import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JiraCollection, JiraInput, JiraIssue } from "../src/connectors/index.js";
import { configSchema, MemoryAuditSink, RunStore, WorkflowEngine } from "../src/core/index.js";
import type { AgentTest, XrayTest } from "../src/connectors/index.js";
import { DataAccess } from "../src/data/index.js";
import { MemoryVaultStorage, Vault } from "../src/masking/index.js";
import { requirementsWorkflow, TEST_CASES_ARTIFACT, TEST_CASES_DRAFT_ARTIFACT, testCasesWorkflow, XRAY_PUSH_ARTIFACT, type TestCase } from "../src/workflows/index.js";
import { sameCheck } from "../src/workflows/test-cases/workflow.js";

const SITE = "https://acme.atlassian.net";
const adf = (text: string) => ({ text, mentions: [], links: [] });

function issue(over: Partial<JiraIssue> & { key: string }): JiraIssue {
  return {
    id: "1",
    type: "Story",
    subtask: false,
    summary: "",
    description: adf(""),
    extraFields: {},
    labels: [],
    components: [],
    fixVersions: [],
    children: [],
    links: [],
    remoteLinks: [],
    people: [],
    updated: "2026-11-01T10:00:00.000+0000",
    role: "root",
    depth: 0,
    ...over,
  };
}

const ISSUES = [
  issue({
    key: "ABC-1",
    type: "Story",
    summary: "Escalate old cases for Marguerite Quillfeather",
    description: adf("Escalate cases older than 2 days.\n\nAcceptance criteria:\n- A case older than 2 days is escalated\n- The owner is notified"),
    children: ["ABC-2"],
    people: [{ role: "reporter", displayName: "Marguerite Quillfeather", accountId: "a1" }],
  }),
  issue({
    key: "ABC-2",
    type: "Sub-task",
    parent: "ABC-1",
    role: "child",
    depth: 1,
    summary: "Email the owner",
    description: adf("Send Marguerite Quillfeather an email at mq@example.com when a case is escalated."),
  }),
];
const SECRETS = ["Marguerite", "Quillfeather", "mq@example.com"];

class FakeJira {
  inputs: JiraInput[] = [];
  fail = false;
  async collect(input: JiraInput): Promise<JiraCollection> {
    if (this.fail) throw new Error("Jira is down");
    this.inputs.push(input);
    return { input, issues: structuredClone(issues), truncated: false, unreachable: [], extraFields: [] };
  }
}

let dir: string;
let runs: RunStore;
let jira: FakeJira;
let issues: JiraIssue[];
let engine: WorkflowEngine;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agent-qa-req-"));
  runs = new RunStore(join(dir, "runs"));
  jira = new FakeJira();
  issues = ISSUES;
  const key = randomBytes(32);
  const config = configSchema.parse({ version: 1, atlassian: { site: SITE, email: "${env:E}", token: "${env:T}" } });
  const data = new DataAccess({
    root: dir,
    store: runs,
    config,
    vault: new Vault({ storage: new MemoryVaultStorage(), keys: { description: "t", getKey: async () => key } }),
    jira,
    confluence: { pages: async () => ({ pages: [], skipped: [] }) },
  });
  engine = new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId }).register(requirementsWorkflow({ data, runs })).register(testCasesWorkflow({ data, runs }));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const good = {
  issues: [
    { key: "ABC-1", quality: { score: 72, missing: ["error-handling"] }, openQuestions: ["Who is the owner when <PERSON_1> is away?"], inferredCriteria: [] },
    { key: "ABC-2", quality: { score: 45, missing: ["acceptance-criteria"] }, openQuestions: [], inferredCriteria: ["The owner gets an email when a case is escalated"] },
  ],
};


const tc = (key: string, n: number, covers: string[], over: Partial<TestCase> = {}): TestCase => ({
  id: `TC-${key}-${String(n).padStart(3, "0")}`,
  requirement: key,
  title: `Case ${n} for ${key}`,
  type: "positive",
  priority: "P2",
  preconditions: [],
  steps: [{ action: "Open the case", data: "", expected: "The case is shown" }],
  covers,
  ...over,
});
const cases = {
  cases: [
    tc("ABC-1", 1, ["AC1"], { title: "Old case escalated for <PERSON_1>", priority: "P1" }),
    tc("ABC-1", 2, ["AC2"]),
    tc("ABC-1", 3, ["AC1"], { type: "negative" }),
    tc("ABC-2", 1, ["AC1"]),
  ],
};

describe("test-cases workflow", () => {
  it("analyzes, writes cases, and records the review in test-cases@1", async () => {
    const first = await engine.start("test-cases", { key: "ABC-1" });
    expect(first.stepId).toBe("analyze");
    const afterAnalyze = await engine.submit(first.runId, "analyze", good);
    expect(afterAnalyze.next).toMatchObject({ stepId: "cases", kind: "generate" });
    expect(afterAnalyze.next.context).toContain("AC1: The owner gets an email when a case is escalated");
    expect(afterAnalyze.next.instructions).toContain("TC-{KEY}-001");

    const afterCases = await engine.submit(first.runId, "cases", cases);
    expect(afterCases.next).toMatchObject({ stepId: "review", kind: "confirm" });
    expect(afterCases.next.context).toContain("TC-ABC-1-001 | P1 | positive | covers AC1 | Old case escalated for <PERSON_1>");
    const draft = await runs.readArtifact(first.runId, TEST_CASES_DRAFT_ARTIFACT);
    expect(draft!.data.cases).toHaveLength(4);
    expect(await readFile(join(dir, "runs", first.runId, "test-cases-draft.md"), "utf8")).toContain("### TC-ABC-2-001: Case 1 for ABC-2");

    const review = {
      approved: true,
      changes: [
        { id: "TC-ABC-1-003", decision: "dropped" },
        { id: "TC-ABC-1-002", decision: "edited", case: tc("ABC-1", 2, ["AC2"], { title: "Owner is notified by email" }) },
      ],
    };
    const done = await engine.submit(first.runId, "review", review);
    expect(done.next.kind).toBe("done");
    const final = (await runs.readArtifact(first.runId, TEST_CASES_ARTIFACT))!;
    expect(final.data.review).toEqual({ generated: 4, kept: 2, edited: 1, dropped: 1, keptRate: 0.5 });
    expect(final.data.cases.map((c) => [c.id, c.review])).toEqual([
      ["TC-ABC-1-001", "kept"],
      ["TC-ABC-1-002", "edited"],
      ["TC-ABC-2-001", "kept"],
    ]);
    expect(final.data.uncovered).toEqual([]);
    expect(final.inputs).toEqual([{ kind: "artifact", ref: `${first.runId}/requirements`, hash: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
    const md = await readFile(join(dir, "runs", first.runId, "test-cases.md"), "utf8");
    expect(md).toContain("3 case(s) after review: 2 kept, 1 edited, 1 dropped of 4 generated (kept rate 50%)");
    for (const s of SECRETS) expect(md, s).not.toContain(s);
  });

  it("rejects cases with wrong ids, unknown criteria, gaps in coverage or made-up tokens", async () => {
    const first = await engine.start("test-cases", { key: "ABC-1" });
    await engine.submit(first.runId, "analyze", good);
    const bad = {
      cases: [
        tc("ABC-1", 1, ["AC1"], { id: "TC-ABC-2-001" }),
        tc("ABC-1", 2, ["AC9"]),
        tc("ABC-1", 2, ["AC1"], { title: "Ask <PERSON_9> about it" }),
        tc("XYZ-1", 1, ["AC1"]),
      ],
    };
    const result = await engine.submit(first.runId, "cases", bad);
    const errors = result.status === "rejected" ? result.errors : [];
    expect(errors).toEqual(
      expect.arrayContaining([
        { path: "$.cases.0.id", message: "must start with TC-ABC-1- for a case of ABC-1" },
        { path: "$.cases.1.covers", message: "ABC-1 has no AC9; its criteria are AC1, AC2" },
        { path: "$.cases.2.id", message: "TC-ABC-1-002 is used more than once" },
        { path: "$.cases.2.text.0", message: expect.stringContaining("<PERSON_9>") },
        { path: "$.cases.3.requirement", message: expect.stringContaining("is not an issue to write cases for here") },
        { path: "$.cases", message: "no case covers ABC-1 AC2" },
        { path: "$.cases", message: "no case covers ABC-2 AC1" },
      ]),
    );
  });

  it("splits many issues into batches and merges them into one draft", async () => {
    issues = Array.from({ length: 6 }, (_, i) =>
      issue({ key: `ABC-${i + 1}`, summary: `Feature ${i + 1}`, description: adf(`Acceptance criteria:\n- Works ${i + 1}`), ...(i ? { role: "child" as const, parent: "ABC-1", depth: 1 } : {}) }),
    );
    const first = await engine.start("test-cases", { key: "ABC-1" });
    const analysis = { issues: issues.map((i) => ({ key: i.key, quality: { score: 80, missing: [] }, openQuestions: [], inferredCriteria: [] })) };
    const b1 = await engine.submit(first.runId, "analyze", analysis);
    expect(b1.next.stepId).toBe("cases_1");
    expect(b1.next.instructions).toContain("batch 1 of 2");
    expect(b1.next.context).toContain("ABC-4");
    expect(b1.next.context).not.toContain("ABC-5");
    const batch = (keys: number[]) => ({ cases: keys.map((k) => tc(`ABC-${k}`, 1, ["AC1"])) });
    expect((await engine.submit(first.runId, "cases_1", batch([1, 2, 3, 4]))).next.stepId).toBe("cases_2");
    expect((await engine.submit(first.runId, "cases_2", batch([5, 6]))).next.stepId).toBe("review");
    const draft = await runs.readArtifact(first.runId, TEST_CASES_DRAFT_ARTIFACT);
    expect(draft!.data.cases.map((c) => c.id)).toEqual(["TC-ABC-1-001", "TC-ABC-2-001", "TC-ABC-3-001", "TC-ABC-4-001", "TC-ABC-5-001", "TC-ABC-6-001"]);
  });

  it("starts from an earlier requirements run without reading Jira again", async () => {
    const req = await engine.start("requirements", { key: "ABC-1" });
    await engine.submit(req.runId, "analyze", good);
    const first = await engine.start("test-cases", { requirementsRun: req.runId });
    expect(first.stepId).toBe("cases");
    expect(jira.inputs).toHaveLength(1);
    await engine.submit(first.runId, "cases", cases);
    const stopped = await engine.submit(first.runId, "review", { approved: false, changes: [] });
    expect(stopped.next.kind).toBe("done");
    expect(await runs.readArtifact(first.runId, TEST_CASES_ARTIFACT)).toBeUndefined();
    await expect(engine.start("test-cases", { requirementsRun: req.runId, key: "ABC-1" })).rejects.toMatchObject({ code: "INVALID_INPUTS" });
  });

  it("masks what the user dictates in an edit before the run keeps it", async () => {
    const first = await engine.start("test-cases", { key: "ABC-1" });
    await engine.submit(first.runId, "analyze", good);
    await engine.submit(first.runId, "cases", cases);
    const edited = tc("ABC-1", 1, ["AC1"], {
      title: "Log in as Marguerite Quillfeather",
      steps: [{ action: "Email mq@example.com", data: "Call +33 6 12 34 56 78", expected: "ok" }],
    });
    const done = await engine.submit(first.runId, "review", { approved: true, changes: [{ id: "TC-ABC-1-001", decision: "edited", case: edited }] });
    expect(done.status).toBe("accepted");
    const final = (await runs.readArtifact(first.runId, TEST_CASES_ARTIFACT))!;
    expect(final.data.cases[0]).toMatchObject({ title: "Log in as <PERSON_1>", review: "edited" });
    const all = [
      await readFile(join(dir, "runs", first.runId, "test-cases.json"), "utf8"),
      await readFile(join(dir, "runs", first.runId, "test-cases.md"), "utf8"),
      await readFile(join(dir, "runs", first.runId, "steps", "state.json"), "utf8"),
    ].join("\n");
    for (const s of [...SECRETS, "12 34 56 78"]) expect(all, s).not.toContain(s);
  });

  it("keeps no personal data from a review that runs out of attempts", async () => {
    const first = await engine.start("test-cases", { key: "ABC-1" });
    await engine.submit(first.runId, "analyze", good);
    await engine.submit(first.runId, "cases", cases);
    const bad = { approved: true, changes: [{ id: "Marguerite Quillfeather", decision: "edited", case: tc("ABC-1", 1, ["AC1"], { requirement: "mq@example.com" }) }] };
    for (let i = 0; i < 3; i++) await engine.submit(first.runId, "review", bad);
    expect((await engine.status(first.runId)).status).toBe("failed");
    const state = await readFile(join(dir, "runs", first.runId, "steps", "state.json"), "utf8");
    for (const s of SECRETS) expect(state, s).not.toContain(s);
  });

  it("refuses to mask edits with an expired vault", async () => {
    const first = await engine.start("test-cases", { key: "ABC-1" });
    await engine.submit(first.runId, "analyze", good);
    // A second front door whose vault storage is empty, as after the 30-day expiry.
    const key = randomBytes(32);
    const config = configSchema.parse({ version: 1, atlassian: { site: SITE, email: "${env:E}", token: "${env:T}" } });
    const fresh = new DataAccess({ root: dir, store: runs, config, vault: new Vault({ storage: new MemoryVaultStorage(), keys: { description: "t", getKey: async () => key } }), jira });
    const later = new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId }).register(testCasesWorkflow({ data: fresh, runs }));
    const run = await later.start("test-cases", { requirementsRun: first.runId });
    await later.submit(run.runId, "cases", cases);
    const edit = { approved: true, changes: [{ id: "TC-ABC-1-002", decision: "edited", case: tc("ABC-1", 2, ["AC2"], { title: "Mail bf@other.org" }) }] };
    await expect(later.submit(run.runId, "review", edit)).rejects.toMatchObject({ code: "CONTEXT_FAILED", message: expect.stringContaining("expired") });
    // Drops need no masking, so they still work.
    expect((await later.submit(run.runId, "review", { approved: true, changes: [{ id: "TC-ABC-1-003", decision: "dropped" }] })).status).toBe("accepted");
  });

  it("lets the user stop without fixing their changes", async () => {
    const first = await engine.start("test-cases", { key: "ABC-1" });
    await engine.submit(first.runId, "analyze", good);
    await engine.submit(first.runId, "cases", cases);
    const stopped = await engine.submit(first.runId, "review", { approved: false, changes: [{ id: "TC-NOPE-1-001", decision: "dropped" }] });
    expect(stopped.status).toBe("accepted");
    expect((await engine.status(first.runId)).outputs.review).toEqual({ approved: false, changes: [] });
  });

  it("rejects review changes to unknown cases or edits that change the id", async () => {
    const first = await engine.start("test-cases", { key: "ABC-1" });
    await engine.submit(first.runId, "analyze", good);
    await engine.submit(first.runId, "cases", cases);
    const result = await engine.submit(first.runId, "review", {
      approved: true,
      changes: [
        { id: "TC-ABC-1-099", decision: "dropped" },
        { id: "TC-ABC-1-001", decision: "edited", case: tc("ABC-1", 5, ["AC1"]) },
        { id: "TC-ABC-1-002", decision: "edited" },
      ],
    });
    const errors = result.status === "rejected" ? result.errors : [];
    expect(errors).toEqual(
      expect.arrayContaining([
        { path: "$.changes.0.id", message: "is not a draft case id" },
        { path: "$.changes.1.case.id", message: "must stay the id of the case being edited" },
        { path: "$.changes.2.case", message: "an edited case needs the whole corrected case" },
      ]),
    );
  });

  describe("with Xray configured", () => {
    let sent: XrayTest[][];
    let audit: MemoryAuditSink;
    let xrayEngine: WorkflowEngine;
    let agentTests: Record<string, AgentTest[]>;
    /** Tests found by label only (their link to the issue was removed). */
    let labelOnly: Record<string, string>;

    beforeEach(() => {
      sent = [];
      agentTests = { "ABC-2": [{ key: "QA-9", tcId: "TC-ABC-2-001", title: "Case 1 for ABC-2", covers: ["AC1"], criteria: [] }] };
      labelOnly = {};
      audit = new MemoryAuditSink();
      const key = randomBytes(32);
      const config = configSchema.parse({
        version: 1,
        atlassian: { site: SITE, email: "${env:E}", token: "${env:T}" },
        xray: { clientId: "i", clientSecret: "${env:S}", projectKey: "QA" },
        masking: { restoreOnWrite: true },
      });
      const data = new DataAccess({
        root: dir,
        store: runs,
        config,
        vault: new Vault({ storage: new MemoryVaultStorage(), keys: { description: "t", getKey: async () => key } }),
        jira,
        confluence: { pages: async () => ({ pages: [], skipped: [] }) },
        labels: {
          findByLabels: async (_project: string, labels: string[]) => {
            const all: Array<[string, string]> = [
              ...Object.values(agentTests).flatMap((ts) => ts.map((t): [string, string] => [`agent-qa:${t.tcId}`, t.key])),
              ...Object.entries(labelOnly).map(([id, key]): [string, string] => [`agent-qa:${id}`, key]),
            ];
            return new Map(all.filter(([l]) => labels.includes(l)));
          },
          findAgentTests: async (_project: string, key: string) => agentTests[key] ?? [],
        },
        xray: {
          importAndWait: async (tests) => {
            sent.push(tests);
            return { jobId: "job1", status: "successful", issues: tests.map((_, i) => ({ elementNumber: i, key: `QA-${10 + i}` })), errors: [] };
          },
        },
        audit,
      });
      xrayEngine = new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId }).register(testCasesWorkflow({ data, runs }));
    });

    async function reviewed() {
      const first = await xrayEngine.start("test-cases", { key: "ABC-1" });
      await xrayEngine.submit(first.runId, "analyze", good);
      await xrayEngine.submit(first.runId, "cases", cases);
      const after = await xrayEngine.submit(first.runId, "review", { approved: true, changes: [{ id: "TC-ABC-1-003", decision: "dropped" }] });
      return { runId: first.runId, next: after.next };
    }

    it("asks, pushes the reviewed cases with real values, and writes xray-push@1", async () => {
      const { runId, next } = await reviewed();
      expect(next).toMatchObject({ stepId: "push", kind: "confirm" });
      expect(next.context).toContain("Push to Xray project QA: 2 new, 1 updated.");
      expect(next.context).toContain("TC-ABC-2-001 | P2 | updates QA-9 (was: Case 1 for ABC-2) | Case 1 for ABC-2");
      // In an IDE that can elicit, the person answers this question themselves (S1-13).
      expect(next.approval).toEqual({ yes: { approve: true } });
      expect(await xrayEngine.approval(runId, "push")).toEqual({ question: "Push 3 reviewed test case(s) to Xray project QA? 2 new, 1 updated.", yes: { approve: true }, no: { approve: false } });
      expect(await xrayEngine.approval(runId, "review")).toBeUndefined();
      const done = await xrayEngine.submit(runId, "push", { approve: true });
      expect(done.next.kind).toBe("done");
      expect(sent).toHaveLength(1);
      expect(sent[0]!.map((t) => t.fields.summary)).toEqual(["[TC-ABC-1-001] Old case escalated for Marguerite Quillfeather", "[TC-ABC-1-002] Case 2 for ABC-1", "[TC-ABC-2-001] Case 1 for ABC-2"]);
      expect(sent[0]![2]!.update_key).toBe("QA-9");
      const push = (await runs.readArtifact(runId, XRAY_PUSH_ARTIFACT))!;
      expect(push.data.counts).toEqual({ created: 2, updated: 1, failed: 0 });
      expect(push.data.results[0]).toEqual({ tcId: "TC-ABC-1-001", action: "created", xrayKey: "QA-10", linkedTo: "ABC-1" });
      const stored = JSON.stringify(push) + (await readFile(join(dir, "runs", runId, "xray-push.md"), "utf8"));
      for (const s of SECRETS) expect(stored, s).not.toContain(s);
      expect(audit.entries.map((e) => e.outcome)).toEqual(["approved", "done"]);
    });

    it("on a rerun, keeps an existing id only for the same check, whatever the criterion numbers", async () => {
      agentTests = {
        "ABC-1": [
          // Pushed before criteria text was written: matched by title only.
          { key: "QA-7", tcId: "TC-ABC-1-001", title: "Old case escalated for Marguerite Quillfeather", covers: ["AC3"], criteria: [] },
          { key: "QA-6", tcId: "TC-ABC-1-002", title: "Edited by hand", covers: [], criteria: [] },
          // Numbered AC5 by its run; its text matches today's AC2.
          { key: "QA-8", tcId: "TC-ABC-1-004", title: "Owner gets told", covers: ["AC5"], criteria: ["The owner is notified"] },
        ],
      };
      labelOnly = { "TC-ABC-1-006": "QA-20" };
      const first = await xrayEngine.start("test-cases", { key: "ABC-1" });
      const step = (await xrayEngine.submit(first.runId, "analyze", good)).next;
      expect(step.stepId).toBe("cases");
      const shown = JSON.parse(step.context.slice(step.context.indexOf("{")));
      expect(shown.issues[0].existingTests).toEqual([
        { id: "TC-ABC-1-001", title: "Old case escalated for <PERSON_1>" },
        { id: "TC-ABC-1-002", title: "Edited by hand" },
        { id: "TC-ABC-1-004", title: "Owner gets told", criteria: ["The owner is notified"] },
      ]);
      for (const s of SECRETS) expect(step.context, s).not.toContain(s);
      const wrong = await xrayEngine.submit(first.runId, "cases", {
        cases: [tc("ABC-1", 1, ["AC1"]), tc("ABC-1", 2, ["AC1"]), tc("ABC-1", 3, ["AC1"]), tc("ABC-1", 6, ["AC1"]), tc("ABC-1", 4, ["AC1"]), tc("ABC-2", 1, ["AC1"])],
      });
      expect(wrong.status).toBe("rejected");
      expect((wrong as { errors: unknown }).errors).toEqual([
        { path: "$.cases.0.id", message: expect.stringContaining('TC-ABC-1-001 is the existing test "Old case escalated for <PERSON_1>", which this case doesn\'t match') },
        { path: "$.cases.1.id", message: expect.stringContaining('TC-ABC-1-002 is the existing test "Edited by hand"') },
        { path: "$.cases.2.id", message: expect.stringContaining("number new cases from TC-ABC-1-007") },
        { path: "$.cases.3.id", message: expect.stringContaining("belongs to Xray test QA-20, which isn't linked to ABC-1") },
        { path: "$.cases.4.id", message: expect.stringContaining("TC-ABC-1-004 is the existing test") },
        { path: "$.cases", message: "no case covers ABC-1 AC2" },
      ]);
      const ok = await xrayEngine.submit(first.runId, "cases", {
        cases: [
          tc("ABC-1", 1, ["AC1"], { title: "Escalated: old case for <PERSON_1>" }),
          tc("ABC-1", 4, ["AC2"], { title: "Notification reaches the owner" }),
          tc("ABC-1", 7, ["AC1"]),
          tc("ABC-2", 1, ["AC1"]),
        ],
      });
      expect(ok.status).toBe("accepted");
      expect(ok.next.context).toContain("TC-ABC-1-001 | P2 | positive | covers AC1 | updates QA-7 | Escalated: old case for <PERSON_1>");
      // A review edit can't turn an existing test into a check of something else either.
      const bypass = await xrayEngine.submit(first.runId, "review", {
        approved: true,
        changes: [{ id: "TC-ABC-1-001", decision: "edited", case: tc("ABC-1", 1, ["AC1"], { title: "Something unrelated" }) }],
      });
      expect(bypass.status).toBe("rejected");
      expect((bypass as { errors: unknown }).errors).toEqual([{ path: "$.changes.0.case.id", message: expect.stringContaining("is the existing test") }]);
      const push = (await xrayEngine.submit(first.runId, "review", { approved: true, changes: [] })).next;
      expect(push.context).toContain("Push to Xray project QA: 2 new, 2 updated.");
      expect(push.context).toContain("TC-ABC-1-001 | P2 | updates QA-7 (was: Old case escalated for <PERSON_1>) | Escalated: old case for <PERSON_1>");
      expect(push.context).toContain("TC-ABC-1-007 | P2 | new |");
      await xrayEngine.submit(first.runId, "push", { approve: true });
      // The pushed test carries its criteria's text, with real values (restoreOnWrite is on).
      expect(sent[0]![1]!.fields.description).toContain("Criteria:\n- AC2: The owner is notified");
    });

    it("matches titles that name the same check", () => {
      expect(sameCheck("Verify AccountDeletionLog__c against the approved WW model", "Check AccountDeletionLog__c matches the WW model")).toBe(true);
      expect(sameCheck("Email field definition", "Snapshot value persistence")).toBe(false);
      expect(sameCheck("Owner notified", "Owner notified by email when escalated")).toBe(true);
      expect(sameCheck("Verify the field", "Verify the other")).toBe(false);
    });

    it("pushes nothing when the user says no", async () => {
      const { runId } = await reviewed();
      const done = await xrayEngine.submit(runId, "push", { approve: false });
      expect(done.next.kind).toBe("done");
      expect(sent).toHaveLength(0);
      expect(audit.entries).toHaveLength(0);
      expect(await runs.readArtifact(runId, XRAY_PUSH_ARTIFACT)).toBeUndefined();
    });

    it("skips the push when the review stopped the run", async () => {
      const first = await xrayEngine.start("test-cases", { key: "ABC-1" });
      await xrayEngine.submit(first.runId, "analyze", good);
      await xrayEngine.submit(first.runId, "cases", cases);
      const after = await xrayEngine.submit(first.runId, "review", { approved: false, changes: [] });
      expect(after.next.kind).toBe("done");
    });
  });
});
