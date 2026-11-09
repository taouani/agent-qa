import type { RunStore } from "../core/index.js";
import { SCRIPTS_RUN_ARTIFACT, TEST_CASES_ARTIFACT } from "../workflows/index.js";
import { caseOutcomes, type CaseOutcome } from "./runnable-rate.js";

/**
 * The kept and runnable rates week by week (S5-2), from the project's own runs,
 * so a team sees them move over its sprints toward the targets (95% kept,
 * 90% runnable). A week is an ISO week (Monday to Sunday, UTC) of when the
 * record was saved.
 *
 * - kept: the test-cases@1 reviews saved that week, --yes reviews left out,
 *   as `keptRate` counts them;
 * - runnable: each case by its latest finished scripts-run@1 of that week,
 *   judged as `runnableRate` judges it (defects, environment and unproven
 *   cases left out of the rate).
 */
export interface WeekRates {
  /** ISO week, e.g. 2026-W45. */
  week: string;
  kept: { runs: number; generated: number; kept: number; rate?: number };
  runnable: { runs: number; cases: number; judged: number; runnable: number; rate?: number };
}

/** The ISO week of a date (UTC): 2026-11-09 is 2026-W46. */
export function isoWeek(at: Date): string {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  // The Thursday of the same week names its year.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 1000 : undefined);

/** The last `weeks` weeks that have a run, oldest first. */
export async function weeklyRates(runs: Pick<RunStore, "list" | "readArtifact">, weeks = 8): Promise<WeekRates[]> {
  const kept = new Map<string, WeekRates["kept"]>();
  const latest = new Map<string, Map<string, { at: string; outcome: CaseOutcome }>>();
  const scriptRuns = new Map<string, number>();
  for (const id of await runs.list()) {
    const cases = await runs.readArtifact(id, TEST_CASES_ARTIFACT).catch(() => undefined);
    if (cases && !cases.data.review.unattended) {
      const w = isoWeek(new Date(cases.createdAt));
      const k = kept.get(w) ?? { runs: 0, generated: 0, kept: 0 };
      k.runs += 1;
      k.generated += cases.data.review.generated;
      k.kept += cases.data.review.kept;
      kept.set(w, k);
    }
    const run = await runs.readArtifact(id, SCRIPTS_RUN_ARTIFACT).catch(() => undefined);
    // As runnableRate: runs whose tests never ran, and runs still in their fix loop, don't count.
    if (run && run.data.attempts.length > 0 && run.data.status !== "failing") {
      const w = isoWeek(new Date(run.createdAt));
      scriptRuns.set(w, (scriptRuns.get(w) ?? 0) + 1);
      const byCase = latest.get(w) ?? new Map<string, { at: string; outcome: CaseOutcome }>();
      for (const [caseId, outcome] of caseOutcomes(run.data)) {
        const seen = byCase.get(caseId);
        if (!seen || seen.at < run.createdAt) byCase.set(caseId, { at: run.createdAt, outcome });
      }
      latest.set(w, byCase);
    }
  }
  const all = [...new Set([...kept.keys(), ...latest.keys()])].sort().slice(-Math.max(1, Math.trunc(weeks)));
  return all.map((week) => {
    const k = kept.get(week) ?? { runs: 0, generated: 0, kept: 0 };
    const outcomes = [...(latest.get(week)?.values() ?? [])].map((x) => x.outcome);
    const judged = outcomes.filter((o) => o === "runnable" || o === "unstable" || o === "failing").length;
    const runnable = outcomes.filter((o) => o === "runnable").length;
    const keptRate = rate(k.kept, k.generated);
    const runnableRate = rate(runnable, judged);
    return {
      week,
      kept: { ...k, ...(keptRate !== undefined ? { rate: keptRate } : {}) },
      runnable: { runs: scriptRuns.get(week) ?? 0, cases: outcomes.length, judged, runnable, ...(runnableRate !== undefined ? { rate: runnableRate } : {}) },
    };
  });
}
