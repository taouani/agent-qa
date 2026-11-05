import { isAbsolute, join } from "node:path";
import type { Config } from "../core/index.js";
import { DEFAULT_BROWSER_CASES, DEFAULT_CASES, DEFAULT_SEEDS, loadCases, loadSeeds, type HarnessCase, type Seed } from "./cases.js";

export interface HarnessSources {
  cases: HarnessCase[];
  seeds: Seed[];
  /** Sources that were skipped, and why. */
  notes: string[];
}

/**
 * Cases and seeds from `harness` in agent-qa.yaml, or the shipped synthetic set
 * when the section is missing. Jira sources are skipped for now.
 */
export async function harnessSources(config: Config | undefined, root: string): Promise<HarnessSources> {
  const at = (p: string) => (isAbsolute(p) ? p : join(root, p));
  if (!config?.harness) return { cases: [...DEFAULT_CASES, ...DEFAULT_BROWSER_CASES], seeds: DEFAULT_SEEDS, notes: ["no harness section: using the shipped synthetic cases"] };
  const cases: HarnessCase[] = [];
  const notes: string[] = [];
  for (const source of config.harness.sources) {
    if ("fixtures" in source) cases.push(...(await loadCases(at(source.fixtures))));
    else notes.push("jira source skipped: the harness reads fixtures only for now (a Jira source has no known seeds to check)");
  }
  const seeds = config.harness.seededPersonalData ? await loadSeeds(at(config.harness.seededPersonalData)) : DEFAULT_SEEDS;
  return { cases, seeds, notes };
}
