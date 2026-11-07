import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FetchLike } from "../src/connectors/http.js";
import { XrayClient, type XrayExecutionInput } from "../src/connectors/xray.js";
import { configSchema, MemoryAuditSink, Policy, RunStore, WorkflowEngine, type WriteGrant } from "../src/core/index.js";
import { MemoryVaultStorage, Vault } from "../src/masking/index.js";
import { DataAccess, executionChanges, executionResults, tcIdOf, type ExecutionRow, type PreviousExecution, type XrayExecutionPlan } from "../src/data/index.js";
import { runTestsWorkflow, TEST_RUN_ARTIFACT, XRAY_EXECUTION_ARTIFACT, type RunTestsDeps } from "../src/workflows/index.js";

const ok = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });

async function withGrant<T>(fn: (g: WriteGrant) => Promise<T>): Promise<T> {
  const policy = new Policy({ rules: { xray: "allow", confluence: "ask", testCode: "ask", jira: "deny", commands: "ask" }, mode: "ide", audit: new MemoryAuditSink() });
  const r = await policy.guard({ target: "xray", summary: "test" }, fn);
  if (r.status !== "done") throw new Error("declined");
  return r.value;
}

const row = (title: string, outcome: ExecutionRow["outcome"], over: Partial<ExecutionRow> = {}): ExecutionRow => ({ title, tags: [], file: "tests/a.spec.ts", line: 3, outcome, runs: 1, failedRuns: outcome === "failed" ? 1 : 0, ...over });

const INPUT: XrayExecutionInput = { project: "QA", summary: "Agent-QA run r1", description: "d", labels: ["agent-qa", "agent-qa:exec:abc"], startedAt: new Date("2026-11-07T10:00:00Z"), finishedAt: new Date("2026-11-07T10:01:00Z"), tests: [{ testKey: "QA-1", status: "FAILED", comment: "Failed in a.spec.ts:3", start: new Date("2026-11-07T10:00:05.250Z"), finish: new Date("2026-11-07T10:00:40Z"), evidence: [{ data: "iVBO", filename: "TC-ABC-1-001.png", contentType: "image/png" }] }] };

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
    // Dates as Xray's examples write them: seconds and an offset, no milliseconds; each test with its own.
    expect(json("results")).toEqual({
      info: { summary: "Agent-QA run r1", description: "d", startDate: "2026-11-07T10:00:00+00:00", finishDate: "2026-11-07T10:01:00+00:00" },
      tests: [{ testKey: "QA-1", start: "2026-11-07T10:00:05+00:00", finish: "2026-11-07T10:00:40+00:00", status: "FAILED", comment: "Failed in a.spec.ts:3", evidence: [{ data: "iVBO", filename: "TC-ABC-1-001.png", contentType: "image/png" }] }],
    });
    expect(json("info")).toEqual({ fields: { project: { key: "QA" }, summary: "Agent-QA run r1", description: "d", issuetype: { name: "Test Execution" }, labels: ["agent-qa", "agent-qa:exec:abc"] } });
    await expect(withGrant((g) => client.importExecution({ ...INPUT, tests: [{ testKey: "not a key", status: "PASSED" }] }, g))).rejects.toThrow(/Not an Xray test key/);
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
        row("TC-ABC-1-001 a [chromium]", "passed", { startedAt: "2026-11-07T10:00:00.000Z", durationMs: 4000 }),
        row("TC-ABC-1-001 a [firefox]", "failed", {
          startedAt: "2026-11-07T10:00:02.000Z",
          durationMs: 9000,
          failure: { message: "\n  Error: expect(locator).toHaveText(expected)\n  Expected: x", at: { file: "tests/pages/case.ts", line: 40 }, snippet: "> 40 |   await expect(this.status).toHaveText(v);" },
        }),
        row("TC-ABC-1-002 b", "flaky", { runs: 2, failedRuns: 1 }),
        row("TC-ABC-1-003 c", "skipped"),
        row("TC-ABC-1-009 not pushed", "passed"),
        row("no case at all", "failed"),
      ],
      keys,
    );
    expect(r.results).toEqual([
      {
        tcId: "TC-ABC-1-001",
        xrayKey: "QA-1",
        status: "FAILED",
        comment: "Failed at tests/pages/case.ts:40 (test tests/a.spec.ts:3).\n\nError: expect(locator).toHaveText(expected)\n  Expected: x\n\n> 40 |   await expect(this.status).toHaveText(v);",
        // Both projects' runs: from the first start to the last end.
        start: "2026-11-07T10:00:00.000Z",
        finish: "2026-11-07T10:00:11.000Z",
      },
      { tcId: "TC-ABC-1-002", xrayKey: "QA-2", status: "PASSED", comment: "Flaky: failed 1 of 2 run(s), passed on a retry (tests/a.spec.ts:3)." },
    ]);
    expect(r.notInXray).toEqual(["TC-ABC-1-009 not pushed (TC-ABC-1-009: no Xray test labelled agent-qa:TC-ABC-1-009; push its case with test-cases first)", "no case at all (no TC id in its title or tags)"]);
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
    const { results, changes } = executionChanges(now, { project: "QA", key: "QA-80", created: "", statuses: { "QA-1": "PASSED", "QA-2": "FAILED", "QA-3": "FAILED", "QA-9": "PASSED" } });
    expect(changes).toEqual({ failing: ["A"], fixed: ["B"], stillFailing: ["C"], added: ["D"], gone: ["QA-9"], other: [], skippedNow: [] });
    expect(results.map((r) => r.before)).toEqual(["PASSED", "FAILED", "FAILED", undefined]);
    expect(executionChanges(now, undefined).changes).toEqual({ failing: [], fixed: [], stillFailing: [], added: [], gone: [], other: [], skippedNow: [] });
    // Before neither passed nor failed: said as it was; a case skipped now isn't "not run".
    const odd = executionChanges(now.slice(0, 1), { project: "QA", key: "QA-80", created: "", statuses: { "QA-1": "TODO", "QA-7": "PASSED", "QA-8": "PASSED" } }, ["QA-7"]).changes;
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

  const config = (writes: Record<string, string> = {}, xray: Record<string, unknown> = {}) =>
    configSchema.parse({ version: 1, atlassian: { site: "https://acme.atlassian.net", email: "${env:E}", token: "${env:T}" }, xray: { clientId: "i", clientSecret: "${env:S}", projectKey: "QA", ...xray }, policy: { writes: { xray: "allow", confluence: "ask", testCode: "ask", jira: "deny", commands: "ask", ...writes } } });

  it("plans from the labels and the last execution passed in, and records through the policy", async () => {
    const recorded: XrayExecutionInput[] = [];
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
        importExecution: async (input) => {
          recorded.push(input);
          return { key: "QA-91" };
        },
      },
    });
    const rows = [row("TC-ABC-1-001 a", "failed"), row("TC-ABC-1-002 b", "passed"), row("TC-ABC-1-009 c", "passed")];
    const previous = { project: "QA", key: "QA-80", created: "2026-11-06T09:00:00.000Z", statuses: { "QA-1": "PASSED" } };
    const plan = await data.xrayExecutionPlan(rows, "agent-qa:exec:abc", [{ ...previous, project: "OLD", key: "OLD-5" }, previous]);
    expect(plan).toMatchObject({ project: "QA", label: "agent-qa:exec:abc", previous: { key: "QA-80", created: "2026-11-06T09:00:00.000Z" }, notInXray: ["TC-ABC-1-009 c (TC-ABC-1-009: no Xray test labelled agent-qa:TC-ABC-1-009; push its case with test-cases first)"], changes: { failing: ["TC-ABC-1-001"], added: ["TC-ABC-1-002"] } });
    // Only another project's execution (the config changed since) is no comparison.
    const other = await data.xrayExecutionPlan(rows, "agent-qa:exec:abc", [{ ...previous, project: "OLD" }]);
    expect(other.previous).toBeUndefined();
    expect(other.changes).toMatchObject({ failing: [], added: [] });
    expect((await data.xrayExecutionPlan(rows, "agent-qa:exec:abc", [])).previous).toBeUndefined();
    const info = { summary: "s", description: "d", startedAt: new Date(0), finishedAt: new Date(1000) };
    expect(await data.recordXrayExecution("r1", plan, "agent-qa:run:r1", info, false)).toEqual({ status: "declined" });
    expect(recorded).toEqual([]);
    expect(await data.recordXrayExecution("r1", plan, "agent-qa:run:r1", info, true)).toEqual({ status: "done", key: "QA-91" });
    expect(recorded[0]).toMatchObject({ project: "QA", labels: ["agent-qa", "agent-qa:exec:abc", "agent-qa:run:r1"], tests: [{ testKey: "QA-1", status: "FAILED" }, { testKey: "QA-2", status: "PASSED" }] });
    expect([...new Set(audit.entries.map((e) => e.summary))]).toEqual(["Record 2 test result(s) (1 failed) as a Test Execution in Xray project QA"]);
  });

  it("attaches failure screenshots only with xray.attachScreenshots, from the profile's folder (Tarek, 7 Nov 2026)", async () => {
    await writeFile(join(dir, "agent-qa.profile.json"), JSON.stringify({ version: 1, folder: ".", kind: "playwright", commands: { test: ["npx", "playwright", "test"] }, reviewedAt: "2026-11-05T00:00:00.000Z" }));
    await mkdir(join(dir, "test-results", "a-chromium"), { recursive: true });
    await writeFile(join(dir, "test-results", "a-chromium", "test-failed-1.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(join(dir, "secret.png"), Buffer.from([1]));
    // A link out of the folder is never followed.
    await symlink(join(dir, "secret.png"), join(dir, "test-results", "link.png")).catch(() => undefined);
    const handle = (path: string, folder = "test-results") => `${folder}#${createHash("sha256").update(path).digest("hex").slice(0, 32)}`;
    const recorded: XrayExecutionInput[] = [];
    const audit = new MemoryAuditSink();
    const key = Buffer.alloc(32, 3);
    const make = (attach: boolean) =>
      new DataAccess({
        root: dir,
        store: runs,
        config: config({}, attach ? { attachScreenshots: true } : {}),
        audit,
        vault: new Vault({ storage: new MemoryVaultStorage(), keys: { description: "t", getKey: async () => key } }),
        labels: { findByLabels: async (_p, labels) => new Map(labels.map((l, i) => [l, `QA-${i + 1}`])) },
        xray: {
          importAndWait: async () => {
            throw new Error("not used");
          },
          importExecution: async (input) => {
            recorded.push(input);
            return { key: "QA-91" };
          },
        },
      });
    const rows = [
      row("TC-ABC-1-001 a", "failed", { failure: { message: "boom", screenshot: handle("a-chromium/test-failed-1.png") } }),
      row("TC-ABC-1-002 b", "failed", { failure: { message: "boom", screenshot: handle("x.png", "..") } }),
      row("TC-ABC-1-003 c", "flaky", { runs: 2, failedRuns: 1, failure: { message: "boom", screenshot: handle("a-chromium/test-failed-1.png") } }),
      row("TC-ABC-1-004 d", "failed", { failure: { message: "boom", screenshot: handle("link.png") } }),
    ];
    const info = { summary: "s", description: "d", startedAt: new Date(0), finishedAt: new Date(1000) };
    const off = make(false);
    await off.recordXrayExecution("r1", await off.xrayExecutionPlan(rows, "agent-qa:exec:abc", []), "agent-qa:run:r1", info, true);
    expect(recorded[0]!.tests.every((t) => t.evidence === undefined)).toBe(true);
    const on = make(true);
    const plan = await on.xrayExecutionPlan(rows, "agent-qa:exec:abc", []);
    // A flaky (passed) case sends none; the count is what the question names.
    expect(plan.results.map((x) => x.screenshot !== undefined)).toEqual([true, true, false, true]);
    expect(plan.screenshots).toBe(3);
    expect((await off.xrayExecutionPlan(rows, "agent-qa:exec:abc", [])).screenshots).toBeUndefined();
    // A plan made with the setting off (the question named no screenshots) sends none, even once it is on.
    await on.recordXrayExecution("r1", await off.xrayExecutionPlan(rows, "agent-qa:exec:abc", []), "agent-qa:run:r1", info, true);
    expect(recorded.at(-1)!.tests.every((t) => t.evidence === undefined)).toBe(true);
    recorded.splice(1);
    await on.recordXrayExecution("r1", plan, "agent-qa:run:r1", info, true);
    // Only the file in the output folder: a folder outside it, or a link out, is never read.
    expect(recorded[1]!.tests.map((t) => t.evidence)).toEqual([[{ data: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"), filename: "TC-ABC-1-001.png", contentType: "image/png" }], undefined, undefined, undefined]);
    expect(audit.entries.at(-1)!.summary).toBe("Record 4 test result(s) (3 failed, 1 unmasked screenshot(s)) as a Test Execution in Xray project QA");
  });

  /** run-tests with fake data: the run step records a run, then the xray step. */
  const engineWith = (over: Partial<RunTestsDeps["data"]> = {}) => {
    const plans: string[] = [];
    const records: XrayExecutionPlan[] = [];
    const previouses: Array<PreviousExecution | undefined> = [];
    const data = {
      savedProfile: async () => ({ folder: "." }),
      maskTexts: async (_r: string, t: string[]) => t,
      selectTests: async () => ({ command: ["npx", "playwright", "test"], args: ["--reporter=json"] }),
      testRunReadiness: async () => ({ ready: true }),
      runTests: async () => ({ status: "done", exitCode: 1, timedOut: false, durationMs: 60_000, errors: [], tests: [row("TC-ABC-1-001 a", "failed", { failure: { message: "Error: boom" } }), row("TC-ABC-1-002 b", "passed"), row("other", "skipped")] }),
      xrayEnabled: async () => true,
      xrayExecutionPlan: async (rows: readonly ExecutionRow[], label: string, candidates: readonly PreviousExecution[]): Promise<XrayExecutionPlan> => {
        plans.push(label);
        const previous = candidates.find((c) => c.project === "QA");
        previouses.push(previous);
        const { results, notInXray, skipped, skippedKeys } = executionResults(rows, new Map([["TC-ABC-1-001", "QA-1"], ["TC-ABC-1-002", "QA-2"]]));
        const c = executionChanges(results, previous, skippedKeys);
        return { project: "QA", label, ...(previous ? { previous: { key: previous.key, created: previous.created } } : {}), results: c.results, notInXray, skipped, changes: c.changes };
      },
      recordXrayExecution: async (_r: string, p: XrayExecutionPlan) => {
        records.push(p);
        return { status: "done" as const, key: `QA-${90 + records.length}` };
      },
      ...over,
    } as unknown as RunTestsDeps["data"];
    const e = new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId }).register(runTestsWorkflow({ data, runs }));
    return { e, plans, records, previouses };
  };

  it("asks to record the results, records a new Test Execution on a yes, and compares the next run with it from the run folder", async () => {
    const { e, plans, records, previouses } = engineWith();
    const first = await e.start("run-tests", { tag: "@smoke" });
    const next = (await e.submit(first.runId, "run", { run: true }, { byPerson: true })).next;
    expect(next.stepId).toBe("xray");
    expect(previouses[0]).toBeUndefined();
    expect(next.context).not.toContain("Since ");
    expect(next.context).toContain("TC-ABC-1-001 | QA-1 | FAILED");
    expect((await e.approval(first.runId, "xray"))!.question).toMatch(/^Record 2 result\(s\) \(1 failed\) in Xray project QA as a new Test Execution\?/);
    expect((await e.submit(first.runId, "xray", { record: true })).next.kind).toBe("done");
    expect(records).toHaveLength(1);
    const firstRecord = (await runs.readArtifact(first.runId, XRAY_EXECUTION_ARTIFACT))!;
    expect(firstRecord.data).toMatchObject({ status: "recorded", key: "QA-91", skipped: 1 });
    expect(firstRecord.data.previous).toBeUndefined();
    expect((await runs.readArtifact(first.runId, TEST_RUN_ARTIFACT))!.data.startedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    // The same selection gives the same label, and the last recorded run of it is the comparison.
    const again = await e.start("run-tests", { tag: "@smoke" });
    const second = (await e.submit(again.runId, "run", { run: true }, { byPerson: true })).next;
    expect(new Set(plans).size).toBe(1);
    expect(plans[0]).toMatch(/^agent-qa:exec:[0-9a-f]{12}$/);
    expect(previouses.at(-1)).toEqual({ project: "QA", key: "QA-91", created: firstRecord.createdAt, statuses: { "QA-1": "FAILED", "QA-2": "PASSED" } });
    expect(second.context).toContain(`Since QA-91 (${firstRecord.createdAt.slice(0, 10)}):`);
    expect(second.context).toContain("TC-ABC-1-001 | QA-1 | FAILED (was FAILED)");
    expect((await e.submit(again.runId, "xray", { record: true })).next.kind).toBe("done");
    expect((await runs.readArtifact(again.runId, XRAY_EXECUTION_ARTIFACT))!.data).toMatchObject({ status: "recorded", key: "QA-92", previous: { key: "QA-91" }, changes: { stillFailing: ["TC-ABC-1-001"] } });
    // A third run compares with the newest (QA-92); a declined one is never a comparison.
    const third = await e.start("run-tests", { tag: "@smoke" });
    await e.submit(third.runId, "run", { run: true }, { byPerson: true });
    expect(previouses.at(-1)?.key).toBe("QA-92");
    expect((await e.submit(third.runId, "xray", { record: false })).next.kind).toBe("done");
    expect((await runs.readArtifact(third.runId, XRAY_EXECUTION_ARTIFACT))!.data.status).toBe("declined");
    const fourth = await e.start("run-tests", { tag: "@smoke" });
    await e.submit(fourth.runId, "run", { run: true }, { byPerson: true });
    expect(previouses.at(-1)?.key).toBe("QA-92");
    // Another selection has its own label and no comparison yet.
    const other = await e.start("run-tests", { tag: "@regression" });
    await e.submit(other.runId, "run", { run: true }, { byPerson: true });
    expect(previouses.at(-1)).toBeUndefined();
    expect(records).toHaveLength(2);
  });

  it("compares with the newest run recorded in the configured project, even when another project's is newer (review)", async () => {
    const { e, plans, previouses } = engineWith();
    const first = await e.start("run-tests", { tag: "@smoke" });
    await e.submit(first.runId, "run", { run: true }, { byPerson: true });
    const label = plans[0]!;
    const none = { notInXray: [], skipped: 0, changes: { failing: [], fixed: [], stillFailing: [], added: [], gone: [], other: [], skippedNow: [] } };
    const older = (await runs.create({ workflow: "run-tests", context: "old", host: "cli", driver: "api" })).id;
    await runs.writeArtifact(older, XRAY_EXECUTION_ARTIFACT, { status: "recorded", key: "QA-70", project: "QA", label, results: [{ tcId: "TC-ABC-1-001", xrayKey: "QA-1", status: "PASSED" }], ...none }, { inputs: [], templateVersion: "xray-execution-1" });
    await new Promise((r) => setTimeout(r, 5));
    const newer = (await runs.create({ workflow: "run-tests", context: "other", host: "cli", driver: "api" })).id;
    await runs.writeArtifact(newer, XRAY_EXECUTION_ARTIFACT, { status: "recorded", key: "OTHER-5", project: "OTHER", label, results: [], ...none }, { inputs: [], templateVersion: "xray-execution-1" });
    const again = await e.start("run-tests", { tag: "@smoke" });
    const next = (await e.submit(again.runId, "run", { run: true }, { byPerson: true })).next;
    expect(previouses.at(-1)?.key).toBe("QA-70");
    expect(next.context).toContain("Since QA-70");
  });

  it("never sends twice: an import that fails, or a run stopped while recording, is uncertain and isn't sent again", async () => {
    const failing = engineWith({
      recordXrayExecution: async () => {
        throw new Error("socket hang up");
      },
    });
    const a = await failing.e.start("run-tests", { tag: "@smoke" });
    await failing.e.submit(a.runId, "run", { run: true }, { byPerson: true });
    expect((await failing.e.submit(a.runId, "xray", { record: true })).next.kind).toBe("done");
    const x = (await runs.readArtifact(a.runId, XRAY_EXECUTION_ARTIFACT))!.data;
    expect(x.status).toBe("uncertain");
    expect(x.reason).toMatch(/^the import failed \(socket hang up\): it may or may not be in Xray, so it isn't sent again\. Look in Xray project QA for a Test Execution labelled agent-qa:run:[0-9a-f]{16}\.$/);
    // An uncertain run is never a comparison.
    const b = await failing.e.start("run-tests", { tag: "@smoke" });
    await failing.e.submit(b.runId, "run", { run: true }, { byPerson: true });
    expect(failing.previouses.at(-1)).toBeUndefined();

    // A stop halfway: the recording record is kept, and the step run again sends nothing.
    const { e, records } = engineWith();
    const c = await e.start("run-tests", { tag: "@smoke" });
    await e.submit(c.runId, "run", { run: true }, { byPerson: true });
    await runs.writeArtifact(c.runId, XRAY_EXECUTION_ARTIFACT, { status: "recording", project: "QA", label: "agent-qa:exec:x", results: [], notInXray: [], skipped: 0, changes: { failing: [], fixed: [], stillFailing: [], added: [], gone: [], other: [], skippedNow: [] } }, { inputs: [], templateVersion: "xray-execution-1" });
    expect((await e.submit(c.runId, "xray", { record: true })).next.kind).toBe("done");
    expect(records).toEqual([]);
    const y = (await runs.readArtifact(c.runId, XRAY_EXECUTION_ARTIFACT))!.data;
    expect(y.status).toBe("uncertain");
    expect(y.reason).toMatch(/^the run stopped while recording: it may or may not be in Xray/);
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

  it("never stops on Jira being down: a no reads nothing, a yes records nothing and says why (review B1)", async () => {
    const down = engineWith({
      xrayExecutionPlan: async () => {
        throw new Error("Xray 503");
      },
    });
    const a = await down.e.start("run-tests", { tag: "@smoke" });
    const next = (await down.e.submit(a.runId, "run", { run: true }, { byPerson: true })).next;
    expect(next.stepId).toBe("xray");
    expect(next.context).toContain("Jira couldn't be read to find the tests in Xray: Xray 503.");
    expect((await down.e.approval(a.runId, "xray"))!.question).toMatch(/^Jira couldn't be read to find the tests in Xray \(Xray 503\), so nothing will be recorded/);
    expect((await down.e.submit(a.runId, "xray", { record: true })).next.kind).toBe("done");
    expect((await runs.readArtifact(a.runId, XRAY_EXECUTION_ARTIFACT))!.data).toMatchObject({ status: "unavailable", reason: "Xray 503" });
    const b = await down.e.start("run-tests", { tag: "@smoke" });
    await down.e.submit(b.runId, "run", { run: true }, { byPerson: true });
    expect((await down.e.submit(b.runId, "xray", { record: false })).next.kind).toBe("done");
    expect((await runs.readArtifact(b.runId, XRAY_EXECUTION_ARTIFACT))!.data.status).toBe("declined");
    expect(down.records).toEqual([]);
  });
});
