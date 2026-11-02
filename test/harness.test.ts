import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildProgram } from "../src/cli/index.js";
import { parseConfig } from "../src/core/index.js";
import {
  DEFAULT_CASES,
  DEFAULT_SEEDS,
  emptyPipeline,
  harnessSources,
  HarnessCaseError,
  RecordingDriver,
  runHarness,
  SeededLeakError,
  SeedScanner,
  validateCases,
  type Pipeline,
} from "../src/harness/index.js";
import { StaticDriver } from "../src/llm/index.js";

const now = () => new Date("2026-11-20T10:00:00Z");

/** Sends the raw ticket text to the model: the bug the harness exists to catch. */
const leakyPipeline: Pipeline = async ({ tickets, driver }) => {
  await driver.complete({ messages: [{ role: "user", content: `Write test cases for:\n${tickets[0]!.description}` }] });
};

/** Sends only the summary, which holds no personal data. */
const summaryPipeline: Pipeline = async ({ tickets, driver }) => {
  await driver.complete({ messages: [{ role: "user", content: tickets[0]!.summary }] });
};

describe("harness runner", () => {
  it("runs an empty pipeline over the shipped cases", async () => {
    const report = await runHarness({ cases: DEFAULT_CASES, seeds: DEFAULT_SEEDS, pipeline: emptyPipeline, pipelineName: "empty", driver: new StaticDriver(), now });
    expect(report.summary).toEqual({ cases: 2, passed: 2, failed: 0, errors: 0, seededLeaks: 0 });
    expect(report).toMatchObject({ version: 1, pipeline: "empty", driver: "static", startedAt: "2026-11-20T10:00:00.000Z" });
  });

  it("catches a deliberately leaked value, and never forwards it or reports it", async () => {
    const inner = new StaticDriver();
    const forwarded = vi.spyOn(inner, "complete");
    const report = await runHarness({ cases: DEFAULT_CASES, seeds: DEFAULT_SEEDS, pipeline: leakyPipeline, driver: inner, now });
    expect(report.summary).toMatchObject({ failed: 2, seededLeaks: 5 });
    expect(report.cases[0]!.seededLeaks.map((l) => l.seedId).sort()).toEqual(["seed-email-1", "seed-name-1", "seed-phone-1"]);
    expect(report.cases[1]!.seededLeaks.map((l) => l.seedId).sort()).toEqual(["seed-card-1", "seed-iban-1"]);
    expect(forwarded).not.toHaveBeenCalled();
    const json = JSON.stringify(report);
    for (const seed of DEFAULT_SEEDS) expect(json).not.toContain(seed.value);
  });

  it("passes calls that carry no seeded data", async () => {
    const report = await runHarness({ cases: DEFAULT_CASES, seeds: DEFAULT_SEEDS, pipeline: summaryPipeline, driver: new StaticDriver(), now });
    expect(report.summary).toMatchObject({ passed: 2, seededLeaks: 0 });
    expect(report.cases.map((c) => c.modelCalls)).toEqual([1, 1]);
  });

  it("fails a case even when the pipeline swallows the leak error", async () => {
    const swallowing: Pipeline = async (ctx) => {
      await leakyPipeline(ctx).catch(() => undefined);
    };
    const report = await runHarness({ cases: DEFAULT_CASES.slice(0, 1), seeds: DEFAULT_SEEDS, pipeline: swallowing, driver: new StaticDriver() });
    expect(report.cases[0]).toMatchObject({ status: "fail" });
  });

  it("reports pipeline errors without leaking seeds through the message", async () => {
    const throwing: Pipeline = async ({ tickets }) => {
      throw new Error(`could not parse ${tickets[0]!.description}`);
    };
    const report = await runHarness({ cases: DEFAULT_CASES.slice(0, 1), seeds: DEFAULT_SEEDS, pipeline: throwing, driver: new StaticDriver() });
    expect(report.cases[0]).toMatchObject({ status: "error", error: "Error: (message withheld: it contains seeded data)" });
    const plain: Pipeline = async () => {
      throw new TypeError("boom");
    };
    expect((await runHarness({ cases: DEFAULT_CASES.slice(0, 1), seeds: DEFAULT_SEEDS, pipeline: plain, driver: new StaticDriver() })).cases[0]!.error).toBe("TypeError: boom");
  });

  it("gives each case its own copy of the tickets", async () => {
    const mutating: Pipeline = async ({ tickets }) => {
      tickets[0]!.description = "changed";
    };
    await runHarness({ cases: DEFAULT_CASES, seeds: DEFAULT_SEEDS, pipeline: mutating, driver: new StaticDriver() });
    expect(DEFAULT_CASES[0]!.tickets[0]!.description).toContain("Marguerite");
  });
});

describe("seed scanner", () => {
  const scanner = new SeedScanner(DEFAULT_SEEDS);
  const ids = (text: string) => scanner.scan(text).map((h) => `${h.seedId}:${h.match}`);

  it("matches across case, spacing and separators, and single name parts", () => {
    expect(ids("contact MARGUERITE   quillfeather")).toEqual(["seed-name-1:exact"]);
    expect(ids("call +33612345678")).toEqual(["seed-phone-1:compact"]);
    expect(ids("iban de89370400440532013000")).toEqual(["seed-iban-1:compact"]);
    expect(ids("card 4111-1111-1111-1111")).toEqual(["seed-card-1:compact"]);
    expect(ids("ask Wrenhallow")).toEqual(["seed-name-2:name-part"]);
    expect(ids("Contact <PERSON_1> about <EMAIL_1>")).toEqual([]);
  });

  it("refuses a leaking request in the recording driver", async () => {
    const driver = new RecordingDriver(new StaticDriver("ok"), DEFAULT_SEEDS, "c1");
    expect(await driver.complete({ messages: [{ role: "user", content: "<PERSON_1>" }] })).toEqual({ text: "ok" });
    await expect(driver.complete({ messages: [{ role: "system", content: "x" }, { role: "user", content: "m.quillfeather@example.com" }] })).rejects.toBeInstanceOf(SeededLeakError);
    // The address also carries the surname, so both seeds count.
    expect(driver.leaks).toEqual([
      { seedId: "seed-name-1", kind: "name", match: "name-part", caseId: "c1", call: 1 },
      { seedId: "seed-email-1", kind: "email", match: "exact", caseId: "c1", call: 1 },
    ]);
  });
});

describe("harness cases", () => {
  it("rejects a case whose seeds aren't in its tickets, unknown seeds and duplicate ids", () => {
    const [first] = DEFAULT_CASES;
    expect(() => validateCases([{ ...first!, seeds: ["seed-card-1"] }], DEFAULT_SEEDS)).toThrow(/don't contain it/);
    expect(() => validateCases([{ ...first!, seeds: ["nope"] }], DEFAULT_SEEDS)).toThrow(/unknown seed/);
    expect(() => validateCases([first!, first!], DEFAULT_SEEDS)).toThrow(HarnessCaseError);
  });

  describe("from agent-qa.yaml", () => {
    let dir: string;
    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "agent-qa-harness-"));
    });
    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it("loads fixtures and seeds, and notes skipped Jira sources", async () => {
      await mkdir(join(dir, "fixtures"));
      await writeFile(
        join(dir, "fixtures", "a.yaml"),
        "id: login\ndescription: Login story\nworkflow: spike-test-cases\ninputs: { ticket: QAH-9 }\ntickets:\n  - key: QAH-9\n    summary: Log in\n    description: Zephyrine Applewood logs in\nseeds: [seed-1]\n",
      );
      await writeFile(join(dir, "seeds.yaml"), "seeds:\n  - id: seed-1\n    kind: name\n    value: Zephyrine Applewood\n");
      const config = parseConfig(
        'version: 1\nharness:\n  sources:\n    - fixtures: ./fixtures\n    - jira:\n        jql: "project = QAH"\n  seededPersonalData: ./seeds.yaml\n',
      );
      const sources = await harnessSources(config, dir);
      expect(sources.cases.map((c) => c.id)).toEqual(["login"]);
      expect(sources.seeds.map((s) => s.id)).toEqual(["seed-1"]);
      expect(sources.notes).toEqual([expect.stringMatching(/jira source skipped/)]);
      const report = await runHarness({ ...sources, pipeline: leakyPipeline, driver: new StaticDriver() });
      expect(report.cases[0]!.seededLeaks.map((l) => l.seedId)).toEqual(["seed-1"]);
    });

    it("reports a bad case or seeds file without echoing seed values", async () => {
      await mkdir(join(dir, "fixtures"));
      await writeFile(join(dir, "fixtures", "bad.json"), '{"id":"x"}');
      await expect(harnessSources(parseConfig("version: 1\nharness:\n  sources:\n    - fixtures: ./fixtures\n"), dir)).rejects.toThrow(/bad.json: \$\.description/);
      await writeFile(join(dir, "seeds.yaml"), "seeds:\n  - id: Bad Id\n    kind: name\n    value: Secret Person\n");
      await rm(join(dir, "fixtures", "bad.json"));
      const config = parseConfig("version: 1\nharness:\n  sources:\n    - fixtures: ./fixtures\n  seededPersonalData: ./seeds.yaml\n");
      await expect(harnessSources(config, dir)).rejects.toThrow(HarnessCaseError);
      await expect(harnessSources(config, dir)).rejects.not.toThrow(/Secret Person/);
    });

    it("uses the shipped set without a harness section", async () => {
      expect((await harnessSources(undefined, dir)).cases).toBe(DEFAULT_CASES);
    });
  });
});

describe("agent-qa harness", () => {
  it("runs the empty pipeline on the shipped cases and exits 0", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-qa-harness-cli-"));
    const out: string[] = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => (out.push(String(chunk)), true));
    const before = process.exitCode;
    try {
      await buildProgram().parseAsync(["node", "agent-qa", "harness", "--json", "--cwd", dir]);
      const report = JSON.parse(out.join(""));
      expect(report.summary).toMatchObject({ cases: 2, passed: 2 });
      expect(process.exitCode).toBe(before);
    } finally {
      write.mockRestore();
      process.exitCode = before;
      await rm(dir, { recursive: true, force: true });
    }
  });
});
