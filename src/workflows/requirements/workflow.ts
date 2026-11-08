import { z } from "zod";
import { EngineError, type OutputError, type RunStore, type StepContext, type StepDefinition, type WorkflowDefinition } from "../../core/index.js";
import type { JiraInput, LoadedSources, MaskedPullRequest, RelatedFeature, Requirement, RequirementsData } from "../../data/index.js";
import {
  QUALITY_GAPS,
  REQUIREMENTS_ARTIFACT,
  REQUIREMENTS_TEMPLATE_VERSION,
  type AnalyzedRequirement,
  type RequirementsArtifact,
} from "./artifact.js";

/**
 * The `requirements` workflow (S1-8).
 *
 * 1. Fetch, in the core with no model: the masked data service reads the
 *    ticket or JQL filter with its children, linked issues and Confluence
 *    pages, and caches them in the run folder. It runs while the analyze step
 *    is rendered; if Jira can't be read the run stays open and `workflow_next`
 *    tries again.
 * 2. Analyze, by the model: a quality score, gaps, open questions, and
 *    proposed criteria for issues that have none. With `withPullRequests`
 *    (S4-6), the pull requests that name each issue on the git host, masked,
 *    are context too, and the analysis may add code notes, each naming the
 *    file it comes from.
 * 3. The core checks every issue is answered once and no unknown token was
 *    made up, then writes `requirements@1` (`requirements.json` and `.md`).
 */

export interface RequirementsDeps {
  data: RequirementsData;
  runs: Pick<RunStore, "writeArtifact" | "readArtifact">;
}

const KEY = /^[A-Z][A-Z0-9_]+-\d+$/;
const TOKEN = /<[A-Z][A-Z0-9_]*_\d+>/g;
/** What `DataAccess.sealInput` stores in place of a JQL filter. */
const SEALED = /^<INPUT_\d+>$/;
const norm = (key: string) => key.trim().toUpperCase();
const MAX_DESCRIPTION = 12_000;
const MAX_PAGE = 6_000;

/** The optional input that adds pull requests to the analysis (S4-6), shared by every workflow that starts from Jira. */
export const withPullRequestsInput = z
  .boolean()
  .optional()
  .describe("Also give the analysis the pull requests that name each issue key on the git host (agent-qa.yaml git section), masked, with their diffs capped per issue");

export const requirementsInputSchema = z
  .object({
    key: z.string().trim().toUpperCase().regex(KEY, "must be a Jira issue key such as ABC-123").optional().describe("One Jira issue key, e.g. ABC-123"),
    jql: z
      .string()
      .trim()
      .min(1)
      .max(4000)
      .refine((q) => !SEALED.test(q), "must be a JQL filter, not a vault token")
      .optional().describe("A JQL filter, e.g. project = ABC AND sprint in openSprints()"),
    withPullRequests: withPullRequestsInput,
  })
  .strict()
  .refine((i) => (i.key === undefined) !== (i.jql === undefined), { message: "give exactly one of key or jql" });
export type RequirementsInputs = z.infer<typeof requirementsInputSchema>;

const analysisSchema = z
  .object({
    issues: z
      .array(
        z
          .object({
            key: z.string().describe("The issue key, exactly as in the context"),
            quality: z
              .object({
                score: z.number().int().min(0).max(100).describe("How ready the issue is to test, 0 to 100"),
                missing: z.array(z.enum(QUALITY_GAPS)).describe("What the issue lacks; empty if nothing"),
              })
              .strict(),
            openQuestions: z.array(z.string().min(1).max(500)).max(15).describe("Questions a tester would ask the author; empty if none"),
            inferredCriteria: z
              .array(
                z.union([
                  z.string().min(1).max(1000),
                  z
                    .object({
                      text: z.string().min(1).max(1000),
                      from: z.string().min(1).max(500).describe('"issue" when the issue implies it, or the path of the related feature it comes from'),
                    })
                    .strict(),
                ]),
              )
              .max(20)
              .describe("Only for issues with no acceptance criteria: testable criteria, each with where it comes from. Empty otherwise"),
            codeNotes: z
              .array(
                z
                  .object({
                    file: z.string().min(1).max(500).describe("The path of the changed file the note comes from, exactly as in the issue's pullRequests"),
                    note: z.string().min(1).max(500).describe("What the change shows that matters for testing: behaviour the issue doesn't state, a limit, an error case, a gap"),
                  })
                  .strict(),
              )
              .max(15)
              .optional()
              .describe("Only for issues with pullRequests in the context: what their code changes show for testing. Leave out otherwise"),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
type Analysis = z.infer<typeof analysisSchema>;

function inputOf(inputs: JiraInputs): JiraInput {
  return inputs.key !== undefined ? { key: inputs.key } : { jql: inputs.jql! };
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}\n[cut: ${text.length - max} more characters]` : text);

/** What the model sees of each issue: masked, and without hashes or ids it doesn't need. */
function contextOf(loaded: LoadedSources, related: Record<string, RelatedFeature[]> = {}, prs: PullRequestsByIssue = {}): string {
  const issues = loaded.sources.requirements.map((r) => ({
    key: r.key,
    type: r.type,
    ...(r.status ? { status: r.status } : {}),
    ...(r.priority ? { priority: r.priority } : {}),
    role: r.role,
    ...(r.parent ? { parent: r.parent } : {}),
    ...(r.children.length ? { children: r.children } : {}),
    ...(r.links.length ? { links: r.links.map((l) => `${l.description} ${l.key}`) } : {}),
    summary: r.summary,
    description: clip(r.description, MAX_DESCRIPTION),
    acceptanceCriteria: r.acceptanceCriteria.map((ac) => `${ac.id}: ${ac.text}`),
    ...(Object.keys(r.extraFields).length ? { extraFields: r.extraFields } : {}),
    ...(r.labels.length ? { labels: r.labels } : {}),
    ...(r.components.length ? { components: r.components } : {}),
    ...(r.linkedPages.length ? { linkedPages: r.linkedPages.map((p) => ({ title: p.title, text: clip(p.text, MAX_PAGE) })) } : {}),
    ...(related[r.key]?.length ? { relatedFeatures: related[r.key]!.map((f) => ({ path: f.path, text: f.text })) } : {}),
    ...(prs[r.key]?.length
      ? {
          pullRequests: prs[r.key]!.map((p) => ({
            id: p.id,
            title: p.title,
            state: p.state,
            files: p.files.map((f) => ({ path: f.path, status: f.status, ...(f.patch !== undefined ? { diff: f.patch } : { diff: "(left out: over the size cap, or not sent by the host)" }) })),
          })),
        }
      : {}),
  }));
  const notes = [
    loaded.sources.truncated ? "The Jira read hit a limit, so some related issues are missing." : "",
    loaded.sources.unreachable.length ? `Could not be read: ${loaded.sources.unreachable.join(", ")}.` : "",
  ].filter(Boolean);
  return [...notes, JSON.stringify({ issues }, null, 2)].join("\n\n");
}

const INSTRUCTIONS = [
  "Analyze each Jira issue in the context for testing. Answer once for every issue, by its key.",
  "quality.score: 90-100 testable as written; 70-89 small gaps; 40-69 a tester must ask before writing cases; below 40 not testable.",
  `quality.missing: the gaps, from: ${QUALITY_GAPS.join(", ")}.`,
  "openQuestions: what a tester would ask the author: undefined behaviour, error cases, limits, roles, data rules. Be specific; no generic questions.",
  'inferredCriteria: only for an issue whose acceptanceCriteria is empty, the testable criteria it implies, one per item, each as {"text", "from"}. from is "issue" for a criterion its summary, description or pages imply. Leave it empty for every issue that has criteria, and for epics that only group other issues.',
  'relatedFeatures: feature files of the repo that may describe similar behaviour, found by the issue key or by words of its summary. For an issue with no criteria, you may propose criteria from them, with from set to the file\'s path, but only for behaviour the issue makes likely to apply. A related feature can describe another process: where it may differ (limits, approvers, roles, messages), ask in openQuestions instead of copying it.',
  "pullRequests: changes on the git host whose title, branch or commits name the issue key, with their diffs (masked; some diffs left out past a size cap). They show what was built, not what was asked: use them for openQuestions where the code and the issue differ, and add codeNotes, each naming the file (its path exactly as given) a note comes from. Don't treat code as acceptance criteria. Leave codeNotes out for issues with no pullRequests.",
  "Use only this context: don't read the repository or other files yourself. What the analysis may use from the repo is already in relatedFeatures and pullRequests.",
  "Values like <PERSON_1> are masked personal data: keep them exactly as they are, never guess what they stand for, and don't make up new ones.",
].join("\n");

/** Errors the schema can't catch: each issue answered once, criteria only where none exist, no made-up tokens. */
function check(requirements: Requirement[], context: string, analysis: Analysis, related: Record<string, RelatedFeature[]> = {}, prs: PullRequestsByIssue = {}): OutputError[] {
  const errors: OutputError[] = [];
  const byKey = new Map(requirements.map((r) => [r.key, r]));
  const seen = new Set<string>();
  const known = new Set(context.match(TOKEN) ?? []);
  analysis.issues.forEach((issue, i) => {
    const at = `$.issues.${i}`;
    const key = norm(issue.key);
    const requirement = byKey.get(key);
    if (!requirement) errors.push({ path: `${at}.key`, message: `${issue.key} is not an issue in the context` });
    else if (seen.has(key)) errors.push({ path: `${at}.key`, message: `${key} is answered more than once` });
    seen.add(key);
    if (requirement && requirement.acceptanceCriteria.length > 0 && issue.inferredCriteria.length > 0) {
      errors.push({ path: `${at}.inferredCriteria`, message: `${issue.key} already has acceptance criteria: leave inferredCriteria empty` });
    }
    const paths = new Set((related[key] ?? []).map((f) => f.path));
    issue.inferredCriteria.forEach((c, j) => {
      const from = typeof c === "string" ? "issue" : c.from;
      if (from !== "issue" && !paths.has(from)) {
        errors.push({ path: `${at}.inferredCriteria.${j}.from`, message: `${from} isn't one of ${key}'s relatedFeatures; use "issue" or one of: ${[...paths].join(", ") || "(none)"}` });
      }
    });
    const files = new Set((prs[key] ?? []).flatMap((p) => p.files.map((f) => f.path)));
    (issue.codeNotes ?? []).forEach((n, j) => {
      if (!files.has(n.file)) {
        errors.push({ path: `${at}.codeNotes.${j}.file`, message: files.size ? `${n.file} isn't a file of ${key}'s pullRequests` : `${key} has no pullRequests in the context: leave codeNotes out` });
      }
    });
    const texts: Array<[string, string]> = [
      ...(issue.codeNotes ?? []).map((n, j): [string, string] => [`${at}.codeNotes.${j}.note`, n.note]),
      ...issue.openQuestions.map((q, j): [string, string] => [`${at}.openQuestions.${j}`, q]),
      ...issue.inferredCriteria.map((c, j): [string, string] => [`${at}.inferredCriteria.${j}`, typeof c === "string" ? c : c.text]),
    ];
    for (const [path, text] of texts) {
      const unknown = (text.match(TOKEN) ?? []).filter((t) => !known.has(t));
      if (unknown.length) errors.push({ path, message: `uses ${[...new Set(unknown)].join(", ")}, which the context doesn't have; keep only tokens from the context` });
    }
  });
  const missing = requirements.filter((r) => !seen.has(r.key)).map((r) => r.key);
  if (missing.length) errors.push({ path: "$.issues", message: `no answer for ${missing.join(", ")}` });
  return errors;
}

function build(loaded: LoadedSources, analysis: Analysis, related: Record<string, RelatedFeature[]> = {}, prs: PullRequestsByIssue = {}): RequirementsArtifact {
  const byKey = new Map(analysis.issues.map((a) => [norm(a.key), a]));
  const requirements = loaded.sources.requirements.map((r): AnalyzedRequirement => {
    const a = byKey.get(r.key)!;
    const own = r.acceptanceCriteria.map((ac) => ({ ...ac, origin: "jira" as const }));
    const inferred =
      own.length === 0
        ? a.inferredCriteria.map((c, i) => {
            const from = typeof c === "string" ? "issue" : c.from;
            return { id: `AC${i + 1}`, text: typeof c === "string" ? c : c.text, origin: "inferred" as const, ...(from !== "issue" ? { from } : {}) };
          })
        : [];
    return {
      key: r.key,
      type: r.type,
      ...(r.status ? { status: r.status } : {}),
      ...(r.priority ? { priority: r.priority } : {}),
      role: r.role,
      depth: r.depth,
      ...(r.parent ? { parent: r.parent } : {}),
      children: r.children,
      links: r.links,
      summary: r.summary,
      description: r.description,
      acceptanceCriteria: own.length ? own : inferred,
      acceptanceCriteriaSource: own.length ? r.acceptanceCriteriaSource : inferred.length ? "inferred" : "none",
      extraFields: r.extraFields,
      labels: r.labels,
      components: r.components,
      fixVersions: r.fixVersions,
      linkedPages: r.linkedPages.map((p) => ({ id: p.id, title: p.title, version: p.version })),
      quality: a.quality,
      openQuestions: a.openQuestions,
      ...(related[r.key]?.length ? { related: related[r.key]!.map((f) => ({ path: f.path, hash: f.hash })) } : {}),
      ...(prs[r.key]?.length ? { pullRequests: prs[r.key]!.map((p) => ({ id: p.id, url: p.url, title: p.title, state: p.state, hash: p.hash })) } : {}),
      ...(a.codeNotes?.length ? { codeNotes: a.codeNotes } : {}),
      sourceHash: r.sourceHash,
    };
  });
  return { input: loaded.sources.input, requirements, truncated: loaded.sources.truncated, unreachable: loaded.sources.unreachable };
}

/** The related feature files of the issues with no criteria of their own (the others don't infer any). */
export async function relatedFeaturesOf(deps: RequirementsDeps, runId: string, loaded: LoadedSources): Promise<Record<string, RelatedFeature[]>> {
  const bare = loaded.sources.requirements.filter((r) => r.acceptanceCriteria.length === 0).map((r) => ({ key: r.key, summary: r.summary }));
  if (!deps.data.relatedFeatures || bare.length === 0) return {};
  return deps.data.relatedFeatures(runId, bare);
}

/** Masked pull requests by issue key. */
export type PullRequestsByIssue = Record<string, MaskedPullRequest[]>;

/** The pull requests of the run's issues, when the inputs ask for them (S4-6). */
export async function pullRequestsOf(deps: RequirementsDeps, runId: string, inputs: JiraInputs, loaded: LoadedSources): Promise<PullRequestsByIssue> {
  if (!inputs.withPullRequests || !deps.data.pullRequests) return {};
  return (await deps.data.pullRequests(runId, loaded.sources.requirements.map((r) => r.key))).byIssue;
}

/**
 * What the analysis of `loaded` would be given, as one string per issue: its
 * sourceHash and its related files. Two runs with the same fingerprint gave
 * the model the same input (Tarek, 7 Nov 2026: reuse only then).
 */
export function inputFingerprint(
  issues: ReadonlyArray<{ key: string; sourceHash: string; related?: ReadonlyArray<{ path: string; hash: string }> | undefined; pullRequests?: ReadonlyArray<{ id: number; hash: string }> | undefined }>,
): string {
  return issues
    .map((r) => `${r.key} ${r.sourceHash} ${[...(r.related ?? [])].map((f) => `${f.path}@${f.hash}`).sort().join(",")}${r.pullRequests?.length ? ` pr:${[...r.pullRequests].map((p) => `${p.id}@${p.hash}`).sort().join(",")}` : ""}`)
    .sort()
    .join("\n");
}

export { inputOf as jiraInputOf };

/** Inputs of any workflow that starts from Jira: one key or one JQL filter. */
export type JiraInputs = { key?: string | undefined; jql?: string | undefined; withPullRequests?: boolean | undefined };

/** Leaves some issues out of an analysis: `--changed-only` drops the ones unchanged since their cases were written. */
export type NarrowSources<I> = (ctx: StepContext<I>, loaded: LoadedSources) => LoadedSources | Promise<LoadedSources>;

/** Only the issues `keep` names, and only their own inputs in the artifact's sourceHash. */
export function onlyIssues(loaded: LoadedSources, keep: ReadonlySet<string>): LoadedSources {
  const requirements = loaded.sources.requirements.filter((r) => keep.has(r.key));
  const dropped = new Set(loaded.sources.requirements.filter((r) => !keep.has(r.key)).map((r) => r.key));
  return { ...loaded, sources: { ...loaded.sources, requirements }, inputs: loaded.inputs.filter((i) => !(i.kind === "jira-issue" && dropped.has(i.ref))) };
}

/** The analyze step, shared with the test-cases workflow. It writes requirements@1 when accepted. */
export function analyzeStep<I extends JiraInputs>(deps: RequirementsDeps, narrow?: NarrowSources<I>): StepDefinition<I, Analysis> {
  const loadFor = async (ctx: StepContext<I>) => {
    const loaded = await deps.data.requirements(ctx.runId, inputOf(ctx.inputs));
    return narrow ? narrow(ctx, loaded) : loaded;
  };
  const relatedOf = (runId: string, loaded: LoadedSources) => relatedFeaturesOf(deps, runId, loaded);
  const prsOf = (runId: string, inputs: I, loaded: LoadedSources) => pullRequestsOf(deps, runId, inputs, loaded);
  return {
    id: "analyze",
    kind: "generate",
    outputSchema: analysisSchema,
    instructions: () => INSTRUCTIONS,
    context: async (ctx) => {
      const { runId, inputs } = ctx;
      const loaded = await loadFor(ctx);
      return contextOf(loaded, await relatedOf(runId, loaded), await prsOf(runId, inputs, loaded));
    },
    check: async (ctx, output) => {
      const { runId, inputs } = ctx;
      const loaded = await loadFor(ctx);
      const related = await relatedOf(runId, loaded);
      const prs = await prsOf(runId, inputs, loaded);
      return check(loaded.sources.requirements, contextOf(loaded, related, prs), output, related, prs);
    },
    onAccept: async (ctx, output) => {
      const { runId, inputs } = ctx;
      const loaded = await loadFor(ctx);
      const prs = await prsOf(runId, inputs, loaded);
      const prInputs = [...new Map(Object.values(prs).flat().map((p) => [p.id, { kind: "git-diff" as const, ref: `pr/${p.id}`, hash: p.hash }])).values()];
      await deps.runs.writeArtifact(runId, REQUIREMENTS_ARTIFACT, build(loaded, output, await relatedOf(runId, loaded), prs), {
        inputs: [...loaded.inputs, ...prInputs],
        templateVersion: REQUIREMENTS_TEMPLATE_VERSION,
      });
    },
  };
}

/** A JQL filter can name a person, so the run folder keeps a vault token instead. */
export async function sealJiraInputs<I extends JiraInputs>(deps: RequirementsDeps, runId: string, inputs: I): Promise<I> {
  if (inputs.withPullRequests) {
    if (inputs.key === undefined && inputs.jql === undefined) throw new EngineError("INVALID_INPUTS", "withPullRequests adds pull requests to a new analysis: give a key or a JQL filter");
    if (!(await deps.data.pullRequestsEnabled?.())) throw new EngineError("INVALID_INPUTS", "withPullRequests needs a git section in agent-qa.yaml (platform, repo and token) to find pull requests");
  }
  if (inputs.key === undefined && inputs.jql === undefined) return inputs;
  const sealed = await deps.data.sealInput(runId, inputOf(inputs));
  return "key" in sealed ? { ...inputs, key: sealed.key } : { ...inputs, jql: sealed.jql };
}

export function requirementsWorkflow(deps: RequirementsDeps): WorkflowDefinition<RequirementsInputs> {
  return {
    id: "requirements",
    description: "Read a Jira issue or JQL filter (with children, linked issues and Confluence pages), mask it, and analyze it into requirements@1 with quality scores and open questions.",
    inputSchema: requirementsInputSchema,
    prepareInputs: (runId, inputs) => sealJiraInputs(deps, runId, inputs),
    steps: [analyzeStep<RequirementsInputs>(deps)],
  };
}
