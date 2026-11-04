import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeRepoFile } from "../src/connectors/index.js";
import { configSchema, MemoryAuditSink, Policy, PolicyDenied, RunStore, WorkflowEngine, type WriteGrant } from "../src/core/index.js";
import { DataAccess, findProjectFolder, PROFILE_FILE, ProfileError, readPlaywrightConfig, readSavedProfile, scanFeature, scanFramework } from "../src/data/index.js";
import { MemoryVaultStorage, Vault } from "../src/masking/index.js";
import { FRAMEWORK_PROFILE_SPEC, profileWorkflow } from "../src/workflows/index.js";

/** A small playwright-bdd repo shaped like the reference one. */
const REPO: Record<string, string> = {
  "package.json": JSON.stringify({
    devDependencies: { "@playwright/test": "^1.58.0", "playwright-bdd": "^8.4.2", "@faker-js/faker": "^10.2.0" },
    scripts: { test: "npx playwright test" },
  }),
  "tsconfig.json": `{
    // comments and trailing commas, as tsc allows
    "compilerOptions": { "paths": { "@pages/*": ["src/pages/*"], "@fixtures/*": ["src/fixtures/*"], }, },
  }`,
  "playwright.config.ts": `
    import { defineConfig, devices } from '@playwright/test';
    import { defineBddConfig } from 'playwright-bdd';
    defineBddConfig({ features: './tests/features/**/*.feature', steps: ['./tests/steps/**/*.ts', './src/fixtures/fixtures.ts'] });
    export default defineConfig({
      testDir: '.features-gen',
      reporter: [['html'], ['list']],
      projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    });`,
  "src/fixtures/fixtures.ts": `
    import { test as base } from 'playwright-bdd';
    export const test = base.extend<{ pages: unknown; testData: unknown }>({
      pages: async ({ page }, use) => { await use({}); },
      async testData({}, use) { await use({}); },
    });`,
  "src/fixtures/step.ts": `export function step(name?: string) { return (t: any) => t; }`,
  "src/pages/base/base-page.ts": `
    export class BasePage {
      constructor(protected page: any) {}
      async goto(path: string) { await this.page.goto(path); }
      private secret() {}
    }`,
  "src/pages/approval-page.ts": `
    import { BasePage } from './base/base-page';
    import { step } from '../fixtures/step';
    export class ApprovalPage extends BasePage {
      @step('Approve')
      async approve() { await this.page.getByRole('button', { name: 'Approve' }).click(); }
      async reject() { await this.page.locator('lightning-button[label="Reject"]').click(); }
      async byXpath() { await this.page.locator('//div[@title="x"]').click(); }
      async label() { await this.page.getByLabel('Reason').fill('x'); }
      async more() { await this.page.getByRole('link').click(); }
    }`,
  "tests/steps/approval-steps.ts": `
    import { createBdd } from 'playwright-bdd';
    import { test } from '../../src/fixtures/fixtures';
    const { Given, When, Then: T } = createBdd(test);
    Given('I am logged in as {string}', async ({ pages }, role: string) => {});
    When(\`I approve the request\`, async ({ pages, testData }) => {});
    T(/^I should see "([^"]+)"$/, async ({ pages }, text: string) => {});
    // Not a step: a computed text can't be read without running the code.
    When(name(), async () => {});
    function name() { return 'x'; }`,
  "tests/features/approval.feature": `@P1 @approval
Feature: Approval
  @smoke
  Scenario: Approve as Jane Doe
    Given I am logged in as "Jane Doe"
  Scenario Outline: Reject <reason>
    When I approve the request
    Examples:
      | reason |
      | jane@example.com |
`,
  "config/users/users.json": `{ "secret": "do-not-read" }`,
  ".env": "SF_JWT_KEY=do-not-read",
  "src/auth/jwt.ts": `export const sign = () => 'x';`,
  "node_modules/x/index.js": "this is never read (",
  ".features-gen/approval.spec.js": "generated (",
};

async function writeRepo(root: string, files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agent-qa-profile-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("scanFramework (S2-2)", () => {
  it("reads a playwright-bdd repo without running it", async () => {
    await writeRepo(dir, REPO);
    const p = scanFramework(dir);
    expect(p).toMatchObject({
      folder: ".",
      kind: "playwright-bdd",
      packages: { playwright: "^1.58.0", playwrightBdd: "^8.4.2", faker: "^10.2.0" },
      config: {
        file: "playwright.config.ts",
        testDir: ".features-gen",
        reporters: ["html", "list"],
        projects: ["chromium"],
        bdd: { features: ["./tests/features/**/*.feature"], steps: ["./tests/steps/**/*.ts", "./src/fixtures/fixtures.ts"] },
      },
      aliases: { "@pages/*": ["src/pages/*"], "@fixtures/*": ["src/fixtures/*"] },
      commands: { generate: ["npx", "bddgen"], test: ["npx", "playwright", "test"], typecheck: ["npx", "tsc", "--noEmit"] },
      testData: { faker: true },
      truncated: false,
      unparsed: [],
    });
    expect(p.steps.map((s) => [s.keyword, s.kind, s.pattern, s.fixtures])).toEqual([
      ["Given", "expression", "I am logged in as {string}", ["pages"]],
      ["When", "expression", "I approve the request", ["pages", "testData"]],
      ["Then", "regex", '^I should see "([^"]+)"$', ["pages"]],
    ]);
    expect(p.steps[0]).toMatchObject({ file: "tests/steps/approval-steps.ts", line: 5 });
    expect(p.pages).toEqual([
      { name: "ApprovalPage", file: "src/pages/approval-page.ts", extends: "BasePage", methods: ["approve", "reject", "byXpath", "label", "more"] },
      { name: "BasePage", file: "src/pages/base/base-page.ts", methods: ["goto"] },
    ]);
    expect(p.fixtures.map((f) => f.name)).toEqual(["pages", "testData"]);
    expect(p.locators).toMatchObject({ getByRole: 2, getByLabel: 1, css: 1, xpath: 1 });
    expect(p.locatorRanking[0]).toBe("getByRole");
    // Paths only; their contents are never read.
    expect(p.authFiles).toEqual([".env", "config/users/users.json", "src/auth/jwt.ts"]);
    expect(JSON.stringify(p)).not.toContain("do-not-read");
  });

  it("keeps feature tags and counts, never scenario titles or examples", () => {
    const f = scanFeature(REPO["tests/features/approval.feature"]!, "a.feature");
    expect(f).toEqual({ file: "a.feature", scenarios: 2, tags: ["@P1", "@approval", "@smoke"] });
    expect(JSON.stringify(f)).not.toMatch(/Jane|jane/);
  });

  it("reads plain Playwright repos and empty folders", async () => {
    await writeRepo(dir, { "package.json": JSON.stringify({ devDependencies: { "@playwright/test": "1.58.0" } }), "playwright.config.js": "module.exports = { reporter: 'list' };" });
    expect(scanFramework(dir)).toMatchObject({ kind: "playwright", commands: { test: ["npx", "playwright", "test"] } });
    expect(scanFramework(dir).commands).not.toHaveProperty("generate");
    expect(scanFramework(dir).commands).not.toHaveProperty("typecheck");
    const empty = await mkdtemp(join(tmpdir(), "agent-qa-empty-"));
    try {
      const p = scanFramework(empty);
      expect(p.kind).toBe("empty");
      expect(p.commands).toBeUndefined();
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it("finds the project in a sub-folder, and asks when there are two", async () => {
    await writeRepo(dir, { "e2e/playwright.config.ts": "export default {}" });
    expect(findProjectFolder(dir)).toBe("e2e");
    await writeRepo(dir, { "tests/playwright.config.ts": "export default {}" });
    expect(() => findProjectFolder(dir)).toThrow(/more than one Playwright project \(e2e, tests\)/);
    expect(findProjectFolder(dir, "tests")).toBe("tests");
    expect(() => findProjectFolder(dir, "../x")).toThrow(/outside the project/);
  });

  it("skips links and lists files it can't parse", async () => {
    const outside = await mkdtemp(join(tmpdir(), "agent-qa-outside-"));
    try {
      await writeRepo(outside, { "steps.ts": "const { Given } = createBdd(test); Given('outside', () => {});" });
      await writeRepo(dir, { "package.json": "{}", "broken.ts": "export const = ;;; {{{" });
      await symlink(outside, join(dir, "linked"), "dir");
      const p = scanFramework(dir);
      // The linked folder isn't walked, so its step isn't seen.
      expect(p.steps).toEqual([]);
      expect(p.unparsed).toEqual(["broken.ts"]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("reads only what a config spells out", () => {
    const c = readPlaywrightConfig("export default defineConfig({ testDir: dir(), reporter: process.env.CI ? 'dot' : 'list', projects: [{ name: n }] })", "playwright.config.ts");
    expect(c).toEqual({ file: "playwright.config.ts", reporters: [], projects: [] });
  });
});

describe("agent-qa.profile.json", () => {
  const vaults = new MemoryVaultStorage();
  const key = Buffer.alloc(32, 3);
  const data = (over: { mode?: "ide" | "ci"; testCode?: "allow" | "ask" | "deny"; audit?: MemoryAuditSink } = {}) =>
    new DataAccess({
      root: dir,
      store: new RunStore(join(dir, ".agent-qa", "runs")),
      config: configSchema.parse({ version: 1, policy: { writes: { testCode: over.testCode ?? "ask" } } }),
      vault: new Vault({ storage: vaults, keys: { description: "t", getKey: async () => key } }),
      audit: over.audit ?? new MemoryAuditSink(),
      ...(over.mode ? { mode: over.mode } : {}),
    });

  it("is saved through the policy layer and read back", async () => {
    await writeRepo(dir, REPO);
    const audit = new MemoryAuditSink();
    const saved = await data({ audit }).saveProfile("run-1");
    expect(saved.status).toBe("done");
    const read = readSavedProfile(dir);
    expect(read).toMatchObject({ version: 1, folder: ".", kind: "playwright-bdd", commands: { generate: ["npx", "bddgen"], test: ["npx", "playwright", "test"], typecheck: ["npx", "tsc", "--noEmit"] } });
    expect(audit.entries.map((e) => [e.target, e.outcome])).toEqual([["testCode", "approved"], ["testCode", "done"]]);
    expect(await data().savedProfile()).toEqual(read);
  });

  it("isn't saved when the repo changed since it was shown, when there is no project, or in CI", async () => {
    await writeRepo(dir, REPO);
    await expect(data().saveProfile("run-1", undefined, { test: ["npx", "playwright", "test"] })).rejects.toThrow(/changed since the profile was shown/);
    await expect(data({ mode: "ci", testCode: "allow" }).saveProfile("run-1")).rejects.toThrow(/pull request/);
    await expect(data({ testCode: "deny" }).saveProfile("run-1")).rejects.toBeInstanceOf(PolicyDenied);
    await expect(readFile(join(dir, PROFILE_FILE))).rejects.toThrow();
    const empty = await mkdtemp(join(tmpdir(), "agent-qa-empty-"));
    try {
      const d = new DataAccess({ root: empty, store: new RunStore(join(empty, "runs")), config: configSchema.parse({ version: 1 }), audit: new MemoryAuditSink() });
      await expect(d.saveProfile("run-1")).rejects.toBeInstanceOf(ProfileError);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it("is refused when broken, and commands can't carry shell syntax", async () => {
    await writeFile(join(dir, PROFILE_FILE), JSON.stringify({ version: 1, folder: ".", kind: "playwright", commands: { test: ["npx", "playwright", "test;rm"] }, reviewedAt: "2026-11-04T00:00:00Z" }));
    expect(() => readSavedProfile(dir)).toThrow(/agent-qa.profile.json is invalid: commands.test.2/);
    await writeFile(join(dir, PROFILE_FILE), JSON.stringify({ version: 1, folder: ".", kind: "playwright", commands: { test: ["npx"] }, reviewedAt: "2026-11-04T00:00:00Z", extra: 1 }));
    expect(() => readSavedProfile(dir)).toThrow(ProfileError);
    await rm(join(dir, PROFILE_FILE));
    expect(readSavedProfile(dir)).toBeUndefined();
  });
});

describe("writeRepoFile", () => {
  async function withGrant<T>(fn: (g: WriteGrant) => Promise<T>, mode: "ide" | "ci" = "ide") {
    const policy = new Policy({ rules: { xray: "ask", confluence: "ask", testCode: "allow", jira: "deny", commands: "ask" }, mode, audit: new MemoryAuditSink() });
    return policy.guard({ target: "testCode", summary: "t" }, fn);
  }

  it("writes inside the project only, and never in pull-request mode", async () => {
    await withGrant((g) => writeRepoFile(g, dir, "a/b.json", "{}"));
    expect(await readFile(join(dir, "a/b.json"), "utf8")).toBe("{}");
    await expect(withGrant((g) => writeRepoFile(g, dir, "../x.json", "{}"))).rejects.toThrow(/outside the project/);
    await expect(withGrant((g) => writeRepoFile(g, dir, "a/b.json", "{}"), "ci")).rejects.toThrow(/pull request/);
    await expect(writeRepoFile(undefined as unknown as WriteGrant, dir, "c.json", "{}")).rejects.toBeInstanceOf(PolicyDenied);
    const outside = await mkdtemp(join(tmpdir(), "agent-qa-outside-"));
    try {
      await symlink(outside, join(dir, "linked"), "dir");
      await expect(withGrant((g) => writeRepoFile(g, dir, "linked/x.json", "{}"))).rejects.toThrow(/links outside/);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe("profile workflow", () => {
  it("shows the scan, saves agent-qa.profile.json only on the person's yes, and keeps framework-profile@1", async () => {
    await writeRepo(dir, REPO);
    const runs = new RunStore(join(dir, ".agent-qa", "runs"));
    const data = new DataAccess({
      root: dir,
      store: runs,
      config: configSchema.parse({ version: 1 }),
      vault: new Vault({ storage: new MemoryVaultStorage(), keys: { description: "t", getKey: async () => Buffer.alloc(32, 5) } }),
      audit: new MemoryAuditSink(),
    });
    const engine = new WorkflowEngine({ store: runs.stateStore({ host: "other", driver: "host-model" }), newRunId: runs.newRunId }).register(profileWorkflow({ data, runs }));

    const declined = await engine.start("profile", {});
    expect(declined).toMatchObject({ stepId: "review", kind: "confirm" });
    expect(declined.context).toContain("npx bddgen");
    expect(declined.context).toContain("Steps: 3 (1 Given, 1 When, 1 Then)");
    expect(declined.context).not.toContain("do-not-read");
    expect((await engine.approval(declined.runId, "review"))?.question).toBe(
      "Save agent-qa.profile.json for playwright-bdd in .? Agent-QA may then run only: npx bddgen; npx playwright test; npx tsc --noEmit.",
    );
    expect((await engine.submit(declined.runId, "review", { approve: false })).next.kind).toBe("done");
    expect(readSavedProfile(dir)).toBeUndefined();
    const art = await runs.readArtifact(declined.runId, FRAMEWORK_PROFILE_SPEC);
    expect(art?.data.steps).toHaveLength(3);

    const accepted = await engine.start("profile", {});
    expect((await engine.submit(accepted.runId, "review", { approve: true })).next.kind).toBe("done");
    expect(readSavedProfile(dir)?.kind).toBe("playwright-bdd");
  });
});

describe("agent-qa profile", () => {
  it("prints the scan and whether the saved profile matches", async () => {
    const { profileCommand } = await import("../src/cli/index.js");
    await writeRepo(dir, REPO);
    let out = "";
    const err: string[] = [];
    expect(profileCommand({ root: dir, json: false }, (s) => (out += s), (s) => err.push(s))).toBe(1);
    expect(out).toContain("agent-qa.profile.json: not saved yet");
    expect(out).toContain("agent-qa run profile --accept review");
    await writeFile(join(dir, PROFILE_FILE), JSON.stringify({ version: 1, folder: ".", kind: "playwright-bdd", commands: { generate: ["npx", "bddgen"], test: ["npx", "playwright", "test"], typecheck: ["npx", "tsc", "--noEmit"] }, reviewedAt: "2026-11-04T00:00:00.000Z" }));
    out = "";
    expect(profileCommand({ root: dir, json: true }, (s) => (out += s), (s) => err.push(s))).toBe(0);
    expect(JSON.parse(out)).toMatchObject({ matches: true, saved: { kind: "playwright-bdd" }, profile: { kind: "playwright-bdd" } });
    expect(profileCommand({ root: dir, folder: "../x", json: false }, () => {}, (s) => err.push(s))).toBe(2);
    expect(err.join("")).toMatch(/outside the project/);
  });
});

describe("agent-qa run profile", () => {
  it("needs no models section, saves on --accept review, and --yes saves nothing", async () => {
    const { runCommand, EXIT } = await import("../src/cli/run.js");
    await writeRepo(dir, REPO);
    await writeFile(join(dir, "agent-qa.yaml"), "version: 1\n");
    const lines: string[] = [];
    const vault = new Vault({ storage: new MemoryVaultStorage(), keys: { description: "t", getKey: async () => Buffer.alloc(32, 9) } });
    const base = { root: dir, env: {}, log: (l: string) => lines.push(l), ask: false as const, data: (b: ConstructorParameters<typeof DataAccess>[0]) => new DataAccess({ ...b, vault }) };
    expect(await runCommand({ ...base, workflow: "profile", yes: true })).toBe(EXIT.done);
    expect(lines.join("\n")).toContain("declined (--yes never accepts this step; use --accept review)");
    expect(readSavedProfile(dir)).toBeUndefined();
    expect(await runCommand({ ...base, workflow: "profile", accept: ["review"] })).toBe(EXIT.done);
    expect(readSavedProfile(dir)?.kind).toBe("playwright-bdd");
    // A workflow that asks a model still needs one.
    expect(await runCommand({ ...base, workflow: "requirements", key: "ABC-1" })).toBe(EXIT.setup);
    expect(lines.at(-1)).toMatch(/no models section/);
  });
});
