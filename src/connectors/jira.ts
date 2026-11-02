import { adfToText, type AdfText } from "./adf.js";
import { HttpClient, type FetchLike, type HttpClientOptions } from "./http.js";

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
  acceptanceCriteriaField?: JiraField;
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
      issues.push(...arr(page.issues).map(obj));
      nextPageToken = str(page.nextPageToken);
      const last = page.isLast === true || !nextPageToken;
      if (issues.length >= limit) return { issues: issues.slice(0, limit), more: !last || issues.length > limit };
      if (last) return { issues, more: false };
    }
  }

  async remoteLinks(key: string): Promise<JiraRemoteLink[]> {
    assertKey(key);
    const raw = await this.http.get(`/rest/api/3/issue/${key}/remotelink`);
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
      frontier = [add(await this.issue(input.key, fields), "root", 0)];
    } else {
      const { issues, more } = await this.search(input.jql, fields, maxIssues);
      truncated ||= more;
      frontier = issues.map((raw) => add(raw, "root", 0));
    }

    // Descendants, one level at a time. `parent = X` covers epic children and sub-tasks in Jira Cloud.
    for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
      const next: JiraIssue[] = [];
      for (let i = 0; i < frontier.length; i += CHUNK) {
        if (room() <= 0) {
          truncated = true;
          break;
        }
        const keys = frontier.slice(i, i + CHUNK).map((f) => f.key);
        const { issues, more } = await this.search(`parent in (${keys.join(",")}) ORDER BY key`, fields, room());
        truncated ||= more;
        for (const raw of issues) {
          const key = str(raw.key);
          if (!key || found.has(key)) continue;
          next.push(add(raw, "child", depth));
        }
      }
      frontier = next;
      if (depth === maxDepth && frontier.length > 0 && room() > 0) {
        // Anything further down is cut off; say so if there is something there.
        const keys = frontier.slice(0, CHUNK).map((f) => f.key);
        const probe = await this.search(`parent in (${keys.join(",")})`, ["summary"], 1);
        truncated ||= probe.issues.length > 0;
      }
    }

    // Children lists, now that the hierarchy is known.
    for (const issue of found.values()) {
      if (issue.parent) {
        const parent = found.get(issue.parent);
        if (parent && !parent.children.includes(issue.key)) parent.children.push(issue.key);
      }
    }

    // Linked issues, one level out, not followed further.
    if (followLinks) {
      const wanted = [...new Set([...found.values()].flatMap((i) => i.links.map((l) => l.key)))].filter((k) => !found.has(k) && ISSUE_KEY.test(k));
      for (let i = 0; i < wanted.length; i += CHUNK) {
        if (room() <= 0) {
          truncated = true;
          break;
        }
        const keys = wanted.slice(i, i + CHUNK);
        const { issues, more } = await this.search(`key in (${keys.join(",")}) ORDER BY key`, fields, room());
        truncated ||= more || (room() <= 0 && i + CHUNK < wanted.length);
        for (const raw of issues) add(raw, "linked", 0);
      }
    }

    for (const issue of found.values()) issue.remoteLinks = await this.remoteLinks(issue.key);

    return { input, issues: [...found.values()], truncated, ...(acField ? { acceptanceCriteriaField: acField } : {}) };
  }
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
  return { text: label ?? "", mentions: str(o.displayName) ? [str(o.displayName)!] : [], links: [] };
}
