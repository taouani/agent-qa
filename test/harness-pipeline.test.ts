import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseConfig } from "../src/core/index.js";
import { DEFAULT_CASES, DEFAULT_SEEDS, FixtureDriver, harnessCaseSchema, keptRate, maskedPipeline, RecordingDriver, runHarness, SeededLeakError } from "../src/harness/index.js";
import { collect } from "../src/harness/pipeline.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agent-qa-hp-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const run = (config?: ReturnType<typeof parseConfig>) =>
  runHarness({ cases: DEFAULT_CASES, seeds: DEFAULT_SEEDS, pipeline: maskedPipeline({ runsDir: join(dir, "runs"), ...(config ? { config } : {}) }), pipelineName: "masked", driver: new FixtureDriver() });

describe("masked pipeline (S1-14)", () => {
  it("runs the real workflows on the shipped cases with no seeded value reaching the model", async () => {
    const report = await run();
    expect(report.summary).toEqual({ cases: 3, passed: 3, failed: 0, errors: 0, seededLeaks: 0 });
    const runs = (await readdir(join(dir, "runs"))).sort();
    expect(runs).toHaveLength(3);
    // The run folders keep masked text only: nothing seeded is on disk.
    for (const r of runs) {
      const files = [...(await readdir(join(dir, "runs", r))).filter((f) => f.includes(".")), ...(await readdir(join(dir, "runs", r, "steps"))).map((f) => join("steps", f))];
      expect(files).toContain(join("steps", "state.json"));
      for (const file of files) {
        const text = await readFile(join(dir, "runs", r, file), "utf8");
        for (const seed of DEFAULT_SEEDS) expect(text, `${r}/${file}`).not.toContain(seed.value);
      }
    }
    // The test-cases runs are unattended reviews, so they never count toward the kept rate.
    const cases = runs.filter((r) => !r.includes("QAH-6"));
    for (const r of cases) {
      const art = JSON.parse(await readFile(join(dir, "runs", r, "test-cases.json"), "utf8"));
      expect(art.data.review.unattended).toBe(true);
    }
  });

  it("fails the gate when masking is switched off", async () => {
    // Only names masked: emails, phones, cards, IBANs, ids and IPs reach the model.
    const report = await run(parseConfig("version: 1\nmasking:\n  detectors: [name]\n"));
    expect(report.summary.passed).toBe(0);
    expect(report.summary.failed).toBe(3);
    const leaked = new Set(report.cases.flatMap((c) => c.seededLeaks.map((l) => l.seedId)));
    for (const id of ["seed-email-1", "seed-phone-1", "seed-card-1", "seed-iban-1", "seed-national-id-1"]) expect(leaked).toContain(id);
    expect(JSON.stringify(report)).not.toContain("4111");
  });

  it("scans the text of confirm steps, which an IDE's model is shown", () => {
    const driver = new RecordingDriver(new FixtureDriver(), DEFAULT_SEEDS, "c");
    expect(() => driver.observe("Review TC-QAH-1-001 for <PERSON_1>")).not.toThrow();
    expect(() => driver.observe("Review the case for Marguerite Quillfeather")).toThrow(SeededLeakError);
    expect(driver.leaks).toMatchObject([{ seedId: "seed-name-1", shown: true, call: 1 }]);
  });

  it("reports a case whose workflow doesn't exist as an error", async () => {
    const bad = harnessCaseSchema.parse({ ...DEFAULT_CASES[2]!, workflow: "nope" });
    const report = await runHarness({ cases: [bad], seeds: DEFAULT_SEEDS, pipeline: maskedPipeline({ runsDir: join(dir, "runs") }), driver: new FixtureDriver() });
    expect(report.cases[0]).toMatchObject({ status: "error" });
    expect(report.cases[0]!.error).toMatch(/nope/);
  });
});

describe("synthetic Jira", () => {
  const [contact, refund] = DEFAULT_CASES;

  it("returns a key with its children, and linked issues with theirs", () => {
    const c = collect(contact!.tickets, { key: "QAH-1" });
    expect(c.issues.map((i) => [i.key, i.role, i.depth])).toEqual([
      ["QAH-1", "root", 0],
      ["QAH-2", "child", 1],
    ]);
    expect(c.acceptanceCriteriaField).toBeDefined();
    expect(c.extraFields.map((f) => f.name)).toEqual(["Customer notes"]);
    const r = collect(refund!.tickets, { key: "QAH-4" });
    expect(r.issues.map((i) => [i.key, i.role])).toEqual([
      ["QAH-4", "root"],
      ["QAH-5", "linked"],
    ]);
    expect(r.issues[1]!.links).toMatchObject([{ direction: "inward", key: "QAH-4" }]);
  });

  it("returns every ticket for a JQL filter, children under their parent", () => {
    const r = collect(refund!.tickets, { jql: "anything" });
    expect(r.issues.map((i) => [i.key, i.role])).toEqual([
      ["QAH-3", "root"],
      ["QAH-4", "child"],
      ["QAH-5", "root"],
    ]);
  });

  it("refuses parents and links outside the case", () => {
    const t = { key: "QAH-9", summary: "s", description: "d" };
    expect(harnessCaseSchema.safeParse({ ...contact!, tickets: [{ ...t, parent: "QAH-8" }] }).success).toBe(false);
    expect(harnessCaseSchema.safeParse({ ...contact!, tickets: [{ ...t, links: [{ key: "QAH-8" }] }] }).success).toBe(false);
    expect(harnessCaseSchema.safeParse({ ...contact!, tickets: [t, t] }).success).toBe(false);
  });
});

describe("kept rate", () => {
  const review = (generated: number, kept: number, unattended = false) => ({
    data: { review: { generated, kept, edited: 0, dropped: generated - kept, keptRate: kept / generated, ...(unattended ? { unattended: true } : {}) } },
  });

  it("pools reviewed runs and leaves out --yes runs and runs without cases", async () => {
    const arts: Record<string, unknown> = { a: review(10, 8), b: review(10, 2, true), c: undefined, d: review(5, 4) };
    const runs = {
      list: async () => [...Object.keys(arts), "e"],
      readArtifact: async (id: string) => {
        if (id === "e") throw new Error("invalid");
        return arts[id];
      },
    };
    expect(await keptRate(runs as never)).toEqual({ runs: 2, unattendedRuns: 1, unreadableRuns: 1, generated: 15, kept: 12, edited: 0, dropped: 3, rate: 0.8 });
  });

  it("has no rate before any review", async () => {
    expect((await keptRate({ list: async () => [], readArtifact: async () => undefined } as never)).rate).toBeUndefined();
  });
});

describe("fixture model", () => {
  it("refuses steps it doesn't know", async () => {
    await expect(new FixtureDriver().complete({ schemaName: "review", messages: [{ role: "user", content: "Context:\n{}\n\nAnswer with JSON that matches this JSON Schema:\n{}" }] })).rejects.toThrow(/can't answer step review/);
  });
});
