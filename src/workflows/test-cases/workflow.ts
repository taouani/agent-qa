import { z } from "zod";
import type { Artifact, InputRef, OutputError, RunStore, StepContext, WorkflowDefinition } from "../../core/index.js";
import type { ExistingTest, RequirementsData, XrayData } from "../../data/index.js";
import { REQUIREMENTS_ARTIFACT, type AnalyzedRequirement, type RequirementsArtifact } from "../requirements/artifact.js";
import { analyzeStep, inputFingerprint, jiraInputOf, relatedFeaturesOf, sealJiraInputs, type RequirementsDeps } from "../requirements/workflow.js";
import {
  TEST_CASES_ARTIFACT,
  TEST_CASES_DRAFT_ARTIFACT,
  TEST_CASES_TEMPLATE_VERSION,
  testCaseSchema,
  XRAY_PUSH_ARTIFACT,
  type XrayPush,
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
 *
 * With `casesRun` (Tarek, 7 Nov 2026), a new run goes straight to the push of
 * an earlier run's reviewed test-cases@1, with that run's vault: the way to
 * push cases whose push was declined. The earlier run stays as it finished.
 * 4. Push (confirm, S1-10; only with an `xray` section the policy doesn't
 *    deny): the user says whether to push the reviewed cases to Xray. The
 *    data layer writes through `Policy.guard`; the core writes `xray-push@1`.
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
    casesRun: z
      .string()
      .regex(RUN_ID, "must be a run id")
      .optional()
      .describe("Id of an earlier test-cases run whose reviewed cases weren't pushed (the push was declined): goes straight to the push, with no analysis, cases or review"),
  })
  .strict()
  .refine((i) => [i.key, i.jql, i.requirementsRun, i.casesRun].filter((v) => v !== undefined).length === 1, { message: "give exactly one of key, jql, requirementsRun or casesRun" });
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
    unattended: z.literal(true).optional().describe("Leave this out. Set only by the CLI's --yes, when nobody reviewed the cases"),
  })
  .strict();
type Review = z.infer<typeof reviewSchema>;

const pushSchema = z
  .object({ approve: z.boolean().describe("true if the user said to push the cases to Xray, false if not") })
  .strict();
type Push = z.infer<typeof pushSchema>;

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

const numberOf = (id: string) => Number(/-(\d+)$/.exec(id)?.[1] ?? NaN);

/** Words that say nothing about what a test checks. */
const FILLER = new Set(
  "the a an and or of to for in on at by with from is are be that this its it as when then than verify verifies check checks ensure ensures test tests validate validates confirm confirms should can".split(" "),
);
/** Words that turn a check into its opposite, by kind: titles that differ in them check different things. */
const POLARITY = new Map(
  Object.entries({
    not: "not no without never",
    fail: "fail fails failed failing error errors",
    invalid: "invalid wrong incorrect",
    refuse: "reject rejects rejected deny denies denied block blocks blocked forbidden unauthorized",
    missing: "missing empty",
  }).flatMap(([kind, ws]) => ws.split(" ").map((w) => [w, kind] as const)),
);
/** Words that narrow a check to another case of it: one title having one the other lacks is another check. */
const QUALIFIER = new Set(
  "duplicate duplicated partial partially twice again multiple bulk concurrent concurrently first second third last all only every each single none some other another new existing same different more less over under above below before after max min maximum minimum eur usd gbp chf jpy dollar dollars euro euros pound pounds yen".split(" "),
);
const stem = (w: string) => w.replace(/(?:ing|ed|es|s)$/, (end) => (w.length - end.length >= 3 ? "" : end));
const rawWords = (text: string) =>
  text
    .toLowerCase()
    .replace(/\bcan(?:no|['’])t\b|n['’]t\b/g, " not")
    .split(/[^\p{L}\p{N}_<>]+/u)
    .filter((w) => w.length > 1 && !FILLER.has(w));
const narrows = (w: string) => QUALIFIER.has(w) || /\d/.test(w) || /^<[a-z]+_\d+>$/.test(w);

/**
 * Whether two titles name the same check. Deliberately strict, since a wrong
 * match overwrites a test in Xray, while a missed one only adds a test:
 * - the same kinds of negation and failure words ("not", "fails", "invalid"...);
 * - no number, currency, masked value or qualifier ("duplicate", "partial",
 *   "twice", "over"...) in one title only;
 * - at least two meaningful words in common, and at least half of all words;
 * - each title has a word the other lacks (a title plus words is a narrower
 *   check), but not one word swapped for another ("password" for "username").
 */
export function sameCheck(a: string, b: string): boolean {
  const [ra, rb] = [rawWords(a), rawWords(b)];
  const polarity = (ws: string[]) => [...new Set(ws.flatMap((w) => POLARITY.get(w) ?? []))].sort().join(" ");
  if (polarity(ra) !== polarity(rb)) return false;
  if (ra.filter((w) => !rb.includes(w)).some(narrows) || rb.filter((w) => !ra.includes(w)).some(narrows)) return false;
  const [x, y] = [new Set(ra.map(stem)), new Set(rb.map(stem))];
  const shared = [...x].filter((w) => y.has(w)).length;
  const onlyX = x.size - shared;
  const onlyY = y.size - shared;
  if (shared < 2 || shared / (shared + onlyX + onlyY) < 0.5) return false;
  if (onlyX === 0 && onlyY === 0) return true;
  return onlyX > 0 && onlyY > 0 && !(onlyX === 1 && onlyY === 1);
}

/**
 * A case may take an existing test's id only to check the same thing: the same
 * title, reworded at most. Criterion numbers aren't compared, since a later run
 * can number the criteria differently. A new case is numbered after every
 * existing test, so a rerun never overwrites a test with an unrelated case.
 */
function checkReuse(at: string, c: TestCase, existing: ExistingTest[], unseen: Map<string, string>): OutputError[] {
  const numbers = [...existing.map((t) => t.id), ...[...unseen.keys()].filter((id) => id.startsWith(`TC-${c.requirement.trim().toUpperCase()}-`))]
    .map(numberOf)
    .filter(Number.isFinite);
  if (numbers.length === 0) return [];
  const highest = Math.max(...numbers);
  const next = `TC-${c.requirement.trim().toUpperCase()}-${String(highest + 1).padStart(3, "0")}`;
  const hidden = unseen.get(c.id);
  if (hidden) return [{ path: `${at}.id`, message: `${c.id} belongs to Xray test ${hidden}, which isn't linked to ${c.requirement} any more, so it can't be matched: number this case from ${next}` }];
  const same = existing.find((t) => t.id === c.id);
  if (same) {
    if (sameCheck(c.title, same.title)) return [];
    return [{ path: `${at}.id`, message: `${c.id} is the existing test "${same.title}", which this case doesn't match: keep the id only for a case that checks the same thing (keep its title, reworded at most), otherwise number it from ${next}` }];
  }
  return numberOf(c.id) <= highest ? [{ path: `${at}.id`, message: `numbers up to ${highest} belong to earlier tests (see existingTests): number new cases from ${next}` }] : [];
}

export type TestCasesDeps = RequirementsDeps & { data: RequirementsData & XrayData; runs: RequirementsDeps["runs"] & Partial<Pick<RunStore, "list">> };

/** Runs searched for an earlier analysis of the same input: the newest this many. */
const MAX_REUSE_RUNS = 200;

const reuseSchema = z
  .object({
    reuse: z.boolean().describe("true to reuse the earlier analysis named in the context, false to analyze again"),
    /** Set by Agent-QA, never by the model: the run whose analysis is reused. */
    run: z.string().optional(),
  })
  .strict();
type Reuse = z.infer<typeof reuseSchema>;
/** An earlier run whose analysis had the same input as this run's. */
interface Earlier {
  run: string;
  created: string;
  issues: number;
  criteria: number;
  quality: number;
}

export function testCasesWorkflow(deps: TestCasesDeps): WorkflowDefinition<TestCasesInputs> {
  const reused = (ctx: Ctx) => {
    const r = ctx.outputs.reuse as Reuse | undefined;
    return r?.reuse && r.run ? r.run : undefined;
  };
  /** The run whose reviewed cases this run pushes: its own, or the earlier one `casesRun` names. */
  const casesRunOf = (ctx: Ctx) => ctx.inputs.casesRun ?? ctx.runId;
  const fresh = (ctx: Ctx) => ctx.inputs.casesRun === undefined;
  const requirementsRunOf = async (ctx: Ctx): Promise<string> =>
    ctx.inputs.casesRun !== undefined ? (await reviewedOf(ctx)).data.requirements.run : (ctx.inputs.requirementsRun ?? reused(ctx) ?? ctx.runId);

  /** Whether an earlier run of this key left an analysis whose tokens are still in its vault: no Jira read (the run may not exist yet). */
  const analyzedBefore = async (ctx: Ctx): Promise<boolean> => {
    const key = ctx.inputs.key;
    if (!deps.runs.list || ctx.inputs.requirementsRun !== undefined || key === undefined) return false;
    for (const id of (await deps.runs.list()).filter((r) => r !== ctx.runId).slice(-MAX_REUSE_RUNS).reverse()) {
      const art = await deps.runs.readArtifact(id, REQUIREMENTS_ARTIFACT).catch(() => undefined);
      if (art && "key" in art.data.input && art.data.input.key === key && (await deps.data.hasVault(id))) return true;
    }
    return false;
  };
  const earlierMemo = new Map<string, Promise<Earlier | undefined>>();
  /**
   * The newest earlier run whose analysis was given the same input as this one
   * would be: the same issues at the same Jira version (sourceHash), and the
   * same related feature files (Tarek, 7 Nov 2026). Its vault must still hold
   * the tokens. Jira is read for this, with no model.
   */
  const earlierOf = (ctx: Ctx, fresh = false): Promise<Earlier | undefined> => {
    let found = fresh ? undefined : earlierMemo.get(ctx.runId);
    if (!found) {
      found = (async () => {
        if (!deps.runs.list || ctx.inputs.requirementsRun !== undefined) return undefined;
        const loaded = await deps.data.requirements(ctx.runId, jiraInputOf(ctx.inputs));
        const related = await relatedFeaturesOf(deps, ctx.runId, loaded);
        const want = inputFingerprint(loaded.sources.requirements.map((r) => ({ key: r.key, sourceHash: r.sourceHash, related: related[r.key] })));
        let best: (Earlier & { at: string }) | undefined;
        for (const id of (await deps.runs.list()).filter((r) => r !== ctx.runId).slice(-MAX_REUSE_RUNS)) {
          const art = await deps.runs.readArtifact(id, REQUIREMENTS_ARTIFACT).catch(() => undefined);
          if (!art || inputFingerprint(art.data.requirements) !== want) continue;
          if (best && best.at >= art.createdAt) continue;
          if (!(await deps.data.hasVault(id))) continue;
          const rs = art.data.requirements;
          best = { run: id, at: art.createdAt, created: art.createdAt.slice(0, 10), issues: rs.length, criteria: rs.reduce((n, r) => n + r.acceptanceCriteria.length, 0), quality: rs.length ? Math.round(rs.reduce((n, r) => n + r.quality.score, 0) / rs.length) : 0 };
        }
        return best && { run: best.run, created: best.created, issues: best.issues, criteria: best.criteria, quality: best.quality };
      })();
      found.catch(() => earlierMemo.delete(ctx.runId));
      if (earlierMemo.size > 16) earlierMemo.delete(earlierMemo.keys().next().value!);
      earlierMemo.set(ctx.runId, found);
    }
    return found;
  };
  const requirements = async (ctx: Ctx): Promise<Artifact<RequirementsArtifact>> => {
    const run = await requirementsRunOf(ctx);
    const art = await deps.runs.readArtifact(run, REQUIREMENTS_ARTIFACT);
    if (!art) throw new Error(`Run ${run} has no requirements@1: run the requirements workflow first, or start from a key or JQL`);
    return art;
  };
  const batchIssues = async (ctx: Ctx) => {
    const all = testable((await requirements(ctx)).data);
    const batch = ctx.batch ?? 0;
    return all.slice(batch * ISSUES_PER_BATCH, (batch + 1) * ISSUES_PER_BATCH);
  };

  // Read once per run and batch: every render of a step's context must show the same tests.
  const existingMemo = new Map<string, Promise<Record<string, ExistingTest[]>>>();
  const existingFor = (ctx: Ctx, keys: string[]) => {
    const memoKey = `${ctx.runId}\n${keys.join(",")}`;
    let found = existingMemo.get(memoKey);
    if (!found) {
      // The requirements run's vault: its tokens are the ones the cases and the push use.
      found = requirementsRunOf(ctx).then((run) => deps.data.existingTests(run, keys));
      found.catch(() => existingMemo.delete(memoKey));
      existingMemo.set(memoKey, found);
    }
    return found;
  };
  /**
   * Ids that an Xray test already has (by label) but that existingTests didn't
   * show, such as a test whose link to the issue was removed: as Xray key per id.
   */
  const unseenTests = async (cases: TestCase[], existing: Record<string, ExistingTest[]>): Promise<Map<string, string>> => {
    if (cases.length === 0 || !(await deps.data.xrayEnabled())) return new Map();
    const shown = new Set(Object.values(existing).flatMap((tests) => tests.map((t) => t.id)));
    const plan = await deps.data.xrayPlan(cases);
    return new Map(Object.entries(plan.existing).filter(([id]) => !shown.has(id)));
  };
  const batchExisting = async (ctx: Ctx) => existingFor(ctx, (await batchIssues(ctx)).map((r) => r.key));

  const casesContext = async (ctx: Ctx): Promise<string> => {
    const art = (await requirements(ctx)).data;
    const existing = await batchExisting(ctx);
    const byKey = new Map(art.requirements.map((r) => [r.key, r]));
    const issues = (await batchIssues(ctx)).map((r) => {
      const parent = r.parent ? byKey.get(r.parent) : undefined;
      return {
        key: r.key,
        type: r.type,
        summary: r.summary,
        ...(parent ? { parent: `${parent.key}: ${parent.summary}` } : {}),
        description: clip(r.description, MAX_DESCRIPTION),
        // A criterion borrowed from a repo feature says so: the case checks a guess, not the story.
        acceptanceCriteria: r.acceptanceCriteria.map((ac) => `${ac.id}: ${ac.text}${ac.from ? ` (inferred from the repo's ${ac.from}, not written in the issue)` : ""}`),
        ...(r.openQuestions.length ? { openQuestions: r.openQuestions } : {}),
        ...(Object.keys(r.extraFields).length ? { extraFields: r.extraFields } : {}),
        // Criterion numbers of an earlier run are left out: they can mean other criteria now.
        ...(existing[r.key]?.length ? { existingTests: existing[r.key]!.map((t) => ({ id: t.id, title: t.title })) } : {}),
      };
    });
    return JSON.stringify({ issues }, null, 2);
  };

  const draftOf = async (ctx: Ctx): Promise<Artifact<TestCasesDraft>> => {
    const draft = await deps.runs.readArtifact(ctx.runId, TEST_CASES_DRAFT_ARTIFACT);
    if (!draft) throw new Error(`Run ${ctx.runId} has no test-cases-draft@1`);
    return draft;
  };

  const reviewed = (ctx: Ctx) => deps.runs.readArtifact(casesRunOf(ctx), TEST_CASES_ARTIFACT);
  async function reviewedOf(ctx: Ctx): Promise<Artifact<TestCases>> {
    const art = await reviewed(ctx);
    if (!art) throw new Error(`Run ${casesRunOf(ctx)} has no test-cases@1`);
    return art;
  }
  /** Whether a run (that one, or a later casesRun run) already pushed these reviewed cases: among the newest runs. */
  const pushedBefore = async (casesRun: string): Promise<boolean> => {
    const ids = deps.runs.list ? (await deps.runs.list()).slice(-MAX_REUSE_RUNS) : [];
    for (const id of new Set([casesRun, ...ids])) {
      const push = await deps.runs.readArtifact(id, XRAY_PUSH_ARTIFACT).catch(() => undefined);
      if (push?.data.testCases.run === casesRun) return true;
    }
    return false;
  };
  const planOf = async (ctx: Ctx) => deps.data.xrayPlan((await reviewedOf(ctx)).data.cases);

  return {
    id: "test-cases",
    description:
      "Write test cases (TC-{KEY}-{NNN}, P1-P4, steps, criteria covered) for a Jira issue, a JQL filter or an earlier requirements run, then let the user review them into test-cases@1.",
    inputSchema: testCasesInputSchema,
    prepareInputs: async (runId, inputs) => {
      if (inputs.casesRun === undefined) return sealJiraInputs(deps, runId, inputs);
      // Checked before the run exists, so a wrong id leaves no run behind.
      const art = await deps.runs.readArtifact(inputs.casesRun, TEST_CASES_ARTIFACT).catch(() => undefined);
      if (!art) throw new Error(`Run ${inputs.casesRun} has no reviewed test cases (test-cases@1): give the id of a test-cases run whose review was approved`);
      if (art.data.cases.length === 0) throw new Error(`Run ${inputs.casesRun} kept no test cases in its review: there is nothing to push`);
      if (!(await deps.data.xrayEnabled())) throw new Error("casesRun pushes reviewed cases to Xray, but agent-qa.yaml has no xray section (or the policy denies Xray)");
      return inputs;
    },
    steps: [
      {
        id: "reuse",
        kind: "confirm",
        outputSchema: reuseSchema,
        // Unattended (--yes), the same input gives the same analysis: reuse it.
        answers: { yes: { reuse: true }, no: { reuse: false }, unattended: { reuse: true } },
        // Entered when an earlier run analyzed the same key; whether Jira and the repo files are unchanged
        // needs Jira, which is read once the run exists (in the context).
        when: (ctx) => analyzedBefore(ctx),
        instructions: () =>
          [
            "The context says whether an earlier run analyzed the same Jira issues, unchanged since, with the same related feature files of the repo.",
            "If it names such a run, ask the user whether to reuse that analysis (its criteria, quality scores and open questions) or analyze again, and wait for their answer: submit reuse: true to reuse it, reuse: false to analyze again.",
            "If it says the input changed, don't ask: submit reuse: false.",
          ].join("\n"),
        context: async (ctx) => {
          const e = await earlierOf(ctx);
          if (!e) return "No earlier analysis with the same input can be reused (the issues or the related feature files changed since, or its run is gone): it will be analyzed again. Submit reuse: false without asking.";
          return `Run ${e.run} (${e.created}) analyzed the same ${e.issues} issue(s), unchanged in Jira since, with the same related feature files: ${e.criteria} criteria, average quality ${e.quality}/100. Its requirements.md is in that run's folder.`;
        },
        // The run is Agent-QA's to name: the one found, whatever the answer says; with none, nothing is reused.
        sanitize: async (ctx, out: Reuse) => {
          // Checked again at the answer: Jira or the repo may have changed while the question waited.
          const e = out.reuse ? await earlierOf(ctx, true) : undefined;
          return e ? { reuse: true, run: e.run } : { reuse: false };
        },
      },
      { ...analyzeStep<TestCasesInputs>(deps), when: (ctx) => fresh(ctx) && ctx.inputs.requirementsRun === undefined && reused(ctx) === undefined },
      {
        id: "cases",
        kind: "generate",
        outputSchema: casesOutputSchema,
        when: fresh,
        batches: async (ctx) => Math.ceil(testable((await requirements(ctx)).data).length / ISSUES_PER_BATCH),
        instructions: (ctx) =>
          [
            `Write test cases for the issues in the context${(ctx.batches ?? 1) > 1 ? ` (batch ${(ctx.batch ?? 0) + 1} of ${ctx.batches}; other issues come in other batches)` : ""}.`,
            "Every acceptance criterion must be covered by at least one case; add negative and edge cases where the criterion allows them. Use the open questions to find edge cases, but don't invent behaviour the issue doesn't state.",
            `Number each issue's cases TC-{KEY}-001, TC-{KEY}-002, and so on (for example TC-ABC-12-001), at most ${MAX_CASES_PER_ISSUE} per issue. requirement is the issue key; covers lists the criteria ids (AC1, AC2...) the case checks.`,
            "Some issues list existingTests: tests an earlier run already put in Xray. A case that checks the same thing as an existing test keeps that test's id and its title (reworded at most), so the test is updated, not duplicated; the criteria may be numbered differently now, so match on what the test checks, not on numbers. Never give an existing id to a case that checks something else: it would overwrite that test. Number new cases after the highest existing id. Existing tests you don't write a case for are left as they are.",
            "Priorities: P1 the main path and anything that loses data or money, P2 important negative cases, P3 secondary and edge cases, P4 cosmetic.",
            "Steps are concrete actions with the data to use and the expected result. Values like <PERSON_1> are masked personal data: keep them exactly as they are and don't make up new ones.",
          ].join("\n"),
        context: casesContext,
        check: async (ctx, output: CasesOutput) => {
          const issues = await batchIssues(ctx);
          const existing = await batchExisting(ctx);
          const unseen = await unseenTests(output.cases.map((c) => ({ ...c, requirement: c.requirement.trim().toUpperCase() })), existing);
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
            errors.push(...checkReuse(at, c, existing[key] ?? [], unseen));
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
            requirements: { run: await requirementsRunOf(ctx), sourceHash: art.sourceHash },
            cases,
            skipped: art.data.requirements.filter((r) => r.acceptanceCriteria.length === 0).map((r) => r.key),
          };
          await deps.runs.writeArtifact(ctx.runId, TEST_CASES_DRAFT_ARTIFACT, draft, { inputs: await inputsOf(ctx, art), templateVersion: TEST_CASES_TEMPLATE_VERSION });
        },
      },
      {
        id: "review",
        kind: "confirm",
        outputSchema: reviewSchema,
        personalAnswer: true,
        answers: { yes: { approved: true, changes: [] }, no: { approved: false, changes: [] }, unattended: { approved: true, changes: [], unattended: true } },
        when: async (ctx) => fresh(ctx) && testable((await requirements(ctx)).data).length > 0,
        instructions: ({ runId }) =>
          [
            `Ask the user to review the draft test cases: they are listed in the context, and in full in test-cases-draft.md in this run's folder (.agent-qa/runs/${runId}/).`,
            "For each case the user may keep it, edit it or drop it. Wait for their answer.",
            "Submit approved: true with changes listing only the edited cases (decision edited, with the whole corrected case, same id) and the dropped ones (decision dropped). Every case not listed is kept.",
            "If the user wants to stop, submit approved: false and nothing is saved.",
          ].join("\n"),
        context: async (ctx) => {
          const draft = (await draftOf(ctx)).data;
          const existing = await existingFor(ctx, testable((await requirements(ctx)).data).map((r) => r.key));
          const xrayKey = new Map(Object.values(existing).flatMap((tests) => tests.map((t) => [t.id, t.xrayKey] as const)));
          const lines = draft.cases.map((c) => `${c.id} | ${c.priority} | ${c.type} | covers ${c.covers.join(", ")}${xrayKey.has(c.id) ? ` | updates ${xrayKey.get(c.id)}` : ""} | ${c.title}`);
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
          const existing = await existingFor(ctx, testable(art).map((r) => r.key));
          const edited = review.changes.flatMap((c) => (c.case ? [{ ...c.case, requirement: c.case.requirement.trim().toUpperCase() }] : []));
          const unseen = await unseenTests(edited, existing);
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
                const key = change.case.requirement.trim().toUpperCase();
                errors.push(...checkReuse(`${at}.case`, change.case, existing[key] ?? [], unseen));
              }
            }
          });
          return errors;
        },
        // An edit is the user's own text and may name people or hold data: it is masked with the
        // requirements run's vault before the run keeps it, like the sources were.
        sanitize: async (ctx, review: Review): Promise<Review> => {
          if (!review.approved) return { approved: false, changes: [] };
          const unattended = review.unattended ? { unattended: true as const } : {};
          const run = await requirementsRunOf(ctx);
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
          return { approved: true, changes, ...unattended };
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
              ...(review.unattended ? { unattended: true as const } : {}),
            },
          };
          await deps.runs.writeArtifact(ctx.runId, TEST_CASES_ARTIFACT, data, { inputs: await inputsOf(ctx, art), templateVersion: TEST_CASES_TEMPLATE_VERSION });
        },
      },
      {
        id: "push",
        kind: "confirm",
        outputSchema: pushSchema,
        // Pushing is never unattended: it takes the person's own yes (a terminal answer or --accept push).
        answers: { yes: { approve: true }, no: { approve: false }, unattended: { approve: false } },
        // In an IDE that can ask the user directly, the yes comes from them, not the host model (Tarek, 3 Nov 2026).
        approval: {
          question: async (ctx) => {
            const plan = await planOf(ctx);
            return `Push ${plan.create + plan.update} reviewed test case(s) to Xray project ${plan.project}? ${plan.create} new, ${plan.update} updated.`;
          },
        },
        // No test-cases@1 when the user stopped the review; nothing to push when they dropped every case.
        when: async (ctx) => ((await reviewed(ctx))?.data.cases.length ?? 0) > 0 && (await deps.data.xrayEnabled()),
        instructions: () =>
          [
            "Ask the user whether to push the reviewed test cases to Xray. The context names the project, how many tests are new and how many update tests an earlier push created, and lists each case. Wait for their answer.",
            "Submit approve: true only if they said yes; approve: false pushes nothing and ends the run.",
          ].join("\n"),
        context: async (ctx) => {
          const plan = await planOf(ctx);
          const existing = await existingFor(ctx, testable((await requirements(ctx)).data).map((r) => r.key));
          const was = new Map(Object.values(existing).flatMap((tests) => tests.map((t) => [t.id, t.title] as const)));
          const lines = (await reviewedOf(ctx)).data.cases.map((c) => {
            const update = plan.existing[c.id];
            const before = update && was.has(c.id) ? ` (was: ${was.get(c.id)})` : "";
            return `${c.id} | ${c.priority} | ${update ? `updates ${update}${before}` : "new"} | ${c.title}`;
          });
          const from =
            ctx.inputs.casesRun === undefined
              ? []
              : (await pushedBefore(ctx.inputs.casesRun))
                ? [`These are the cases reviewed in run ${ctx.inputs.casesRun} (${(await reviewedOf(ctx)).createdAt.slice(0, 10)}), already pushed once: a yes pushes them again, updating the same tests.`]
                : [`These are the cases reviewed in run ${ctx.inputs.casesRun} (${(await reviewedOf(ctx)).createdAt.slice(0, 10)}), not pushed then.`];
          return [...from, `Push to Xray project ${plan.project}: ${plan.create} new, ${plan.update} updated.`, ...lines].join("\n");
        },
        onAccept: async (ctx, push: Push) => {
          if (!push.approve) return;
          const art = await reviewedOf(ctx);
          const outcome = await deps.data.pushToXray(ctx.runId, await requirementsRunOf(ctx), art.data.cases, true);
          if (outcome.status !== "done") return;
          const { project, jobs, results } = outcome.result;
          const count = (action: string) => results.filter((r) => r.action === action).length;
          const data: XrayPush = {
            testCases: { run: casesRunOf(ctx), sourceHash: art.sourceHash },
            project,
            jobs,
            results,
            counts: { created: count("created"), updated: count("updated"), failed: count("failed") },
          };
          await deps.runs.writeArtifact(ctx.runId, XRAY_PUSH_ARTIFACT, data, {
            inputs: [{ kind: "artifact", ref: `${casesRunOf(ctx)}/test-cases`, hash: art.sourceHash }],
            templateVersion: TEST_CASES_TEMPLATE_VERSION,
          });
        },
      },
    ],
  };

  async function inputsOf(ctx: Ctx, art: Artifact<RequirementsArtifact>): Promise<InputRef[]> {
    return [{ kind: "artifact", ref: `${await requirementsRunOf(ctx)}/requirements`, hash: art.sourceHash }];
  }
}
