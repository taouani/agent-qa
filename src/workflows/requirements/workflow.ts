import { z } from "zod";
import type { OutputError, RunStore, WorkflowDefinition } from "../../core/index.js";
import type { JiraInput, LoadedSources, Requirement, RequirementsData } from "../../data/index.js";
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
 *    proposed criteria for issues that have none.
 * 3. The core checks every issue is answered once and no unknown token was
 *    made up, then writes `requirements@1` (`requirements.json` and `.md`).
 */

export interface RequirementsDeps {
  data: RequirementsData;
  runs: Pick<RunStore, "writeArtifact">;
}

const KEY = /^[A-Z][A-Z0-9_]+-\d+$/;
const TOKEN = /<[A-Z][A-Z0-9_]*_\d+>/g;
const MAX_DESCRIPTION = 12_000;
const MAX_PAGE = 6_000;

export const requirementsInputSchema = z
  .object({
    key: z.string().trim().toUpperCase().regex(KEY, "must be a Jira issue key such as ABC-123").optional().describe("One Jira issue key, e.g. ABC-123"),
    jql: z.string().trim().min(1).max(4000).optional().describe("A JQL filter, e.g. project = ABC AND sprint in openSprints()"),
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
              .array(z.string().min(1).max(1000))
              .max(20)
              .describe("Only for issues with no acceptance criteria: testable criteria the issue implies. Empty otherwise"),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
type Analysis = z.infer<typeof analysisSchema>;

function inputOf(inputs: RequirementsInputs): JiraInput {
  return inputs.key !== undefined ? { key: inputs.key } : { jql: inputs.jql! };
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}\n[cut: ${text.length - max} more characters]` : text);

/** What the model sees of each issue: masked, and without hashes or ids it doesn't need. */
function contextOf(loaded: LoadedSources): string {
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
  "inferredCriteria: only for an issue whose acceptanceCriteria is empty, the testable criteria its summary and description imply, one per item. Leave it empty for every issue that has criteria, and for epics that only group other issues.",
  "Values like <PERSON_1> are masked personal data: keep them exactly as they are, never guess what they stand for, and don't make up new ones.",
].join("\n");

/** Errors the schema can't catch: each issue answered once, criteria only where none exist, no made-up tokens. */
function check(requirements: Requirement[], context: string, analysis: Analysis): OutputError[] {
  const errors: OutputError[] = [];
  const byKey = new Map(requirements.map((r) => [r.key, r]));
  const seen = new Set<string>();
  const known = new Set(context.match(TOKEN) ?? []);
  analysis.issues.forEach((issue, i) => {
    const at = `$.issues.${i}`;
    const requirement = byKey.get(issue.key);
    if (!requirement) errors.push({ path: `${at}.key`, message: `${issue.key} is not an issue in the context` });
    else if (seen.has(issue.key)) errors.push({ path: `${at}.key`, message: `${issue.key} is answered more than once` });
    seen.add(issue.key);
    if (requirement && requirement.acceptanceCriteria.length > 0 && issue.inferredCriteria.length > 0) {
      errors.push({ path: `${at}.inferredCriteria`, message: `${issue.key} already has acceptance criteria: leave inferredCriteria empty` });
    }
    const texts: Array<[string, string]> = [
      ...issue.openQuestions.map((q, j): [string, string] => [`${at}.openQuestions.${j}`, q]),
      ...issue.inferredCriteria.map((c, j): [string, string] => [`${at}.inferredCriteria.${j}`, c]),
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

function build(loaded: LoadedSources, analysis: Analysis): RequirementsArtifact {
  const byKey = new Map(analysis.issues.map((a) => [a.key, a]));
  const requirements = loaded.sources.requirements.map((r): AnalyzedRequirement => {
    const a = byKey.get(r.key)!;
    const own = r.acceptanceCriteria.map((ac) => ({ ...ac, origin: "jira" as const }));
    const inferred = own.length === 0 ? a.inferredCriteria.map((text, i) => ({ id: `AC${i + 1}`, text, origin: "inferred" as const })) : [];
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
      labels: r.labels,
      components: r.components,
      fixVersions: r.fixVersions,
      linkedPages: r.linkedPages.map((p) => ({ id: p.id, title: p.title, version: p.version })),
      quality: a.quality,
      openQuestions: a.openQuestions,
      sourceHash: r.sourceHash,
    };
  });
  return { input: loaded.sources.input, requirements, truncated: loaded.sources.truncated, unreachable: loaded.sources.unreachable };
}

export function requirementsWorkflow(deps: RequirementsDeps): WorkflowDefinition<RequirementsInputs> {
  const load = (runId: string, inputs: RequirementsInputs) => deps.data.requirements(runId, inputOf(inputs));
  return {
    id: "requirements",
    description: "Read a Jira issue or JQL filter (with children, linked issues and Confluence pages), mask it, and analyze it into requirements@1 with quality scores and open questions.",
    inputSchema: requirementsInputSchema,
    // A JQL filter can name a person, so the run folder keeps a vault token instead.
    prepareInputs: async (runId, inputs) => {
      const sealed = await deps.data.sealInput(runId, inputOf(inputs));
      return "key" in sealed ? { key: sealed.key } : { jql: sealed.jql };
    },
    steps: [
      {
        id: "analyze",
        kind: "generate",
        outputSchema: analysisSchema,
        instructions: () => INSTRUCTIONS,
        context: async ({ runId, inputs }) => contextOf(await load(runId, inputs)),
        check: async ({ runId, inputs }, output) => {
          const loaded = await load(runId, inputs);
          return check(loaded.sources.requirements, contextOf(loaded), output);
        },
        onAccept: async ({ runId, inputs }, output) => {
          const loaded = await load(runId, inputs);
          await deps.runs.writeArtifact(runId, REQUIREMENTS_ARTIFACT, build(loaded, output), {
            inputs: loaded.inputs,
            templateVersion: REQUIREMENTS_TEMPLATE_VERSION,
          });
        },
      },
    ],
  };
}
