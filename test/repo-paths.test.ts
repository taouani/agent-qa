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
  it("masks each part alone, keeps the extension, and gives every path back exactly", () => {
    const entries = new Map<string, string>();
    const counters: Record<string, number> = {};
    const vault = {
      tokenFor: (kind: string, value: string) => {
        for (const [t, v] of entries) if (v === value && t.startsWith(`<${kind}_`)) return t;
        const t = `<${kind}_${(counters[kind] = (counters[kind] ?? 0) + 1)}>`;
        entries.set(t, value);
        return t;
      },
      valueOf: (t: string) => entries.get(t),
    };
    // A stand-in for the detectors: an email whole, a known name in pieces.
    const mask = (text: string) =>
      text.replace(/[\w.]+@[\w.]+/g, (m) => vault.tokenFor("EMAIL", m)).replace(/\b(marie|curie)\b/gi, () => vault.tokenFor("PERSON", "Marie Curie"));
    const p = repoPaths(mask, vault);
    expect(p.shown("tests/login.spec.ts")).toBe("tests/login.spec.ts");
    expect(p.shown(EMAIL)).toBe("tests/<EMAIL_1>.spec.ts");
    // <PERSON_1>-<PERSON_1> would come back as "Marie Curie-Marie Curie": the whole part is one token.
    expect(p.shown(NAMED)).toBe("tests/users/<PATH_1>.spec.ts");
    expect(p.shown("marie/curie.feature")).toBe("<PATH_2>/<PATH_3>.feature");
    for (const path of ["tests/login.spec.ts", EMAIL, NAMED, "marie/curie.feature", "tests/<X_1>.spec.ts"]) expect(p.real(p.shown(path))).toBe(path);
    // The same path, the same tokens, every time.
    expect(p.shown(NAMED)).toBe("tests/users/<PATH_1>.spec.ts");
    expect(p.inText(`${NAMED}:3:5 failed, and so did ${EMAIL}`)).toBe("tests/users/<PATH_1>.spec.ts:3:5 failed, and so did tests/<EMAIL_1>.spec.ts");
  });

  describe("through the data layer", () => {
    let dir: string;
    const vaults = new MemoryVaultStorage();
    const key = Buffer.alloc(32, 9);
    const host: typeof runHostCommand = async (grant, options) => {
      assertGrant(grant, "commands");
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

    it("lists, reads, edits and removes files by the paths the model was shown", async () => {
      const d = await seeded(data(), "run-1");
      const listing = await d.frameworkFiles("run-1");
      expect(leaks(listing.files)).toBe(false);
      const named = listing.files.find((f) => f.startsWith("tests/users/"))!;
      expect(named).toMatch(/^tests\/users\/<[A-Z]+_\d+>\.spec\.ts$/);
      expect(listing.files).toContainEqual(expect.stringMatching(/^tests\/<EMAIL_\d+>\.spec\.ts$/));

      const [f] = await d.readTestFiles("run-1", "run-1", ".", [named]);
      expect(f!.path).toBe(named);
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
      // Playwright gets the real file.
      expect(selected.args.some((a) => a.includes("marie-curie"))).toBe(true);

      const r = await d.runTests("run-1", "run-1", ".", { files: [f!.path] }, true);
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
      expect(page?.file).toMatch(/^pages\/<PATH_\d+>\.ts$/);
      expect(listing.files).toContain(page!.file);
      expect(leaks(profile.pages.map((p) => p.file))).toBe(false);
    });
  });
});
