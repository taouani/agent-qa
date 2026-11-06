import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configSchema, MemoryAuditSink, RunStore, unifiedDiff } from "../src/core/index.js";
import { DataAccess, gitBlobId, ProfileError } from "../src/data/index.js";
import { MemoryVaultStorage, Vault } from "../src/masking/index.js";

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const SPEC = "import { test } from '@playwright/test';\n\ntest('login', async ({ page }) => {\n  await page.fill('#user', 'jane.doe@example.com');\n  await page.click('#go');\n});\n";

describe("DataAccess: changing existing test files (S3-1)", () => {
  let dir: string;
  const vaults = new MemoryVaultStorage();
  const key = Buffer.alloc(32, 5);
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-testfiles-"));
    await mkdir(join(dir, "e2e", "tests"), { recursive: true });
    await writeFile(join(dir, "agent-qa.profile.json"), JSON.stringify({ version: 1, folder: "e2e", kind: "playwright", commands: { test: ["npx", "playwright", "test"] }, reviewedAt: "2026-11-06T00:00:00.000Z" }));
    await writeFile(join(dir, "e2e", "tests", "login.spec.ts"), SPEC);
    await writeFile(join(dir, "e2e", "tests", "other.spec.ts"), "test('other')\n");
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const data = (over: { mode?: "ci"; testCode?: "ask" | "deny"; audit?: MemoryAuditSink } = {}) =>
    new DataAccess({
      root: dir,
      store: new RunStore(join(dir, ".agent-qa", "runs")),
      config: configSchema.parse({ version: 1, policy: { writes: { testCode: over.testCode ?? "ask" } } }),
      vault: new Vault({ storage: vaults, keys: { description: "t", getKey: async () => key } }),
      audit: over.audit ?? new MemoryAuditSink(),
      ...(over.mode ? { mode: over.mode } : {}),
    });

  it("reads files masked, with the sha256 and git blob id of their real bytes", async () => {
    const [f] = await data().readTestFiles("run-1", "run-1", "e2e", ["tests/login.spec.ts"]);
    expect(f!.content).not.toContain("jane.doe@example.com");
    expect(f!.content).toMatch(/<EMAIL_\d+>/);
    expect(f!.sha256).toBe(sha(SPEC));
    expect(f!.gitBlob).toBe(gitBlobId(Buffer.from(SPEC)));
    // git's own id for the same bytes.
    expect(gitBlobId(Buffer.from("hello\n"))).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
    expect(execFileSync("git", ["hash-object", "--stdin"], { input: SPEC }).toString().trim()).toBe(f!.gitBlob);
  });

  it("writes the reviewed edit with its real values back, only while the file holds what was read", async () => {
    const d = data();
    const [f] = await d.readTestFiles("run-1", "run-1", "e2e", ["tests/login.spec.ts"]);
    const edited = f!.content.replace("page.click('#go')", "page.getByRole('button', { name: 'Go' }).click()");
    expect(unifiedDiff("tests/login.spec.ts", f!.content, edited)).toContain("+  await page.getByRole('button', { name: 'Go' }).click();");
    expect(await d.editTestFiles("run-1", "run-1", "e2e", [{ path: "tests/login.spec.ts", content: edited, sha256: f!.sha256 }], false)).toEqual({ status: "declined" });
    const r = await d.editTestFiles("run-1", "run-1", "e2e", [{ path: "tests/login.spec.ts", content: edited, sha256: f!.sha256 }], true);
    const now = await readFile(join(dir, "e2e", "tests", "login.spec.ts"), "utf8");
    expect(now).toBe(SPEC.replace("page.click('#go')", "page.getByRole('button', { name: 'Go' }).click()"));
    expect(now).toContain("jane.doe@example.com");
    expect(r).toEqual({ status: "done", written: [{ path: "tests/login.spec.ts", sha256: sha(now) }] });
    // The same yes again (a retry after a stop): the file already holds it.
    expect(await d.editTestFiles("run-1", "run-1", "e2e", [{ path: "tests/login.spec.ts", content: edited, sha256: f!.sha256 }], true)).toMatchObject({ status: "done" });

    // Changed since it was read: never overwritten.
    await writeFile(join(dir, "e2e", "tests", "login.spec.ts"), `${now}// mine\n`);
    await expect(d.editTestFiles("run-1", "run-1", "e2e", [{ path: "tests/login.spec.ts", content: f!.content, sha256: f!.sha256 }], true)).rejects.toThrow(/changed since Agent-QA read it[^]*Nothing was changed/);
    expect(await readFile(join(dir, "e2e", "tests", "login.spec.ts"), "utf8")).toBe(`${now}// mine\n`);
  });

  it("changes all files or none, and keeps a file's mode", async () => {
    const d = data();
    await chmod(join(dir, "e2e", "tests", "login.spec.ts"), 0o755);
    const [a, b] = await d.readTestFiles("run-1", "run-1", "e2e", ["tests/login.spec.ts", "tests/other.spec.ts"]);
    await writeFile(join(dir, "e2e", "tests", "other.spec.ts"), "test('changed meanwhile')\n");
    const edits = [
      { path: "tests/login.spec.ts", content: `${a!.content}// a\n`, sha256: a!.sha256 },
      { path: "tests/other.spec.ts", content: "test('b')\n", sha256: b!.sha256 },
    ];
    await expect(d.editTestFiles("run-1", "run-1", "e2e", edits, true)).rejects.toThrow(/other\.spec\.ts changed since Agent-QA read it/);
    expect(await readFile(join(dir, "e2e", "tests", "login.spec.ts"), "utf8")).toBe(SPEC);
    await d.editTestFiles("run-1", "run-1", "e2e", [edits[0]!], true);
    if (process.platform !== "win32") expect((await stat(join(dir, "e2e", "tests", "login.spec.ts"))).mode & 0o777).toBe(0o755);
  });

  it("never touches configs, .env, package.json, the profile or a non-test file, and refuses unknown tokens", async () => {
    const d = data();
    for (const p of ["playwright.config.ts", "package.json", ".env", "tsconfig.json", "agent-qa.profile.json", ".github/x.ts", "README.md", "../x.spec.ts", "tests/<EMAIL_1>.ts"]) {
      await expect(d.readTestFiles("run-1", "run-1", "e2e", [p])).rejects.toBeInstanceOf(ProfileError);
      await expect(d.editTestFiles("run-1", "run-1", "e2e", [{ path: p, content: "x", sha256: sha("x") }], true)).rejects.toBeInstanceOf(ProfileError);
    }
    await expect(d.readTestFiles("run-1", "run-1", "e2e", ["tests/login.spec.ts", "tests/LOGIN.spec.ts"])).rejects.toThrow(/listed twice/);
    await expect(d.readTestFiles("run-1", "run-1", "other", ["tests/login.spec.ts"])).rejects.toThrow(/profile changed/);
    await expect(d.readTestFiles("run-1", "run-1", "e2e", ["tests/none.spec.ts"])).rejects.toThrow(/isn't a plain file/);
    const [f] = await d.readTestFiles("run-1", "run-1", "e2e", ["tests/login.spec.ts"]);
    await expect(d.editTestFiles("run-1", "run-1", "e2e", [{ path: "tests/login.spec.ts", content: `${f!.content}// <PERSON_9>\n`, sha256: f!.sha256 }], true)).rejects.toThrow(/no value for[^]*PERSON_9/);
    expect(await readFile(join(dir, "e2e", "tests", "login.spec.ts"), "utf8")).toBe(SPEC);
  });

  it("reads no link out of the folder, no binary and nothing that wouldn't come back exactly", async () => {
    const d = data();
    await writeFile(join(dir, "secret.ts"), "x");
    await symlink(join(dir, "secret.ts"), join(dir, "e2e", "tests", "linked.spec.ts"));
    await expect(d.readTestFiles("run-1", "run-1", "e2e", ["tests/linked.spec.ts"])).rejects.toThrow(/isn't a plain file/);
    await writeFile(join(dir, "e2e", "tests", "bin.json"), Buffer.from([0xff, 0xfe, 0x00]));
    await expect(d.readTestFiles("run-1", "run-1", "e2e", ["tests/bin.json"])).rejects.toThrow(/isn't UTF-8 text/);
    // Text that looks like a token the vault knows would come back as that token's value.
    const [f] = await d.readTestFiles("run-1", "run-1", "e2e", ["tests/login.spec.ts"]);
    const token = /<EMAIL_\d+>/.exec(f!.content)![0];
    await writeFile(join(dir, "e2e", "tests", "tok.spec.ts"), `// ${token}\n`);
    await expect(d.readTestFiles("run-1", "run-1", "e2e", ["tests/tok.spec.ts"])).rejects.toThrow(/can't be masked and put back exactly/);
    await writeFile(join(dir, "e2e", "tests", "big.spec.ts"), "x".repeat(200_001));
    await expect(d.readTestFiles("run-1", "run-1", "e2e", ["tests/big.spec.ts"])).rejects.toThrow(/too large/);
  });

  it("goes through the policy: denied writes nothing, and CI's checkout change leaves as a pull request", async () => {
    const [f] = await data().readTestFiles("run-1", "run-1", "e2e", ["tests/other.spec.ts"]);
    const edit = [{ path: "tests/other.spec.ts", content: "test('b')\n", sha256: f!.sha256 }];
    await expect(data({ testCode: "deny" }).editTestFiles("run-1", "run-1", "e2e", edit, true)).rejects.toThrow();
    expect(await readFile(join(dir, "e2e", "tests", "other.spec.ts"), "utf8")).toBe("test('other')\n");
    const audit = new MemoryAuditSink();
    expect(await data({ mode: "ci", audit }).editTestFiles("run-1", "run-1", "e2e", edit, true)).toEqual({ status: "done", written: [{ path: "tests/other.spec.ts", sha256: sha("test('b')\n") }], pullRequest: true });
    expect(JSON.stringify(audit.entries)).toContain("Change 1 existing test file(s) in e2e");
  });
});
