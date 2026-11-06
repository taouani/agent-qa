import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { runHostCommand } from "../src/connectors/host.js";
import { assertGrant, configSchema, MemoryAuditSink, RunStore, WorkflowEngine } from "../src/core/index.js";
import { DataAccess, ProfileError } from "../src/data/index.js";
import { MemoryVaultStorage, Vault } from "../src/masking/index.js";
import { runTestsWorkflow, statusOf, TEST_RUN_ARTIFACT } from "../src/workflows/index.js";

// A real report from Playwright 1.49 (three tests: one passes, two fail), its folder written as /PROJECT.
const FIXTURE = readFileSync(join(import.meta.dirname, "fixtures", "playwright-report.json"), "utf8");

describe("running a part of the repo's suite (S3-2)", () => {
  let dir: string;
  const vaults = new MemoryVaultStorage();
  const key = Buffer.alloc(32, 3);
  const ran: string[][] = [];
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-suite-"));
    ran.length = 0;
    await mkdir(join(dir, "tests"), { recursive: true });
    await writeFile(join(dir, "agent-qa.profile.json"), JSON.stringify({ version: 1, folder: ".", kind: "playwright", commands: { test: ["npx", "playwright", "test"] }, reviewedAt: "2026-11-06T00:00:00.000Z" }));
    // An earlier run's report, as CI left it: from another machine's folder.
    await writeFile(join(dir, "last-run.json"), FIXTURE.replaceAll("/PROJECT", "/home/runner/work/app"));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const host: typeof runHostCommand = async (grant, options) => {
    assertGrant(grant, "commands");
    ran.push(options.argv);
    const file = options.env?.PLAYWRIGHT_JSON_OUTPUT_NAME;
    if (file) await writeFile(file, FIXTURE.replaceAll("/PROJECT", dir.replace(/\\/g, "\\\\")));
    return { exitCode: 1, timedOut: false, aborted: false, stdout: "", stderr: "", truncated: false, durationMs: 5 };
  };
  const data = (commands: "ask" | "deny" = "ask") =>
    new DataAccess({
      host,
      root: dir,
      store: new RunStore(join(dir, ".agent-qa", "runs")),
      config: configSchema.parse({ version: 1, policy: { writes: { commands, testCode: "ask" } } }),
      vault: new Vault({ storage: vaults, keys: { description: "t", getKey: async () => key } }),
      audit: new MemoryAuditSink(),
    });

  it("turns a selection into Playwright's arguments, checked before anything runs", async () => {
    const d = data();
    // Each file from the folder's own name, dots escaped: Playwright reads it as a pattern on the whole path.
    const a = basename(dir);
    expect((await d.selectTests("r", ".", { files: ["tests/a.spec.ts:12", "tests/b.spec.ts"], project: "chromium" })).args).toEqual(["--reporter=json", "--retries=0", "--workers=1", "--project=chromium", `${a}/tests/a\\.spec\\.ts:12`, `${a}/tests/b\\.spec\\.ts`]);
    expect((await d.selectTests("r", ".", { grep: "TC-ABC-1.001 login", workers: 2, repeatEach: 3 })).args).toEqual(["--reporter=json", "--retries=0", "--workers=2", "--repeat-each=3", "--grep=TC-ABC-1\\.001 login"]);
    expect((await d.selectTests("r", ".", { tag: "@smoke" })).args).toContain("--grep=@smoke");
    const refused: Array<Parameters<DataAccess["selectTests"]>[2]> = [
      {},
      { project: "chromium" },
      { grep: "a", tag: "@b" },
      { grep: "a|b" },
      { tag: "smoke" },
      { files: ["../x.spec.ts"] },
      { files: ["package.json"] },
      { files: ["tests/a.feature:3"] },
      { files: ["tests/a.spec.ts"], workers: 9 },
      { failedIn: "nope.json" },
      { failedIn: "agent-qa.profile.json" },
      { grep: "/x/" },
      { grep: "C: drive" },
      { files: Array.from({ length: 50 }, (_, i) => `tests/${"long-folder-name/".repeat(8)}case-${i}.spec.ts`) },
    ];
    for (const s of refused) await expect(d.selectTests("r", ".", s)).rejects.toBeInstanceOf(ProfileError);
    expect(ran).toEqual([]);
  });

  it("runs again an earlier report's failed tests, by file and line, with their titles masked", async () => {
    const d = data();
    const picked = await d.selectTests("r", ".", { failedIn: "last-run.json" });
    expect(picked.args.slice(3)).toEqual([`${basename(dir)}/tests/a\\.spec\\.ts:6`, `${basename(dir)}/tests/a\\.spec\\.ts:10`]);
    expect(picked.fromReport!.map((t) => t.line)).toEqual([6, 10]);
    expect(JSON.stringify(picked.fromReport)).not.toContain("jane.doe@example.com");
    const r = await d.runTests("r", "r", ".", { failedIn: "last-run.json" }, true);
    expect(ran).toEqual([["npx", "playwright", "test", "--reporter=json", "--retries=0", "--workers=1", ...picked.args.slice(3)]]);
    if (r.status !== "done") throw new Error(r.status);
    expect(r.tests.map((t) => t.outcome)).toEqual(["passed", "failed", "failed"]);
    expect(JSON.stringify(r)).not.toContain("jane.doe@example.com");
    // Without failures, nothing to run again.
    await writeFile(join(dir, "green.json"), JSON.stringify({ suites: [], stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 0 } }));
    await expect(d.selectTests("r", ".", { failedIn: "green.json" })).rejects.toThrow(/no failed or flaky test/);
    expect(await d.runTests("r", "r", ".", { tag: "@smoke" }, false)).toEqual({ status: "declined" });
  });

  it("records the run as test-run@1 after the person's own yes, and only once", async () => {
    const runs = new RunStore(join(dir, "runs"));
    const e = new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId }).register(runTestsWorkflow({ data: data(), runs }));
    const first = await e.start("run-tests", { failedIn: "last-run.json" });
    expect(first.stepId).toBe("run");
    expect(first.context).toContain("tests/a\\.spec\\.ts:6");
    expect(first.context).not.toContain("jane.doe@example.com");
    // A model's yes isn't the person's.
    await expect(e.submit(first.runId, "run", { run: true })).rejects.toMatchObject({ code: "NEEDS_PERSON" });
    expect((await e.submit(first.runId, "run", { run: true }, { byPerson: true })).next.kind).toBe("done");
    const art = (await runs.readArtifact(first.runId, TEST_RUN_ARTIFACT))!.data;
    expect(art).toMatchObject({ status: "failed", folder: ".", counts: { passed: 1, failed: 2, flaky: 0, skipped: 0 }, selection: { failedIn: "last-run.json" } });
    expect(art.command.slice(0, 3)).toEqual(["npx", "playwright", "test"]);
    expect(await readFile(join(dir, "runs", first.runId, "test-run.md"), "utf8")).toContain("# Test run: failed");
    expect(ran).toHaveLength(1);

    // A selection Playwright can't take stops at the start, before any question.
    await expect(e.start("run-tests", { files: ["../x.spec.ts"] })).rejects.toThrow();
    await expect(e.start("run-tests", { project: "chromium" })).rejects.toThrow();

    // No: nothing runs, and the record says so.
    const no = await e.start("run-tests", { tag: "@smoke" });
    await e.submit(no.runId, "run", { run: false }, { byPerson: true });
    expect((await runs.readArtifact(no.runId, TEST_RUN_ARTIFACT))!.data).toMatchObject({ status: "declined", tests: [] });
    expect(ran).toHaveLength(1);
  });

  it("keeps no title text unmasked: not in the command, the record or the step", async () => {
    const runs = new RunStore(join(dir, "runs"));
    const e = new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId }).register(runTestsWorkflow({ data: data(), runs }));
    const first = await e.start("run-tests", { grep: "jane.doe@example.com" });
    expect(first.context).toMatch(/--grep=<EMAIL_\d+>/);
    expect(JSON.stringify(await e.approval(first.runId, "run"))).not.toContain("jane");
    await e.submit(first.runId, "run", { run: true }, { byPerson: true });
    // Playwright itself got the real text.
    expect(ran.at(-1)).toContain("--grep=jane\\.doe@example\\.com");
    const art = (await runs.readArtifact(first.runId, TEST_RUN_ARTIFACT))!.data;
    expect(JSON.stringify(art)).not.toContain("jane");
    expect(await readFile(join(dir, "runs", first.runId, "test-run.md"), "utf8")).not.toContain("jane");
  });

  it("names the outcome from the tests", () => {
    expect(statusOf([], ["Error: No tests found"])).toBe("no-tests");
    expect(statusOf([], [])).toBe("no-tests");
    expect(statusOf([{ outcome: "skipped" }], [])).toBe("no-tests");
    expect(statusOf([], ["boom"])).toBe("error");
    expect(statusOf([{ outcome: "passed" }, { outcome: "flaky" }], [])).toBe("flaky");
    expect(statusOf([{ outcome: "passed" }, { outcome: "failed" }], [])).toBe("failed");
    expect(statusOf([{ outcome: "passed" }], [])).toBe("passed");
  });
});
