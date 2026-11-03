import { adfToText, type AdfText } from "./adf.js";
import { ConnectorError, HttpClient, type FetchLike, type HttpClientOptions } from "./http.js";

/**
 * Jira Cloud client (slice 1, S1-2). Read-only in slice 1: it fetches one
 * issue or a JQL filter, then follows each issue's hierarchy down (epic to
 * stories, story to tasks and sub-tasks) and its links one level out.
 *
 * What it returns is NOT masked. Only the data service calls connectors, and
 * it masks everything before anything else sees it.
 */

export const ISSUE_KEY = /^[A-Z][A-Z0-9_]+-\d+$/;

/** Common names of the acceptance-criteria field in the 9 supported languages. */
const AC_FIELD_NAMES =
  /^(acceptance criteria|crit[eè]res d'acceptation|criterios de aceptaci[oó]n|akzeptanzkriterien|crit[eé]rios de aceita[cç][aã]o|acceptatiecriteria|criteri di accettazione|معايير القبول|验收标准|驗收標準)$/i;

export interface JiraPerson {
  role: "assignee" | "reporter" | "creator";
  displayName: string;
  accountId?: string;
  email?: string;
}

export interface JiraLink {
  /** Link type name, e.g. "Blocks". */
  type: string;
  direction: "inward" | "outward";
  /** e.g. "is blocked by". */
  description: string;
  key: string;
}

export interface JiraRemoteLink {
  url: string;
  title?: string;
  /** e.g. "com.atlassian.confluence" for Confluence pages. */
  application?: string;
}

export interface JiraIssue {
  key: string;
  id: string;
  type: string;
  subtask: boolean;
  status?: string;
  priority?: string;
  summary: string;
  description: AdfText;
  acceptanceCriteria?: AdfText;
  /** Other configured text fields, by field name. */
  extraFields: Record<string, AdfText>;
  labels: string[];
  components: string[];
  fixVersions: string[];
  parent?: string;
  children: string[];
  links: JiraLink[];
  remoteLinks: JiraRemoteLink[];
  people: JiraPerson[];
  created?: string;
  updated: string;
  /** How the issue was reached: the input itself, a descendant, or a linked issue. */
  role: "root" | "child" | "linked";
  /** 0 for roots and linked issues, 1 for their children, and so on. */
  depth: number;
  /** True for a child reached through a linked issue rather than through the input. */
  viaLink?: boolean;
}

export interface JiraField {
  id: string;
  name: string;
  custom: boolean;
}

export type JiraInput = { key: string } | { jql: string };

export interface CollectOptions {
  /** Levels of children to follow below each root (epic → story → sub-task is 2). Default 3. */
  maxDepth?: number;
  /** Stop adding issues after this many. Default 100. */
  maxIssues?: number;
  /** Follow issue links one level out. Default true. */
  followLinks?: boolean;
  /**
   * Also walk down from linked issues (an epic's stories, a story's sub-tasks), within the same caps.
   * Default true. A story linked to its own epic brings in its sibling stories too. When off, children of
   * linked issues are not counted as cut off: `truncated` stays false for them.
   */
  followLinkedChildren?: boolean;
  /** Field id or name for acceptance criteria. Default: found by name. */
  acceptanceCriteriaField?: string;
  /** More text fields to fetch, by id or name. */
  extraFields?: string[];
}

export interface JiraCollection {
  input: JiraInput;
  issues: JiraIssue[];
  /** True when maxIssues or maxDepth cut something off. */
  truncated: boolean;
  /** Linked issues that Jira would not return (deleted, archived, moved or restricted). */
  unreachable: string[];
  acceptanceCriteriaField?: JiraField;
  /** The `extraFields` asked for, resolved to ids and names. Issues key them by name. */
  extraFields: JiraField[];
}

export interface JiraClientOptions extends Partial<Omit<HttpClientOptions, "service" | "baseUrl" | "headers" | "writeTarget" | "readOnlyPosts">> {
  site: string;
  email: string;
  token: string;
  fetch?: FetchLike;
}

const SEARCH_PATH = "/rest/api/3/search/jql";
const BASE_FIELDS = [
  "summary",
  "description",
  "issuetype",
  "status",
  "priority",
  "labels",
  "components",
  "fixVersions",
  "parent",
  "subtasks",
  "issuelinks",
  "assignee",
  "reporter",
  "creator",
  "created",
  "updated",
];
const CHUNK = 50;
const REMOTE_LINK_CONCURRENCY = 4;

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export class JiraClient {
  readonly http: HttpClient;
  private fieldCache: JiraField[] | undefined;

  constructor(options: JiraClientOptions) {
    const { site, email, token, ...rest } = options;
    const auth = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
    this.http = new HttpClient({
      ...rest,
      service: "Jira",
      baseUrl: site,
      writeTarget: "jira",
      readOnlyPosts: [(path) => path === SEARCH_PATH],
      headers: () => ({ Authorization: auth }),
    });
  }

  async fields(): Promise<JiraField[]> {
    if (!this.fieldCache) {
      const raw = await this.http.get<unknown[]>("/rest/api/3/field");
      this.fieldCache = arr(raw).map((f) => ({ id: str(obj(f).id) ?? "", name: str(obj(f).name) ?? "", custom: obj(f).custom === true }));
    }
    return this.fieldCache;
  }

  /** Field by id or by name (case-insensitive). */
  async findField(idOrName: string): Promise<JiraField | undefined> {
    const all = await this.fields();
    return all.find((f) => f.id === idOrName) ?? all.find((f) => f.name.toLowerCase() === idOrName.toLowerCase());
  }

  /**
   * The configured field (id or name), or the first custom field named like
   * "Acceptance criteria" in one of the 9 languages. A site with two such
   * fields should configure the one to use.
   */
  async acceptanceCriteriaField(configured?: string): Promise<JiraField | undefined> {
    if (configured) return this.findField(configured);
    return (await this.fields()).find((f) => f.custom && AC_FIELD_NAMES.test(f.name.trim()));
  }

  async issue(key: string, fields: string[]): Promise<Raw> {
    assertKey(key);
    return obj(await this.http.get(`/rest/api/3/issue/${key}`, { query: { fields: fields.join(",") } }));
  }

  /** Every issue a JQL filter returns, up to `limit`. */
  async search(jql: string, fields: string[], limit: number): Promise<{ issues: Raw[]; more: boolean }> {
    const issues: Raw[] = [];
    let nextPageToken: string | undefined;
    for (;;) {
      const page = obj(
        await this.http.request(SEARCH_PATH, {
          method: "POST",
          body: { jql, fields, maxResults: Math.min(100, Math.max(1, limit - issues.length)), ...(nextPageToken ? { nextPageToken } : {}) },
        }),
      );
      const batch = arr(page.issues).map(obj);
      issues.push(...batch);
      const token = str(page.nextPageToken);
      // An empty page or a repeated token would otherwise loop forever.
      const last = page.isLast === true || !token || token === nextPageToken || batch.length === 0;
      nextPageToken = token;
      if (issues.length >= limit) return { issues: issues.slice(0, limit), more: !last || issues.length > limit };
      if (last) return { issues, more: false };
    }
  }

  /**
   * Issues in `project` carrying any of `labels`, as label → issue key, for
   * finding tests pushed by an earlier run. Labels Jira can't hold (spaces,
   * quotes) are skipped.
   */
  async findByLabels(project: string, labels: string[]): Promise<Map<string, string>> {
    if (!/^[A-Z][A-Z0-9_]+$/.test(project)) throw new Error("Not a Jira project key");
    const wanted = [...new Set(labels.filter((l) => /^[^\s"'\\]{1,255}$/.test(l)))];
    const found = new Map<string, string>();
    for (let i = 0; i < wanted.length; i += CHUNK) {
      const chunk = wanted.slice(i, i + CHUNK);
      // Oldest first, so the first push's test wins when a label is on more than one issue.
      const jql = `project = "${project}" AND labels in (${chunk.map((l) => `"${l}"`).join(", ")}) ORDER BY created ASC`;
      const { issues } = await this.search(jql, ["labels"], 1000);
      for (const raw of issues) {
        const key = str(raw.key);
        if (!key) continue;
        for (const label of arr(obj(raw.fields).labels)) if (typeof label === "string" && chunk.includes(label) && !found.has(label)) found.set(label, key);
      }
    }
    return found;
  }

  /** Whether any of these issues has a child that isn't in `known`. */
  private async hasNewChildren(keys: string[], known: Map<string, unknown>): Promise<boolean> {
    const valid = keys.filter((k) => ISSUE_KEY.test(k));
    for (let i = 0; i < valid.length; i += CHUNK) {
      // Ask for one more than we know about, so a new child can't hide behind known ones.
      const probe = await this.search(`parent in (${valid.slice(i, i + CHUNK).join(",")}) ORDER BY key`, ["summary"], known.size + 1);
      if (probe.issues.some((raw) => !known.has(str(raw.key) ?? ""))) return true;
    }
    return false;
  }

  async remoteLinks(key: string): Promise<JiraRemoteLink[]> {
    assertKey(key);
    let raw: unknown;
    try {
      raw = await this.http.get(`/rest/api/3/issue/${key}/remotelink`);
    } catch (error) {
      if (isGone(error)) return [];
      throw error;
    }
    return arr(raw).flatMap((r) => {
      const o = obj(obj(r).object);
      const url = str(o.url);
      if (!url) return [];
      const title = str(o.title);
      const application = str(obj(obj(r).application).type);
      return [{ url, ...(title ? { title } : {}), ...(application ? { application } : {}) }];
    });
  }

  /** Fetch the input, its descendants and its linked issues. */
  async collect(input: JiraInput, options: CollectOptions = {}): Promise<JiraCollection> {
    const maxDepth = options.maxDepth ?? 3;
    const maxIssues = options.maxIssues ?? 100;
    const followLinks = options.followLinks ?? true;

    const acField = await this.acceptanceCriteriaField(options.acceptanceCriteriaField);
    if (options.acceptanceCriteriaField && !acField) throw new Error(`Jira has no field "${options.acceptanceCriteriaField}" (acceptance criteria)`);
    const extras: JiraField[] = [];
    for (const name of options.extraFields ?? []) {
      const f = await this.findField(name);
      if (!f) throw new Error(`Jira has no field "${name}"`);
      extras.push(f);
    }
    const fields = [...BASE_FIELDS, ...(acField ? [acField.id] : []), ...extras.map((f) => f.id)];

    const found = new Map<string, JiraIssue>();
    let truncated = false;
    const room = () => maxIssues - found.size;
    const add = (raw: Raw, role: JiraIssue["role"], depth: number) => {
      const issue = toIssue(raw, role, depth, acField, extras);
      if (!found.has(issue.key)) found.set(issue.key, issue);
      return issue;
    };

    // Roots.
    let frontier: JiraIssue[];
    if ("key" in input) {
      frontier = [add(await this.issue(input.key.trim().toUpperCase(), fields), "root", 0)];
    } else {
      const { issues, more } = await this.search(input.jql, fields, maxIssues);
      truncated ||= more;
      frontier = issues.map((raw) => add(raw, "root", 0));
    }

    // Descendants, one level at a time. `parent = X` covers epic children and sub-tasks in Jira Cloud.
    // Searches ask for up to maxIssues, so issues already collected (a JQL root that is also a child)
    // can't use up the limit and hide new ones.
    const walkDown = async (start: JiraIssue[], viaLink: boolean) => {
      let level = start;
      for (let depth = 1; depth <= maxDepth && level.length > 0; depth++) {
        const next: JiraIssue[] = [];
        for (let i = 0; i < level.length; i += CHUNK) {
          if (room() <= 0) {
            truncated ||= await this.hasNewChildren(level.slice(i).map((f) => f.key), found);
            break;
          }
          const keys = level.slice(i, i + CHUNK).map((f) => f.key).filter((k) => ISSUE_KEY.test(k));
          if (keys.length === 0) continue;
          const { issues, more } = await this.search(`parent in (${keys.join(",")}) ORDER BY key`, fields, maxIssues);
          const fresh = issues.filter((raw) => {
            const key = str(raw.key);
            return !!key && ISSUE_KEY.test(key) && !found.has(key);
          });
          const space = room();
          truncated ||= more || fresh.length > space;
          for (const raw of fresh.slice(0, space)) {
            const issue = add(raw, "child", depth);
            if (viaLink) issue.viaLink = true;
            next.push(issue);
          }
        }
        level = next;
      }
      // Below maxDepth is cut off; say so only if something is there.
      if (level.length > 0 && !truncated) truncated = await this.hasNewChildren(level.map((f) => f.key), found);
    };
    await walkDown(frontier, false);

    // Linked issues, one level out: their own links are not followed, but their children are
    // (followLinkedChildren, on by default), e.g. a story linked to an epic brings the epic's stories.
    const linked: JiraIssue[] = [];
    const unreachable: string[] = [];
    if (followLinks) {
      const wanted = [...new Set([...found.values()].flatMap((i) => i.links.map((l) => l.key)))].filter((k) => !found.has(k) && ISSUE_KEY.test(k));
      for (let i = 0; i < wanted.length; i += CHUNK) {
        if (room() <= 0) {
          truncated = true;
          break;
        }
        const keys = wanted.slice(i, i + CHUNK);
        let issues: Raw[];
        let more = false;
        try {
          ({ issues, more } = await this.search(`key in (${keys.join(",")}) ORDER BY key`, fields, room()));
        } catch (error) {
          // Jira refuses the whole query (400) when one key is gone or hidden. Fetch one by one instead.
          if (!(error instanceof ConnectorError && error.code === "BAD_REQUEST")) throw error;
          issues = [];
          for (const key of keys) {
            if (issues.length >= room()) {
              more = true;
              break;
            }
            try {
              issues.push(await this.issue(key, fields));
            } catch (inner) {
              if (!isGone(inner)) throw inner;
              unreachable.push(key);
            }
          }
        }
        truncated ||= more;
        for (const raw of issues) {
          const before = found.size;
          const issue = add(raw, "linked", 0);
          if (found.size > before) linked.push(issue);
        }
        // A search that succeeds found every key: Jira fails the whole query on a missing one, and
        // resolves a moved key to the issue's new key. So only the fallback above adds to unreachable.
      }
      if (options.followLinkedChildren ?? true) await walkDown(linked, true);
    }

    // Children lists, including linked issues whose parent was collected. Only collected issues are listed.
    for (const issue of found.values()) issue.children = [];
    for (const issue of found.values()) {
      if (issue.parent) {
        const parent = found.get(issue.parent);
        if (parent && !parent.children.includes(issue.key)) parent.children.push(issue.key);
      }
    }

    // Remote links (e.g. Confluence pages), a few issues at a time.
    const all = [...found.values()];
    for (let i = 0; i < all.length; i += REMOTE_LINK_CONCURRENCY) {
      await Promise.all(all.slice(i, i + REMOTE_LINK_CONCURRENCY).map(async (issue) => (issue.remoteLinks = await this.remoteLinks(issue.key))));
    }

    return { input, issues: [...found.values()], truncated, unreachable, extraFields: extras, ...(acField ? { acceptanceCriteriaField: acField } : {}) };
  }
}

/** 404 or 403: the issue is gone or hidden from this account. */
function isGone(error: unknown): boolean {
  return error instanceof ConnectorError && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN");
}

function assertKey(key: string): void {
  if (!ISSUE_KEY.test(key)) throw new Error(`Not a Jira issue key: ${JSON.stringify(key.slice(0, 40))}`);
}

function person(role: JiraPerson["role"], v: unknown): JiraPerson[] {
  const o = obj(v);
  const displayName = str(o.displayName);
  if (!displayName) return [];
  const accountId = str(o.accountId);
  const email = str(o.emailAddress);
  return [{ role, displayName, ...(accountId ? { accountId } : {}), ...(email ? { email } : {}) }];
}

function toIssue(raw: Raw, role: JiraIssue["role"], depth: number, acField: JiraField | undefined, extras: JiraField[]): JiraIssue {
  const f = obj(raw.fields);
  const issuetype = obj(f.issuetype);
  const key = str(raw.key) ?? "";
  const links: JiraLink[] = arr(f.issuelinks).flatMap((l): JiraLink[] => {
    const o = obj(l);
    const type = obj(o.type);
    const out = obj(o.outwardIssue);
    const inw = obj(o.inwardIssue);
    const outKey = str(out.key);
    const inKey = str(inw.key);
    if (outKey) return [{ type: str(type.name) ?? "", direction: "outward" as const, description: str(type.outward) ?? "", key: outKey }];
    if (inKey) return [{ type: str(type.name) ?? "", direction: "inward" as const, description: str(type.inward) ?? "", key: inKey }];
    return [];
  });
  const extraFields: Record<string, AdfText> = {};
  for (const e of extras) if (f[e.id] !== undefined && f[e.id] !== null) extraFields[e.name] = textOf(f[e.id]);
  const parent = str(obj(f.parent).key);
  const status = str(obj(f.status).name);
  const priority = str(obj(f.priority).name);
  const created = str(f.created);
  return {
    key,
    id: str(raw.id) ?? "",
    type: str(issuetype.name) ?? "",
    subtask: issuetype.subtask === true,
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    summary: str(f.summary) ?? "",
    description: textOf(f.description),
    ...(acField && f[acField.id] != null ? { acceptanceCriteria: textOf(f[acField.id]) } : {}),
    extraFields,
    labels: arr(f.labels).filter((l): l is string => typeof l === "string"),
    components: arr(f.components).flatMap((c) => str(obj(c).name) ?? []),
    fixVersions: arr(f.fixVersions).flatMap((c) => str(obj(c).name) ?? []),
    ...(parent ? { parent } : {}),
    children: arr(f.subtasks).flatMap((s) => str(obj(s).key) ?? []),
    links,
    remoteLinks: [],
    people: [...person("assignee", f.assignee), ...person("reporter", f.reporter), ...person("creator", f.creator)],
    ...(created ? { created } : {}),
    updated: str(f.updated) ?? "",
    role,
    depth,
  };
}

/** A field can be ADF, a plain string, an option ({ value }), or a list of those. */
function textOf(v: unknown): AdfText {
  if (v === null || v === undefined) return { text: "", mentions: [], links: [] };
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return { text: String(v), mentions: [], links: [] };
  if (Array.isArray(v)) {
    const parts = v.map(textOf);
    return { text: parts.map((p) => p.text).filter(Boolean).join("\n"), mentions: parts.flatMap((p) => p.mentions), links: parts.flatMap((p) => p.links) };
  }
  const o = obj(v);
  if (o.type === "doc") return adfToText(o);
  const label = str(o.value) ?? str(o.name) ?? str(o.displayName);
  // A cascading select holds its second level in `child`.
  const childLabel = str(obj(o.child).value);
  return { text: [label, childLabel].filter(Boolean).join(" / "), mentions: str(o.displayName) ? [str(o.displayName)!] : [], links: [] };
}
