import type { RunStore } from "../core/index.js";
import { SCRIPTS_RUN_ARTIFACT, type ScriptsRun } from "../workflows/index.js";

/**
 * The runnable rate (S2-10): of the test cases whose generated tests ran on
 * the project's own app, the share whose tests pass, again and again, as
 * Agent-QA left them. From every run's `scripts-run@1`.
 *
 * A case counts as runnable when every test of it passed in the last run and
 * that run was a stability run (the tests had already passed once and passed
 * again), or the run passed with no stability runs asked for. A case's tests
 * are those tagged with its id (@TC-…) or carrying it in their title.
 *
 * A case whose run stopped on a real defect, or on the environment
 * (sign-in, network, the app down), is counted apart and left out of the
 * rate: the generated test isn't what failed. Runs where the person said no
 * to running the tests don't count at all.
 */
export interface RunnableRate {
  /** Runs whose tests ran. */
  runs: number;
  /** Runs left out: the person said no to running, or the record couldn't be read. */
  declinedRuns: number;
  unreadableRuns: number;
  /** Cases whose tests ran. */
  cases: number;
  runnable: number;
  /** Stopped on a real defect in the app (reported, never fixed in the test). */
  defects: number;
  /** Stopped on the environment. */
  environment: number;
  /** Tests that pass only some of the time. */
  unstable: number;
  /** Still failing, or never run (a case with no test that ran). */
  failing: number;
  /** Fix rounds over the counted runs. */
  fixRounds: number;
  /** runnable / (cases - defects - environment); absent when nothing counts. */
  rate?: number;
}

type Outcome = "runnable" | "defects" | "environment" | "unstable" | "failing";

/** What one case came to in one run. */
export function caseOutcomes(run: ScriptsRun): Map<string, Outcome> {
  const last = run.attempts.at(-1);
  const out = new Map<string, Outcome>();
  const stopped = new Map((run.stoppedOn ?? []).map((s) => [s.test, s.kind]));
  for (const c of run.cases) {
    // TC-ABC-1-001 in a title, not inside TC-ABC-1-0010.
    const named = new RegExp(`(^|[^A-Za-z0-9-])${c.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![0-9])`);
    const rows = (last?.tests ?? []).filter((t) => t.tags.includes(`@${c.id}`) || named.test(t.title));
    const passed = rows.length > 0 && rows.every((t) => t.outcome === "passed");
    let o: Outcome;
    if (passed && (last?.kind === "stability" || run.status === "passed")) o = "runnable";
    else if (rows.some((t) => stopped.get(t.title) === "defect")) o = "defects";
    else if (run.status === "environment" && !passed) o = "environment";
    else if (rows.some((t) => t.outcome === "flaky") || run.status === "unstable") o = "unstable";
    else o = "failing";
    out.set(c.id, o);
  }
  return out;
}

export async function runnableRate(runs: Pick<RunStore, "list" | "readArtifact">): Promise<RunnableRate> {
  const out: RunnableRate = { runs: 0, declinedRuns: 0, unreadableRuns: 0, cases: 0, runnable: 0, defects: 0, environment: 0, unstable: 0, failing: 0, fixRounds: 0 };
  for (const id of await runs.list()) {
    let art;
    try {
      art = await runs.readArtifact(id, SCRIPTS_RUN_ARTIFACT);
    } catch {
      out.unreadableRuns += 1;
      continue;
    }
    if (!art) continue;
    if (art.data.status === "declined" || art.data.attempts.length === 0) {
      out.declinedRuns += 1;
      continue;
    }
    out.runs += 1;
    out.fixRounds += art.data.rounds;
    for (const o of caseOutcomes(art.data).values()) {
      out.cases += 1;
      out[o] += 1;
    }
  }
  const counted = out.cases - out.defects - out.environment;
  if (counted > 0) out.rate = Math.round((out.runnable / counted) * 1000) / 1000;
  return out;
}
