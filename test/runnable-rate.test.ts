import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runnableLine } from "../src/cli/index.js";
import { RunStore } from "../src/core/index.js";
import { runnableRate } from "../src/harness/index.js";
import { SCRIPTS_RUN_ARTIFACT, type ScriptsRun } from "../src/workflows/index.js";

const row = (id: string, outcome: "passed" | "failed" | "flaky" | "skipped", bdd = true) => ({
  title: bdd ? `Approvals › ${id} scenario` : `${id} spec`,
  tags: bdd ? [`@${id}`] : [],
  file: "a.spec.ts",
  line: 1,
  outcome,
  runs: 1,
  failedRuns: outcome === "passed" ? 0 : 1,
});
const attempt = (kind: "run" | "stability", tests: ReturnType<typeof row>[]) => ({ kind, changed: [], classified: [], exitCode: 0, timedOut: false, durationMs: 1, tests, errors: [] });
const run = (over: Partial<ScriptsRun>): ScriptsRun => ({
  status: "passed",
  folder: ".",
  files: [],
  cases: [],
  attempts: [],
  fixRounds: 3,
  stabilityRuns: 3,
  rounds: 0,
  ...over,
});
const cases = (...ids: string[]) => ids.map((id) => ({ id, steps: [{ step: 1, file: "a.spec.ts", line: 1 }] }));

describe("runnable rate", () => {
  let dir: string;
  let runs: RunStore;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-runnable-"));
    runs = new RunStore(dir);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));
  const save = async (id: string, data: ScriptsRun) => {
    await runs.create({ workflow: "scripts", context: "ABC-1", host: "cli", driver: "api", id });
    await runs.writeArtifact(id, SCRIPTS_RUN_ARTIFACT, data, { inputs: [], templateVersion: "scripts-run-1" });
  };

  it("counts cases that pass again and again, and leaves out defects, the environment and runs never run", async () => {
    expect(await runnableRate(runs)).toMatchObject({ runs: 0, cases: 0 });
    expect(runnableLine(await runnableRate(runs))).toBe("runnable rate: no generated tests have run yet");
    // Passed and stable after one fix: both cases runnable (one by tag, one by title).
    await save("r1", run({ cases: cases("TC-ABC-1-001", "TC-ABC-1-002"), rounds: 1, attempts: [attempt("run", [row("TC-ABC-1-001", "failed")]), attempt("stability", [row("TC-ABC-1-001", "passed"), row("TC-ABC-1-002", "passed", false)])] }));
    // A real defect on one case: left out; the other case still failing.
    await save("r2", run({ status: "defect", cases: cases("TC-ABC-2-001", "TC-ABC-2-002"), stoppedOn: [{ test: "Approvals › TC-ABC-2-001 scenario", kind: "defect", reason: "wrong total" }], attempts: [attempt("run", [row("TC-ABC-2-001", "failed"), row("TC-ABC-2-002", "failed")])] }));
    // Unstable, the environment, a case with no test that ran, and a run never run.
    await save("r3", run({ status: "unstable", cases: cases("TC-ABC-3-001"), attempts: [attempt("stability", [{ ...row("TC-ABC-3-001", "flaky"), runs: 3, failedRuns: 1 }])] }));
    await save("r4", run({ status: "environment", cases: cases("TC-ABC-4-001"), attempts: [attempt("run", [row("TC-ABC-4-001", "failed")])] }));
    await save("r5", run({ status: "gave-up", cases: cases("TC-ABC-5-001"), attempts: [attempt("run", [])] }));
    await save("r6", run({ status: "declined", cases: cases("TC-ABC-6-001") }));
    const r = await runnableRate(runs);
    expect(r).toEqual({ runs: 5, declinedRuns: 1, unreadableRuns: 0, cases: 7, runnable: 2, defects: 1, environment: 1, unstable: 1, failing: 2, fixRounds: 1, rate: 0.4 });
    expect(runnableLine(r)).toBe("runnable rate: 40.0% (2 of 5 case(s) pass again and again; 1 unstable, 2 failing) over 5 run(s), 1 fix round(s); left out: 1 stopped on a real defect, 1 on the environment");
  });

  it("never counts a pass that wasn't run again", async () => {
    // Passed in the first run, then the run stopped before the stability run.
    await save("r1", run({ status: "failing", cases: cases("TC-ABC-1-001"), attempts: [attempt("run", [row("TC-ABC-1-001", "passed")])] }));
    expect(await runnableRate(runs)).toMatchObject({ cases: 1, runnable: 0, failing: 1, rate: 0 });
    // A test named for another case with a longer id isn't this case's.
    await save("r2", run({ cases: cases("TC-ABC-7-001"), attempts: [attempt("stability", [{ ...row("TC-ABC-7-0010", "passed", false) }])] }));
    expect(await runnableRate(runs)).toMatchObject({ cases: 2, runnable: 0, failing: 2 });
  });
});
