import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runnableLine } from "../src/cli/index.js";
import { RunStore } from "../src/core/index.js";
import { caseOutcomes, runnableRate } from "../src/harness/index.js";
import { SCRIPTS_RUN_ARTIFACT, type ScriptsRun } from "../src/workflows/index.js";

type Outcome = "passed" | "failed" | "flaky" | "skipped";
const row = (id: string, outcome: Outcome, bdd = true) => ({
  title: bdd ? `Approvals › ${id} scenario` : `${id} spec`,
  tags: bdd ? [`@${id}`] : [],
  file: "a.spec.ts",
  line: 1,
  outcome,
  runs: 1,
  failedRuns: outcome === "passed" ? 0 : 1,
});
const attempt = (kind: "run" | "stability", tests: ReturnType<typeof row>[], errors: string[] = []) => ({ kind, changed: [], classified: [], exitCode: 0, timedOut: false, durationMs: 1, tests, errors });
const run = (over: Partial<ScriptsRun>): ScriptsRun => ({ status: "passed", folder: ".", files: [], cases: [], attempts: [], fixRounds: 3, stabilityRuns: 3, rounds: 0, ...over });
const cases = (...ids: string[]) => ids.map((id) => ({ id, steps: [{ step: 1, file: "a.spec.ts", line: 1 }] }));
const A = "TC-ABC-1-001";
const B = "TC-ABC-1-002";

describe("runnable rate", () => {
  let dir: string;
  let runs: RunStore;
  let clock = 0;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-runnable-"));
    clock = 0;
    // Saved in this order, a minute apart: run ids alone don't sort by time.
    runs = new RunStore(dir, { now: () => new Date(Date.UTC(2026, 10, 5, 10, clock++)) });
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));
  const save = async (id: string, data: ScriptsRun) => {
    await runs.create({ workflow: "scripts", context: "ABC-1", host: "cli", driver: "api", id });
    await runs.writeArtifact(id, SCRIPTS_RUN_ARTIFACT, data, { inputs: [], templateVersion: "scripts-run-1" });
  };

  it("judges each case by its latest finished run", async () => {
    expect(runnableLine(await runnableRate(runs))).toBe("runnable rate: no case to judge yet");
    await save("z-first", run({ status: "gave-up", cases: cases(A), rounds: 3, attempts: [attempt("run", [row(A, "failed")])] }));
    await save("a-second", run({ cases: cases(A, B), rounds: 1, attempts: [attempt("run", [row(A, "failed")]), attempt("stability", [row(A, "passed"), row(B, "passed", false)])] }));
    const r = await runnableRate(runs);
    expect(r).toMatchObject({ runs: 2, cases: 2, runnable: 2, failing: 0, fixRounds: 4, rate: 1 });
    expect(runnableLine(r)).toBe("runnable rate: 100.0% (2 of 2 case(s) pass again and again), each case by its latest of 2 run(s)");
  });

  it("sets apart a pass never run again, a defect and the environment, and says what is unstable", () => {
    const o = (r: ScriptsRun) => Object.fromEntries(caseOutcomes(r));
    // A defect on B stops the loop before A's stability run; the model's title is its own.
    expect(o(run({ status: "defect", cases: cases(A, B), stoppedOn: [{ test: `${B} scenario`, kind: "defect", reason: "wrong total" }], attempts: [attempt("run", [row(A, "passed"), row(B, "failed")])] }))).toEqual({ [A]: "unproven", [B]: "defects" });
    // The last round of an unstable run: a flaky case and a case that failed every time.
    expect(o(run({ status: "unstable", cases: cases(A, B), attempts: [attempt("run", [{ ...row(A, "flaky"), runs: 3, failedRuns: 1 }, row(B, "failed")])] }))).toEqual({ [A]: "unstable", [B]: "failing" });
    // Failed in the stability run after passing once: unstable.
    expect(o(run({ status: "unstable", cases: cases(A), attempts: [attempt("run", [row(A, "passed")]), attempt("stability", [{ ...row(A, "failed"), runs: 3, failedRuns: 1 }])] }))).toEqual({ [A]: "unstable" });
    // The tests couldn't run at all for the stability run; the environment stop.
    expect(o(run({ status: "environment", cases: cases(A), attempts: [attempt("run", [row(A, "passed")]), { ...attempt("stability", [], ["the profile has no test command"]), unavailable: true as const }] }))).toEqual({ [A]: "environment" });
    // Code that doesn't load, or a case whose test never ran, is the generated code's failure.
    expect(o(run({ status: "gave-up", cases: cases(A), attempts: [attempt("run", [], ["no test report came back: SyntaxError: Unexpected token"])] }))).toEqual({ [A]: "failing" });
    expect(o(run({ status: "gave-up", cases: cases(A), attempts: [attempt("run", [], [`no test ran for ${A}: each case's test must run (not skipped, not left out)`])] }))).toEqual({ [A]: "failing" });
    expect(o(run({ status: "environment", cases: cases(A), attempts: [attempt("run", [row(A, "failed")])] }))).toEqual({ [A]: "environment" });
    // No stability runs asked for; a case with no test; a longer id isn't this case.
    expect(o(run({ stabilityRuns: 0, cases: cases(A), attempts: [attempt("run", [row(A, "passed")])] }))).toEqual({ [A]: "runnable" });
    expect(o(run({ status: "gave-up", cases: cases(A), attempts: [attempt("run", [row(`${A}0`, "passed", false), row(`${A}-B`, "passed", false)])] }))).toEqual({ [A]: "failing" });
  });

  it("doesn't count runs never run, still in their loop, or unreadable", async () => {
    await save("r1", run({ status: "declined", cases: cases(A) }));
    await save("r2", run({ status: "failing", cases: cases(A), attempts: [attempt("run", [row(A, "failed")])], pending: { changed: ["a.spec.ts"], classified: [] } }));
    await save("r3", run({ status: "defect", cases: cases(A, B), stoppedOn: [{ test: row(B, "failed").title, kind: "defect", reason: "x" }], attempts: [attempt("run", [row(A, "passed"), row(B, "failed")])] }));
    // A declined stability run still ran the tests once.
    await save("r4", run({ status: "declined", cases: cases("TC-ABC-2-001"), attempts: [attempt("run", [row("TC-ABC-2-001", "passed")])] }));
    await runs.create({ workflow: "scripts", context: "ABC-1", host: "cli", driver: "api", id: "r5" });
    await writeFile(join(dir, "r5", "scripts-run.json"), "{ not json");
    const r = await runnableRate(runs);
    expect(r).toEqual({ runs: 2, notRunRuns: 1, inProgressRuns: 1, unreadableRuns: 1, cases: 3, runnable: 0, unproven: 2, defects: 1, environment: 0, unstable: 0, failing: 0, fixRounds: 0 });
    expect(runnableLine(r)).toBe("runnable rate: no case to judge yet (3 case(s), none judged on their tests); 1 run(s) never ran their tests, 1 still in their fix loop, 1 unreadable");
  });
});
