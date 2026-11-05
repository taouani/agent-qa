import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_BROWSER_CASES, DEFAULT_SEEDS, FixtureDriver, maskedPipeline, RecordingDriver, runHarness, SeededLeakError, standInRecords, startStandInApp, type Seed } from "../src/harness/index.js";

const seeds = (ids: string[]) => DEFAULT_SEEDS.filter((s) => ids.includes(s.id));

describe("stand-in app", () => {
  it("puts one record per seeded name, and the other seeds in the first one's details", () => {
    const records = standInRecords(seeds(["seed-name-1", "seed-name-2", "seed-email-1", "seed-phone-1", "seed-iban-1"]));
    expect(records.map((r) => r.name)).toEqual(["Marguerite Quillfeather", "Tobias Wrenhallow"]);
    expect(records[0]!.contact).toBe("Tobias Wrenhallow");
    // The record the tour opens shows every other seed in its details.
    const values = records[0]!.fields.map((f) => f.value);
    for (const s of ["m.quillfeather@example.com", "+33 6 39 98 12 34", "DE89 3704 0044 0532 0130 00"]) expect(values).toContain(s);
    expect(new Set(records.map((r) => r.id)).size).toBe(2);
  });

  it("serves a list view, record pages and nothing else, on this machine only", async () => {
    const app = await startStandInApp(seeds(["seed-name-1", "seed-email-1"]));
    try {
      expect(app.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      const list = await (await fetch(app.url + app.start)).text();
      expect(list).toContain("<title>Approval Requests | Salesforce</title>");
      const href = /href="(\/lightning\/r\/[^"]+)"/.exec(list)![1]!;
      const record = await (await fetch(app.url + href)).text();
      expect(record).toContain("<h1>Marguerite Quillfeather</h1>");
      expect(record).toContain('value="m.quillfeather@example.com"');
      expect((await fetch(app.url + "/lightning/r/Approval_Request__c/nope/view")).status).toBe(404);
    } finally {
      await app.close();
    }
  });
});

// The real browser: Playwright from a folder's node_modules, as in explorer.test.ts.
const playwrightFolder = (() => {
  for (const from of [process.env.AGENT_QA_PLAYWRIGHT_DIR, "/opt/node-tools"].filter((x): x is string => !!x)) {
    try {
      return dirname(dirname(createRequire(join(from, "package.json")).resolve("playwright/package.json")));
    } catch {
      // Not there.
    }
  }
  // Set in CI's browser job: a missing browser there must fail, not skip.
  if (process.env.AGENT_QA_PLAYWRIGHT_DIR) throw new Error("AGENT_QA_PLAYWRIGHT_DIR has no Playwright");
  return undefined;
})();

describe.skipIf(!playwrightFolder)("browser leak gate (real Chromium on the stand-in app)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-standin-"));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("explores the stand-in app with no seeded value reaching the model", async () => {
    const report = await runHarness({ cases: DEFAULT_BROWSER_CASES, seeds: DEFAULT_SEEDS, pipeline: maskedPipeline({ runsDir: join(dir, "runs"), playwrightFolder: playwrightFolder! }), pipelineName: "masked", driver: new FixtureDriver() });
    expect(report.cases[0]).toMatchObject({ status: "pass", seededLeaks: [] });
    const withExploration = [];
    for (const r of await readdir(join(dir, "runs"))) if ((await readdir(join(dir, "runs", r))).includes("exploration.json")) withExploration.push(r);
    expect(withExploration).toHaveLength(1);
    const art = JSON.parse(await readFile(join(dir, "runs", withExploration[0]!, "exploration.json"), "utf8"));
    const c = art.data.cases[0];
    expect(c).toMatchObject({ status: "complete", endedBy: "finish" });
    const actions = c.steps.flatMap((s: { actions: unknown[] }) => s.actions);
    // Opened a record by its masked name, typed a comment naming it, and read it back in the toast.
    expect(actions.map((a: { outcome: string }) => a.outcome)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(actions[0].action.target.name).toMatch(/^<PERSON_\d+>$/);
    expect(JSON.stringify(art)).not.toContain("Quillfeather");
  }, 120_000);

  it("fails the gate when a page shows a value no detector knows", async () => {
    // Addresses have no detector yet: on a record page, outside a table, one reaches the model.
    // A canary for that known gap: when an address detector lands, this test must change to expect no leak.
    const address: Seed = { id: "seed-address-1", kind: "address", value: "12 Rue des Lilas" };
    const all = [...seeds(["seed-name-1"]), address];
    const c = DEFAULT_BROWSER_CASES[0]!;
    const driver = new RecordingDriver(new FixtureDriver(), all, c.id);
    const pipeline = maskedPipeline({ runsDir: join(dir, "runs"), playwrightFolder: playwrightFolder! });
    await expect(pipeline({ case: c, tickets: structuredClone(c.tickets), driver, seeds: all, observe: (t) => driver.observe(t) })).rejects.toBeInstanceOf(SeededLeakError);
    expect(driver.leaks.map((l) => l.seedId)).toEqual(["seed-address-1"]);
  }, 120_000);
});
