import { z } from "zod";
import type { Artifact, InputRef, OutputError, StepContext, WorkflowDefinition } from "../../core/index.js";
import { REQUIREMENTS_ARTIFACT, type AnalyzedRequirement, type RequirementsArtifact } from "../requirements/artifact.js";
import { analyzeStep, sealJiraInputs, type RequirementsDeps } from "../requirements/workflow.js";
import {
  TEST_CASES_ARTIFACT,
  TEST_CASES_DRAFT_ARTIFACT,
  TEST_CASES_TEMPLATE_VERSION,
  testCaseSchema,
  type TestCase,
  type TestCases,
  type TestCasesDraft,
} from "./artifact.js";

/**
 * The `test-cases` workflow (S1-9).
 *
 * 1. Analyze (skipped when `requirementsRun` names an earlier requirements
 *    run): the same step as the requirements workflow, writing requirements@1.
 * 2. Cases, by the model, in batches of a few issues so a large JQL fits:
 *    TC-{KEY}-{NNN} cases with P1-P4, steps and the criteria each covers.
 *    The core checks ids, coverage of every criterion and the tokens. The
 *    last batch writes `test-cases-draft@1` for the reviewer.
 * 3. Review (confirm, decision 2): the user keeps, edits or drops cases; the
 *    core writes `test-cases@1` with each case's review and the kept rate.
 */

const KEY = /^[A-Z][A-Z0-9_]+-\d+$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const TOKEN = /<[A-Z][A-Z0-9_]*_\d+>/g;
const SEALED = /^<INPUT_\d+>$/;
/** Issues per cases batch: enough context per answer, small enough for one model answer. */
export const ISSUES_PER_BATCH = 4;
const MAX_CASES_PER_ISSUE = 30;
const MAX_DESCRIPTION = 8_000;

export const testCasesInputSchema = z
  .object({
    key: z.string().trim().toUpperCase().regex(KEY, "must be a Jira issue key such as ABC-123").optional().describe("One Jira issue key, e.g. ABC-123"),
    jql: z
      .string()
      .trim()
      .min(1)
      .max(4000)
      .refine((q) => !SEALED.test(q), "must be a JQL filter, not a vault token")
      .optional()
      .describe("A JQL filter"),
    requirementsRun: z.string().regex(RUN_ID, "must be a run id").optional().describe("Id of a finished requirements run to start from, instead of reading Jira again"),
  })
  .strict()
  .refine((i) => [i.key, i.jql, i.requirementsRun].filter((v) => v !== undefined).length === 1, { message: "give exactly one of key, jql or requirementsRun" });
export type TestCasesInputs = z.infer<typeof testCasesInputSchema>;

const casesOutputSchema = z.object({ cases: z.array(testCaseSchema).min(1) }).strict();
type CasesOutput = z.infer<typeof casesOutputSchema>;

const reviewSchema = z
  .object({
    approved: z.boolean().describe("true once the user has reviewed the cases; false if they stopped the run (nothing is saved)"),
    changes: z
      .array(
        z
          .object({
            id: z.string().describe("The case id"),
            decision: z.enum(["edited", "dropped"]),
            case: testCaseSchema.optional().describe("For edited: the whole corrected case, same id"),
          })
          .strict(),
      )
      .describe("Only the cases the user edited or dropped; every other case is kept as written"),
  })
  .strict();
type Review = z.infer<typeof reviewSchema>;

type Ctx = StepContext<TestCasesInputs>;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}\n[cut: ${text.length - max} more characters]` : text);
const testable = (art: RequirementsArtifact) => art.requirements.filter((r) => r.acceptanceCriteria.length > 0);
const tokensIn = (text: string) => new Set(text.match(TOKEN) ?? []);

function unknownTokens(path: string, text: string, known: Set<string>): OutputError[] {
  const unknown = [...new Set((text.match(TOKEN) ?? []).filter((t) => !known.has(t)))];
  return unknown.length ? [{ path, message: `uses ${unknown.join(", ")}, which the context doesn't have; keep only tokens from the context` }] : [];
}

function caseTexts(c: TestCase): string[] {
  return [c.title, ...c.preconditions, ...c.steps.flatMap((s) => [s.action, s.data, s.expected])];
}

/** Errors in one case against its issue: id, criteria, tokens. */
function checkCase(at: string, c: TestCase, byKey: Map<string, AnalyzedRequirement>, known: Set<string>): OutputError[] {
  const errors: OutputError[] = [];
  const requirement = byKey.get(c.requirement.trim().toUpperCase());
  if (!requirement) return [{ path: `${at}.requirement`, message: `is not an issue to write cases for here (${[...byKey.keys()].join(", ")})` }];
  if (!c.id.startsWith(`TC-${requirement.key}-`)) errors.push({ path: `${at}.id`, message: `must start with TC-${requirement.key}- for a case of ${requirement.key}` });
  const ids = new Set(requirement.acceptanceCriteria.map((ac) => ac.id));
  const bad = c.covers.filter((ac) => !ids.has(ac));
  if (bad.length) errors.push({ path: `${at}.covers`, message: `${requirement.key} has no ${bad.join(", ")}; its criteria are ${[...ids].join(", ")}` });
  caseTexts(c).forEach((text, i) => errors.push(...unknownTokens(`${at}.text.${i}`, text, known)));
  return errors;
}

export type TestCasesDeps = RequirementsDeps;

export function testCasesWorkflow(deps: TestCasesDeps): WorkflowDefinition<TestCasesInputs> {
  const requirementsRunOf = (ctx: Ctx) => ctx.inputs.requirementsRun ?? ctx.runId;
  const requirements = async (ctx: Ctx): Promise<Artifact<RequirementsArtifact>> => {
    const run = requirementsRunOf(ctx);
    const art = await deps.runs.readArtifact(run, REQUIREMENTS_ARTIFACT);
    if (!art) throw new Error(`Run ${run} has no requirements@1: run the requirements workflow first, or start from a key or JQL`);
    return art;
  };
  const batchIssues = async (ctx: Ctx) => {
    const all = testable((await requirements(ctx)).data);
    const batch = ctx.batch ?? 0;
    return all.slice(batch * ISSUES_PER_BATCH, (batch + 1) * ISSUES_PER_BATCH);
  };

  const casesContext = async (ctx: Ctx): Promise<string> => {
    const art = (await requirements(ctx)).data;
    const byKey = new Map(art.requirements.map((r) => [r.key, r]));
    const issues = (await batchIssues(ctx)).map((r) => {
      const parent = r.parent ? byKey.get(r.parent) : undefined;
      return {
        key: r.key,
        type: r.type,
        summary: r.summary,
        ...(parent ? { parent: `${parent.key}: ${parent.summary}` } : {}),
        description: clip(r.description, MAX_DESCRIPTION),
        acceptanceCriteria: r.acceptanceCriteria.map((ac) => `${ac.id}: ${ac.text}`),
        ...(r.openQuestions.length ? { openQuestions: r.openQuestions } : {}),
        ...(Object.keys(r.extraFields).length ? { extraFields: r.extraFields } : {}),
      };
    });
    return JSON.stringify({ issues }, null, 2);
  };

  const draftOf = async (ctx: Ctx): Promise<Artifact<TestCasesDraft>> => {
    const draft = await deps.runs.readArtifact(ctx.runId, TEST_CASES_DRAFT_ARTIFACT);
    if (!draft) throw new Error(`Run ${ctx.runId} has no test-cases-draft@1`);
    return draft;
  };

  return {
    id: "test-cases",
    description:
      "Write test cases (TC-{KEY}-{NNN}, P1-P4, steps, criteria covered) for a Jira issue, a JQL filter or an earlier requirements run, then let the user review them into test-cases@1.",
    inputSchema: testCasesInputSchema,
    prepareInputs: (runId, inputs) => sealJiraInputs(deps, runId, inputs),
    steps: [
      { ...analyzeStep<TestCasesInputs>(deps), when: (ctx) => ctx.inputs.requirementsRun === undefined },
      {
        id: "cases",
        kind: "generate",
        outputSchema: casesOutputSchema,
        batches: async (ctx) => Math.ceil(testable((await requirements(ctx)).data).length / ISSUES_PER_BATCH),
        instructions: (ctx) =>
          [
            `Write test cases for the issues in the context${(ctx.batches ?? 1) > 1 ? ` (batch ${(ctx.batch ?? 0) + 1} of ${ctx.batches}; other issues come in other batches)` : ""}.`,
            "Every acceptance criterion must be covered by at least one case; add negative and edge cases where the criterion allows them. Use the open questions to find edge cases, but don't invent behaviour the issue doesn't state.",
            `Number each issue's cases TC-{KEY}-001, TC-{KEY}-002, and so on (for example TC-ABC-12-001), at most ${MAX_CASES_PER_ISSUE} per issue. requirement is the issue key; covers lists the criteria ids (AC1, AC2...) the case checks.`,
            "Priorities: P1 the main path and anything that loses data or money, P2 important negative cases, P3 secondary and edge cases, P4 cosmetic.",
            "Steps are concrete actions with the data to use and the expected result. Values like <PERSON_1> are masked personal data: keep them exactly as they are and don't make up new ones.",
          ].join("\n"),
        context: casesContext,
        check: async (ctx, output: CasesOutput) => {
          const issues = await batchIssues(ctx);
          const byKey = new Map(issues.map((r) => [r.key, r]));
          const known = tokensIn(await casesContext(ctx));
          const errors: OutputError[] = [];
          const ids = new Set<string>();
          const perIssue = new Map<string, number>();
          const covered = new Set<string>();
          output.cases.forEach((c, i) => {
            const at = `$.cases.${i}`;
            if (ids.has(c.id)) errors.push({ path: `${at}.id`, message: `${c.id} is used more than once` });
            ids.add(c.id);
            errors.push(...checkCase(at, c, byKey, known));
            const key = c.requirement.trim().toUpperCase();
            perIssue.set(key, (perIssue.get(key) ?? 0) + 1);
            for (const ac of c.covers) covered.add(`${key} ${ac}`);
          });
          for (const r of issues) {
            const n = perIssue.get(r.key) ?? 0;
            if (n > MAX_CASES_PER_ISSUE) errors.push({ path: "$.cases", message: `${r.key} has ${n} cases; at most ${MAX_CASES_PER_ISSUE}` });
            const missing = r.acceptanceCriteria.filter((ac) => !covered.has(`${r.key} ${ac.id}`)).map((ac) => ac.id);
            if (missing.length) errors.push({ path: "$.cases", message: `no case covers ${r.key} ${missing.join(", ")}` });
          }
          return errors;
        },
        onAccept: async (ctx, output: CasesOutput) => {
          if ((ctx.batch ?? 0) + 1 < (ctx.batches ?? 1)) return;
          const art = await requirements(ctx);
          const earlier = ((ctx.outputs.cases as CasesOutput[] | undefined) ?? []).slice(0, ctx.batch ?? 0);
          const cases = [...earlier.flatMap((o) => o.cases), ...output.cases].map((c) => ({ ...c, requirement: c.requirement.trim().toUpperCase() }));
          const draft: TestCasesDraft = {
            requirements: { run: requirementsRunOf(ctx), sourceHash: art.sourceHash },
            cases,
            skipped: art.data.requirements.filter((r) => r.acceptanceCriteria.length === 0).map((r) => r.key),
          };
          await deps.runs.writeArtifact(ctx.runId, TEST_CASES_DRAFT_ARTIFACT, draft, { inputs: inputsOf(ctx, art), templateVersion: TEST_CASES_TEMPLATE_VERSION });
        },
      },
      {
        id: "review",
        kind: "confirm",
        outputSchema: reviewSchema,
        personalAnswer: true,
        when: async (ctx) => testable((await requirements(ctx)).data).length > 0,
        instructions: ({ runId }) =>
          [
            `Ask the user to review the draft test cases: they are listed in the context, and in full in test-cases-draft.md in this run's folder (.agent-qa/runs/${runId}/).`,
            "For each case the user may keep it, edit it or drop it. Wait for their answer.",
            "Submit approved: true with changes listing only the edited cases (decision edited, with the whole corrected case, same id) and the dropped ones (decision dropped). Every case not listed is kept.",
            "If the user wants to stop, submit approved: false and nothing is saved.",
          ].join("\n"),
        context: async (ctx) => {
          const draft = (await draftOf(ctx)).data;
          const lines = draft.cases.map((c) => `${c.id} | ${c.priority} | ${c.type} | covers ${c.covers.join(", ")} | ${c.title}`);
          return [`${draft.cases.length} draft case(s):`, ...lines].join("\n");
        },
        check: async (ctx, review: Review) => {
          // A user who stops the run isn't asked to fix their changes: nothing is saved anyway.
          if (!review.approved) return [];
          const art = (await requirements(ctx)).data;
          const draft = (await draftOf(ctx)).data;
          const ids = new Set(draft.cases.map((c) => c.id));
          const byKey = new Map(art.requirements.map((r) => [r.key, r]));
          const known = tokensIn(JSON.stringify(art) + JSON.stringify(draft));
          const errors: OutputError[] = [];
          const seen = new Set<string>();
          review.changes.forEach((change, i) => {
            const at = `$.changes.${i}`;
            // Messages here never repeat what the user typed: it may hold personal data.
            if (!ids.has(change.id)) errors.push({ path: `${at}.id`, message: "is not a draft case id" });
            if (seen.has(change.id)) errors.push({ path: `${at}.id`, message: "this case is changed more than once" });
            seen.add(change.id);
            if (change.decision === "dropped" && change.case) errors.push({ path: `${at}.case`, message: "a dropped case has no case" });
            if (change.decision === "edited") {
              if (!change.case) errors.push({ path: `${at}.case`, message: "an edited case needs the whole corrected case" });
              else {
                if (change.case.id !== change.id) errors.push({ path: `${at}.case.id`, message: "must stay the id of the case being edited" });
                errors.push(...checkCase(`${at}.case`, change.case, byKey, known));
              }
            }
          });
          return errors;
        },
        // An edit is the user's own text and may name people or hold data: it is masked with the
        // requirements run's vault before the run keeps it, like the sources were.
        sanitize: async (ctx, review: Review): Promise<Review> => {
          if (!review.approved) return { approved: false, changes: [] };
          const run = requirementsRunOf(ctx);
          // An expired vault starts again from <PERSON_1>, which would give a new value an old token.
          const art = await requirements(ctx);
          const edits = review.changes.some((c) => c.case);
          if (edits && /<[A-Z][A-Z0-9_]*_\d+>/.test(JSON.stringify(art.data)) && !(await deps.data.hasVault(run))) {
            throw new Error(`the token vault of run ${run} has expired or was deleted, so edits can't be masked consistently; start a new run`);
          }
          const changes = await Promise.all(
            review.changes.map(async (change) => {
              if (!change.case) return change;
              const c = change.case;
              const [title, ...rest] = await deps.data.maskTexts(run, [c.title, ...c.preconditions, ...c.steps.flatMap((s) => [s.action, s.data, s.expected])], "review.edit");
              const preconditions = rest.slice(0, c.preconditions.length);
              const steps = c.steps.map((_, i) => {
                const [action, data, expected] = rest.slice(c.preconditions.length + i * 3, c.preconditions.length + i * 3 + 3) as [string, string, string];
                return { action, data, expected };
              });
              const masked = testCaseSchema.safeParse({ ...c, title: title!, preconditions, steps });
              if (!masked.success) {
                const where = masked.error.issues.map((i) => i.path.join(".")).join(", ");
                throw new Error(`case ${c.id} no longer fits once its personal data is masked (${where}); shorten it and submit again`);
              }
              return { ...change, case: masked.data };
            }),
          );
          return { approved: true, changes };
        },
        onAccept: async (ctx, review: Review) => {
          if (!review.approved) return;
          const art = await requirements(ctx);
          const draft = (await draftOf(ctx)).data;
          const changes = new Map(review.changes.map((c) => [c.id, c]));
          const cases: TestCases["cases"] = [];
          const dropped: string[] = [];
          for (const c of draft.cases) {
            const change = changes.get(c.id);
            if (change?.decision === "dropped") dropped.push(c.id);
            else if (change?.decision === "edited") cases.push({ ...change.case!, requirement: c.requirement, review: "edited" });
            else cases.push({ ...c, review: "kept" });
          }
          const covered = new Set(cases.flatMap((c) => c.covers.map((ac) => `${c.requirement} ${ac}`)));
          const uncovered = testable(art.data).flatMap((r) =>
            r.acceptanceCriteria.filter((ac) => !covered.has(`${r.key} ${ac.id}`)).map((ac) => ({ requirement: r.key, criterion: ac.id })),
          );
          const kept = cases.filter((c) => c.review === "kept").length;
          const data: TestCases = {
            requirements: draft.requirements,
            cases,
            dropped,
            skipped: draft.skipped,
            uncovered,
            review: {
              generated: draft.cases.length,
              kept,
              edited: cases.length - kept,
              dropped: dropped.length,
              keptRate: draft.cases.length ? kept / draft.cases.length : 1,
            },
          };
          await deps.runs.writeArtifact(ctx.runId, TEST_CASES_ARTIFACT, data, { inputs: inputsOf(ctx, art), templateVersion: TEST_CASES_TEMPLATE_VERSION });
        },
      },
    ],
  };

  function inputsOf(ctx: Ctx, art: Artifact<RequirementsArtifact>): InputRef[] {
    return [{ kind: "artifact", ref: `${requirementsRunOf(ctx)}/requirements`, hash: art.sourceHash }];
  }
}
