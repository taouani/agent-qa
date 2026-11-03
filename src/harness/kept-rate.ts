import type { RunStore } from "../core/index.js";
import { TEST_CASES_ARTIFACT } from "../workflows/index.js";

/**
 * The kept rate (S1-14): of the test cases the model wrote, the share people
 * kept as written in review, from every run's `test-cases@1`. Reviews taken
 * with `--yes` (`review.unattended`) are left out: nobody looked at those cases.
 */
export interface KeptRate {
  /** Runs with a reviewed test-cases@1 that count. */
  runs: number;
  /** Runs left out because nobody reviewed them (--yes). */
  unattendedRuns: number;
  /** Runs whose test-cases@1 couldn't be read. */
  unreadableRuns: number;
  generated: number;
  kept: number;
  edited: number;
  dropped: number;
  /** kept / generated over the counted runs; absent when no case was reviewed. */
  rate?: number;
}

export async function keptRate(runs: Pick<RunStore, "list" | "readArtifact">): Promise<KeptRate> {
  const out: KeptRate = { runs: 0, unattendedRuns: 0, unreadableRuns: 0, generated: 0, kept: 0, edited: 0, dropped: 0 };
  for (const id of await runs.list()) {
    let art;
    try {
      art = await runs.readArtifact(id, TEST_CASES_ARTIFACT);
    } catch {
      out.unreadableRuns += 1;
      continue;
    }
    if (!art) continue;
    const r = art.data.review;
    if (r.unattended) {
      out.unattendedRuns += 1;
      continue;
    }
    out.runs += 1;
    out.generated += r.generated;
    out.kept += r.kept;
    out.edited += r.edited;
    out.dropped += r.dropped;
  }
  if (out.generated > 0) out.rate = Math.round((out.kept / out.generated) * 1000) / 1000;
  return out;
}
