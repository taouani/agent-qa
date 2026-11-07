import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FetchLike } from "../src/connectors/http.js";
import { XrayClient, type XrayExecutionInput } from "../src/connectors/xray.js";
import { configSchema, MemoryAuditSink, Policy, RunStore, WorkflowEngine, type WriteGrant } from "../src/core/index.js";
import { DataAccess, executionChanges, executionResults, tcIdOf, type ExecutionRow, type XrayExecutionPlan } from "../src/data/index.js";
import { runTestsWorkflow, TEST_RUN_ARTIFACT, XRAY_EXECUTION_ARTIFACT, type RunTestsDeps } from "../src/workflows/index.js";

const ok = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });

async function withGrant<T>(fn: (g: WriteGrant) => Promise<T>): Promise<T> {
  const policy = new Policy({ rules: { xray: "allow", confluence: "ask", testCode: "ask", jira: "deny", commands: "ask" }, mode: "ide", audit: new MemoryAuditSink() });
  const r = await policy.guard({ target: "xray", summary: "test" }, fn);
  if (r.status !== "done") throw new Error("declined");
  return r.value;
}

const row = (title: string, outcome: ExecutionRow["outcome"], over: Partial<ExecutionRow> = {}): ExecutionRow => ({ title, tags: [], file: "tests/a.spec.ts", line: 3, outcome, runs: 1, failedRuns: outcome === "failed" ? 1 : 0, ...over });

const INPUT: XrayExecutionInput = { project: "QA", summary: "Agent-QA run r1", description: "d", labels: ["agent-qa", "agent-qa:exec:abc"], startedAt: new Date("2026-11-07T10:00:00Z"), finishedAt: new Date("2026-11-07T10:01:00Z"), tests: [{ testKey: "QA-1", status: "FAILED", comment: "Failed in a.spec.ts:3" }] };

describe("Xray Test Executions (S3-9): the client", () => {
  it("records results as a multipart import with the execution's labels, only with a grant", async () => {
    const calls: Array<{ path: string; type: string; body: string }> = [];
    const fetch: FetchLike = async (url, init) => {
      const u = new URL(url);
      calls.push({ path: u.pathname, type: new Headers(init.headers).get("content-type") ?? "", body: String(init.body ?? "") });
      if (u.pathname === "/api/v2/authenticate") return ok("tok");
      if (u.pathname === "/api/v2/import/execution/multipart") return ok({ id: "1", key: "QA-90", self: "x" });
      return new Response("{}", { status: 404 });
    };
    const client = new XrayClient({ clientId: "i", clientSecret: "s", fetch });
    await expect(client.importExecution(INPUT, undefined as unknown as WriteGrant)).rejects.toThrow();
    expect(await withGrant((g) => client.importExecution(INPUT, g))).toEqual({ key: "QA-90" });
    const sent = calls.find((c) => c.path === "/api/v2/import/execution/multipart")!;
    const boundary = /boundary=(\S+)/.exec(sent.type)![1]!;
    expect(sent.type).toMatch(/^multipart\/form-data; boundary=/);
    const parts = sent.body.split(`--${boundary}`).filter((p) => p.includes("Content-Disposition"));
    const json = (name: string) => JSON.parse(parts.find((p) => p.includes(`name="${name}"`))!.split("\r\n\r\n")[1]!.trim());
    expect(json("results")).toEqual({ info: { summary: "Agent-QA run r1", description: "d", startDate: "2026-11-07T10:00:00.000Z", finishDate: "2026-11-07T10:01:00.000Z" }, tests: [{ testKey: "QA-1", status: "FAILED", comment: "Failed in a.spec.ts:3" }] });
    expect(json("info")).toEqual({ fields: { project: { key: "QA" }, summary: "Agent-QA run r1", description: "d", issuetype: { name: "Test Execution" }, labels: ["agent-qa", "agent-qa:exec:abc"] } });
    await expect(withGrant((g) => client.importExecution({ ...INPUT, tests: [{ testKey: "not a key", status: "PASSED" }] }, g))).rejects.toThrow(/Not an Xray test key/);
  });

  it("reads the newest execution with a label through the fixed GraphQL query, page by page, with no grant", async () => {
    const bodies: Array<{ query: string; variables: { jql: string; start: number } }> = [];
    const page = (start: number, key = "QA-80") => ({
      data: {
        getTestExecutions: {
          results: [
            {
              issueId: "1",
              jira: { key, created: "2026-11-06T09:00:00.000+0000" },
              testRuns: { total: 101, results: start === 0 ? Array.from({ length: 100 }, (_, i) => ({ status: { name: i === 0 ? "FAILED" : "PASSED" }, test: { jira: { key: `QA-${i + 1}` } } })) : [{ status: { name: "passed" }, test: { jira: { key: "QA-101" } } }] },
            },
          ],
        },
      },
    });
    let second = "QA-80";
    const fetch: FetchLike = async (url, init) => {
      const u = new URL(url);
      if (u.pathname === "/api/v2/authenticate") return ok("tok");
      const body = JSON.parse(String(init.body));
      bodies.push(body);
      return ok(page(body.variables.start, body.variables.start === 0 ? "QA-80" : second));
    };
    const client = new XrayClient({ clientId: "i", clientSecret: "s", fetch });
    const read = (await client.lastExecution("QA", "agent-qa:exec:abc"))!;
    expect(read.key).toBe("QA-80");
    expect(Object.keys(read.statuses)).toHaveLength(101);
    expect(read.statuses["QA-1"]).toBe("FAILED");
    expect(read.statuses["QA-101"]).toBe("PASSED");
    expect(bodies.map((b) => b.variables.start)).toEqual([0, 100]);
    expect(bodies[0]!.variables.jql).toBe('project = "QA" AND issuetype = "Test Execution" AND labels = "agent-qa:exec:abc" ORDER BY created DESC');
    expect(bodies[0]!.query).not.toMatch(/mutation/);
    await client.lastExecution("QA", "agent-qa:exec:abc", "agent-qa:run:r1");
    expect(bodies.at(-1)!.variables.jql).toBe('project = "QA" AND issuetype = "Test Execution" AND labels = "agent-qa:exec:abc" AND labels != "agent-qa:run:r1" ORDER BY created DESC');
    // A newer execution between pages: the first one's statuses stand.
    second = "QA-81";
    expect(Object.keys((await client.lastExecution("QA", "agent-qa:exec:abc"))!.statuses)).toHaveLength(100);
    // None yet.
    const none = new XrayClient({ clientId: "i", clientSecret: "s", fetch: async (url) => (new URL(url).pathname.endsWith("authenticate") ? ok("t") : ok({ data: { getTestExecutions: { results: [] } } })) });
    expect(await none.lastExecution("QA", "agent-qa:exec:abc")).toBeUndefined();
    await expect(none.lastExecution("QA", 'x" OR 1=1')).rejects.toThrow(/Not a label/);
  });
});

describe("Xray Test Executions (S3-9): results and changes", () => {
  it("finds each case by its TC id, one result per case, and leaves out skipped tests and tests with no case", () => {
    expect(tcIdOf("TC-ABC-1-001 Create a request", [])).toBe("TC-ABC-1-001");
    expect(tcIdOf("Approval › Create", ["@TC-ABC-12-010", "@positive"])).toBe("TC-ABC-12-010");
    expect(tcIdOf("no id", ["@smoke"])).toBeUndefined();
    const keys = new Map([["TC-ABC-1-001", "QA-1"], ["TC-ABC-1-002", "QA-2"], ["TC-ABC-1-003", "QA-3"]]);
    const r = executionResults(
      [
        row("TC-ABC-1-001 a [chromium]", "passed"),
        row("TC-ABC-1-001 a [firefox]", "failed", { failure: { message: "\n  Error: expect(locator).toHaveText(expected)\n  Expected: x" } }),
        row("TC-ABC-1-002 b", "flaky", { runs: 2, failedRuns: 1 }),
        row("TC-ABC-1-003 c", "skipped"),
        row("TC-ABC-1-009 not pushed", "passed"),
        row("no case at all", "failed"),
      ],
      keys,
    );
    expect(r.results).toEqual([
      { tcId: "TC-ABC-1-001", xrayKey: "QA-1", status: "FAILED", comment: "Failed in tests/a.spec.ts:3: Error: expect(locator).toHaveText(expected)" },
      { tcId: "TC-ABC-1-002", xrayKey: "QA-2", status: "PASSED", comment: "Flaky: failed 1 of 2 run(s), passed on a retry (tests/a.spec.ts:3)" },
    ]);
    expect(r.notInXray).toEqual(["TC-ABC-1-009 not pushed", "no case at all"]);
    expect(r.skipped).toBe(1);
    expect(r.skippedKeys).toEqual(["QA-3"]);
  });

  it("says what changed since the last execution", () => {
    const now = [
      { tcId: "A", xrayKey: "QA-1", status: "FAILED" as const },
      { tcId: "B", xrayKey: "QA-2", status: "PASSED" as const },
      { tcId: "C", xrayKey: "QA-3", status: "FAILED" as const },
      { tcId: "D", xrayKey: "QA-4", status: "PASSED" as const },
    ];
    const { results, changes } = executionChanges(now, { key: "QA-80", created: "", statuses: { "QA-1": "PASSED", "QA-2": "FAILED", "QA-3": "FAILED", "QA-9": "PASSED" } });
    expect(changes).toEqual({ failing: ["A"], fixed: ["B"], stillFailing: ["C"], added: ["D"], gone: ["QA-9"], other: [], skippedNow: [] });
    expect(results.map((r) => r.before)).toEqual(["PASSED", "FAILED", "FAILED", undefined]);
    expect(executionChanges(now, undefined).changes).toEqual({ failing: [], fixed: [], stillFailing: [], added: [], gone: [], other: [], skippedNow: [] });
    // Before neither passed nor failed: said as it was; a case skipped now isn't "not run".
    const odd = executionChanges(now.slice(0, 1), { key: "QA-80", created: "", statuses: { "QA-1": "TODO", "QA-7": "PASSED", "QA-8": "PASSED" } }, ["QA-7"]).changes;
    expect(odd).toMatchObject({ failing: [], other: ["A (was TODO)"], skippedNow: ["QA-7"], gone: ["QA-8"] });
  });
});

describe("Xray Test Executions (S3-9): data access and run-tests", () => {
  let dir: string;
  let runs: RunStore;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-xexec-"));
    runs = new RunStore(join(dir, "runs"));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const config = (writes: Record<string, string> = {}) =>
    configSchema.parse({ version: 1, atlassian: { site: "https://acme.atlassian.net", email: "${env:E}", token: "${env:T}" }, xray: { clientId: "i", clientSecret: "${env:S}", projectKey: "QA" }, policy: { writes: { xray: "allow", confluence: "ask", testCode: "ask", jira: "deny", commands: "ask", ...writes } } });

  it("plans from the labels and the last execution, and records through the policy", async () => {
    const recorded: XrayExecutionInput[] = [];
    const lastCalls: Array<[string, string, string | undefined]> = [];
    const own: { mine?: { key: string; created: string; statuses: Record<string, string> } } = {};
    const audit = new MemoryAuditSink();
    const data = new DataAccess({
      root: dir,
      store: runs,
      config: config(),
      audit,
      labels: { findByLabels: async (_p, labels) => new Map(labels.filter((l) => l !== "agent-qa:TC-ABC-1-009").map((l, i) => [l, `QA-${i + 1}`])) },
      xray: {
        importAndWait: async () => {
          throw new Error("not used");
        },
        lastExecution: async (project, label, without) => {
          lastCalls.push([project, label, without]);
          if (label.startsWith("agent-qa:run:")) return own.mine;
          return { key: "QA-80", created: "2026-11-06T09:00:00.000+0000", statuses: { "QA-1": "PASSED" } };
        },
        importExecution: async (input) => {
          recorded.push(input);
          return { key: "QA-91" };
        },
      },
    });
    const plan = await data.xrayExecutionPlan([row("TC-ABC-1-001 a", "failed"), row("TC-ABC-1-002 b", "passed"), row("TC-ABC-1-009 c", "passed")], "agent-qa:exec:abc", "agent-qa:run:r1");
    expect(lastCalls[0]).toEqual(["QA", "agent-qa:exec:abc", "agent-qa:run:r1"]);
    expect(plan).toMatchObject({ project: "QA", label: "agent-qa:exec:abc", previous: { key: "QA-80" }, notInXray: ["TC-ABC-1-009 c"], changes: { failing: ["TC-ABC-1-001"], added: ["TC-ABC-1-002"] } });
    const info = { summary: "s", description: "d", startedAt: new Date(0), finishedAt: new Date(1000) };
    expect(await data.recordXrayExecution("r1", plan, "agent-qa:run:r1", info, false)).toEqual({ status: "declined" });
    expect(recorded).toEqual([]);
    expect(await data.recordXrayExecution("r1", plan, "agent-qa:run:r1", info, true)).toEqual({ status: "done", key: "QA-91" });
    expect(recorded[0]).toMatchObject({ project: "QA", labels: ["agent-qa", "agent-qa:exec:abc", "agent-qa:run:r1"], tests: [{ testKey: "QA-1", status: "FAILED" }, { testKey: "QA-2", status: "PASSED" }] });
    // A retry after a stop finds the run's own execution and records nothing again.
    own.mine = { key: "QA-91", created: "", statuses: {} };
    expect(await data.recordXrayExecution("r1", plan, "agent-qa:run:r1", info, true)).toEqual({ status: "done", key: "QA-91", again: true });
    expect(recorded).toHaveLength(1);
    expect([...new Set(audit.entries.map((e) => e.summary))]).toEqual(["Record 2 test result(s) (1 failed) as a Test Execution in Xray project QA"]);
  });

  /** run-tests with fake data: the run step records a run, then the xray step. */
  const engineWith = (over: Partial<RunTestsDeps["data"]> = {}) => {
    const plans: string[] = [];
    const records: XrayExecutionPlan[] = [];
    const data = {
      savedProfile: async () => ({ folder: "." }),
      maskTexts: async (_r: string, t: string[]) => t,
      selectTests: async () => ({ command: ["npx", "playwright", "test"], args: ["--reporter=json"] }),
      testRunReadiness: async () => ({ ready: true }),
      runTests: async () => ({ status: "done", exitCode: 1, timedOut: false, durationMs: 60_000, errors: [], tests: [row("TC-ABC-1-001 a", "failed", { failure: { message: "Error: boom" } }), row("TC-ABC-1-002 b", "passed"), row("other", "skipped")] }),
      xrayEnabled: async () => true,
      xrayExecutionPlan: async (rows: readonly ExecutionRow[], label: string): Promise<XrayExecutionPlan> => {
        plans.push(label);
        const { results, notInXray, skipped, skippedKeys } = executionResults(rows, new Map([["TC-ABC-1-001", "QA-1"], ["TC-ABC-1-002", "QA-2"]]));
        const c = executionChanges(results, { key: "QA-80", created: "2026-11-06T09:00:00.000+0000", statuses: { "QA-1": "PASSED", "QA-2": "PASSED" } }, skippedKeys);
        return { project: "QA", label, previous: { key: "QA-80", created: "2026-11-06T09:00:00.000+0000" }, results: c.results, notInXray, skipped, changes: c.changes };
      },
      recordXrayExecution: async (_r: string, p: XrayExecutionPlan) => {
        records.push(p);
        return { status: "done" as const, key: "QA-91" };
      },
      ...over,
    } as unknown as RunTestsDeps["data"];
    const e = new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId }).register(runTestsWorkflow({ data, runs }));
    return { e, plans, records };
  };

  it("asks to record the results, shows what changed, and records a new Test Execution on a yes", async () => {
    const { e, plans, records } = engineWith();
    const first = await e.start("run-tests", { tag: "@smoke" });
    const next = (await e.submit(first.runId, "run", { run: true }, { byPerson: true })).next;
    expect(next.stepId).toBe("xray");
    expect(next.context).toContain("Since QA-80 (2026-11-06):");
    expect(next.context).toContain("- now failing: TC-ABC-1-001");
    expect(next.context).toContain("TC-ABC-1-001 | QA-1 | FAILED (was PASSED)");
    expect((await e.approval(first.runId, "xray"))!.question).toMatch(/^Record 2 result\(s\) \(1 failed\) in Xray project QA as a new Test Execution\?/);
    expect((await e.submit(first.runId, "xray", { record: true })).next.kind).toBe("done");
    expect(records).toHaveLength(1);
    const x = (await runs.readArtifact(first.runId, XRAY_EXECUTION_ARTIFACT))!.data;
    expect(x).toMatchObject({ status: "recorded", key: "QA-91", previous: { key: "QA-80" }, skipped: 1, changes: { failing: ["TC-ABC-1-001"] } });
    expect((await runs.readArtifact(first.runId, TEST_RUN_ARTIFACT))!.data.startedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    // The same selection gives the same label, and its text never shows in it.
    const again = await e.start("run-tests", { tag: "@smoke" });
    await e.submit(again.runId, "run", { run: true }, { byPerson: true });
    expect(new Set(plans).size).toBe(1);
    expect(plans[0]).toMatch(/^agent-qa:exec:[0-9a-f]{12}$/);
    expect((await e.submit(again.runId, "xray", { record: false })).next.kind).toBe("done");
    expect((await runs.readArtifact(again.runId, XRAY_EXECUTION_ARTIFACT))!.data.status).toBe("declined");
    expect(records).toHaveLength(1);
  });

  it("skips the step without Xray, and records nothing when no test has a case in Xray", async () => {
    const off = engineWith({ xrayEnabled: async () => false });
    const a = await off.e.start("run-tests", { tag: "@smoke" });
    expect((await off.e.submit(a.runId, "run", { run: true }, { byPerson: true })).next.kind).toBe("done");
    const none = engineWith({
      xrayExecutionPlan: async (rows: readonly ExecutionRow[], label: string) => ({ project: "QA", label, results: [], notInXray: rows.map((r) => r.title), skipped: 0, changes: { failing: [], fixed: [], stillFailing: [], added: [], gone: [], other: [], skippedNow: [] } }),
    });
    const b = await none.e.start("run-tests", { tag: "@smoke" });
    await none.e.submit(b.runId, "run", { run: true }, { byPerson: true });
    expect((await none.e.approval(b.runId, "xray"))!.question).toMatch(/nothing can be recorded/);
    await none.e.submit(b.runId, "xray", { record: true });
    expect((await runs.readArtifact(b.runId, XRAY_EXECUTION_ARTIFACT))!.data.status).toBe("nothing");
    expect(none.records).toEqual([]);
  });

  it("never stops on Xray being down: a no reads nothing, a yes records nothing and says why (review B1)", async () => {
    const down = engineWith({
      xrayExecutionPlan: async () => {
        throw new Error("Xray 503");
      },
    });
    const a = await down.e.start("run-tests", { tag: "@smoke" });
    const next = (await down.e.submit(a.runId, "run", { run: true }, { byPerson: true })).next;
    expect(next.stepId).toBe("xray");
    expect(next.context).toContain("Xray couldn't be read: Xray 503.");
    expect((await down.e.approval(a.runId, "xray"))!.question).toMatch(/^Xray couldn't be read \(Xray 503\), so nothing will be recorded/);
    expect((await down.e.submit(a.runId, "xray", { record: true })).next.kind).toBe("done");
    expect((await runs.readArtifact(a.runId, XRAY_EXECUTION_ARTIFACT))!.data).toMatchObject({ status: "unavailable", reason: "Xray 503" });
    const b = await down.e.start("run-tests", { tag: "@smoke" });
    await down.e.submit(b.runId, "run", { run: true }, { byPerson: true });
    expect((await down.e.submit(b.runId, "xray", { record: false })).next.kind).toBe("done");
    expect((await runs.readArtifact(b.runId, XRAY_EXECUTION_ARTIFACT))!.data.status).toBe("declined");
    expect(down.records).toEqual([]);
  });
});
