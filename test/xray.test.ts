import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FetchLike } from "../src/connectors/http.js";
import { JiraClient } from "../src/connectors/jira.js";
import { XrayClient, type XrayJobResult, type XrayTest } from "../src/connectors/xray.js";
import { ConnectorError } from "../src/connectors/http.js";
import { configSchema, MemoryAuditSink, Policy, PolicyDenied, RunStore, type WriteGrant } from "../src/core/index.js";
import { DataAccess, toXrayTest, type PushCase } from "../src/data/index.js";
import { MemoryVaultStorage, Vault } from "../src/masking/index.js";

const ok = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });

async function grantFor(): Promise<{ run: <T>(fn: (g: WriteGrant) => Promise<T>) => Promise<T> }> {
  const policy = new Policy({ rules: { xray: "allow", confluence: "ask", testCode: "ask", jira: "deny" }, mode: "ide", audit: new MemoryAuditSink() });
  return {
    run: async (fn) => {
      const r = await policy.guard({ target: "xray", summary: "test" }, fn);
      if (r.status !== "done") throw new Error("declined");
      return r.value;
    },
  };
}

const TEST: XrayTest = { testtype: "Manual", fields: { summary: "[TC-ABC-1-001] t", project: { key: "QA" }, labels: ["agent-qa"] }, steps: [{ action: "a", data: "", result: "r" }] };

describe("XrayClient", () => {
  it("authenticates once, imports and polls the job until it finishes", async () => {
    const calls: Array<{ method: string; path: string; auth?: string; body?: unknown }> = [];
    let polls = 0;
    const fetch: FetchLike = async (url, init) => {
      const u = new URL(url);
      const headers = new Headers(init.headers);
      calls.push({ method: init.method ?? "GET", path: u.pathname, ...(headers.get("authorization") ? { auth: headers.get("authorization")! } : {}), ...(init.body ? { body: JSON.parse(String(init.body)) } : {}) });
      if (u.pathname === "/api/v2/authenticate") return ok("tok-1");
      if (u.pathname === "/api/v2/import/test/bulk") return ok({ jobId: "job1" });
      if (u.pathname === "/api/v2/import/test/bulk/job1/status") {
        polls += 1;
        if (polls < 3) return ok({ status: polls === 1 ? "pending" : "working" });
        return ok({ status: "partially_successful", result: { issues: [{ elementNumber: 0, key: "QA-7", id: "1" }], errors: [{ elementNumber: 1, errors: { summary: "too long" } }] } });
      }
      return new Response("{}", { status: 404 });
    };
    const client = new XrayClient({ clientId: "id", clientSecret: "secret", fetch, sleep: async () => {}, pollMs: 1 });
    const { run } = await grantFor();
    const result = await run((g) => client.importAndWait([TEST, TEST], g));
    expect(result).toEqual({ jobId: "job1", status: "partially_successful", issues: [{ elementNumber: 0, key: "QA-7" }], errors: [{ elementNumber: 1, message: "rejected: summary" }] });
    expect(calls.filter((c) => c.path === "/api/v2/authenticate")).toHaveLength(1);
    expect(calls[0]!.body).toEqual({ client_id: "id", client_secret: "secret" });
    expect(calls.slice(1).every((c) => c.auth === "Bearer tok-1")).toBe(true);
    expect(polls).toBe(3);
  });

  it("refuses to import without a grant and times out a job that never finishes", async () => {
    let now = 0;
    const fetch: FetchLike = async (url) => {
      const u = new URL(url);
      if (u.pathname === "/api/v2/authenticate") return ok("tok");
      if (u.pathname === "/api/v2/import/test/bulk") return ok({ jobId: "job2" });
      return ok({ status: "working" });
    };
    const client = new XrayClient({ clientId: "id", clientSecret: "s", fetch, sleep: async () => void (now += 1000), now: () => now, jobTimeoutMs: 5000 });
    await expect(client.importTests([TEST], undefined as unknown as WriteGrant)).rejects.toThrow();
    const { run } = await grantFor();
    await expect(run((g) => client.importAndWait([TEST], g))).rejects.toMatchObject({ code: "TIMEOUT", jobId: "job2" });
  });

  it("counts an unknown final status as failed and keeps no Xray text", async () => {
    const fetch: FetchLike = async (url) => new URL(url).pathname === "/api/v2/authenticate" ? ok("tok") : ok({ status: "unsuccessful", result: { errors: [{ elementNumber: 0, message: "user Ana Lima can't see QA" }, { errors: { steps: "x" } }] } });
    expect(await new XrayClient({ clientId: "i", clientSecret: "s", fetch }).jobStatus("job4")).toEqual({
      status: "failed",
      issues: [],
      errors: [{ elementNumber: 0, message: "rejected by Xray" }, { message: "rejected: steps" }],
    });
  });

  it("rejects bad answers: no token, no job id, no status", async () => {
    const answers: Record<string, unknown> = { "/api/v2/authenticate": "", "/api/v2/import/test/bulk": { jobId: "../x" } };
    const fetch: FetchLike = async (url) => ok(answers[new URL(url).pathname] ?? { result: {} });
    const { run } = await grantFor();
    await expect(run((g) => new XrayClient({ clientId: "i", clientSecret: "s", fetch }).importTests([TEST], g))).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    answers["/api/v2/authenticate"] = "tok";
    await expect(run((g) => new XrayClient({ clientId: "i", clientSecret: "s", fetch }).importTests([TEST], g))).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(new XrayClient({ clientId: "i", clientSecret: "s", fetch }).jobStatus("job3")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(new XrayClient({ clientId: "i", clientSecret: "s", fetch }).jobStatus("../etc")).rejects.toThrow("Not an Xray job id");
  });
});

describe("JiraClient.findByLabels", () => {
  it("finds earlier tests by label, in chunks, skipping labels Jira can't hold", async () => {
    const jqls: string[] = [];
    const fetch: FetchLike = async (url, init) => {
      const body = JSON.parse(String(init.body)) as { jql: string };
      jqls.push(body.jql);
      return ok({ issues: [{ key: "QA-1", fields: { labels: ["agent-qa", "agent-qa:TC-ABC-1-001"] } }, { key: "QA-2", fields: { labels: ["other"] } }], isLast: true });
    };
    const jira = new JiraClient({ site: "https://example.atlassian.net", email: "e", token: "t", fetch, sleep: async () => {} });
    const labels = Array.from({ length: 60 }, (_, i) => `agent-qa:TC-ABC-1-${String(i + 1).padStart(3, "0")}`);
    const found = await jira.findByLabels("QA", [...labels, 'bad "label"']);
    expect([...found]).toEqual([["agent-qa:TC-ABC-1-001", "QA-1"]]);
    expect(jqls).toHaveLength(2);
    expect(jqls[0]).toMatch(/^project = "QA" AND labels in \("agent-qa:TC-ABC-1-001", .*\) ORDER BY created ASC$/);
    expect(jqls.join()).not.toContain("bad");
    await expect(jira.findByLabels("qa; drop", labels)).rejects.toThrow("Not a Jira project key");
  });
});

describe("JiraClient.findAgentTests", () => {
  it("finds an issue's earlier tests with their id, title and covered criteria", async () => {
    const jqls: string[] = [];
    const fetch: FetchLike = async (_url, init) => {
      jqls.push((JSON.parse(String(init.body)) as { jql: string }).jql);
      return ok({
        isLast: true,
        issues: [
          { key: "QA-1", fields: { summary: "[TC-ABC-1-001] Escalate", labels: ["agent-qa", "agent-qa:TC-ABC-1-001"], description: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "Covers AC1, AC3, Jane Doe of ABC-1 (positive, P1). Written by Agent-QA." }] }, { type: "paragraph", content: [{ type: "text", text: "Criteria:" }, { type: "hardBreak" }, { type: "text", text: "- AC1: A case is escalated" }, { type: "hardBreak" }, { type: "text", text: "- AC3: The owner is told" }] }] } } },
          { key: "QA-2", fields: { summary: "Renamed by hand", labels: ["agent-qa", "agent-qa:TC-ABC-1-002"], description: null } },
          { key: "QA-3", fields: { summary: "[TC-ABC-12-001] Other issue", labels: ["agent-qa", "agent-qa:TC-ABC-12-001"] } },
          { key: "QA-4", fields: { summary: "[TC-ABC-1-001] Duplicate", labels: ["agent-qa", "agent-qa:TC-ABC-1-001"] } },
        ],
      });
    };
    const jira = new JiraClient({ site: "https://example.atlassian.net", email: "e", token: "t", fetch, sleep: async () => {} });
    expect(await jira.findAgentTests("QA", "ABC-1")).toEqual([
      { key: "QA-1", tcId: "TC-ABC-1-001", title: "Escalate", covers: ["AC1", "AC3"], criteria: ["A case is escalated", "The owner is told"] },
      { key: "QA-2", tcId: "TC-ABC-1-002", title: "Renamed by hand", covers: [], criteria: [] },
    ]);
    expect(jqls).toEqual(['project = "QA" AND labels = "agent-qa" AND issue in linkedIssues("ABC-1") ORDER BY created ASC']);
    await expect(jira.findAgentTests("QA", 'ABC-1") OR ("x')).rejects.toThrow();
  });
});

const pushCase = (n: number, over: Partial<PushCase> = {}): PushCase => ({
  id: `TC-ABC-1-${String(n).padStart(3, "0")}`,
  requirement: "ABC-1",
  title: `Escalate for <PERSON_1> (${n})`,
  type: "positive",
  priority: "P1",
  preconditions: ["<PERSON_1> owns the case"],
  steps: [{ action: "Open the case of <PERSON_1>", data: "", expected: "It is escalated" }],
  covers: ["AC1"],
  ...over,
});

describe("toXrayTest", () => {
  it("maps a case to a manual test with labels, priority, link and steps", () => {
    const xray = configSchema.parse({ version: 1, xray: { clientId: "i", clientSecret: "${env:S}", projectKey: "QA", priorities: { P1: "Highest" } } }).xray!;
    const test = toXrayTest(pushCase(1), xray, "QA-9", (t) => t.replace("<PERSON_1>", "Ana"));
    expect(test).toEqual({
      testtype: "Manual",
      update_key: "QA-9",
      fields: {
        summary: "[TC-ABC-1-001] Escalate for Ana (1)",
        project: { key: "QA" },
        labels: ["agent-qa", "agent-qa:TC-ABC-1-001"],
        description: "Preconditions:\n- Ana owns the case\n\nCovers AC1 of ABC-1 (positive, P1). Written by Agent-QA.",
        priority: { name: "Highest" },
      },
      update: { issuelinks: [{ add: { type: { name: "Test" }, outwardIssue: { key: "ABC-1" } } }] },
      steps: [{ action: "Open the case of Ana", data: "", result: "It is escalated" }],
    });
    expect(toXrayTest(pushCase(2, { priority: "P3" }), xray, undefined, (t) => t).fields.priority).toBeUndefined();
  });
});

describe("DataAccess.pushToXray", () => {
  let dir: string;
  let runs: RunStore;
  let sent: XrayTest[][];
  let audit: MemoryAuditSink;
  let job: (tests: XrayTest[], n: number) => XrayJobResult;
  const vaults = new MemoryVaultStorage();
  const key = Buffer.alloc(32, 7);

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-xray-"));
    runs = new RunStore(join(dir, "runs"));
    sent = [];
    audit = new MemoryAuditSink();
    job = (tests) => ({ status: "successful", issues: tests.map((_, i) => ({ elementNumber: i, key: `QA-${100 + i}` })), errors: [] });
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  function access(over: { writes?: Record<string, string>; restoreOnWrite?: boolean; mode?: "ide" | "ci"; xray?: boolean } = {}) {
    const config = configSchema.parse({
      version: 1,
      atlassian: { site: "https://acme.atlassian.net", email: "${env:E}", token: "${env:T}" },
      ...(over.xray === false ? {} : { xray: { clientId: "i", clientSecret: "${env:S}", projectKey: "QA" } }),
      ...(over.writes ? { policy: { writes: { xray: "ask", confluence: "ask", testCode: "ask", jira: "deny", ...over.writes } } } : {}),
      ...(over.restoreOnWrite ? { masking: { restoreOnWrite: true } } : {}),
    });
    return new DataAccess({
      root: dir,
      store: runs,
      config,
      vault: new Vault({ storage: vaults, keys: { description: "t", getKey: async () => key } }),
      xray: {
        importAndWait: async (tests) => {
          sent.push(tests);
          return { ...job(tests, sent.length), jobId: `job${sent.length}` };
        },
      },
      labels: { findByLabels: async () => new Map([["agent-qa:TC-ABC-1-002", "QA-55"]]) },
      audit,
      ...(over.mode ? { mode: over.mode } : {}),
    });
  }

  it("plans creates and updates from the labels of earlier pushes", async () => {
    expect(await access().xrayPlan([pushCase(1), pushCase(2)])).toEqual({ project: "QA", existing: { "TC-ABC-1-002": "QA-55" }, create: 1, update: 1 });
  });

  it("pushes through the policy, records the audit entry and keeps tokens by default", async () => {
    const out = await access().pushToXray("run-1", "run-1", [pushCase(1), pushCase(2)], true);
    expect(out).toEqual({
      status: "done",
      result: {
        project: "QA",
        jobs: ["job1"],
        results: [
          { tcId: "TC-ABC-1-001", action: "created", xrayKey: "QA-100", linkedTo: "ABC-1" },
          { tcId: "TC-ABC-1-002", action: "updated", xrayKey: "QA-101", linkedTo: "ABC-1" },
        ],
      },
    });
    expect(sent[0]![1]!.update_key).toBe("QA-55");
    expect(sent[0]![0]!.fields.summary).toBe("[TC-ABC-1-001] Escalate for <PERSON_1> (1)");
    expect(audit.entries.map((e) => [e.target, e.decision, e.outcome])).toEqual([
      ["xray", "ask", "approved"],
      ["xray", "ask", "done"],
    ]);
    expect(audit.entries[0]!.summary).toBe("Push 2 test case(s) to Xray project QA (1 new, 1 updated)");
  });

  it("sends nothing when the user says no, and nothing to an unconfigured or denied Xray", async () => {
    expect(await access().pushToXray("run-1", "run-1", [pushCase(1)], false)).toEqual({ status: "declined" });
    expect(sent).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
    expect(await access().xrayEnabled()).toBe(true);
    expect(await access({ xray: false }).xrayEnabled()).toBe(false);
    const noJira = new DataAccess({ root: dir, store: runs, config: configSchema.parse({ version: 1, xray: { clientId: "i", clientSecret: "${env:S}", projectKey: "QA" } }) });
    expect(await noJira.xrayEnabled()).toBe(false);
    expect(await access({ writes: { xray: "deny" } }).xrayEnabled()).toBe(false);
    expect(await access({ mode: "ci" }).xrayEnabled()).toBe(false);
    expect(await access({ mode: "ci", writes: { xray: "allow" } }).xrayEnabled()).toBe(true);
    await expect(access({ mode: "ci" }).pushToXray("run-1", "run-1", [pushCase(1)], true)).rejects.toBeInstanceOf(PolicyDenied);
    expect(sent).toHaveLength(0);
    expect(audit.entries.at(-1)).toMatchObject({ outcome: "denied", mode: "ci" });
  });

  it("restores tokens on write when asked, and then keeps no Xray message", async () => {
    const vault = await new Vault({ storage: vaults, keys: { description: "t", getKey: async () => key } }).open("req-run");
    expect(vault.tokenFor("PERSON", "Ana Lima")).toBe("<PERSON_1>");
    await vault.save();
    job = (tests) => ({ status: "partially_successful", issues: [{ elementNumber: 0, key: "QA-1" }], errors: [{ elementNumber: 1, message: `bad summary ${tests[1]!.fields.summary}` }] });
    const out = await access({ restoreOnWrite: true }).pushToXray("run-2", "req-run", [pushCase(1), pushCase(3)], true);
    expect(sent[0]![0]!.fields.summary).toBe("[TC-ABC-1-001] Escalate for Ana Lima (1)");
    expect(sent[0]![0]!.steps[0]!.action).toBe("Open the case of Ana Lima");
    expect(out.status === "done" && out.result.results[1]).toEqual({ tcId: "TC-ABC-1-003", action: "failed", linkedTo: "ABC-1", error: "rejected by Xray (message not kept: restoreOnWrite is on)" });
    expect(JSON.stringify(out)).not.toContain("Ana");
  });

  it("refuses to restore with an expired vault instead of sending tokens", async () => {
    await expect(access({ restoreOnWrite: true }).pushToXray("run-2", "gone-run", [pushCase(1)], true)).rejects.toThrow("expired or was deleted");
    expect(sent).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  it("keeps what earlier batches created when a later job fails", async () => {
    job = (tests, n) => {
      if (n === 2) {
        const e = new ConnectorError("TIMEOUT", "Xray", "GET", "/x", undefined, "Xray import job job2 did not finish in 600 s; it may still complete in Xray, so check Xray before pushing again");
        e.jobId = "job2";
        throw e;
      }
      return { status: "successful", issues: tests.map((_, i) => ({ elementNumber: i, key: `QA-${100 + i}` })), errors: [] };
    };
    const many = Array.from({ length: 1002 }, (_, i) => pushCase(1, { id: `TC-ABC-${i + 1}-001`, requirement: `ABC-${i + 1}` }));
    const out = await access().pushToXray("run-1", "run-1", many, true);
    expect(out.status).toBe("done");
    if (out.status !== "done") return;
    expect(out.result.jobs).toEqual(["job1", "job2"]);
    expect(out.result.results.filter((r) => r.action === "created")).toHaveLength(1000);
    expect(out.result.results.slice(1000)).toEqual([
      expect.objectContaining({ tcId: "TC-ABC-1001-001", action: "failed", error: expect.stringContaining("check Xray before pushing again") }),
      expect.objectContaining({ tcId: "TC-ABC-1002-001", action: "failed" }),
    ]);
  });

  it("fails the write, keeping nothing, when the import never started", async () => {
    job = () => {
      throw new ConnectorError("AUTH", "Xray", "POST", "/api/v2/authenticate", 401);
    };
    await expect(access().pushToXray("run-1", "run-1", [pushCase(1)], true)).rejects.toBeInstanceOf(ConnectorError);
    expect(audit.entries.map((e) => e.outcome)).toEqual(["approved", "failed"]);
  });

  it("marks a timed-out batch as unknown, also with restoreOnWrite", async () => {
    const vault = await new Vault({ storage: vaults, keys: { description: "t", getKey: async () => key } }).open("req-3");
    vault.tokenFor("PERSON", "Ana Lima");
    await vault.save();
    job = () => {
      const e = new ConnectorError("TIMEOUT", "Xray", "GET", "/x", undefined, "Xray import job job1 did not finish in 600 s; it may still complete in Xray, so check Xray before pushing again");
      e.jobId = "job1";
      throw e;
    };
    const out = await access({ restoreOnWrite: true }).pushToXray("run-3", "req-3", [pushCase(1)], true);
    expect(out.status === "done" && out.result).toEqual({
      project: "QA",
      jobs: ["job1"],
      results: [{ tcId: "TC-ABC-1-001", action: "failed", linkedTo: "ABC-1", error: expect.stringMatching(/^unknown: .*check Xray before pushing again$/) }],
    });
  });

  it("splits more than 1000 cases into several import jobs", async () => {
    const many = Array.from({ length: 1001 }, (_, i) => pushCase(1, { id: `TC-ABC-${i + 1}-001`, requirement: `ABC-${i + 1}` }));
    const out = await access().pushToXray("run-1", "run-1", many, true);
    expect(sent.map((s) => s.length)).toEqual([1000, 1]);
    expect(out.status === "done" && out.result.jobs).toEqual(["job1", "job2"]);
    expect(out.status === "done" && out.result.results[1000]).toMatchObject({ tcId: "TC-ABC-1001-001", xrayKey: "QA-100" });
  });

  it("writes the default audit log under the project folder", async () => {
    const data = new DataAccess({
      root: dir,
      store: runs,
      config: configSchema.parse({ version: 1, atlassian: { site: "https://acme.atlassian.net", email: "e", token: "${env:T}" }, xray: { clientId: "i", clientSecret: "${env:S}", projectKey: "QA" } }),
      vault: new Vault({ storage: vaults, keys: { description: "t", getKey: async () => key } }),
      xray: { importAndWait: async (tests) => ({ ...job(tests, 1), jobId: "j" }) },
      labels: { findByLabels: async () => new Map() },
    });
    await data.pushToXray("run-1", "run-1", [pushCase(1)], true);
    expect(await readFile(join(dir, ".agent-qa", "audit.jsonl"), "utf8")).toContain('"outcome":"done"');
  });
});
