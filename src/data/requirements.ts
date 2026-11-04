import { z } from "zod";
import { hashInput, resolveSecret, type ArtifactSpec, type Config, type InputRef, type RunStore, type SecretSources } from "../core/index.js";
import {
  ConfluenceClient,
  JiraClient,
  pageIdFromUrl,
  type CollectOptions,
  type ConfluencePage,
  type FetchLike,
  type JiraCollection,
  type JiraInput,
  type JiraIssue,
  type SkippedPage,
} from "../connectors/index.js";
import { Masker, type DetectorName, type NameLanguage, type RunVault } from "../masking/index.js";

/**
 * The masked data service (S1-6). It is the only caller of connectors: it
 * reads a Jira ticket or JQL filter with its children, linked issues and
 * linked Confluence pages, masks every free-text value, and hands workflows
 * `Requirement` entities that hold tokens, never real values. The result is
 * cached in the run folder (`sources.json`) with a `masking-report.json` that
 * counts what was masked and never holds a value.
 */

// ---------------------------------------------------------------- schemas

export const acceptanceCriterionSchema = z.object({ id: z.string().regex(/^AC\d+$/), text: z.string() }).strict();

export const linkedPageSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    version: z.number().int(),
    text: z.string(),
  })
  .strict();

export const requirementSchema = z
  .object({
    key: z.string(),
    type: z.string(),
    status: z.string().optional(),
    priority: z.string().optional(),
    role: z.enum(["root", "child", "linked"]),
    depth: z.number().int().min(0),
    viaLink: z.boolean().optional(),
    parent: z.string().optional(),
    children: z.array(z.string()),
    links: z.array(z.object({ type: z.string(), direction: z.enum(["inward", "outward"]), description: z.string(), key: z.string() }).strict()),
    summary: z.string(),
    description: z.string(),
    acceptanceCriteria: z.array(acceptanceCriterionSchema),
    /** Where the criteria came from: their own field, a heading in the description, or nowhere. */
    acceptanceCriteriaSource: z.enum(["field", "description", "none"]),
    extraFields: z.record(z.string(), z.string()),
    labels: z.array(z.string()),
    components: z.array(z.string()),
    fixVersions: z.array(z.string()),
    /** People on the issue, as tokens. */
    people: z.array(z.object({ role: z.enum(["assignee", "reporter", "creator"]), token: z.string() }).strict()),
    linkedPages: z.array(linkedPageSchema),
    updated: z.string(),
    /** sha256 of the issue's `updated` value and its linked pages' versions: same hash, same source. */
    sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export type Requirement = z.infer<typeof requirementSchema>;

const sourcesSchema = z
  .object({
    /** The masked input: an issue key, or the JQL with any personal data in it replaced. */
    input: z.union([z.object({ key: z.string() }).strict(), z.object({ jql: z.string() }).strict()]),
    requirements: z.array(requirementSchema),
    /**
     * sha256 of the run id, the input's vault token and every setting that changes the output (masking, collect
     * options, SOURCES_VERSION). A cache hit needs the same key; the raw input itself is never stored.
     */
    cacheKey: z.string().regex(/^[0-9a-f]{64}$/),
    truncated: z.boolean(),
    unreachable: z.array(z.string()),
    skippedPages: z.array(z.object({ issue: z.string(), reason: z.string() }).strict()),
  })
  .strict();
export type MaskedSources = z.infer<typeof sourcesSchema>;

export const SOURCES_ARTIFACT: ArtifactSpec<MaskedSources> = { name: "sources", schema: "sources@1", data: sourcesSchema };

const countsSchema = z.record(z.string(), z.number().int().min(0));
export const maskingReportSchema = z
  .object({
    byDetector: countsSchema,
    byField: countsSchema,
    /** Fields replaced whole (people, `masking.fields`), by field. */
    wholeFields: countsSchema,
    /** Distinct tokens issued in this run. */
    tokens: z.number().int().min(0),
    /** Fields passed through as they are, by rule: ids, types, statuses, dates. */
    unmaskedFields: z.array(z.string()),
    detectors: z.array(z.string()),
    languages: z.array(z.string()),
    issues: z.number().int().min(0),
    pages: z.number().int().min(0),
  })
  .strict();
export type MaskingReport = z.infer<typeof maskingReportSchema>;

export const MASKING_REPORT_ARTIFACT: ArtifactSpec<MaskingReport> = {
  name: "masking-report",
  schema: "masking-report@1",
  data: maskingReportSchema,
  render: renderReport,
};

/** Bumped when masking or entity building changes, so cached sources are rebuilt. */
export const SOURCES_VERSION = "sources-4";

const UNMASKED_FIELDS = [
  "jira.key",
  "jira.type",
  "jira.status",
  "jira.priority",
  "jira.parent",
  "jira.children",
  "jira.links",
  "jira.updated",
  "confluence.id",
  "confluence.version",
];

/** Standard fields the client always reads, by every name Jira gives them, to the name used here. */
const STANDARD_FIELDS: Record<string, string> = {
  summary: "summary",
  description: "description",
  assignee: "assignee",
  reporter: "reporter",
  creator: "creator",
  labels: "labels",
  label: "labels",
  components: "components",
  component: "components",
  "component/s": "components",
  fixversions: "fixVersions",
  fixversion: "fixVersions",
  "fix versions": "fixVersions",
  "fix version": "fixVersions",
  "fix version/s": "fixVersions",
  acceptancecriteria: "acceptanceCriteria",
  "acceptance criteria": "acceptanceCriteria",
};

const ALL_DETECTORS: DetectorName[] = ["email", "iban", "card", "national-id", "phone", "ip", "name"];
const ALL_LANGUAGES: NameLanguage[] = ["en", "fr", "es", "de", "pt", "nl", "it", "ar", "zh"];

// ---------------------------------------------------------------- service

export interface MaskedDataOptions {
  config: Config;
  store: RunStore;
  runId: string;
  vault: RunVault;
  secrets?: SecretSources;
  fetch?: FetchLike;
  /** Replace the clients, for tests. */
  jira?: Pick<JiraClient, "collect">;
  confluence?: Pick<ConfluenceClient, "pages">;
}

export interface LoadOptions {
  /** Read Jira again even when the run already has sources for this input. */
  refresh?: boolean;
}

export interface LoadedSources {
  sources: MaskedSources;
  report: MaskingReport;
  /** One per issue and page, for the next artifact's `sourceHash`. */
  inputs: InputRef[];
  /** True when read from the run folder instead of Jira. */
  cached: boolean;
}

export class MaskedDataService {
  constructor(private readonly options: MaskedDataOptions) {}

  /** Masked requirements for a Jira key or JQL filter, from the run folder when already read. */
  async requirements(input: JiraInput, options: LoadOptions = {}): Promise<LoadedSources> {
    const { store, runId, vault } = this.options;
    const rawInput = "key" in input ? { key: input.key.trim().toUpperCase() } : { jql: input.jql };
    // The input stands in the key as a vault token: the same input gets the same token, and a JQL
    // holding a name can't be guessed back from the hash.
    const inputToken = vault.tokenFor("INPUT", JSON.stringify(rawInput));
    await vault.save();
    const cacheKey = hashInput(
      JSON.stringify({
        input: inputToken,
        version: SOURCES_VERSION,
        masking: this.options.config.masking,
        detectors: this.detectors(),
        languages: this.languages(),
        collect: this.collectOptions(),
        maxPages: this.options.config.atlassian?.jira?.maxPages ?? 20,
      }),
    );

    if (!options.refresh) {
      // An artifact that no longer parses (an older shape) is a miss, not an error.
      const cached = await store.readArtifact(runId, SOURCES_ARTIFACT).catch(() => undefined);
      const report = await store.readArtifact(runId, MASKING_REPORT_ARTIFACT).catch(() => undefined);
      if (cached && report && cached.data.cacheKey === cacheKey) {
        return { sources: cached.data, report: report.data, inputs: cached.inputs, cached: true };
      }
    }

    const collection = withoutTests(await (await this.jira()).collect(input, this.collectOptions()));
    const { pages, skipped } = await this.pages(collection);
    const masker = this.masker();
    const built = buildSources(collection, pages, skipped, masker, this.wholeFields(), rawInput, cacheKey);
    await vault.save();

    const counts = masker.report();
    const report: MaskingReport = {
      byDetector: counts.byDetector,
      byField: counts.byField,
      wholeFields: counts.wholeFields,
      tokens: counts.tokens,
      unmaskedFields: UNMASKED_FIELDS,
      detectors: this.detectors(),
      languages: this.languages(),
      issues: built.sources.requirements.length,
      pages: built.pageCount,
    };
    const source = { inputs: built.inputs, templateVersion: SOURCES_VERSION };
    await store.writeArtifact(runId, SOURCES_ARTIFACT, built.sources, source);
    await store.writeArtifact(runId, MASKING_REPORT_ARTIFACT, report, source);
    return { sources: built.sources, report, inputs: built.inputs, cached: false };
  }

  private detectors(): DetectorName[] {
    return (this.options.config.masking.detectors ?? ALL_DETECTORS).filter((d) => d !== "address");
  }

  private languages(): NameLanguage[] {
    return this.options.config.masking.languages ?? ALL_LANGUAGES;
  }

  /**
   * Free text written in the run (a reviewer's edit), masked like the sources:
   * the run's known people keep their tokens, detectors find the rest.
   */
  maskText(text: string, field: string): string {
    const masker = this.masker();
    masker.addNames(this.options.vault.valuesOf("PERSON"));
    return masker.mask(text, { field });
  }

  async saveVault(): Promise<void> {
    await this.options.vault.save();
  }

  private masker(): Masker {
    const detectors = this.options.config.masking.detectors;
    return new Masker({ vault: this.options.vault, ...(detectors ? { detectors } : {}), nameLanguages: this.languages() });
  }

  /** `masking.fields.jira`, folded for matching by id or name. */
  private wholeFields(): Set<string> {
    return new Set(this.wholeFieldNames().map((f) => f.toLowerCase()));
  }

  /** `masking.fields.jira`, trimmed, standard fields by their id whatever name is used, `customfield_` ids in Jira's case. */
  private wholeFieldNames(): string[] {
    return (this.options.config.masking.fields?.jira ?? [])
      .map((f) => f.trim())
      .filter(Boolean)
      .map((f) => STANDARD_FIELDS[f.toLowerCase()] ?? f.replace(/^customfield_/i, "customfield_"));
  }

  private collectOptions(): CollectOptions {
    const jira = this.options.config.atlassian?.jira ?? {};
    // Fields masked whole are read too, unless they are standard ones the client already reads.
    const standard = new Set(Object.values(STANDARD_FIELDS).map((f) => f.toLowerCase()));
    const whole = this.wholeFieldNames().filter((f) => !standard.has(f.toLowerCase()));
    const acField = jira.acceptanceCriteriaField?.trim().toLowerCase();
    const extraFields = [...new Set([...(jira.extraFields ?? []).map((f) => f.trim()), ...whole])].filter((f) => f.toLowerCase() !== acField);
    return {
      ...(jira.maxDepth !== undefined ? { maxDepth: jira.maxDepth } : {}),
      ...(jira.maxIssues !== undefined ? { maxIssues: jira.maxIssues } : {}),
      ...(jira.followLinks !== undefined ? { followLinks: jira.followLinks } : {}),
      ...(jira.followLinkedChildren !== undefined ? { followLinkedChildren: jira.followLinkedChildren } : {}),
      ...(jira.acceptanceCriteriaField ? { acceptanceCriteriaField: jira.acceptanceCriteriaField } : {}),
      ...(extraFields.length ? { extraFields } : {}),
    };
  }

  private async credentials(): Promise<{ site: string; email: string; token: string }> {
    const atlassian = this.options.config.atlassian;
    if (!atlassian) throw new Error("agent-qa.yaml has no atlassian section: add site, email and token to read Jira.");
    const secrets = this.options.secrets ?? {};
    const email = atlassian.email.startsWith("${") ? await resolveSecret(atlassian.email, secrets) : atlassian.email;
    return { site: atlassian.site, email, token: await resolveSecret(atlassian.token, secrets) };
  }

  private async jira(): Promise<Pick<JiraClient, "collect">> {
    return this.options.jira ?? new JiraClient({ ...(await this.credentials()), ...(this.options.fetch ? { fetch: this.options.fetch } : {}) });
  }

  private async confluence(): Promise<Pick<ConfluenceClient, "pages">> {
    return this.options.confluence ?? new ConfluenceClient({ ...(await this.credentials()), ...(this.options.fetch ? { fetch: this.options.fetch } : {}) });
  }

  /** Confluence pages the issues link to (remote links and links in text), each read once. */
  private async pages(collection: JiraCollection): Promise<{ pages: Map<string, ConfluencePage>; skipped: Array<{ issue: string; reason: SkippedPage["reason"] }> }> {
    const site = this.options.config.atlassian?.site;
    const maxPages = this.options.config.atlassian?.jira?.maxPages ?? 20;
    const pages = new Map<string, ConfluencePage>();
    const skipped: Array<{ issue: string; reason: SkippedPage["reason"] }> = [];
    if (!site || maxPages === 0) return { pages, skipped };
    const urls = new Map<string, string>(); // url -> first issue that links it
    for (const issue of collection.issues) for (const url of confluenceUrls(issue, site)) if (!urls.has(url)) urls.set(url, issue.key);
    if (urls.size === 0) return { pages, skipped };
    const result = await (await this.confluence()).pages([...urls.keys()], { maxPages });
    for (const page of result.pages) pages.set(page.id, page);
    for (const s of result.skipped) skipped.push({ issue: urls.get(s.url) ?? "", reason: s.reason });
    return { pages, skipped };
  }
}

/** JQL fields whose values are people: usernames, account ids, emails or names. */
const JQL_PEOPLE = new Set([
  "assignee",
  "reporter",
  "creator",
  "watcher",
  "watchers",
  "voter",
  "voters",
  "approver",
  "approvers",
  "worklogauthor",
  "request participants",
  "request participant",
]);
/** Values that name no one. */
const JQL_KEEP = /^(?:empty|null)$/i;
/** Atlassian account ids: 24 hex digits, or `123456:uuid`. */
const ACCOUNT_ID = /\b(?:[0-9a-f]{24}|\d{6}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/giu;
/** JQL tokens: space, strings (an unclosed one runs to the end), operators, brackets, commas, words. */
const JQL_TOKEN = /\s+|"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|!=|!~|<=|>=|[=~<>(),!]|[^\s"'(),=!~<>]+/gu;
/** JQL functions whose arguments are people. */
const JQL_USER_FUNCTIONS = new Set(["updatedby", "approver", "pendingby", "approvedby", "projectsleadbyuser", "componentsleadbyuser", "projectswhereuserhaspermission", "projectswhereuserhasrole", "commentedby", "worklogged"]);
/**
 * JQL functions known to take no people (groups, dates, versions, sprints, issues).
 * Any other function's arguments are masked as people: an unknown function fails closed.
 */
const JQL_FUNCTIONS = new Set([
  "currentuser", "currentlogin", "lastlogin", "membersof", "now",
  "startofday", "endofday", "startofweek", "endofweek", "startofmonth", "endofmonth", "startofyear", "endofyear",
  "issuehistory", "watchedissues", "votedissues", "linkedissues", "parentepic", "portfolioparent",
  "releasedversions", "unreleasedversions", "latestreleasedversion", "earliestunreleasedversion",
  "opensprints", "closedsprints", "futuresprints", "cascadeoption", "componentsleadbycurrentuser",
]);
const JQL_OPERATORS = new Set(["=", "!=", "~", "!~", "<", ">", "<=", ">=", "in", "not", "was", "is"]);
/** History predicates and whether their value is a person (`by`), the field's own kind (`from`, `to`) or a date. */
const JQL_PREDICATES: Record<string, "person" | "field" | "other"> = { by: "person", from: "field", to: "field", after: "other", before: "other", on: "other", during: "other" };

const unquote = (token: string) => {
  const quote = /^["']/.exec(token)?.[0];
  if (!quote) return token;
  const closed = token.length > 1 && token.endsWith(quote);
  return token.slice(1, closed ? -1 : undefined).replace(/\\(.)/g, "$1");
};

/**
 * A JQL filter with personal data replaced. It is read token by token, so
 * quoted text stays whole:
 * - values of people fields (`assignee = jdoe`, `reporter in (a, "B C")`,
 *   `assignee changed from a to b`) and of `by` in history clauses become
 *   PERSON tokens; a known person keeps their token;
 * - a list that doesn't close is masked to the end (fail closed);
 * - account ids anywhere become PERSON tokens; the rest of the text goes
 *   through the detectors like any free text.
 * Only this masked copy is ever stored: the filter itself is sealed in the vault.
 */
export function maskJql(jql: string, masker: Pick<Masker, "mask">): string {
  const tokens = jql.match(JQL_TOKEN) ?? [];
  const isSpace = (t: string | undefined) => t !== undefined && /^\s+$/.test(t);
  const nextIndex = (i: number) => {
    let j = i + 1;
    while (isSpace(tokens[j])) j++;
    return j;
  };
  const person = (token: string) => {
    const quote = /^["']/.exec(token)?.[0] ?? "";
    const closing = quote && token.length > 1 && token.endsWith(quote) ? quote : "";
    const bare = unquote(token).trim();
    if (!bare || JQL_KEEP.test(bare)) return token;
    const known = masker.mask(bare, { field: "input.jql" });
    const masked = /^<[A-Z][A-Z0-9_]*_\d+>$/.test(known) ? known : masker.mask(bare, { field: "input.jql", whole: "PERSON" });
    return quote + masked + closing;
  };
  const text = (token: string) => (isSpace(token) ? token : maskText(token, masker));

  const out: string[] = [];
  let field: string | undefined;
  let history = false;
  let expect: "person" | "other" | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (isSpace(t)) {
      out.push(t);
      continue;
    }
    const lower = t.toLowerCase();
    if (expect) {
      const asPerson = expect === "person";
      if (lower === "not" || lower === "in" || lower === "is") {
        out.push(t); // `was not in`, `not in`, `is not`: still before the value
        continue;
      }
      const isName = (j: number) => /^[A-Za-z_][\w.]*$/.test(tokens[j]!) && tokens[nextIndex(j)] === "(";
      if (t === "(" || isName(i)) {
        // A list or a function call, walked to its closing bracket (or the end: fail closed).
        // Function arguments are people for the user functions (updatedBy(jdoe)), text otherwise;
        // list items are people in a people clause. Where a person is expected, an unknown
        // function name is masked too.
        const stack: Array<"list" | "people" | "text"> = [];
        let j = i;
        for (; j < tokens.length; j++) {
          const u = tokens[j]!;
          if (isSpace(u) || u === ",") out.push(u);
          else if (u === "(") {
            const before = tokens.slice(0, j).reverse().find((x) => !isSpace(x));
            const fn = before && /^[A-Za-z_][\w.]*$/.test(before) && j > i ? before.toLowerCase() : undefined;
            stack.push(fn === undefined ? "list" : JQL_FUNCTIONS.has(fn) ? "text" : "people");
            out.push(u);
          } else if (u === ")") {
            stack.pop();
            out.push(u);
          } else if (isName(j)) {
            const name = u.toLowerCase();
            const inPeople = stack.length ? stack[stack.length - 1] !== "text" && (stack[stack.length - 1] === "people" || asPerson) : asPerson;
            out.push(inPeople && !JQL_FUNCTIONS.has(name) && !JQL_USER_FUNCTIONS.has(name) ? person(u) : u);
          } else {
            const top = stack[stack.length - 1];
            out.push(top === "people" || (top === "list" && asPerson) ? person(u) : text(u));
          }
          if (stack.length === 0 && u === ")") break;
        }
        i = j;
      } else {
        out.push(asPerson ? person(t) : text(t));
      }
      expect = undefined;
      continue;
    }
    if (lower === "and" || lower === "or" || lower === "order" || t === ")" || t === "(") {
      field = undefined;
      history = false;
      out.push(t);
      continue;
    }
    if (field === undefined) {
      if (lower !== "not") field = unquote(t).trim().toLowerCase();
      out.push(text(t));
      continue;
    }
    if (lower === "changed" || lower === "was") {
      history = true;
      if (lower === "was") expect = JQL_PEOPLE.has(field) ? "person" : "other";
      out.push(t);
      continue;
    }
    if (history && Object.hasOwn(JQL_PREDICATES, lower)) {
      const kind = JQL_PREDICATES[lower]!;
      expect = kind === "person" || (kind === "field" && JQL_PEOPLE.has(field)) ? "person" : "other";
      out.push(t);
      continue;
    }
    if (JQL_OPERATORS.has(lower)) {
      expect = JQL_PEOPLE.has(field) ? "person" : "other";
      out.push(t);
      continue;
    }
    out.push(text(t));
  }
  return out.join("");
}

/** Free JQL text: account ids as PERSON tokens, the rest through the detectors. */
function maskText(text: string, masker: Pick<Masker, "mask">): string {
  let out = "";
  let at = 0;
  for (const m of text.matchAll(ACCOUNT_ID)) {
    out += (at < m.index ? masker.mask(text.slice(at, m.index), { field: "input.jql" }) : "") + masker.mask(m[0], { field: "input.jql", whole: "PERSON" });
    at = m.index + m[0].length;
  }
  return out + (at < text.length ? masker.mask(text.slice(at), { field: "input.jql" }) : "");
}

/** Links on an issue that point at a Confluence page on this site. */
function confluenceUrls(issue: JiraIssue, site: string): string[] {
  const candidates = [
    ...issue.remoteLinks.map((l) => l.url),
    ...issue.description.links,
    ...(issue.acceptanceCriteria?.links ?? []),
    ...Object.values(issue.extraFields).flatMap((f) => f.links),
  ];
  return [...new Set(candidates.filter((url) => "id" in pageIdFromUrl(url, site)))];
}

// ---------------------------------------------------------------- building

const AC_HEADING =
  /^\s*(?:#+\s*)?(?:acceptance criteria|critères d'acceptation|criteres d'acceptation|criterios de aceptación|criterios de aceptacion|akzeptanzkriterien|critérios de aceitação|criterios de aceitacao|acceptatiecriteria|criteri di accettazione|معايير القبول|验收标准)\s*[:：]?\s*$/iu;
const NEXT_HEADING = /^\s*(?:#+\s*\S|[\p{Lu}][^.!?:]{0,60}[:：]\s*$)/u;
/** A bullet, a number or letter with a dot or bracket, or "AC3:"; always followed by a space, so "1.5 s" and "e.g." stay. */
const BULLET = /^\s*(?:[-*•·▪◦]|\d+[.)]|[a-z][.)]|AC\s*\d+\s*[:.)-]?)\s+/iu;
/** A line that starts a Gherkin scenario. */
const GHERKIN_START =
  /^\s*(?:(?:given|scenario|scenario outline|background|étant donné|etant donne|scénario|dado que|escenario|cenário|cenario|angenommen|gegeben sei|szenario|gegeven|dato che)\b|假如|假设|场景)/iu;
/** Gherkin lines that continue a scenario: When, Then, And, But in the 9 languages. */
const GHERKIN_NEXT =
  /^\s*(?:(?:and|but|then|when|et|mais|alors|quand|lorsque|y|pero|entonces|cuando|und|aber|dann|wenn|e|mas|então|entao|quando|en|maar|dan|als|ma|allora)\s|并且|而且|那么|当|但是)/iu;

/**
 * Acceptance criteria as AC1, AC2...: one per line or bullet; Gherkin lines
 * that continue a scenario (And, Then, When) stay with it.
 */
export function splitCriteria(text: string): Array<{ id: string; text: string }> {
  const items: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const bulleted = BULLET.test(line);
    const clean = line.replace(BULLET, "").trim();
    if (!clean) continue;
    // A Gherkin step stays with the scenario it continues; elsewhere "When offline..." is its own criterion.
    const last = items[items.length - 1];
    if (last !== undefined && !bulleted && GHERKIN_START.test(last) && GHERKIN_NEXT.test(clean)) items[items.length - 1] += "\n" + clean;
    else items.push(clean);
  }
  return items.map((t, i) => ({ id: `AC${i + 1}`, text: t }));
}

/** Criteria under an "Acceptance criteria" heading in the description, and the description without them. */
export function criteriaFromDescription(text: string): { criteria: string; rest: string } | undefined {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => AC_HEADING.test(l));
  if (at < 0) return undefined;
  // The criteria end at the next heading, or at a blank line followed by a line that is not a bullet.
  let end = at + 1;
  while (end < lines.length) {
    const line = lines[end]!;
    if (end > at + 1 && NEXT_HEADING.test(line) && !BULLET.test(line)) break;
    if (end > at + 1 && !line.trim()) {
      const next = lines.slice(end + 1).find((l) => l.trim());
      if (next === undefined || !(BULLET.test(next) || GHERKIN_START.test(next))) break;
    }
    end++;
  }
  const criteria = lines.slice(at + 1, end).join("\n");
  if (!criteria.trim()) return undefined;
  return { criteria, rest: [...lines.slice(0, at), ...lines.slice(end)].join("\n").trim() };
}

function buildSources(
  collection: JiraCollection,
  pages: Map<string, ConfluencePage>,
  skipped: Array<{ issue: string; reason: string }>,
  masker: Masker,
  wholeFields: Set<string>,
  rawInput: MaskedSources["input"],
  cacheKey: string,
): { sources: MaskedSources; inputs: InputRef[]; pageCount: number } {
  const normal = (name: string) => name.replace(/\s+/g, " ").trim();
  // Every person and mention is known before any text is masked, so a name gets its token everywhere.
  const people = new Set<string>();
  for (const issue of collection.issues) {
    for (const p of issue.people) {
      if (p.displayName.trim()) people.add(normal(p.displayName));
    }
    for (const t of [issue.description, issue.acceptanceCriteria, ...Object.values(issue.extraFields)]) {
      for (const m of t?.mentions ?? []) if (m.trim()) people.add(normal(m.replace(/^@/, "")));
    }
  }
  masker.addNames(people);
  // People first, so the reporter and assignee get the low token numbers.
  const peopleTokens = new Map<string, Requirement["people"]>();
  for (const issue of collection.issues) {
    peopleTokens.set(
      issue.key,
      issue.people
        .filter((p) => p.displayName.trim())
        .map((p) => ({ role: p.role, token: masker.mask(normal(p.displayName), { field: `jira.${p.role}`, whole: "PERSON" }) })),
    );
  }
  // The input is masked after the people are known, so a name in the JQL gets the person's token.
  const input: MaskedSources["input"] = "key" in rawInput ? rawInput : { jql: maskJql(rawInput.jql, masker) };

  const fieldIds = new Map(collection.extraFields.map((f) => [f.name, f.id.toLowerCase()]));
  const acField = collection.acceptanceCriteriaField;
  if (acField) fieldIds.set(acField.name, acField.id.toLowerCase());
  const isWhole = (name: string) => wholeFields.has(name.toLowerCase()) || wholeFields.has(fieldIds.get(name) ?? "\u0000");
  const text = (value: string, field: string, name = field) =>
    isWhole(name) ? masker.mask(value, { field: `jira.${field}`, whole: "PII" }) : masker.mask(value, { field: `jira.${field}` });

  const maskedPages = new Map<string, Requirement["linkedPages"][number]>();
  const pageFor = (page: ConfluencePage) => {
    let masked = maskedPages.get(page.id);
    if (!masked) {
      masked = {
        id: page.id,
        title: masker.mask(page.title, { field: "confluence.title" }),
        version: page.version,
        text: masker.mask(page.body.text, { field: "confluence.body" }),
      };
      maskedPages.set(page.id, masked);
    }
    return masked;
  };
  const requirements: Requirement[] = collection.issues.map((issue) => {
    const linked = linkedPageIds(issue, pages);
    const linkedPages = linked.map((id) => pageFor(pages.get(id)!));

    let description = issue.description.text;
    let criteriaText = issue.acceptanceCriteria?.text ?? "";
    let acceptanceCriteriaSource: Requirement["acceptanceCriteriaSource"] = criteriaText.trim() ? "field" : "none";
    if (acceptanceCriteriaSource === "none") {
      const found = criteriaFromDescription(description);
      if (found) {
        criteriaText = found.criteria;
        description = found.rest;
        acceptanceCriteriaSource = "description";
      }
    }
    // Criteria taken from the description are as private as the description.
    const acName = acceptanceCriteriaSource === "description" ? "description" : (acField?.name ?? "acceptanceCriteria");
    const acWhole = isWhole(acName) || isWhole("acceptanceCriteria");
    const maskedCriteria = !criteriaText.trim()
      ? ""
      : acWhole
        ? masker.mask(criteriaText, { field: "jira.acceptanceCriteria", whole: "PII" })
        : masker.mask(criteriaText, { field: "jira.acceptanceCriteria" });

    const extraFields: Record<string, string> = {};
    for (const [name, value] of Object.entries(issue.extraFields)) {
      if (acField && name === acField.name) continue; // already the criteria
      extraFields[name] = text(value.text, `field.${name}`, name);
    }
    const list = (values: string[], field: string) =>
      values.map((v) => (isWhole(field) ? masker.mask(v, { field: `jira.${field}`, whole: "PII" }) : masker.mask(v, { field: `jira.${field}` })));

    return {
      key: issue.key,
      type: issue.type,
      ...(issue.status ? { status: issue.status } : {}),
      ...(issue.priority ? { priority: issue.priority } : {}),
      role: issue.role,
      depth: issue.depth,
      ...(issue.viaLink ? { viaLink: true } : {}),
      ...(issue.parent ? { parent: issue.parent } : {}),
      children: issue.children,
      links: issue.links.map((l) => ({ type: l.type, direction: l.direction, description: l.description, key: l.key })),
      summary: text(issue.summary, "summary"),
      description: text(description, "description"),
      acceptanceCriteria: acWhole ? (maskedCriteria ? [{ id: "AC1", text: maskedCriteria }] : []) : splitCriteria(maskedCriteria),
      acceptanceCriteriaSource,
      extraFields,
      labels: list(issue.labels, "labels"),
      components: list(issue.components, "components"),
      fixVersions: list(issue.fixVersions, "fixVersions"),
      people: peopleTokens.get(issue.key) ?? [],
      linkedPages,
      updated: issue.updated,
      sourceHash: hashInput(JSON.stringify({ key: issue.key, updated: issue.updated, pages: linked.map((id) => `${id}@${pages.get(id)!.version}`) })),
    };
  });

  const inputs: InputRef[] = [
    ...requirements.map((r) => ({ kind: "jira-issue" as const, ref: r.key, hash: hashInput(JSON.stringify(r)) })),
    ...[...maskedPages.values()].map((p) => ({ kind: "confluence-page" as const, ref: p.id, hash: hashInput(JSON.stringify(p)) })),
  ];
  const sources: MaskedSources = {
    input,
    cacheKey,
    requirements,
    truncated: collection.truncated,
    unreachable: collection.unreachable,
    skippedPages: skipped,
  };
  return { sources, inputs, pageCount: maskedPages.size };
}

/** Ids of the read pages an issue links to, in link order. */
function linkedPageIds(issue: JiraIssue, pages: Map<string, ConfluencePage>): string[] {
  const ids: string[] = [];
  const urls = [
    ...issue.remoteLinks.map((l) => l.url),
    ...issue.description.links,
    ...(issue.acceptanceCriteria?.links ?? []),
    ...Object.values(issue.extraFields).flatMap((f) => f.links),
  ];
  for (const url of urls) {
    for (const page of pages.values()) {
      if (!ids.includes(page.id) && samePage(url, page)) ids.push(page.id);
    }
  }
  return ids;
}

function samePage(url: string, page: ConfluencePage): boolean {
  try {
    const found = pageIdFromUrl(url, new URL(page.url).origin);
    return "id" in found && found.id === page.id;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- report view

function renderReport(report: MaskingReport): string {
  const rows = (counts: Record<string, number>) =>
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k, v]) => `| ${k} | ${v} |`)
      .join("\n") || "| (none) | 0 |";
  return [
    "# Masking report",
    "",
    `${report.issues} issue(s) and ${report.pages} page(s) read; ${report.tokens} distinct token(s) issued. This report holds counts only, never values.`,
    "",
    `Detectors: ${report.detectors.join(", ")}. Name languages: ${report.languages.join(", ") || "none"}.`,
    "",
    "## By detector",
    "",
    "| Detector | Masked |",
    "|---|---|",
    rows(report.byDetector),
    "",
    "## By field",
    "",
    "| Field | Masked |",
    "|---|---|",
    rows(report.byField),
    "",
    "## Replaced whole",
    "",
    "| Field | Values |",
    "|---|---|",
    rows(report.wholeFields),
    "",
    "## Passed through by rule",
    "",
    report.unmaskedFields.map((f) => `- ${f}`).join("\n"),
    "",
  ].join("\n");
}

/** Xray's own issue types: tests and their containers, never requirements. */
const XRAY_TYPES = /^(test|test set|test plan|test execution|pre-?condition)$/i;

/**
 * The collection without tests reached through links or children: Agent-QA's
 * own (an `agent-qa:TC-…` label) and any Xray test issue. A rerun would otherwise
 * read the tests its first push linked to the issue as requirements. The
 * issue asked for is always kept.
 */
export function withoutTests(collection: JiraCollection): JiraCollection {
  const isTest = (i: JiraIssue) => i.role !== "root" && (i.labels.some((l) => l.startsWith("agent-qa:TC-")) || XRAY_TYPES.test(i.type.trim()));
  const dropped = new Set(collection.issues.filter(isTest).map((i) => i.key));
  if (dropped.size === 0) return collection;
  return {
    ...collection,
    issues: collection.issues.filter((i) => !dropped.has(i.key)).map((i) => ({ ...i, children: i.children.filter((k) => !dropped.has(k)) })),
  };
}
