import { describe, expect, it, vi } from "vitest";
import { buildProgram, weeksTable } from "../src/cli/index.js";
import { isoWeek, weeklyRates } from "../src/harness/index.js";
import { SCRIPTS_RUN_ARTIFACT, TEST_CASES_ARTIFACT, type ScriptsRun } from "../src/workflows/index.js";

const A = "TC-ABC-1-001";
const B = "TC-ABC-1-002";
const row = (id: string, outcome: "passed" | "failed") => ({ title: `${id} spec`, tags: [`@${id}`], file: "a.spec.ts", line: 1, outcome, runs: 1, failedRuns: outcome === "passed" ? 0 : 1 });
const stability = (...tests: ReturnType<typeof row>[]) => ({ kind: "stability" as const, changed: [], classified: [], exitCode: 0, timedOut: false, durationMs: 1, tests, errors: [] });
const scripts = (status: ScriptsRun["status"], ...tests: ReturnType<typeof row>[]): ScriptsRun => ({
  status,
  folder: ".",
  files: [],
  cases: [A, B].map((id) => ({ id, steps: [{ step: 1, file: "a.spec.ts", line: 1 }] })),
  attempts: [stability(...tests)],
  fixRounds: 3,
  stabilityRuns: 3,
  rounds: 0,
});
const review = (generated: number, kept: number, unattended = false) => ({ review: { generated, kept, edited: 0, dropped: generated - kept, keptRate: kept / generated, ...(unattended ? { unattended: true } : {}) } });

/** A run store with each run's artifacts and when each was saved. */
function store(runs: Record<string, { at: string; cases?: unknown; scripts?: ScriptsRun }>) {
  return {
    list: async () => Object.keys(runs),
    readArtifact: async (id: string, spec: unknown) => {
      const r = runs[id]!;
      const data = spec === TEST_CASES_ARTIFACT ? r.cases : spec === SCRIPTS_RUN_ARTIFACT ? r.scripts : undefined;
      return data === undefined ? undefined : { data, createdAt: r.at };
    },
  };
}

describe("rates week by week (S5-2)", () => {
  it("names ISO weeks, the year of their Thursday", () => {
    expect(isoWeek(new Date("2026-11-09T08:00:00Z"))).toBe("2026-W46");
    expect(isoWeek(new Date("2026-11-08T23:59:00Z"))).toBe("2026-W45");
    expect(isoWeek(new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53");
    expect(isoWeek(new Date("2025-12-29T12:00:00Z"))).toBe("2026-W01");
  });

  it("pools each week's reviews and judges each case by its latest run of the week", async () => {
    const runs = store({
      a: { at: "2026-11-03T10:00:00Z", cases: review(10, 8) },
      b: { at: "2026-11-04T10:00:00Z", cases: review(10, 0, true) },
      c: { at: "2026-11-05T10:00:00Z", scripts: scripts("unstable", row(A, "failed"), row(B, "passed")) },
      d: { at: "2026-11-06T10:00:00Z", scripts: scripts("passed", row(A, "passed"), row(B, "passed")) },
      e: { at: "2026-11-10T10:00:00Z", cases: review(4, 4), scripts: scripts("unstable", row(A, "passed"), row(B, "failed")) },
      // Still in its fix loop: not counted.
      f: { at: "2026-11-11T10:00:00Z", scripts: scripts("failing", row(A, "failed"), row(B, "failed")) },
    });
    const weeks = await weeklyRates(runs as never);
    expect(weeks).toEqual([
      { week: "2026-W45", kept: { runs: 1, generated: 10, kept: 8, rate: 0.8 }, runnable: { runs: 2, cases: 2, judged: 2, runnable: 2, rate: 1 } },
      { week: "2026-W46", kept: { runs: 1, generated: 4, kept: 4, rate: 1 }, runnable: { runs: 1, cases: 2, judged: 2, runnable: 1, rate: 0.5 } },
    ]);
    expect(await weeklyRates(runs as never, 1)).toHaveLength(1);
    expect(weeksTable(weeks)).toBe(
      ["week      kept                    runnable", "2026-W45  80% (8/10 in 1 run(s))  100% (2/2 judged in 2 run(s))", "2026-W46  100% (4/4 in 1 run(s))  50% (1/2 judged in 1 run(s))"].join("\n"),
    );
  });

  it("agent-qa report prints the rates, the weeks and the targets, or JSON", async () => {
    const out: string[] = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => (out.push(String(chunk)), true));
    try {
      const empty = `${process.cwd()}/test/fixtures/no-such-project`;
      await buildProgram().parseAsync(["node", "agent-qa", "report", "--cwd", empty]);
      expect(out.join("")).toContain("kept rate: no reviewed test cases yet");
      expect(out.join("")).toContain("targets: 95% kept, 90% runnable");
      out.length = 0;
      await buildProgram().parseAsync(["node", "agent-qa", "report", "--json", "--cwd", empty]);
      expect(JSON.parse(out.join(""))).toMatchObject({ targets: { kept: 0.95, runnable: 0.9 }, weeks: [] });
    } finally {
      write.mockRestore();
    }
  });
});
