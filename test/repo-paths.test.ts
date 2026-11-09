import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { runHostCommand } from "../src/connectors/host.js";
import { assertGrant, configSchema, MemoryAuditSink, RunStore } from "../src/core/index.js";
import { DataAccess } from "../src/data/index.js";
import { repoPaths } from "../src/data/repo-paths.js";
import { MemoryVaultStorage, Vault } from "../src/masking/index.js";

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const FIXTURE = readFileSync(join(import.meta.dirname, "fixtures", "playwright-report.json"), "utf8");
const NAMED = "tests/users/marie-curie.spec.ts";
const EMAIL = "tests/jane.doe@example.com.spec.ts";

describe("repo paths are masked like any other text the model sees (S5-4)", () => {
  it("masks each part alone, keeps the suffix, and finds the real file again in any run", async () => {
    const folder = await mkdtemp(join(tmpdir(), "agent-qa-paths-unit-"));
    try {
      for (const f of ["tests/login.spec.ts", EMAIL, NAMED, "marie/curie.feature", "pages/marie-curie.page.ts", "tests/anne-marie.spec.ts"]) {
        await mkdir(join(folder, f, ".."), { recursive: true });
        await writeFile(join(folder, f), "");
      }
      // A stand-in for the detectors: an email, a known name in pieces.
      const mask = (text: string) => text.replace(/[\w.]+@[\w.]+/g, "<EMAIL_1>").replace(/\b(marie|curie)\b/gi, "<PERSON_1>");
      const p = repoPaths({ mask, key: Buffer.alloc(32, 1), folder });
      expect(p.shown("tests/login.spec.ts")).toBe("tests/login.spec.ts");
      expect(p.shown(EMAIL)).toMatch(/^tests\/<PATH_[B-Z]+_1>\.spec\.ts$/);
      expect(p.shown(NAMED)).toMatch(/^tests\/users\/<PATH_[B-Z]+_1>\.spec\.ts$/);
      expect(p.shown("pages/marie-curie.page.ts")).toMatch(/^pages\/<PATH_[B-Z]+_1>\.page\.ts$/);
      expect(p.shown("marie/curie.feature")).toMatch(/^<PATH_[B-Z]+_1>\/<PATH_[B-Z]+_1>\.feature$/);
      // The same file, the same token, in another run (another masker, the same key); another key, another token.
      const again = repoPaths({ mask, key: Buffer.alloc(32, 1), folder });
      expect(again.shown(NAMED)).toBe(p.shown(NAMED));
      expect(repoPaths({ mask, key: Buffer.alloc(32, 2), folder }).shown(NAMED)).not.toBe(p.shown(NAMED));
      for (const path of ["tests/login.spec.ts", EMAIL, NAMED, "marie/curie.feature", "pages/marie-curie.page.ts"]) expect(again.real(p.shown(path))).toBe(path);
      // A token no file of the folder masks to is refused, never guessed.
      expect(() => p.real("tests/<PATH_BBBBBBBBBB_1>.spec.ts")).toThrow(/no file of the folder has this masked name/);
      // A whole path only: marie.spec.ts isn't replaced inside anne-marie.spec.ts.
      const short = p.shown("marie.spec.ts");
      expect(p.inText(`${NAMED}:3:5 failed, and so did tests/anne-marie.spec.ts and marie.spec.ts.`)).toBe(`${p.shown(NAMED)}:3:5 failed, and so did tests/anne-marie.spec.ts and ${short}.`);
      // A path the model chose is shown as it chose it.
      p.asGiven("tests/new-marie.spec.ts", "tests/new-marie.spec.ts");
      expect(p.shown("tests/new-marie.spec.ts")).toBe("tests/new-marie.spec.ts");
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  describe("through the data layer", () => {
    let dir: string;
    const vaults = new MemoryVaultStorage();
    const key = Buffer.alloc(32, 9);
    const ran: string[][] = [];
    const host: typeof runHostCommand = async (grant, options) => {
      assertGrant(grant, "commands");
      ran.push(options.argv);
      const file = options.env?.PLAYWRIGHT_JSON_OUTPUT_NAME;
      if (file) await writeFile(file, FIXTURE.replaceAll("/PROJECT", dir.replace(/\\/g, "\\\\")).replaceAll("a.spec.ts", "users/marie-curie.spec.ts"));
      return { exitCode: 1, timedOut: false, aborted: false, stdout: "", stderr: "", truncated: false, durationMs: 5 };
    };
    const data = (typeCheck?: ConstructorParameters<typeof DataAccess>[0]["typeCheck"]) =>
      new DataAccess({
        host,
        root: dir,
        store: new RunStore(join(dir, ".agent-qa", "runs")),
        config: configSchema.parse({ version: 1, policy: { writes: { commands: "ask", testCode: "ask" } } }),
        vault: new Vault({ storage: vaults, keys: { description: "t", getKey: async () => key } }),
        audit: new MemoryAuditSink(),
        ...(typeCheck ? { typeCheck } : {}),
      });
    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "agent-qa-paths-"));
      await mkdir(join(dir, "tests", "users"), { recursive: true });
      await writeFile(join(dir, "agent-qa.profile.json"), JSON.stringify({ version: 1, folder: ".", kind: "playwright", commands: { test: ["npx", "playwright", "test"] }, reviewedAt: "2026-11-06T00:00:00.000Z" }));
      await writeFile(join(dir, NAMED), "test('profile page', async () => {});\n");
      await writeFile(join(dir, EMAIL), "test('inbox', async () => {});\n");
    });
    afterEach(() => rm(dir, { recursive: true, force: true }));
    // The run read a ticket that names her first, as a requirements run does: the masker knows the name then.
    const seeded = async (d: DataAccess, run: string) => {
      await d.maskTexts(run, ["Reported by Marie Curie."], "jira.description");
      return d;
    };
    const leaks = (value: unknown) => /marie|curie|jane|doe@/i.test(JSON.stringify(value));

    it("deletes expired run vaults the first time it opens one", async () => {
      await vaults.write("expired-run", JSON.stringify({ expiresAt: "2000-01-01T00:00:00.000Z" }));
      await vaults.write("live-run", JSON.stringify({ expiresAt: "2999-01-01T00:00:00.000Z" }));
      await seeded(data(), "run-purge");
      expect(await vaults.read("expired-run")).toBeUndefined();
      expect(await vaults.read("live-run")).toBeDefined();
      await vaults.delete("live-run");
    });

    it("lists, reads, edits and removes files by the paths the model was shown", async () => {
      const d = await seeded(data(), "run-1");
      const listing = await d.frameworkFiles("run-1");
      expect(leaks(listing.files)).toBe(false);
      const named = listing.files.find((f) => f.startsWith("tests/users/"))!;
      expect(named).toMatch(/^tests\/users\/<PATH_[B-Z]+_1>\.spec\.ts$/);
      expect(listing.files).toContainEqual(expect.stringMatching(/^tests\/<PATH_[B-Z]+_1>\.spec\.ts$/));

      const [f] = await d.readTestFiles("run-1", "run-1", ".", [named]);
      expect(f!.path).toBe(named);
      // Another run (an audit's finding read by a refactor): the same token names the same file.
      expect((await d.readTestFiles("run-2", "run-2", ".", [named]))[0]!.path).toBe(named);
      // The person may name the real path: it comes back masked.
      expect((await d.readTestFiles("run-1", "run-1", ".", [NAMED]))[0]!.path).toBe(named);

      const edited = f!.content.replace("profile page", "profile page shows the name");
      const w = await d.editTestFiles("run-1", "run-1", ".", [{ path: named, content: edited, sha256: f!.sha256 }], true);
      expect(w).toEqual({ status: "done", written: [{ path: named, sha256: sha(edited) }] });
      expect(await readFile(join(dir, NAMED), "utf8")).toBe(edited);

      // A refusal names the file as the model knows it.
      const stale = d.editTestFiles("run-1", "run-1", ".", [{ path: named, content: "x", sha256: f!.sha256 }], true);
      await expect(stale).rejects.toThrow(`${named} changed since Agent-QA read it`);
      await stale.catch((e: Error) => expect(leaks(e.message)).toBe(false));

      expect(await d.removeTestFiles("run-1", "run-1", ".", [{ path: named, sha256: sha(edited) }], true)).toEqual({ status: "done", removed: [named] });
      await expect(readFile(join(dir, NAMED), "utf8")).rejects.toThrow();
    });

    it("runs tests by a shown path and reports results, failures and type errors with shown paths only", async () => {
      const d = await seeded(data(async (_grant, files) => files.map((f) => ({ file: f.path, line: 1, code: 2304, message: `Cannot find name 'x' in ${f.path}.` }))), "run-1");
      const [f] = await d.readTestFiles("run-1", "run-1", ".", [NAMED]);
      const selected = await d.selectTests("run-1", ".", { files: [`${f!.path}:3`] });
      // The command as the model and the run record see it: the shown path, escaped as Playwright reads it.
      expect(leaks(selected.args)).toBe(false);
      expect(selected.args.at(-1)).toContain(`${f!.path.replace(/\./g, "\\.")}:3`.split("/").join(process.platform === "win32" ? "\\\\" : "/"));

      const r = await d.runTests("run-1", "run-1", ".", { files: [f!.path] }, true);
      // Playwright gets the real file.
      expect(ran.at(-1)!.some((a) => a.includes("marie-curie"))).toBe(true);
      if (r.status !== "done") throw new Error(r.status);
      expect(r.tests.length).toBeGreaterThan(0);
      expect(r.tests.every((t) => t.file === f!.path)).toBe(true);
      expect(leaks(r)).toBe(false);

      const tc = await d.typeCheck("run-1", "run-1", [{ path: f!.path, content: f!.content }], true);
      expect(tc).toEqual({ status: "done", diagnostics: [{ file: f!.path, line: 1, code: 2304, message: `Cannot find name 'x' in ${f!.path}.` }] });
    });

    it("masks the paths in the framework profile the same way", async () => {
      await writeFile(join(dir, "package.json"), JSON.stringify({ devDependencies: { "@playwright/test": "1.49.0" } }));
      await writeFile(join(dir, "playwright.config.ts"), "export default {};\n");
      await mkdir(join(dir, "pages"), { recursive: true });
      await writeFile(join(dir, "pages", "marie-curie.page.ts"), "export class MarieCuriePage { constructor(readonly page) {} open() {} }\n");
      const store = new RunStore(join(dir, ".agent-qa", "runs"));
      await store.create({ workflow: "profile", context: "p", host: "cli", driver: "api", id: "2026-11-08-p-a" });
      const d = await seeded(data(), "2026-11-08-p-a");
      const profile = await d.frameworkProfile("2026-11-08-p-a", ".");
      const listing = await d.frameworkFiles("2026-11-08-p-a");
      const page = profile.pages.find((p) => p.file.startsWith("pages/"));
      expect(page?.file).toMatch(/^pages\/<PATH_[B-Z]+_1>\.page\.ts$/);
      expect(listing.files).toContain(page!.file);
      expect(leaks(profile.pages.map((p) => p.file))).toBe(false);
    });
  });
});
