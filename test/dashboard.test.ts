import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeDashboard, writeHarnessReport } from "../src/cli/report-files.js";
import { COST_ARTIFACT, RunStore } from "../src/core/index.js";
import { MASKING_REPORT_ARTIFACT } from "../src/data/index.js";
import { dashboardData, HARNESS_LAST_REPORT, renderDashboard } from "../src/harness/index.js";
import { TEST_CASES_ARTIFACT } from "../src/workflows/index.js";

const manifest = (id: string, workflow: string, startedAt: string, model?: string) => ({ id, workflow, context: "x", status: "done", startedAt, host: "cli", driver: "api", ...(model ? { model } : {}) });
const cost = (calls: number, usd?: number) => ({ total: { calls, unpricedCalls: 0, inputTokens: calls * 1000, outputTokens: calls * 100, cachedInputTokens: 0, promptChars: 0, answerChars: 0, ...(usd !== undefined ? { usd } : {}), unpriced: [], hostModelCalls: 0 } });
const masking = (tokens: number, byDetector: Record<string, number>) => ({ byDetector, byField: {}, wholeFields: {}, tokens, unmaskedFields: [], detectors: [], languages: [], issues: 2, pages: 1 });

function store(runs: Record<string, { manifest: ReturnType<typeof manifest>; arts: Map<unknown, unknown> }>) {
  return {
    list: async () => Object.keys(runs),
    manifest: async (id: string) => runs[id]?.manifest as never,
    readArtifact: async (id: string, spec: unknown) => {
      const data = runs[id]?.arts.get(spec);
      return data === undefined ? undefined : ({ data, createdAt: runs[id]!.manifest.startedAt } as never);
    },
  };
}

describe("the local dashboard (S5-3)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-dash-"));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("puts the rates, the last harness run, masking totals and cost per run in one self-contained file", async () => {
    const runs = store({
      "2026-11-03-abc-1-a": {
        manifest: manifest("2026-11-03-abc-1-a", "test-cases", "2026-11-03T10:00:00.000Z", "anthropic:claude-opus-5-5"),
        arts: new Map<unknown, unknown>([
          [TEST_CASES_ARTIFACT, { review: { generated: 10, kept: 9, edited: 1, dropped: 0, keptRate: 0.9 } }],
          [COST_ARTIFACT, cost(4, 0.42)],
          [MASKING_REPORT_ARTIFACT, masking(7, { email: 3, name: 4 })],
        ]),
      },
      "2026-11-04-<b>-b": { manifest: manifest("2026-11-04-<b>-b", "review", "2026-11-04T10:00:00.000Z"), arts: new Map<unknown, unknown>([[COST_ARTIFACT, cost(2)]]) },
    });
    const harnessDir = join(dir, "harness");
    await mkdir(harnessDir);
    const report = { version: 1, pipeline: "masked", driver: "fixture", startedAt: "2026-11-05T10:00:00.000Z", finishedAt: "2026-11-05T10:01:00.000Z", cases: [{ id: "contact-email", workflow: "test-cases", status: "fail", modelCalls: 3, seededLeaks: [{ seedId: "seed-1", kind: "email", caseId: "contact-email", call: 0 }], durationMs: 5 }], summary: { cases: 1, passed: 0, failed: 1, errors: 0, seededLeaks: 1 } };
    await writeFile(join(harnessDir, HARNESS_LAST_REPORT), JSON.stringify(report));
    const data = await dashboardData(runs, { harnessDir, targets: { kept: 0.95, runnable: 0.9 }, now: () => new Date("2026-11-09T08:00:00Z") });
    expect(data.masking).toEqual({ runs: 1, tokens: 7, issues: 2, pages: 1, byDetector: { email: 3, name: 4 } });
    expect(data.runs.map((r) => r.id)).toEqual(["2026-11-04-<b>-b", "2026-11-03-abc-1-a"]);
    const html = renderDashboard(data);
    expect(html).toContain("90.0%");
    expect(html).toContain("seed-1 (email)");
    expect(html).toContain("$0.42");
    expect(html).toContain("not priced");
    // Escaped, and nothing that loads or runs anything.
    expect(html).toContain("2026-11-04-&lt;b&gt;-b");
    expect(html).not.toMatch(/<script|https?:\/\/|<link|<img|@import|url\(/i);
  });

  it("says what is missing on a new project", async () => {
    const data = await dashboardData(store({}), { harnessDir: join(dir, "none"), targets: { kept: 0.95, runnable: 0.9 } });
    const html = renderDashboard(data);
    expect(html).toContain("No harness run yet");
    expect(html).toContain("No runs in this project yet");
    expect(html).toContain("No week has a reviewed or finished run yet");
  });

  it("writes the dashboard to a new .html file or over one it wrote, and leaves any other file alone", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-qa-dash-file-"));
    try {
      const html = renderDashboard(await dashboardData(new RunStore(join(dir, "runs")), { harnessDir: join(dir, "harness"), targets: { kept: 0.95, runnable: 0.9 } }));
      const file = join(dir, "out", "report.html");
      await writeDashboard(file, html);
      await writeDashboard(file, html);
      expect(await readFile(file, "utf8")).toBe(html);
      await writeFile(join(dir, "mine.html"), "<p>my notes</p>");
      await expect(writeDashboard(join(dir, "mine.html"), html)).rejects.toThrow(/isn't a dashboard agent-qa wrote/);
      expect(await readFile(join(dir, "mine.html"), "utf8")).toBe("<p>my notes</p>");
      await expect(writeDashboard(join(dir, "playwright.config.ts"), html)).rejects.toThrow(/an \.html file only/);
      // Never through a symlink a cloned repo could commit: not for the dashboard, the harness report or its folder.
      if (process.platform !== "win32") {
        await writeFile(join(dir, "victim.txt"), "keep");
        await symlink(join(dir, "victim.txt"), join(dir, "linked.html"));
        await expect(writeDashboard(join(dir, "linked.html"), html)).rejects.toThrow(/is a symlink/);
        const project = join(dir, "project");
        await mkdir(join(project, ".agent-qa", "harness"), { recursive: true });
        await symlink(join(dir, "victim.txt"), join(project, ".agent-qa", "harness", HARNESS_LAST_REPORT));
        await expect(writeHarnessReport(project, { summary: {} })).rejects.toThrow(/is a symlink/);
        const other = join(dir, "other");
        await mkdir(join(other, ".agent-qa"), { recursive: true });
        await symlink(join(dir, "out"), join(other, ".agent-qa", "harness"));
        await expect(writeHarnessReport(other, { summary: {} })).rejects.toThrow(/is a symlink/);
        expect(await readFile(join(dir, "victim.txt"), "utf8")).toBe("keep");
        await writeHarnessReport(join(dir, "fresh"), { summary: {} });
        expect(JSON.parse(await readFile(join(dir, "fresh", ".agent-qa", "harness", HARNESS_LAST_REPORT), "utf8"))).toEqual({ summary: {} });
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
