import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import {
  assertGrant,
  FileAuditSink,
  MemoryAuditSink,
  parseConfig,
  Policy,
  PolicyDenied,
  type Mode,
  type WriteGrant,
} from "../src/core/index.js";

const defaults = () => parseConfig("version: 1\n").policy.writes;
const allowAll = { xray: "allow", confluence: "allow", testCode: "allow", jira: "allow" } as const;

function policy(mode: Mode, rules = defaults(), confirm?: () => Promise<boolean>) {
  const audit = new MemoryAuditSink();
  const p = new Policy({ rules, mode, audit, ...(confirm ? { confirm } : {}), now: () => new Date("2026-11-01T00:00:00Z") });
  return { p, audit };
}

describe("Policy.decide", () => {
  it("asks for writes and denies Jira by default in the IDE", () => {
    const { p } = policy("ide");
    expect(p.decide("xray")).toEqual({ kind: "ask" });
    expect(p.decide("testCode")).toEqual({ kind: "ask" });
    expect(p.decide("jira")).toMatchObject({ kind: "deny" });
    expect(policy("ide", allowAll).p.decide("confluence")).toEqual({ kind: "allow" });
  });

  it("in CI, denies ask, allows allow, and sends test code only as a pull request", () => {
    const { p } = policy("ci");
    expect(p.decide("xray")).toMatchObject({ kind: "deny", reason: expect.stringMatching(/policy.writes.xray: allow/) });
    expect(p.decide("testCode")).toEqual({ kind: "pull-request" });
    const open = policy("ci", allowAll).p;
    expect(open.decide("xray")).toEqual({ kind: "allow" });
    expect(open.decide("testCode")).toEqual({ kind: "pull-request" });
    expect(policy("ci", { ...allowAll, testCode: "deny" }).p.decide("testCode")).toMatchObject({ kind: "deny" });
  });
});

describe("Policy.guard", () => {
  const request = { target: "xray", summary: "Push 3 test cases to PROJ", runId: "r1" } as const;

  it("runs the write after the user confirms, with a grant, and audits it", async () => {
    let asked = 0;
    const { p, audit } = policy("ide", defaults(), async () => (asked++, true));
    const result = await p.guard(request, async (grant) => {
      assertGrant(grant, "xray");
      expect(grant.via).toBe("direct");
      return 42;
    });
    expect(result).toEqual({ status: "done", value: 42 });
    expect(asked).toBe(1);
    expect(audit.entries).toEqual([
      expect.objectContaining({ target: "xray", decision: "ask", outcome: "approved", runId: "r1", mode: "ide", at: "2026-11-01T00:00:00.000Z" }),
      expect.objectContaining({ outcome: "done" }),
    ]);
  });

  it("doesn't write when the user declines", async () => {
    const { p, audit } = policy("ide", defaults(), async () => false);
    let ran = false;
    expect(await p.guard(request, async () => void (ran = true))).toEqual({ status: "declined" });
    expect(ran).toBe(false);
    expect(audit.entries[0]).toMatchObject({ outcome: "declined" });
  });

  it("denies ask without a way to confirm, deny rules, and unknown targets", async () => {
    const { p, audit } = policy("ide");
    await expect(p.guard(request, async () => 1)).rejects.toBeInstanceOf(PolicyDenied);
    await expect(p.guard({ target: "jira", summary: "Edit PROJ-1" }, async () => 1)).rejects.toThrow(/"deny"/);
    await expect(p.guard({ target: "slack" as never, summary: "x" }, async () => 1)).rejects.toThrow(/unknown write target/);
    expect(audit.entries.map((e) => e.outcome)).toEqual(["denied", "denied", "denied"]);
  });

  it("denies unknown targets and rules in decide, in CI too", () => {
    expect(policy("ci", allowAll).p.decide("slack" as never)).toMatchObject({ kind: "deny" });
    expect(policy("ide", { ...allowAll, xray: undefined as never }).p.decide("xray")).toMatchObject({ kind: "deny" });
    expect(policy("ide", { ...allowAll, xray: "yes" as never }).p.decide("xray")).toMatchObject({ kind: "deny" });
  });

  it("gives CI test code a pull-request grant without asking", async () => {
    const { p } = policy("ci", defaults(), async () => {
      throw new Error("must not ask in CI");
    });
    const result = await p.guard({ target: "testCode", summary: "Add 2 specs" }, async (g) => g.via);
    expect(result).toEqual({ status: "done", value: "pull-request" });
    const ide = await policy("ide", allowAll).p.guard({ target: "testCode", summary: "Add 2 specs" }, async (g) => g.via);
    expect(ide).toEqual({ status: "done", value: "direct" });
  });

  it("refuses a grant kept after guard returns", async () => {
    const { p } = policy("ide", allowAll);
    let kept: WriteGrant | undefined;
    await p.guard(request, async (grant) => void (kept = grant));
    expect(() => assertGrant(kept, "xray")).toThrow(/without a policy grant/);
  });

  it("doesn't write when the audit log fails, and reports a late audit failure without failing the write", async () => {
    let writes = 0;
    const broken = new Policy({ rules: allowAll, mode: "ide", audit: { append: async () => Promise.reject(new Error("disk full")) } });
    await expect(broken.guard(request, async () => void writes++)).rejects.toThrow(/audit log can't be written/);
    expect(writes).toBe(0);

    let calls = 0;
    const late: unknown[] = [];
    const flaky = new Policy({
      rules: allowAll,
      mode: "ide",
      audit: { append: async () => (calls++ === 0 ? undefined : Promise.reject(new Error("disk full"))) },
      onAuditError: (e) => late.push(e),
    });
    expect(await flaky.guard(request, async () => 7)).toEqual({ status: "done", value: 7 });
    expect(late).toHaveLength(1);
  });

  it("keeps the original error when auditing a failure fails, and PolicyDenied when auditing a denial fails", async () => {
    let calls = 0;
    const p = new Policy({ rules: allowAll, mode: "ide", audit: { append: async () => (calls++ === 0 ? undefined : Promise.reject(new Error("audit"))) } });
    const boom = new Error("boom");
    await expect(p.guard(request, async () => Promise.reject(boom))).rejects.toBe(boom);
    const denied = new Policy({ rules: defaults(), mode: "ide", audit: { append: async () => Promise.reject(new Error("audit")) } });
    await expect(denied.guard({ target: "jira", summary: "x" }, async () => 1)).rejects.toBeInstanceOf(PolicyDenied);
  });

  it("audits a confirm that throws, and rethrows it", async () => {
    const { p, audit } = policy("ide", defaults(), async () => Promise.reject(Object.assign(new Error("x"), { name: "AbortError" })));
    await expect(p.guard(request, async () => 1)).rejects.toThrow("x");
    expect(audit.entries).toEqual([expect.objectContaining({ outcome: "failed", error: "AbortError" })]);
  });

  it("audits a failed write with the error name only, and rethrows", async () => {
    const { p, audit } = policy("ide", allowAll);
    const boom = Object.assign(new Error("token ghp_secret leaked in message"), { name: "HttpError" });
    await expect(p.guard(request, async () => Promise.reject(boom))).rejects.toBe(boom);
    expect(audit.entries[1]).toMatchObject({ outcome: "failed", error: "HttpError" });
    expect(JSON.stringify(audit.entries)).not.toContain("ghp_secret");
    const named = Object.assign(new Error("x"), { name: "ghp_secret_in_name" });
    await expect(p.guard(request, async () => Promise.reject(named))).rejects.toBe(named);
    expect(audit.entries.at(-1)).toMatchObject({ error: "Error" });
  });

  it("writes the audit log as JSON lines", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-qa-audit-"));
    try {
      const sink = FileAuditSink.forRoot(dir);
      expect(sink.file).toBe(join(dir, ".agent-qa", "audit.jsonl"));
      const p = new Policy({ rules: allowAll, mode: "ide", audit: sink });
      await Promise.all(Array.from({ length: 20 }, (_, i) => p.guard({ target: "confluence", summary: `Publish page ${i}` }, async () => i)));
      const lines = (await readFile(sink.file, "utf8")).trim().split("\n").map((l) => JSON.parse(l));
      expect(lines).toHaveLength(40);
      expect(lines.filter((l) => l.outcome === "done")).toHaveLength(20);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("assertGrant", () => {
  it("refuses a missing, forged, or wrong-target grant", async () => {
    expect(() => assertGrant(undefined, "xray")).toThrow(PolicyDenied);
    const forged = Object.freeze({ id: "x", target: "xray", via: "direct" }) as unknown as WriteGrant;
    expect(() => assertGrant(forged, "xray")).toThrow(/without a policy grant/);
    const { p } = policy("ide", allowAll);
    await p.guard({ target: "confluence", summary: "Publish" }, async (grant) => {
      expect(() => assertGrant(grant, "xray")).toThrow(PolicyDenied);
      assertGrant(grant, "confluence");
    });
    const other = policy("ide", allowAll).p;
    await other.guard({ target: "jira", summary: "Edit" }, async (grant) => {
      expect(() => assertGrant(grant, "xray")).toThrow(PolicyDenied);
    });
  });
});

describe("fs write lint rule", () => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const lint = async (code: string, file: string) => (await eslint.lintText(code, { filePath: file }))[0]!.messages.map((m) => m.ruleId);

  const blocked = {
    "a named write": 'import { writeFile } from "node:fs/promises";\nexport const x = writeFile;\n',
    "a write not in any list": 'import { link } from "node:fs/promises";\nexport const x = link;\n',
    "fs.promises": 'import { promises } from "node:fs";\nexport const x = promises;\n',
    "a namespace import": 'import * as fs from "node:fs";\nexport const x = fs;\n',
    "a default import": 'import fs from "fs";\nexport const x = fs;\n',
    "a literal dynamic import": 'export const x = await import("node:fs/promises");\n',
    "require()": 'export const x = require("fs");\n',
    "import = require": 'import fs = require("fs");\nexport const x = fs;\n',
    "child_process": 'import { execSync } from "node:child_process";\nexport const x = execSync;\n',
    "createRequire": 'import { createRequire } from "node:module";\nexport const x = createRequire;\n',
  };

  for (const [name, code] of Object.entries(blocked)) {
    it(`blocks ${name} outside the writer files`, async () => {
      expect((await lint(code, "src/workflows/x.ts")).length).toBeGreaterThan(0);
    });
  }

  it("allows fs reads anywhere, and writes only in the writer files", async () => {
    expect(await lint('import { readFile, stat } from "node:fs/promises";\nexport const x = [readFile, stat];\n', "src/data/x.ts")).toEqual([]);
    const append = 'import { appendFile } from "node:fs/promises";\nexport const x = appendFile;\n';
    expect(await lint(append, "src/core/policy/audit.ts")).toEqual([]);
    expect((await lint(append, "src/core/policy/policy.ts")).length).toBeGreaterThan(0);
    expect((await lint('import { execSync } from "node:child_process";\nexport const x = execSync;\n', "src/core/policy/audit.ts")).length).toBeGreaterThan(0);
  });
});
