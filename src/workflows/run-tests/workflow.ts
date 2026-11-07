import { createHash } from "node:crypto";
import { z } from "zod";
import type { ArtifactSpec, RunStore, StepContext, WorkflowDefinition } from "../../core/index.js";
import type { MaskedTestResult, PreviousExecution, ProfileData, RequirementsData, SuiteData, TestSelection, XrayData, XrayExecutionPlan } from "../../data/index.js";
import { testRowSchema } from "../scripts/run.js";

/**
 * `run-tests` (S3-2): runs a chosen part of the repo's own suite, not only
 * tests Agent-QA wrote, with the repo's Playwright and the reviewed
 * profile's commands, after the person's own yes. The part is spec or
 * feature paths, a title text, a tag, a project, or the failed and flaky
 * tests of an earlier JSON report. The result is test-run@1, masked: the
 * start of `debug` (S3-3), and a record of its own. With Xray set up, the
 * results can then go to Xray as a new Test Execution (S3-9), with what
 * changed since the last one recorded for the same selection, found in the
 * run folder (Tarek, 7 Nov 2026): xray-execution@1.
 */

/** Which tests to run: the selection fields `run-tests` and `debug` share. */
export const selectionFields = {
    files: z.array(z.string().min(1).max(300)).min(1).max(50).optional().describe("Spec or feature paths from the profile's folder; a spec may end with :line"),
    grep: z.string().min(1).max(200).optional().describe("Text in the tests' titles (plain text)"),
    tag: z.string().min(2).max(101).optional().describe("A tag, such as @smoke (also picks tags that start with it)"),
    project: z.string().min(1).max(80).optional().describe("A Playwright project of the repo's config"),
    failedIn: z.string().min(1).max(300).optional().describe("A Playwright JSON report in the folder: its failed and flaky tests run again"),
    repeatEach: z.number().int().min(1).max(10).optional().describe("Run each test this many times"),
    workers: z.number().int().min(1).max(4).optional().describe("Parallel workers; default 1"),
};

/** At least one of files, grep, tag or failedIn; grep or tag, not both. */
export const hasSelection = (i: { files?: unknown; grep?: unknown; tag?: unknown; failedIn?: unknown }) => i.files !== undefined || i.grep !== undefined || i.tag !== undefined || i.failedIn !== undefined;

export const runTestsInputSchema = z
  .object(selectionFields)
  .strict()
  .refine(hasSelection, "pick the tests: files, grep, tag or failedIn")
  .refine((i) => !(i.grep !== undefined && i.tag !== undefined), "pick grep or tag, not both");
export type RunTestsInputs = z.infer<typeof runTestsInputSchema>;

/**
 * `test-run@1`. passed: every selected test passed; failed: at least one
 * failed; flaky: none failed, some passed only on a repeat; no-tests: the
 * selection matched nothing (or all skipped); error: the run broke before
 * tests ran; declined: the person said no; unavailable: tests can't run here.
 */
export const testRunSchema = z
  .object({
    status: z.enum(["passed", "failed", "flaky", "no-tests", "error", "declined", "unavailable"]),
    reason: z.string().optional(),
    folder: z.string(),
    /** The profile's test command and the arguments Agent-QA added (masked). */
    command: z.array(z.string()),
    selection: z
      .object({ files: z.array(z.string()).optional(), grep: z.string().optional(), tag: z.string().optional(), project: z.string().optional(), failedIn: z.string().optional(), repeatEach: z.number().optional(), workers: z.number().optional() })
      .strict(),
    /** From `failedIn`: the report's failed and flaky tests, run again. */
    fromReport: z.array(z.object({ title: z.string(), file: z.string(), line: z.number() }).strict()).optional(),
    /** When the tests started (ISO), for the Test Execution's dates. */
    startedAt: z.string().optional(),
    exitCode: z.number().nullable(),
    timedOut: z.boolean(),
    durationMs: z.number(),
    counts: z.object({ passed: z.number(), failed: z.number(), flaky: z.number(), skipped: z.number() }).strict(),
    tests: z.array(testRowSchema),
    errors: z.array(z.string()),
  })
  .strict();
export type TestRun = z.infer<typeof testRunSchema>;

const one = (s: string) => s.replace(/\s+/g, " ").trim();

function renderTestRun(r: TestRun): string {
  const c = r.counts;
  const lines = [`# Test run: ${r.status}`, "", ...(r.reason ? [one(r.reason), ""] : []), `Folder: ${r.folder}. Command: \`${r.command.join(" ")}\`.`, ""];
  if (r.status !== "declined" && r.status !== "unavailable") lines.push(`${c.passed} passed, ${c.failed} failed, ${c.flaky} flaky, ${c.skipped} skipped, in ${Math.round(r.durationMs / 1000)} s${r.timedOut ? " (timed out)" : ""}.`, "");
  for (const t of r.tests.filter((x) => x.outcome !== "passed" && x.outcome !== "skipped")) lines.push(`- ${t.outcome}: ${one(t.title)} (${t.file}:${t.line})${t.failure ? `: ${one(t.failure.message.split("\n")[0] ?? "")}` : ""}`);
  for (const e of r.errors) lines.push(`- error: ${one(e.split("\n")[0] ?? "")}`);
  return `${lines.join("\n")}\n`;
}

export const TEST_RUN_ARTIFACT: ArtifactSpec<TestRun> = { name: "test-run", schema: "test-run@1", data: testRunSchema, render: renderTestRun };

const resultSchema = z
  .object({ tcId: z.string(), xrayKey: z.string(), status: z.enum(["PASSED", "FAILED", "TODO"]), comment: z.string().optional(), start: z.string().optional(), finish: z.string().optional(), screenshot: z.string().optional(), before: z.string().optional() })
  .strict();

/**
 * `xray-execution@1` (S3-9): recorded, with the Test Execution's key;
 * declined: the person (or the policy) said no; nothing: no test of the run
 * has a case in Xray; unavailable: Jira couldn't be read, so nothing was
 * recorded (an optional report never stops the run); recording: saved just
 * before the import; uncertain: the import failed or was cut off, so it may
 * or may not be in Xray (never sent again: the person checks the run's
 * label). changes compares with `previous`, the newest execution this run
 * folder recorded with the same label (the same selection of tests).
 */
export const xrayExecutionSchema = z
  .object({
    status: z.enum(["recorded", "declined", "nothing", "unavailable", "recording", "uncertain"]),
    /** Why Jira couldn't be read (unavailable), or why the recording's outcome isn't known (uncertain). */
    reason: z.string().optional(),
    project: z.string().optional(),
    key: z.string().optional(),
    label: z.string(),
    previous: z.object({ key: z.string(), created: z.string() }).strict().optional(),
    results: z.array(resultSchema),
    notInXray: z.array(z.string()),
    skipped: z.number(),
    changes: z.object({ failing: z.array(z.string()), fixed: z.array(z.string()), stillFailing: z.array(z.string()), added: z.array(z.string()), gone: z.array(z.string()), other: z.array(z.string()), skippedNow: z.array(z.string()) }).strict(),
  })
  .strict();
export type XrayExecution = z.infer<typeof xrayExecutionSchema>;

/** What changed since the last execution, one line per kind of change. */
export function changeLines(p: { previous?: { key: string; created: string } | undefined; changes: XrayExecutionPlan["changes"]; results: ReadonlyArray<{ status: string }> }): string[] {
  if (!p.previous) return ["No earlier Agent-QA Test Execution for these tests: nothing to compare with."];
  const c = p.changes;
  const list = (ids: string[]) => ids.slice(0, 20).join(", ") + (ids.length > 20 ? ` and ${ids.length - 20} more` : "");
  const lines = [`Since ${p.previous.key}${p.previous.created ? ` (${p.previous.created.slice(0, 10)})` : ""}:`];
  if (c.failing.length) lines.push(`- now failing: ${list(c.failing)}`);
  if (c.fixed.length) lines.push(`- now passing: ${list(c.fixed)}`);
  if (c.stillFailing.length) lines.push(`- still failing: ${list(c.stillFailing)}`);
  if (c.other.length) lines.push(`- before neither passed nor failed: ${list(c.other)}`);
  if (c.skippedNow.length) lines.push(`- in the last one, skipped now: ${list(c.skippedNow)}`);
  if (c.added.length) lines.push(`- not in the last one: ${list(c.added)}`);
  if (c.gone.length) lines.push(`- in the last one, not run now: ${list(c.gone)}`);
  if (lines.length === 1) lines.push(`- nothing changed: ${p.results.filter((r) => r.status === "FAILED").length} failing, as before`);
  return lines;
}

function renderXrayExecution(x: XrayExecution): string {
  const failed = x.results.filter((r) => r.status === "FAILED").length;
  const head = x.status === "recorded" ? `# Xray: recorded as ${x.key}` : x.status === "declined" ? "# Xray: not recorded" : x.status === "unavailable" ? "# Xray: Jira couldn't be read, nothing recorded" : x.status === "recording" ? "# Xray: recording" : x.status === "uncertain" ? "# Xray: may or may not be recorded" : "# Xray: nothing to record";
  if (x.status === "unavailable" || x.project === undefined) return `${[head, "", ...(x.reason ? [one(x.reason)] : [])].join("\n")}\n`;
  const lines = [head, "", ...(x.status === "uncertain" && x.reason ? [one(x.reason), ""] : []), `Project ${x.project}. ${x.results.length} result(s), ${failed} failed${x.skipped ? `, ${x.skipped} skipped (not recorded)` : ""}.`, "", ...changeLines(x), ""];
  for (const r of x.results) lines.push(`- ${r.tcId} (${r.xrayKey}): ${r.status}${r.before ? `, was ${r.before}` : ""}${r.comment ? `: ${one(r.comment).slice(0, 300)}` : ""}`);
  if (x.notInXray.length) lines.push("", `Not in Xray, not recorded: ${x.notInXray.map(one).join("; ")}`);
  return `${lines.join("\n")}\n`;
}

export const XRAY_EXECUTION_ARTIFACT: ArtifactSpec<XrayExecution> = { name: "xray-execution", schema: "xray-execution@1", data: xrayExecutionSchema, render: renderXrayExecution };

const recordSchema = z.object({ record: z.boolean().describe("true only if the user said to record these results in Xray") }).strict();

const runSchema = z.object({ run: z.boolean().describe("true only if the user agreed to run these tests with their repo's Playwright") }).strict();

export interface RunTestsDeps {
  data: Pick<ProfileData, "savedProfile"> & SuiteData & Pick<RequirementsData, "maskTexts"> & Partial<Pick<XrayData, "xrayEnabled" | "xrayExecutionPlan" | "recordXrayExecution">>;
  runs: Pick<RunStore, "readArtifact" | "writeArtifact"> & Partial<Pick<RunStore, "list">>;
}

type Ctx = StepContext<RunTestsInputs>;

export const selectionOf = (i: Pick<RunTestsInputs, "files" | "grep" | "tag" | "project" | "failedIn" | "repeatEach" | "workers">): TestSelection => ({ files: i.files, grep: i.grep, tag: i.tag, project: i.project, failedIn: i.failedIn, repeatEach: i.repeatEach, workers: i.workers });

/** The outcome of the tests, from their rows: a skipped test counts as not run. */
export function statusOf(tests: Pick<MaskedTestResult, "outcome">[], errors: string[]): TestRun["status"] {
  if (tests.some((t) => t.outcome === "failed")) return "failed";
  // Playwright's own word for a selection that matched nothing.
  if (tests.length === 0 && errors.length > 0 && errors.every((e) => /No tests found/i.test(e))) return "no-tests";
  if (tests.every((t) => t.outcome === "skipped")) return errors.length ? "error" : "no-tests";
  if (errors.length) return "error";
  return tests.some((t) => t.outcome === "flaky") ? "flaky" : "passed";
}

export function runTestsWorkflow(deps: RunTestsDeps): WorkflowDefinition<RunTestsInputs> {
  const folder = async () => {
    const saved = await deps.data.savedProfile();
    if (!saved) throw new Error("no reviewed framework profile: run the profile workflow and accept it first");
    return saved.folder;
  };
  // The run's own vault masks what it shows: titles from a report, errors.
  const picked = async (ctx: Ctx) => deps.data.selectTests(ctx.runId, await folder(), selectionOf(ctx.inputs));
  const where = (f: string) => (f === "." ? "the repo root" : f);
  // The command as shown and kept: the title text masked before it was escaped (escaped, no detector would know it).
  const shown = async (ctx: Ctx, p: Awaited<ReturnType<typeof picked>>) => {
    const grep = ctx.inputs.grep !== undefined ? (await deps.data.maskTexts(ctx.runId, [ctx.inputs.grep], "run.grep"))[0]! : undefined;
    const args = p.args.map((a) => (grep !== undefined && a.startsWith("--grep=") ? `--grep=${grep}` : a));
    return deps.data.maskTexts(ctx.runId, [...p.command, ...args], "run.command");
  };
  const describe = async (ctx: Ctx) => {
    const p = await picked(ctx);
    const report = p.fromReport ? ` (${p.fromReport.length} test(s) that failed in ${ctx.inputs.failedIn})` : "";
    return `\`${(await shown(ctx, p)).join(" ")}\` in ${where(await folder())}${report}`;
  };
  // What the run keeps of the person's own words: a title text can name someone.
  const maskedSelection = async (ctx: Ctx): Promise<TestRun["selection"]> => {
    const i = ctx.inputs;
    const grep = i.grep !== undefined ? (await deps.data.maskTexts(ctx.runId, [i.grep], "run.grep"))[0] : undefined;
    return Object.fromEntries(Object.entries({ ...selectionOf(i), grep }).filter(([, v]) => v !== undefined)) as TestRun["selection"];
  };
  const save = async (ctx: Ctx, run: TestRun) =>
    deps.runs.writeArtifact(ctx.runId, TEST_RUN_ARTIFACT, run, {
      inputs: [{ kind: "repo-folder", ref: run.folder, hash: createHash("sha256").update(JSON.stringify(run.selection)).digest("hex") }],
      templateVersion: "test-run-1",
    });
  // The label that finds the last execution of the same selection: a hash of it, never its text.
  // failedIn isn't in it: the same report path holds other failures each time, so the tests decide.
  const labelOf = (i: RunTestsInputs) => {
    const sel = { files: [...(i.files ?? [])].sort(), grep: i.grep ?? null, tag: i.tag ?? null, project: i.project ?? null, failedIn: i.failedIn !== undefined };
    return `agent-qa:exec:${createHash("sha256").update(JSON.stringify(sel)).digest("hex").slice(0, 12)}`;
  };
  const testRun = async (ctx: Ctx) => (await deps.runs.readArtifact(ctx.runId, TEST_RUN_ARTIFACT))?.data;
  /** This run's own execution, so a person can find it in Xray (after an uncertain recording, say). */
  const runLabel = (ctx: Ctx) => `agent-qa:run:${createHash("sha256").update(ctx.runId).digest("hex").slice(0, 16)}`;
  /** Runs read for the last execution: the newest this many. */
  const MAX_PREVIOUS_RUNS = 500;
  // The last execution recorded for the same selection, from the run folder: the newest per Xray project, by when its record was written.
  const previousOf = async (ctx: Ctx): Promise<PreviousExecution[]> => {
    if (!deps.runs.list) return [];
    const label = labelOf(ctx.inputs);
    const best = new Map<string, PreviousExecution>();
    for (const id of (await deps.runs.list()).filter((r) => r !== ctx.runId).slice(-MAX_PREVIOUS_RUNS)) {
      const a = await deps.runs.readArtifact(id, XRAY_EXECUTION_ARTIFACT).catch(() => undefined);
      if (!a || a.data.status !== "recorded" || a.data.label !== label || !a.data.key || !a.data.project) continue;
      const seen = best.get(a.data.project);
      if (seen && seen.created >= a.createdAt) continue;
      best.set(a.data.project, { project: a.data.project, key: a.data.key, created: a.createdAt, statuses: Object.fromEntries(a.data.results.map((r) => [r.xrayKey, r.status])) });
    }
    return [...best.values()];
  };
  // One read of Jira (and the run folder) per run for the question and its context; onAccept reads again. A failed read is an answer, not an error.
  type Planned = { plan: XrayExecutionPlan } | { error: string };
  const plans = new Map<string, Promise<Planned>>();
  const planOf = (ctx: Ctx, fresh = false): Promise<Planned> => {
    if (fresh || !plans.has(ctx.runId)) {
      if (plans.size > 16) plans.delete(plans.keys().next().value!);
      const p = (async (): Promise<Planned> => {
        try {
          return { plan: await deps.data.xrayExecutionPlan!((await testRun(ctx))!.tests, labelOf(ctx.inputs), await previousOf(ctx)) };
        } catch (error) {
          return { error: one(error instanceof Error ? error.message : String(error)).slice(0, 300) };
        }
      })();
      plans.set(ctx.runId, p);
      void p.then((r) => "error" in r && plans.delete(ctx.runId));
    }
    return plans.get(ctx.runId)!;
  };
  const empty = { exitCode: null, timedOut: false, durationMs: 0, counts: { passed: 0, failed: 0, flaky: 0, skipped: 0 }, tests: [], errors: [] };

  return {
    id: "run-tests",
    description: "Run a chosen part of the repo's own Playwright suite (spec paths, a title text, a tag, or an earlier report's failures) and record the results, after the user's yes.",
    inputSchema: runTestsInputSchema,
    // Checked at once: a selection Playwright can't take, or a report without failures, stops before any question.
    prepareInputs: async (runId, inputs) => {
      await deps.data.selectTests(runId, await folder(), selectionOf(inputs));
      return inputs;
    },
    steps: [
      {
        id: "run",
        kind: "confirm",
        outputSchema: runSchema,
        // Running repo code takes the person's own yes.
        answers: { yes: { run: true }, no: { run: false }, unattended: { run: false } },
        approval: {
          personOnly: true,
          question: async (ctx) => `Run ${await describe(ctx)}? The tests sign in and use your app as your test users do. Nothing in your repo is changed.`,
        },
        instructions: () =>
          [
            "Ask the user whether Agent-QA may run these tests with their repo's Playwright. The tests sign in and use their app. Wait for their answer.",
            "Submit run: true only if they said yes to running them.",
          ].join("\n"),
        context: async (ctx) => {
          const p = await picked(ctx);
          return [`Command: ${(await shown(ctx, p)).join(" ")} in ${where(await folder())}.`, ...(p.fromReport ? [`From ${ctx.inputs.failedIn}: ${p.fromReport.map((t) => `${t.title} (${t.file}:${t.line})`).join("; ")}`] : [])].join("\n");
        },
        onAccept: async (ctx, out) => {
          // Run again after a stop halfway: the tests ran already, their record stands.
          if (await deps.runs.readArtifact(ctx.runId, TEST_RUN_ARTIFACT)) return;
          const f = await folder();
          const selection = await maskedSelection(ctx);
          // A no is kept even when the selection no longer holds (the report was removed since).
          if (!(out as z.infer<typeof runSchema>).run) return void (await save(ctx, { folder: f, command: [], selection, ...empty, status: "declined", reason: "the person said no to running the tests, or nobody was asked (an unattended run)" }));
          const p = await picked(ctx);
          const base = { folder: f, command: await shown(ctx, p), selection, ...(p.fromReport ? { fromReport: p.fromReport } : {}) };
          const ready = await deps.data.testRunReadiness(ctx.runId);
          if (!ready.ready) return void (await save(ctx, { ...base, ...empty, status: "unavailable", reason: ready.reason }));
          const startedAt = new Date().toISOString();
          const r = await deps.data.runTests(ctx.runId, ctx.runId, f, selectionOf(ctx.inputs), true);
          if (r.status === "declined") return void (await save(ctx, { ...base, ...empty, status: "declined", reason: "the policy or the person said no to running the tests" }));
          if (r.status === "unavailable") return void (await save(ctx, { ...base, ...empty, status: "unavailable", reason: r.reason }));
          const count = (o: string) => r.tests.filter((t) => t.outcome === o).length;
          const tests = r.tests.map((t) => ({
            title: t.title,
            tags: t.tags,
            file: t.file,
            line: t.line,
            outcome: t.outcome,
            runs: t.runs,
            failedRuns: t.failedRuns,
            ...(t.startedAt !== undefined ? { startedAt: t.startedAt, durationMs: t.durationMs ?? 0 } : {}),
            ...(t.failure ? { failure: { message: t.failure.message, ...(t.failure.snippet !== undefined ? { snippet: t.failure.snippet } : {}), ...(t.failure.at ? { at: t.failure.at } : {}), ...(t.failure.snapshot !== undefined ? { snapshot: t.failure.snapshot } : {}), ...(t.failure.screenshot !== undefined ? { screenshot: t.failure.screenshot } : {}) } } : {}),
          }));
          const status = statusOf(r.tests, r.errors);
          await save(ctx, {
            ...base,
            status,
            ...(status === "no-tests" ? { reason: "the selection matched no test that ran" } : {}),
            startedAt,
            exitCode: r.exitCode,
            timedOut: r.timedOut,
            durationMs: r.durationMs,
            counts: { passed: count("passed"), failed: count("failed"), flaky: count("flaky"), skipped: count("skipped") },
            tests,
            errors: r.errors,
          });
        },
      },
      {
        id: "xray",
        kind: "confirm",
        outputSchema: recordSchema,
        // Writing to Xray takes the person's yes (or --accept xray in CI), as the test-case push does.
        answers: { yes: { record: true }, no: { record: false }, unattended: { record: false } },
        when: async (ctx) => {
          if (!deps.data.xrayEnabled || !deps.data.xrayExecutionPlan || !deps.data.recordXrayExecution) return false;
          const run = await testRun(ctx);
          return !!run && run.tests.some((t) => t.outcome !== "skipped") && (await deps.data.xrayEnabled());
        },
        approval: {
          question: async (ctx) => {
            const planned = await planOf(ctx);
            if ("error" in planned) return `Jira couldn't be read to find the tests in Xray (${planned.error}), so nothing will be recorded. Go on?`;
            const p = planned.plan;
            if (p.results.length === 0) return `None of these tests has a test case in Xray project ${p.project}, so nothing can be recorded (the context says why for each). Go on?`;
            const failed = p.results.filter((r) => r.status === "FAILED").length;
            const shots = p.screenshots ? `, with ${p.screenshots} unmasked failure screenshot(s)` : "";
            return `Record ${p.results.length} result(s) (${failed} failed) in Xray project ${p.project} as a new Test Execution${shots}? ${changeLines(p).join(" ")}`;
          },
        },
        instructions: () =>
          [
            "Ask the user whether to record these test results in Xray as a new Test Execution. The context lists each result and what changed since the last Agent-QA execution of the same tests. Wait for their answer.",
            "Submit record: true only if they said yes; record: false records nothing.",
          ].join("\n"),
        context: async (ctx) => {
          const planned = await planOf(ctx);
          if ("error" in planned) return `Jira couldn't be read to find the tests in Xray: ${planned.error}. Nothing will be recorded, whatever the answer; the test run's record stands.`;
          const p = planned.plan;
          return [
            `Xray project ${p.project}: ${p.results.length} result(s) to record${p.skipped ? `, ${p.skipped} skipped test(s) left out` : ""}.`,
            ...(p.screenshots ? [`With ${p.screenshots} failure screenshot(s) as evidence (xray.attachScreenshots): screenshots aren't masked, so what the page showed goes to Xray as it is. Say so when you ask.`] : []),
            ...changeLines(p),
            ...p.results.map((r) => `${r.tcId} | ${r.xrayKey} | ${r.status}${r.before ? ` (was ${r.before})` : ""}`),
            ...(p.notInXray.length ? [`Not in Xray, not recorded: ${p.notInXray.join("; ")}`] : []),
          ].join("\n");
        },
        onAccept: async (ctx, out) => {
          const run = (await testRun(ctx))!;
          const write = (x: XrayExecution) => deps.runs.writeArtifact(ctx.runId, XRAY_EXECUTION_ARTIFACT, x, { inputs: [{ kind: "artifact", ref: `${ctx.runId}/test-run`, hash: createHash("sha256").update(JSON.stringify(run.tests)).digest("hex") }], templateVersion: "xray-execution-1" });
          const uncertain = (x: XrayExecution, why: string) =>
            write({ ...x, status: "uncertain", reason: `${why}: it may or may not be in Xray, so it isn't sent again. Look in Xray project ${x.project} for a Test Execution labelled ${runLabel(ctx)}.` });
          // Run again after a stop halfway: a record stands; one cut off during the import isn't sent twice.
          const kept = (await deps.runs.readArtifact(ctx.runId, XRAY_EXECUTION_ARTIFACT))?.data;
          if (kept?.status === "recording") return void (await uncertain(kept, "the run stopped while recording"));
          if (kept) return;
          const none = { label: labelOf(ctx.inputs), results: [], notInXray: [], skipped: 0, changes: { failing: [], fixed: [], stillFailing: [], added: [], gone: [], other: [], skippedNow: [] } };
          // A no reads nothing: Xray being down never stops it.
          if (!(out as z.infer<typeof recordSchema>).record) return void (await write({ ...none, status: "declined" }));
          const planned = await planOf(ctx, true);
          if ("error" in planned) return void (await write({ ...none, status: "unavailable", reason: planned.error }));
          const p = planned.plan;
          const base = { project: p.project, label: p.label, ...(p.previous ? { previous: p.previous } : {}), results: p.results, notInXray: p.notInXray, skipped: p.skipped, changes: p.changes };
          if (p.results.length === 0) return void (await write({ ...base, status: "nothing" }));
          const finishedAt = run.startedAt ? new Date(Date.parse(run.startedAt) + run.durationMs) : new Date();
          const startedAt = run.startedAt ? new Date(run.startedAt) : new Date(finishedAt.getTime() - run.durationMs);
          const failed = p.results.filter((r) => r.status === "FAILED").length;
          // Kept before the import: a stop during it is never followed by a second one.
          await write({ ...base, status: "recording" });
          let r: Awaited<ReturnType<NonNullable<RunTestsDeps["data"]["recordXrayExecution"]>>>;
          try {
            r = await deps.data.recordXrayExecution!(
              ctx.runId,
              p,
              runLabel(ctx),
              { summary: `Agent-QA run ${ctx.runId}: ${p.results.length - failed} passed, ${failed} failed`, description: [`Recorded by Agent-QA from \`${run.command.join(" ")}\` in ${run.folder}.`, "", ...changeLines(p)].join("\n"), startedAt, finishedAt },
              true,
            );
          } catch (error) {
            return void (await uncertain({ ...base, status: "recording" }, `the import failed (${one(error instanceof Error ? error.message : String(error)).slice(0, 300)})`));
          }
          await write(r.status === "done" ? { ...base, status: "recorded", key: r.key } : { ...base, status: "declined" });
        },
      },
    ],
  };
}
