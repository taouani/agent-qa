import type { RunStore } from "../core/index.js";
import { SCRIPTS_RUN_ARTIFACT, type ScriptsRun } from "../workflows/index.js";

/**
 * The runnable rate (S2-10): how the project's generated tests stand now. For
 * each test case, the latest finished run of its generated tests (from every
 * run's `scripts-run@1`, latest by when the record was saved) says what it
 * came to:
 *
 * - runnable: every test of the case passed in a stability run (it passed,
 *   then passed again each time), or in a run that passed with no stability
 *   runs asked for;
 * - unproven: it passed, but the run ended before running it again (another
 *   case failed, so no stability run happened);
 * - defect: the model stopped on a real defect in one of its tests;
 * - environment: sign-in, the network or the app failed, so nothing could be
 *   judged;
 * - unstable: a test of it passed only some of the time;
 * - failing: still failing, or no test of it ran.
 *
 * The rate is runnable over the cases judged on their tests: defect,
 * environment and unproven cases are shown apart and left out, since the
 * generated test isn't what they say failed. A case's tests are those tagged
 * with its id (@TC-…) or carrying it in their title. Runs still in their fix
 * loop, and runs whose tests never ran, don't count.
 */
export interface RunnableRate {
  /** Finished runs whose tests ran. */
  runs: number;
  /** Runs whose tests never ran (the person said no, or nobody was asked). */
  notRunRuns: number;
  /** Runs still in their fix loop (or stopped halfway): they can go on. */
  inProgressRuns: number;
  /** Records that couldn't be read. */
  unreadableRuns: number;
  /** Cases, each once, by its latest finished run. */
  cases: number;
  runnable: number;
  unproven: number;
  defects: number;
  environment: number;
  unstable: number;
  failing: number;
  /** Fix rounds over every finished run. */
  fixRounds: number;
  /** runnable / (cases - defects - environment - unproven); absent when nothing counts. */
  rate?: number;
}

export type CaseOutcome = "runnable" | "unproven" | "defects" | "environment" | "unstable" | "failing";

/** Matches a case's id in a title: TC-ABC-1-001, not inside TC-ABC-1-0010 or TC-ABC-1-001-B. */
const named = (id: string) => new RegExp(`(^|[^A-Za-z0-9_-])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_-])`);

/** What each case came to in one finished run. */
export function caseOutcomes(run: ScriptsRun): Map<string, CaseOutcome> {
  const last = run.attempts.at(-1);
  const out = new Map<string, CaseOutcome>();
  for (const c of run.cases) {
    const isMine = named(c.id);
    const rows = (last?.tests ?? []).filter((t) => t.tags.includes(`@${c.id}`) || isMine.test(t.title));
    const passed = rows.length > 0 && rows.every((t) => t.outcome === "passed");
    // The model's words name the test: matched by the case's id, as the rows are.
    const defect = (run.stoppedOn ?? []).some((s) => s.kind === "defect" && (isMine.test(s.test) || rows.some((t) => t.title === s.test)));
    // Only a run that couldn't start: code that doesn't load, or a case with no test, is the generated code's failure.
    const unreachable = last?.unavailable === true;
    let o: CaseOutcome;
    if (passed && (last?.kind === "stability" || run.status === "passed")) o = "runnable";
    else if (defect) o = "defects";
    else if (run.status === "environment" || unreachable) o = "environment";
    else if (passed) o = "unproven";
    // As the run loop judges it: flaky, or failed in a stability run after passing.
    else if (rows.some((t) => t.outcome === "flaky") || (last?.kind === "stability" && rows.some((t) => t.outcome === "failed"))) o = "unstable";
    else o = "failing";
    out.set(c.id, o);
  }
  return out;
}

export async function runnableRate(runs: Pick<RunStore, "list" | "readArtifact">): Promise<RunnableRate> {
  const out: RunnableRate = { runs: 0, notRunRuns: 0, inProgressRuns: 0, unreadableRuns: 0, cases: 0, runnable: 0, unproven: 0, defects: 0, environment: 0, unstable: 0, failing: 0, fixRounds: 0 };
  const latest = new Map<string, { at: string; outcome: CaseOutcome }>();
  for (const id of await runs.list()) {
    let art;
    try {
      art = await runs.readArtifact(id, SCRIPTS_RUN_ARTIFACT);
    } catch {
      out.unreadableRuns += 1;
      continue;
    }
    if (!art) continue;
    const r = art.data;
    if (r.attempts.length === 0) {
      out.notRunRuns += 1;
      continue;
    }
    if (r.status === "failing") {
      out.inProgressRuns += 1;
      continue;
    }
    // A declined stability run or fix write still ran the tests: judged by what ran.
    out.runs += 1;
    out.fixRounds += r.rounds;
    for (const [caseId, outcome] of caseOutcomes(r)) {
      const seen = latest.get(caseId);
      if (!seen || seen.at < art.createdAt) latest.set(caseId, { at: art.createdAt, outcome });
    }
  }
  for (const { outcome } of latest.values()) {
    out.cases += 1;
    out[outcome] += 1;
  }
  const counted = out.cases - out.defects - out.environment - out.unproven;
  if (counted > 0) out.rate = Math.round((out.runnable / counted) * 1000) / 1000;
  return out;
}
