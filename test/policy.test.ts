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
      expect.objectContaining({ target: "xray", decision: "ask", outcome: "done", runId: "r1", mode: "ide", at: "2026-11-01T00:00:00.000Z" }),
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
    expect(audit.entries.map((e) => e.outcome)).toEqual(["denied", "denied"]);
  });

  it("gives CI test code a pull-request grant without asking", async () => {
    const { p } = policy("ci", defaults(), async () => {
      throw new Error("must not ask in CI");
    });
    const result = await p.guard({ target: "testCode", summary: "Add 2 specs" }, async (g) => g.via);
    expect(result).toEqual({ status: "done", value: "pull-request" });
  });

  it("audits a failed write with the error name only, and rethrows", async () => {
    const { p, audit } = policy("ide", allowAll);
    const boom = Object.assign(new Error("token ghp_secret leaked in message"), { name: "HttpError" });
    await expect(p.guard(request, async () => Promise.reject(boom))).rejects.toBe(boom);
    expect(audit.entries[0]).toMatchObject({ outcome: "failed", error: "HttpError" });
    expect(JSON.stringify(audit.entries)).not.toContain("ghp_secret");
  });

  it("writes the audit log as JSON lines", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-qa-audit-"));
    try {
      const file = join(dir, "nested", "audit.jsonl");
      const p = new Policy({ rules: allowAll, mode: "ide", audit: new FileAuditSink(file) });
      await p.guard(request, async () => 1);
      await p.guard({ target: "confluence", summary: "Publish page" }, async () => 2);
      const lines = (await readFile(file, "utf8")).trim().split("\n").map((l) => JSON.parse(l));
      expect(lines.map((l) => l.target)).toEqual(["xray", "confluence"]);
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
    });
  });
});

describe("fs write lint rule", () => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const lint = async (code: string, file: string) => (await eslint.lintText(code, { filePath: file }))[0]!.messages.map((m) => m.ruleId);

  it("blocks fs writes outside the policy, run and vault modules", async () => {
    expect(await lint('import { writeFile } from "node:fs/promises";\nexport const w = writeFile;\n', "src/workflows/x.ts")).toContain("no-restricted-imports");
    expect(await lint('import * as fs from "node:fs";\nexport const f = fs;\n', "src/data/x.ts")).toContain("no-restricted-imports");
    expect(await lint('import { readFile } from "node:fs/promises";\nexport const r = readFile;\n', "src/data/x.ts")).not.toContain("no-restricted-imports");
    expect(await lint('import { appendFile } from "node:fs/promises";\nexport const a = appendFile;\n', "src/core/policy/x.ts")).not.toContain("no-restricted-imports");
  });
});
