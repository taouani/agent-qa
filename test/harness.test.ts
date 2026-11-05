import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildProgram } from "../src/cli/index.js";
import { parseConfig } from "../src/core/index.js";
import {
  DEFAULT_BROWSER_CASES,
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
    expect(report.summary).toEqual({ cases: 3, passed: 3, failed: 0, errors: 0, seededLeaks: 0 });
    expect(report).toMatchObject({ version: 1, pipeline: "empty", driver: "static", startedAt: "2026-11-20T10:00:00.000Z" });
  });

  it("catches a deliberately leaked value, and never forwards it or reports it", async () => {
    const inner = new StaticDriver();
    const forwarded = vi.spyOn(inner, "complete");
    const report = await runHarness({ cases: DEFAULT_CASES, seeds: DEFAULT_SEEDS, pipeline: leakyPipeline, driver: inner, now });
    expect(report.summary).toMatchObject({ failed: 3, seededLeaks: 7 });
    expect(report.cases[0]!.seededLeaks.map((l) => l.seedId).sort()).toEqual(["seed-email-1", "seed-name-1", "seed-name-2", "seed-phone-1"]);
    expect(report.cases[1]!.seededLeaks.map((l) => l.seedId).sort()).toEqual(["seed-name-3"]);
    expect(report.cases[2]!.seededLeaks.map((l) => l.seedId).sort()).toEqual(["seed-name-2", "seed-phone-1"]);
    expect(forwarded).not.toHaveBeenCalled();
    const json = JSON.stringify(report);
    for (const seed of DEFAULT_SEEDS) expect(json).not.toContain(seed.value);
  });

  it("passes calls that carry no seeded data", async () => {
    const report = await runHarness({ cases: DEFAULT_CASES, seeds: DEFAULT_SEEDS, pipeline: summaryPipeline, driver: new StaticDriver(), now });
    expect(report.summary).toMatchObject({ passed: 3, seededLeaks: 0 });
    expect(report.cases.map((c) => c.modelCalls)).toEqual([1, 1, 1]);
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

  it("withholds a seed in an error name, and treats a foreign leak error as an error", async () => {
    const named: Pipeline = async () => {
      throw Object.assign(new Error("x"), { name: "Quillfeather" });
    };
    const r1 = await runHarness({ cases: DEFAULT_CASES.slice(0, 1), seeds: DEFAULT_SEEDS, pipeline: named, driver: new StaticDriver() });
    expect(r1.cases[0]!.error).toBe("Error: x");
    const foreign: Pipeline = async () => {
      throw new SeededLeakError([]);
    };
    const r2 = await runHarness({ cases: DEFAULT_CASES.slice(0, 1), seeds: DEFAULT_SEEDS, pipeline: foreign, driver: new StaticDriver() });
    expect(r2.cases[0]!.status).toBe("error");
  });

  it("reports a circular or BigInt throw instead of crashing", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    for (const thrown of [circular, 10n]) {
      const p: Pipeline = async () => {
        throw thrown;
      };
      const report = await runHarness({ cases: DEFAULT_CASES.slice(0, 1), seeds: DEFAULT_SEEDS, pipeline: p, driver: new StaticDriver() });
      expect(report.cases[0]!.status).toBe("error");
    }
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
    expect(ids("contact MARGUERITE   quillfeather")).toEqual(["seed-name-1:words"]);
    expect(ids("contact Quillfeather, Marguerite")).toEqual(["seed-name-1:words"]);
    expect(ids("call +33639981234")).toEqual(["seed-phone-1:digits"]);
    expect(ids("call 06 39 98 12 34")).toEqual(["seed-phone-1:national"]);
    expect(ids("iban de89370400440532013000")).toEqual(["seed-iban-1:digits"]);
    expect(ids("card 4111-1111-1111-1111")).toEqual(["seed-card-1:digits"]);
    expect(ids("card \uFF14\uFF11\uFF11\uFF11 1111 1111 1111")).toEqual(["seed-card-1:exact"]);
    expect(ids("ask Wrenhallow")).toEqual(["seed-name-2:name-part"]);
    expect(ids("Wrenhallow's account and Quillfeather-Smith")).toEqual(["seed-name-1:name-part", "seed-name-2:name-part"]);
    expect(ids("Contact <PERSON_1> about <EMAIL_1>")).toEqual([]);
  });

  it("handles accents, escapes and base64", () => {
    const accented = new SeedScanner([{ id: "s", kind: "name", value: "Zoë Ångström" }]);
    for (const text of ["Zoe\u0308 A\u030Angstro\u0308m", "Zoe Angstrom", "contact Angstrom"]) expect(accented.scan(text)).toHaveLength(1);
    const email = new SeedScanner([{ id: "e", kind: "email", value: "pat.vexwillow@example.com" }]);
    for (const text of [
      "pat.vexwillow%40example.com",
      "pat.vexwillow&#64;example.com",
      "pat.vexwillow\\u0040example.com",
      "user patvexwillow",
      Buffer.from("mail pat.vexwillow@example.com now").toString("base64"),
    ]) expect(email.scan(text), text).toHaveLength(1);
  });

  it("sees through invisible characters and other separators", () => {
    expect(ids("contact Quill\u200Dfeather")).toEqual(["seed-name-1:name-part"]);
    expect(ids("iban DE 89 3704 0044 0532 0130 00")).toEqual(["seed-iban-1:digits"]);
    expect(ids("card 4111_1111_1111_1111")).toEqual(["seed-card-1:digits"]);
  });

  it("avoids false positives on digits, IPs and common words", () => {
    expect(ids("account 24111111111111111119")).toEqual([]);
    const ip = new SeedScanner([{ id: "ip", kind: "ip", value: "192.0.2.10" }]);
    expect(ip.scan("host 192.0.2.100")).toEqual([]);
    expect(ip.scan("host 192.0.2.10.")).toHaveLength(1);
    const grace = new SeedScanner([{ id: "g", kind: "name", value: "Grace Field" }]);
    expect(grace.scan("Field: Case.Status, grace period")).toEqual([]);
    expect(grace.scan("owner Field, Grace")).toHaveLength(1);
    const short = new SeedScanner([{ id: "w", kind: "name", value: "Li Wu" }]);
    expect(short.scan("Wu, Li")).toHaveLength(1);
    const address = new SeedScanner([{ id: "a", kind: "address", value: "12 Rue de la Paix, Paris" }]);
    expect(address.scan("12 Rue de la Paix\nParis")).toHaveLength(1);
  });

  it("scans every string in a request, not only message text", async () => {
    const driver = new RecordingDriver(new StaticDriver(), DEFAULT_SEEDS, "c1");
    const request = { messages: [{ role: "user" as const, content: "ok" }], tools: [{ description: "for m.quillfeather@example.com" }] };
    await expect(driver.complete(request as never)).rejects.toBeInstanceOf(SeededLeakError);
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
    expect(() => validateCases([first!], [...DEFAULT_SEEDS, DEFAULT_SEEDS[0]!])).toThrow(/Duplicate seed id/);
    // Matching follows the scanner, so different case in the ticket still counts.
    const lower = { ...first!, tickets: [{ ...first!.tickets[0]!, description: first!.tickets[0]!.description.toLowerCase() }] };
    expect(() => validateCases([lower], DEFAULT_SEEDS)).not.toThrow();
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

    it("never echoes file content in parse errors", async () => {
      await mkdir(join(dir, "f"));
      const config = parseConfig("version: 1\nharness:\n  sources:\n    - fixtures: ./f\n  seededPersonalData: ./seeds.json\n");
      await writeFile(join(dir, "seeds.json"), '{"seeds":[{"id":"s","kind":"name","value": Secret Person}]}');
      await expect(harnessSources(config, dir)).rejects.toThrow(/seeds.json is not valid JSON/);
      await expect(harnessSources(config, dir)).rejects.not.toThrow(/Secret/);
      await writeFile(join(dir, "seeds.json"), '{"seeds":[{"id":"s","kind":"name","value":"Ann Example"}]}');
      await writeFile(join(dir, "f", "a.json"), '{"description": Zephyrine Applewood}');
      await expect(harnessSources(config, dir)).rejects.not.toThrow(/Zephyrine/);
      await writeFile(join(dir, "f", "a.json"), "");
      await rm(join(dir, "f", "a.json"));
      await writeFile(join(dir, "f", "a.yaml"), "description: [Zephyrine Applewood\n");
      await expect(harnessSources(config, dir)).rejects.toThrow(/a.yaml is not valid YAML/);
      await expect(harnessSources(config, dir)).rejects.not.toThrow(/Zephyrine/);
    });

    it("counts only digits for phone and card seeds, and needs the whole value in fixtures", async () => {
      expect(() => validateCases([], [{ id: "c", kind: "card", value: "abcdefgh" } as never])).not.toThrow();
      const { seedSchema } = await import("../src/harness/index.js");
      expect(seedSchema.safeParse({ id: "c", kind: "card", value: "abcdefgh" }).success).toBe(false);
      expect(seedSchema.safeParse({ id: "i", kind: "iban", value: "DE893704" }).success).toBe(true);
      const [first] = DEFAULT_CASES;
      const ticket = { ...first!.tickets[0]!, description: "Quillfeather only", fields: {} };
      delete ticket.acceptanceCriteria;
      const partial = { ...first!, tickets: [ticket], seeds: ["seed-name-1"] };
      expect(() => validateCases([partial], DEFAULT_SEEDS)).toThrow(/don't contain it/);
    });

    it("rejects short digit seeds and duplicate seed ids", async () => {
      const config = parseConfig("version: 1\nharness:\n  sources:\n    - fixtures: ./f\n  seededPersonalData: ./seeds.yaml\n");
      await mkdir(join(dir, "f"));
      await writeFile(join(dir, "seeds.yaml"), "seeds:\n  - id: p\n    kind: phone\n    value: '1 23'\n");
      await expect(harnessSources(config, dir)).rejects.toThrow(/at least 8/);
      await writeFile(join(dir, "seeds.yaml"), "seeds:\n  - id: p\n    kind: name\n    value: Ann Example\n  - id: p\n    kind: name\n    value: Bob Example\n");
      await expect(harnessSources(config, dir)).rejects.toThrow(/duplicate seed id p/);
      await expect(harnessSources(parseConfig("version: 1\nharness:\n  sources:\n    - fixtures: ./missing\n"), dir)).rejects.toThrow(/can't be read \(ENOENT\)/);
    });

    it("uses the shipped set without a harness section", async () => {
      expect((await harnessSources(undefined, dir)).cases).toEqual([...DEFAULT_CASES, ...DEFAULT_BROWSER_CASES]);
    });
  });
});

async function runCli(args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => (out.push(String(chunk)), true));
  const ewrite = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => (err.push(String(chunk)), true));
  const before = process.exitCode;
  process.exitCode = undefined;
  try {
    await buildProgram().parseAsync(["node", "agent-qa", ...args]);
    return { out: out.join(""), err: err.join(""), code: process.exitCode };
  } finally {
    write.mockRestore();
    ewrite.mockRestore();
    process.exitCode = before;
  }
}

describe("agent-qa harness exit codes", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-harness-cli-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("exits 2 when there is nothing to test", async () => {
    await writeFile(join(dir, "agent-qa.yaml"), 'version: 1\nharness:\n  sources:\n    - jira:\n        jql: "project = QAH"\n');
    const r = await runCli(["harness", "--cwd", dir]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/no harness cases/);
  });

  it("skips the browser cases unless asked, and names a missing Playwright", async () => {
    const r = await runCli(["harness", "--pipeline", "empty", "--cwd", dir]);
    expect(r.code).toBeUndefined();
    expect(r.out).toContain("note: 2 browser case(s) skipped: run with --browser");
    expect(r.out).toContain("3/3 passed");
    const browser = await runCli(["harness", "--browser", "--cwd", dir]);
    expect(browser.code).toBe(1);
    expect(browser.out).toMatch(/\[error\] approval-request-explore: .*Playwright isn't installed in the repo/);
    expect(browser.out).toMatch(/\[error\] approval-request-defect: .*has none \(npm install @playwright\/test there\)/);
    expect(browser.out).toContain("3/5 passed");
  }, 60_000);

  it("exits 2 with one line for a bad config or a missing fixtures folder", async () => {
    await writeFile(join(dir, "agent-qa.yaml"), "version: 2\n");
    expect(await runCli(["harness", "--cwd", dir])).toMatchObject({ code: 2, err: expect.stringMatching(/^agent-qa harness: Invalid config/) });
    await writeFile(join(dir, "agent-qa.yaml"), "version: 1\nharness:\n  sources:\n    - fixtures: ./nope\n");
    const r = await runCli(["harness", "--cwd", dir]);
    expect(r).toMatchObject({ code: 2, err: expect.stringMatching(/ENOENT/) });
    expect(r.err).not.toContain(dir);
  });

  it("exits 2 for a bad pipeline or a model it can't use, before running anything", async () => {
    expect(await runCli(["harness", "--pipeline", "bogus", "--cwd", dir])).toMatchObject({ code: 2, err: expect.stringMatching(/unknown pipeline bogus/) });
    expect(await runCli(["harness", "--pipeline", "empty", "--model", "anthropic:claude-opus-5-5", "--cwd", dir])).toMatchObject({ code: 2, err: expect.stringMatching(/no effect/) });
    expect(await runCli(["harness", "--model", "anthropic:claude-opus-5-5", "--cwd", dir])).toMatchObject({ code: 2, err: expect.stringMatching(/needs a models section/) });
    await writeFile(join(dir, "agent-qa.yaml"), "version: 1\nmodels:\n  default: anthropic:claude-opus-5-5\n  keys:\n    anthropic: ${env:AGENT_QA_TEST_UNSET_KEY}\n");
    expect(await runCli(["harness", "--model", "anthropic:claude-opus-5-5", "--cwd", dir])).toMatchObject({ code: 2, err: expect.stringMatching(/key for anthropic/) });
    expect(await runCli(["harness", "--model", "nope", "--cwd", dir])).toMatchObject({ code: 2 });
  });
});

describe("agent-qa harness", () => {
  it("runs the real workflows on the shipped cases with the offline model and exits 0", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-qa-harness-cli-"));
    const out: string[] = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => (out.push(String(chunk)), true));
    const before = process.exitCode;
    try {
      await buildProgram().parseAsync(["node", "agent-qa", "harness", "--json", "--cwd", dir]);
      const report = JSON.parse(out.join(""));
      expect(report).toMatchObject({ pipeline: "masked", driver: "fixture", summary: { cases: 3, passed: 3, seededLeaks: 0 } });
      expect(report.cases.map((c: { modelCalls: number }) => c.modelCalls)).toEqual([2, 2, 1]);
      expect(report.keptRate).toMatchObject({ runs: 0, generated: 0 });
      // Harness runs are kept apart from the project's runs.
      expect((await readdir(join(dir, ".agent-qa", "harness", "runs"))).length).toBe(3);
      expect(process.exitCode).toBe(before);
    } finally {
      write.mockRestore();
      process.exitCode = before;
      await rm(dir, { recursive: true, force: true });
    }
  });
});
