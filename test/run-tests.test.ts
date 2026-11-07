import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { runHostCommand } from "../src/connectors/host.js";
import { assertGrant, configSchema, MemoryAuditSink, RunStore } from "../src/core/index.js";
import { DataAccess, parsePlaywrightReport, ProfileError, TEST_RUN_TIMEOUT_MS } from "../src/data/index.js";
import { statusOf } from "../src/workflows/index.js";
import { fileFilter } from "../src/data/access.js";
import { MemoryVaultStorage, Vault } from "../src/masking/index.js";

// A real report from Playwright 1.49 (three tests: one passes, two fail), its folder written as /PROJECT.
const FIXTURE = readFileSync(join(import.meta.dirname, "fixtures", "playwright-report.json"), "utf8");
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

describe("Playwright's JSON report", () => {
  it("gives one row per test, with the first failure, its code and where, from the folder", () => {
    const r = parsePlaywrightReport(JSON.parse(FIXTURE.replaceAll("/PROJECT", "/repo")), "/repo");
    expect(r.errors).toEqual([]);
    expect(r.tests.map((t) => [t.title, t.file, t.line, t.outcome])).toEqual([
      ["TC-ABC-1-001 passes", "tests/a.spec.ts", 2, "passed"],
      ["TC-ABC-1-002 missing button for jane.doe@example.com", "tests/a.spec.ts", 6, "failed"],
      ["TC-ABC-1-003 wrong text", "tests/a.spec.ts", 10, "failed"],
    ]);
    const click = r.tests[1]!.failure!;
    expect(click.message).toContain("locator.click: Timeout 500ms exceeded.");
    expect(click.message).not.toMatch(/\u001b/);
    expect(click.at).toEqual({ file: "tests/a.spec.ts", line: 8 });
    expect(click.snippet).toContain(">  8 |");
    expect(r.tests[2]!.failure!.message).toContain('Received string: "Hello"');
    // Each test's start and duration, for the Xray test run's dates.
    expect(r.tests.map((t) => [t.startedAt, t.durationMs])).toEqual([
      ["2026-11-05T05:43:43.097Z", 654],
      ["2026-11-05T05:43:44.669Z", 650],
      ["2026-11-05T05:43:45.958Z", 1183],
    ]);
  });

  it("keeps Playwright's screenshot only from a project's output folder, a passed test's too", () => {
    const shot = (path: string) => ({ name: "screenshot", contentType: "image/png", path });
    const t = (title: string, path: string) => ({ title, file: "a.spec.ts", line: 1, tests: [{ status: "unexpected", results: [{ status: "failed", error: { message: "boom" }, attachments: [shot(path)] }] }] });
    const json = {
      config: { rootDir: "/repo", projects: [{ outputDir: "/repo/test-results" }] },
      suites: [
        {
          title: "a.spec.ts",
          file: "a.spec.ts",
          specs: [
            t("in", "/repo/test-results/a-in/test-failed-1.png"),
            t("out", "/home/me/.ssh/key.png"),
            t("not an image", "/repo/test-results/a/trace.zip"),
            // screenshot: 'on': a passed test has one too.
            { title: "passed", file: "a.spec.ts", line: 2, tests: [{ status: "expected", results: [{ status: "passed", attachments: [shot("/repo/test-results/a-passed/test-finished-1.png")] }] }] },
            // Failed, then passed on a retry: the failure's.
            { title: "flaky", file: "a.spec.ts", line: 3, tests: [{ status: "flaky", results: [{ status: "failed", error: { message: "boom" }, attachments: [shot("/repo/test-results/a-flaky/test-failed-1.png")] }, { status: "passed", attachments: [shot("/repo/test-results/a-flaky-retry1/test-finished-1.png")] }] }] },
          ],
        },
      ],
      stats: { expected: 1, unexpected: 3, flaky: 1, skipped: 0 },
    };
    const at = (p: string) => ({ outputDir: "/repo/test-results", path: `/repo/test-results/${p}` });
    expect(parsePlaywrightReport(json, "/repo").tests.map((x) => x.screenshot)).toEqual([at("a-in/test-failed-1.png"), undefined, undefined, at("a-passed/test-finished-1.png"), at("a-flaky/test-failed-1.png")]);
  });

  it("spans repeated runs from the first start to the last end", () => {
    const run = (startTime: string, duration: number) => ({ status: "expected", results: [{ status: "passed", startTime, duration }] });
    const json = { suites: [{ title: "a.spec.ts", file: "a.spec.ts", specs: [{ title: "t", file: "a.spec.ts", line: 1, tests: [run("2026-11-05T10:00:05.000Z", 1000), run("2026-11-05T10:00:00.000Z", 2000)] }] }], stats: { expected: 2, unexpected: 0, flaky: 0, skipped: 0 } };
    expect(parsePlaywrightReport(json, "/repo").tests[0]).toMatchObject({ startedAt: "2026-11-05T10:00:00.000Z", durationMs: 6000 });
  });

  it("counts repeated runs of a test once, flaky when only some failed", () => {
    const run = (status: string) => ({ status, results: [{ status: status === "expected" ? "passed" : "failed", error: { message: "boom" } }] });
    const json = { suites: [{ title: "a.spec.ts", file: "a.spec.ts", specs: [{ title: "t", file: "a.spec.ts", line: 1, tests: [run("expected"), run("unexpected"), run("expected")] }] }], stats: { expected: 2, unexpected: 1, flaky: 0, skipped: 0 } };
    expect(parsePlaywrightReport(json, "/repo").tests).toEqual([expect.objectContaining({ title: "t", outcome: "flaky", runs: 3, failedRuns: 1, failure: expect.objectContaining({ message: "boom" }) })]);
    expect(() => parsePlaywrightReport({ nope: 1 }, "/repo")).toThrow(/unexpected shape/);
  });
});

describe("DataAccess: running and fixing generated tests", () => {
  let dir: string;
  const vaults = new MemoryVaultStorage();
  const key = Buffer.alloc(32, 9);
  const ran: Array<{ argv: string[]; report?: string | undefined }> = [];
  let reply: (argv: string[], reportFile: string | undefined) => Promise<{ exitCode: number; stdout?: string; stderr?: string }>;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-runtests-"));
    ran.length = 0;
    reply = async (_argv, file) => {
      if (file) await writeFile(file, FIXTURE.replaceAll("/PROJECT", dir.replace(/\\/g, "\\\\")));
      return { exitCode: 1 };
    };
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const profile = (kind: "playwright" | "playwright-bdd") =>
    writeFile(join(dir, "agent-qa.profile.json"), JSON.stringify({ version: 1, folder: ".", kind, commands: { ...(kind === "playwright-bdd" ? { generate: ["npx", "bddgen"] } : {}), test: ["npx", "playwright", "test"] }, reviewedAt: "2026-11-05T00:00:00.000Z" }));
  const host: typeof runHostCommand = async (grant, options) => {
    assertGrant(grant, "commands");
    const file = options.env?.PLAYWRIGHT_JSON_OUTPUT_NAME;
    ran.push({ argv: options.argv, report: file });
    const r = await reply(options.argv, file);
    return { exitCode: r.exitCode, timedOut: false, aborted: false, stdout: r.stdout ?? "", stderr: r.stderr ?? "", truncated: false, durationMs: 5 };
  };
  const data = (over: { mode?: "ci"; commands?: "allow" | "deny"; audit?: MemoryAuditSink } = {}) =>
    new DataAccess({
      host,
      root: dir,
      store: new RunStore(join(dir, ".agent-qa", "runs")),
      config: configSchema.parse({ version: 1, policy: { writes: { commands: over.commands ?? "ask", testCode: "ask" } } }),
      vault: new Vault({ storage: vaults, keys: { description: "t", getKey: async () => key } }),
      audit: over.audit ?? new MemoryAuditSink(),
      ...(over.mode ? { mode: over.mode } : {}),
    });

  it("runs only the generated specs, with the JSON reporter, no retries and one worker, and masks what comes back", async () => {
    await profile("playwright");
    const d = data();
    expect(await d.testRunReadiness("run-1")).toEqual({ ready: true });
    const r = await d.runGeneratedTests("run-1", "run-1", ".", { files: ["tests/a.spec.ts"] }, true);
    expect(ran.map((x) => x.argv)).toEqual([["npx", "playwright", "test", "--reporter=json", "--retries=0", "--workers=1", fileFilter("tests/a.spec.ts", false, basename(dir)), `--global-timeout=${TEST_RUN_TIMEOUT_MS}`]]);
    // The report went to a temporary file, removed after.
    expect(ran[0]!.report).toBeDefined();
    expect(existsSync(ran[0]!.report!)).toBe(false);
    expect(r.status).toBe("done");
    if (r.status !== "done") return;
    expect(r.tests.map((t) => t.outcome)).toEqual(["passed", "failed", "failed"]);
    expect(r.tests[1]!.title).toMatch(/^TC-ABC-1-002 missing button for <EMAIL_\d+>$/);
    expect(JSON.stringify(r)).not.toContain(dir);
    expect(JSON.stringify(r)).not.toContain("jane.doe");
    // Stability runs repeat each test.
    await d.runGeneratedTests("run-1", "run-1", ".", { files: ["tests/a.spec.ts"], repeatEach: 3 }, true);
    expect(ran[1]!.argv).toContain("--repeat-each=3");
    expect(await d.runGeneratedTests("run-1", "run-1", ".", { files: ["tests/a.spec.ts"] }, false)).toEqual({ status: "declined" });
    await expect(d.runGeneratedTests("run-1", "run-1", "e2e", { files: ["tests/a.spec.ts"] }, true)).rejects.toThrow(/profile changed/);
    await expect(d.runGeneratedTests("run-1", "run-1", ".", { files: ["package.json"] }, true)).rejects.toBeInstanceOf(ProfileError);
    expect(await data({ commands: "deny" }).testRunReadiness("run-1")).toMatchObject({ ready: false, reason: expect.stringContaining("policy") });
  });

  it("generates playwright-bdd's specs first, runs them by feature, and stops when that fails", async () => {
    await profile("playwright-bdd");
    const d = data();
    const write = reply;
    reply = async (argv, file) => (argv.includes("bddgen") ? { exitCode: 0 } : write(argv, file));
    await d.runGeneratedTests("run-2", "run-2", ".", { files: ["tests/features/ABC-1.feature"] }, true);
    expect(ran.map((x) => x.argv)).toEqual([["npx", "bddgen"], ["npx", "playwright", "test", "--reporter=json", "--retries=0", "--workers=1", fileFilter("tests/features/ABC-1.feature", true, ""), `--global-timeout=${TEST_RUN_TIMEOUT_MS}`]]);
    ran.length = 0;
    reply = async () => ({ exitCode: 1, stderr: `Missing step definitions: When I pay jane.doe@example.com in ${dir}/tests/features/ABC-1.feature` });
    const r = await d.runGeneratedTests("run-2", "run-2", ".", { files: ["tests/features/ABC-1.feature"] }, true);
    expect(ran).toHaveLength(1);
    expect(r).toMatchObject({ status: "done", tests: [], errors: [expect.stringMatching(/^npx bddgen failed: Missing step definitions: When I pay <EMAIL_\d+> in \.\/tests\/features\/ABC-1\.feature$/)] });
    // No report: what the command said, masked.
    reply = async (argv) => ({ exitCode: argv.includes("bddgen") ? 0 : 1, stderr: "Error: No tests found" });
    expect(await d.runGeneratedTests("run-2", "run-2", ".", { files: ["tests/features/ABC-1.feature"] }, true)).toMatchObject({ status: "done", errors: ["no test report came back: Error: No tests found"] });
  });

  it("masks a page snapshot as the explorer does, reads only Playwright's own, and masks before it cuts", async () => {
    await profile("playwright");
    await mkdir(join(dir, "test-results", "a-t"), { recursive: true });
    await writeFile(join(dir, ".env"), "SF_PASSWORD=hunter2\n");
    const aria = ['- table:', '  - row "Name Account":', '    - cell "Initech Partners"', '- textbox "Reference": ACME-77821-ZX', '- paragraph: Contact anna.kowalska@example.com'].join("\n");
    await writeFile(join(dir, "test-results", "a-t", "error-context.md"), aria);
    const long = `${"x".repeat(3990)} anna.kowalska@example.com`;
    const report = (attachment: object) =>
      JSON.stringify({
        config: { rootDir: dir, projects: [{ outputDir: join(dir, "test-results") }] },
        suites: [{ title: "a.spec.ts", file: "a.spec.ts", specs: [{ title: "TC-1 t", file: "a.spec.ts", line: 1, tests: [{ status: "unexpected", results: [{ status: "failed", error: { message: long }, attachments: [attachment] }] }] }] }],
        stats: { expected: 0, unexpected: 1, flaky: 0, skipped: 0 },
      });
    let attach: object = { name: "error-context", contentType: "text/markdown", path: join(dir, "test-results", "a-t", "error-context.md") };
    reply = async (_argv, file) => {
      await writeFile(file!, report(attach));
      return { exitCode: 1 };
    };
    const r = await data().runGeneratedTests("run-4", "run-4", ".", { files: ["a.spec.ts"] }, true);
    if (r.status !== "done") throw new Error(r.status);
    const f = r.tests[0]!.failure!;
    expect(f.snapshot).toBeDefined();
    for (const v of ["Initech Partners", "ACME-77821-ZX", "anna.kowalska"]) expect(f.snapshot).not.toContain(v);
    expect(f.message).not.toContain("anna.kowalska@examp");
    expect(f.message.length).toBeLessThanOrEqual(4000);
    // An attachment the test made, naming any other file, is never read.
    for (const other of [{ name: "error-context", contentType: "text/plain", path: join(dir, ".env") }, { name: "error-context", contentType: "text/markdown", path: join(dir, "error-context.md") }]) {
      attach = other;
      await writeFile(join(dir, "error-context.md"), "SF_PASSWORD=hunter2");
      const again = await data().runGeneratedTests("run-4", "run-4", ".", { files: ["a.spec.ts"] }, true);
      expect(JSON.stringify(again)).not.toContain("hunter2");
    }
  });

  it("changes only files that still hold what Agent-QA wrote, all or none", async () => {
    await profile("playwright");
    await mkdir(join(dir, "tests"), { recursive: true });
    await writeFile(join(dir, "tests/a.spec.ts"), "a1\n");
    await writeFile(join(dir, "tests/b.spec.ts"), "theirs\n");
    const audit = new MemoryAuditSink();
    const d = data({ audit });
    expect(await d.replaceGeneratedFiles("run-3", "run-3", ".", [{ path: "tests/a.spec.ts", content: "a2\n", sha256: sha("a1\n") }], true)).toEqual({ status: "done", written: ["tests/a.spec.ts"] });
    expect(await readFile(join(dir, "tests/a.spec.ts"), "utf8")).toBe("a2\n");
    expect(audit.entries.map((e) => [e.target, e.outcome])).toEqual([["testCode", "approved"], ["testCode", "done"]]);
    // Run again with the same change: nothing to do.
    expect(await d.replaceGeneratedFiles("run-3", "run-3", ".", [{ path: "tests/a.spec.ts", content: "a2\n", sha256: sha("a1\n") }], true)).toMatchObject({ status: "done" });
    // b changed since Agent-QA wrote it: refused, and a gets its bytes back.
    const both = [{ path: "tests/a.spec.ts", content: "a3\n", sha256: sha("a2\n") }, { path: "tests/b.spec.ts", content: "b2\n", sha256: sha("b1\n") }];
    await expect(d.replaceGeneratedFiles("run-3", "run-3", ".", both, true)).rejects.toThrow(/tests\/b\.spec\.ts changed since Agent-QA wrote it[^]*Nothing was changed/);
    expect(await readFile(join(dir, "tests/a.spec.ts"), "utf8")).toBe("a2\n");
    expect(await readFile(join(dir, "tests/b.spec.ts"), "utf8")).toBe("theirs\n");
    await expect(d.replaceGeneratedFiles("run-3", "run-3", ".", [{ path: "tests/a.spec.ts", content: "<PERSON_1>", sha256: sha("a2\n") }], true)).rejects.toThrow(/masking token/);
    expect(await d.replaceGeneratedFiles("run-3", "run-3", ".", both, false)).toEqual({ status: "declined" });
    // In CI the fix goes into the job's own checkout.
    expect(await data({ mode: "ci" }).replaceGeneratedFiles("run-3", "run-3", ".", [both[0]!], true)).toEqual({ status: "done", written: ["tests/a.spec.ts"], pullRequest: true });
    expect(await readFile(join(dir, "tests/a.spec.ts"), "utf8")).toBe("a3\n");
  });
});

// The real thing, where a Chromium is installed (this sandbox): the repo's own npx playwright, its JSON report through the env var.
const CHROMIUM = "/opt/pw-browsers/chromium";
describe.skipIf(!existsSync(CHROMIUM) || process.platform === "win32")("running generated tests with real Playwright", () => {
  it("reads the report of a real run, the failing test's error included", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-qa-realrun-"));
    try {
      const { symlink } = await import("node:fs/promises");
      await symlink(join(import.meta.dirname, "..", "node_modules"), join(dir, "node_modules"), "dir");
      await mkdir(join(dir, "tests"));
      await writeFile(join(dir, "playwright.config.ts"), `import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: 'tests', timeout: 5000, use: { launchOptions: { executablePath: '${CHROMIUM}' } } });\n`);
      await writeFile(
        join(dir, "tests", "gen.spec.ts"),
        "import { test, expect } from '@playwright/test';\ntest('TC-X-1-001 ok', async ({ page }) => { await page.setContent('<button>Save</button>'); await expect(page.getByRole('button', { name: 'Save' })).toBeVisible(); });\ntest('TC-X-1-002 bad', async ({ page }) => { await page.setContent('<button>Save</button>'); await page.getByRole('button', { name: 'Submit' }).click({ timeout: 300 }); });\n",
      );
      await writeFile(join(dir, "tests", "other.spec.ts"), "import { test } from '@playwright/test';\ntest('not mine', { tag: '@smoke' }, async () => {});\n");
      await writeFile(join(dir, "agent-qa.profile.json"), JSON.stringify({ version: 1, folder: ".", kind: "playwright", commands: { test: ["npx", "playwright", "test"] }, reviewedAt: "2026-11-05T00:00:00.000Z" }));
      const d = new DataAccess({ root: dir, store: new RunStore(join(dir, ".agent-qa", "runs")), config: configSchema.parse({ version: 1, policy: { writes: { commands: "allow" } } }), vault: new Vault({ storage: new MemoryVaultStorage(), keys: { description: "t", getKey: async () => Buffer.alloc(32, 3) } }), audit: new MemoryAuditSink() });
      const r = await d.runGeneratedTests("run-r", "run-r", ".", { files: ["tests/gen.spec.ts"] }, true);
      expect(r.status).toBe("done");
      if (r.status !== "done") return;
      expect(r.errors).toEqual([]);
      expect(r.tests.map((t) => [t.title, t.outcome])).toEqual([["TC-X-1-001 ok", "passed"], ["TC-X-1-002 bad", "failed"]]);
      expect(r.tests[1]!.failure).toMatchObject({ message: expect.stringContaining("getByRole('button', { name: 'Submit' })"), at: { file: "tests/gen.spec.ts", line: 3 } });

      // S3-2: a part of the suite, as Playwright itself takes it. A report of the whole suite first, as CI leaves one.
      const { execFileSync } = await import("node:child_process");
      try {
        execFileSync("npx", ["playwright", "test", "--reporter=json"], { cwd: dir, env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: join(dir, "last.json") }, stdio: "ignore" });
      } catch {
        // A failing test: exit code 1.
      }
      const titles = async (selection: Parameters<DataAccess["runTests"]>[3]) => {
        const x = await d.runTests("run-r", "run-r", ".", selection, true);
        if (x.status !== "done") throw new Error(x.status);
        return x.tests.map((t) => t.title);
      };
      expect(await titles({ failedIn: "last.json" })).toEqual(["TC-X-1-002 bad"]);
      expect(await titles({ grep: "TC-X-1-001 ok" })).toEqual(["TC-X-1-001 ok"]);
      expect(await titles({ tag: "@smoke" })).toEqual(["not mine"]);
      expect(await titles({ files: ["tests/gen.spec.ts:3"] })).toEqual(["TC-X-1-002 bad"]);
      // A file whose path ends like the chosen one's is not picked, nor a test of the same line there.
      await mkdir(join(dir, "tests", "more", "tests"), { recursive: true });
      await writeFile(join(dir, "tests", "more", "tests", "gen.spec.ts"), "import { test } from '@playwright/test';\ntest('elsewhere', async () => {});\ntest('elsewhere 3', async () => {});\n");
      await writeFile(join(dir, "tests", "admin-gen.spec.ts"), "import { test } from '@playwright/test';\ntest('admin', async () => {});\ntest('admin 3', async () => {});\n");
      expect(await titles({ files: ["tests/gen.spec.ts:3"] })).toEqual(["TC-X-1-002 bad"]);
      expect(await titles({ failedIn: "last.json" })).toEqual(["TC-X-1-002 bad"]);
      const none = await d.runTests("run-r", "run-r", ".", { grep: "zzz nothing" }, true);
      if (none.status !== "done") throw new Error(none.status);
      expect(statusOf(none.tests, none.errors)).toBe("no-tests");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
