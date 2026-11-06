import { createHash } from "node:crypto";
import { z } from "zod";
import type { ArtifactSpec, RunStore, StepContext, WorkflowDefinition } from "../../core/index.js";
import type { MaskedTestResult, ProfileData, RequirementsData, SuiteData, TestSelection } from "../../data/index.js";
import { testRowSchema } from "../scripts/run.js";

/**
 * `run-tests` (S3-2): runs a chosen part of the repo's own suite, not only
 * tests Agent-QA wrote, with the repo's Playwright and the reviewed
 * profile's commands, after the person's own yes. The part is spec or
 * feature paths, a title text, a tag, a project, or the failed and flaky
 * tests of an earlier JSON report. The result is test-run@1, masked: the
 * start of `debug` (S3-3), and a record of its own.
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

const runSchema = z.object({ run: z.boolean().describe("true only if the user agreed to run these tests with their repo's Playwright") }).strict();

export interface RunTestsDeps {
  data: Pick<ProfileData, "savedProfile"> & SuiteData & Pick<RequirementsData, "maskTexts">;
  runs: Pick<RunStore, "readArtifact" | "writeArtifact">;
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
            ...(t.failure ? { failure: { message: t.failure.message, ...(t.failure.snippet !== undefined ? { snippet: t.failure.snippet } : {}), ...(t.failure.at ? { at: t.failure.at } : {}), ...(t.failure.snapshot !== undefined ? { snapshot: t.failure.snapshot } : {}) } } : {}),
          }));
          const status = statusOf(r.tests, r.errors);
          await save(ctx, {
            ...base,
            status,
            ...(status === "no-tests" ? { reason: "the selection matched no test that ran" } : {}),
            exitCode: r.exitCode,
            timedOut: r.timedOut,
            durationMs: r.durationMs,
            counts: { passed: count("passed"), failed: count("failed"), flaky: count("flaky"), skipped: count("skipped") },
            tests,
            errors: r.errors,
          });
        },
      },
    ],
  };
}
