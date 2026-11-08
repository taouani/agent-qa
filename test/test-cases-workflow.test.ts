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

  it("refuses casesRun when Xray isn't configured", async () => {
    const first = await engine.start("test-cases", { key: "ABC-1" });
    await engine.submit(first.runId, "analyze", good);
    await engine.submit(first.runId, "cases", cases);
    await engine.submit(first.runId, "review", { approved: true, changes: [] });
    await expect(engine.start("test-cases", { casesRun: first.runId })).rejects.toThrow("no xray section");
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
    /** Imports left that reject the first test. */
    let rejectFirst: number;
    let importThrows: boolean;
    let xrayConfig: ReturnType<typeof configSchema.parse>;
    let xrayLabels: NonNullable<ConstructorParameters<typeof DataAccess>[0]["labels"]>;
    let xrayClient: NonNullable<ConstructorParameters<typeof DataAccess>[0]["xray"]>;

    beforeEach(() => {
      sent = [];
      rejectFirst = 0;
      importThrows = false;
      agentTests = { "ABC-2": [{ key: "QA-9", tcId: "TC-ABC-2-001", title: "Case 1 for ABC-2", covers: ["AC1"] }] };
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
            if (importThrows) throw new Error("Xray is down");
            sent.push(tests);
            const issues = tests.map((_, i) => ({ elementNumber: i, key: `QA-${10 + i}` }));
            if (rejectFirst > 0) {
              rejectFirst--;
              return { jobId: "job1", status: "successful", issues: issues.slice(1), errors: [{ elementNumber: 0, message: "rejected" }] };
            }
            return { jobId: "job1", status: "successful", issues, errors: [] };
          },
        },
        audit,
      });
      xrayConfig = config;
      xrayLabels = data["options"].labels!;
      xrayClient = data["options"].xray!;
      xrayEngine = new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId }).register(testCasesWorkflow({ data, runs }));
    });

    async function reviewed() {
      const first = await xrayEngine.start("test-cases", { key: "ABC-1" });
      if (first.stepId === "reuse") await xrayEngine.submit(first.runId, "reuse", { reuse: false });
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
          { key: "QA-7", tcId: "TC-ABC-1-001", title: "Old case escalated for Marguerite Quillfeather", covers: ["AC3"] },
          { key: "QA-6", tcId: "TC-ABC-1-002", title: "Edited by hand", covers: [] },
          // Numbered AC5 by its run: today's criteria are numbered differently.
          { key: "QA-8", tcId: "TC-ABC-1-004", title: "Owner gets told", covers: ["AC5"] },
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
        { id: "TC-ABC-1-004", title: "Owner gets told" },
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
          tc("ABC-1", 4, ["AC2"], { title: "The owner gets told" }),
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
      expect(sent[0]!.map((t) => t.update_key)).toEqual(["QA-7", "QA-8", undefined, undefined]);
    });

    it("matches titles that name the same check", () => {
      expect(sameCheck("Verify AccountDeletionLog__c against the approved WW model", "Check AccountDeletionLog__c matches the WW model")).toBe(true);
      expect(sameCheck("Email field definition", "Snapshot value persistence")).toBe(false);
      expect(sameCheck("Verify the field", "Verify the other")).toBe(false);
      expect(sameCheck("Escalated: old case for <PERSON_1>", "Old case escalated for <PERSON_1>")).toBe(true);
      expect(sameCheck("Login fails with invalid password", "Login with an invalid password fails")).toBe(true);
      expect(sameCheck("Access is denied", "Access deny shown")).toBe(false);
      expect(sameCheck("User cannot delete the log", "User can't delete the log")).toBe(true);
    });

    it("doesn't take different checks for the same one", () => {
      const different = [
        ["Discount is applied at checkout", "Discount is not applied at checkout for an expired code"],
        ["Discount is applied at checkout", "Discount isn't applied at checkout"],
        ["Login fails with invalid password", "Login fails with invalid username"],
        ["Refund approved by manager", "Refund rejected by manager"],
        ["Order total shows in EUR", "Order total shows in USD"],
        ["Email field is required", "Phone field is required"],
        ["Refund over 500 needs approval", "Refund under 500 needs no approval"],
        ["Login", "Login is blocked after 5 failed attempts"],
        ["Owner notified", "Owner notified by email when escalated"],
        ["Case is created from the contact form", "Duplicate case is created from the contact form"],
        ["Refund is approved by the manager", "Partial refund is approved by the manager"],
        ["Owner is notified when case escalates", "Owner is notified twice when case escalates"],
        ["Discount applied at checkout", "Discount applied at checkout for VIP customers"],
        ["Refund over 500 EUR needs approval", "Refund under 100 EUR needs approval"],
        ["Order total shows in EUR", "Order total shows in US dollars"],
        ["Escalated case for <PERSON_1>", "Escalated case for <PERSON_2>"],
      ];
      for (const [a, b] of different) expect(sameCheck(a!, b!), `${a} / ${b}`).toBe(false);
    });

    it("pushes nothing when the user says no", async () => {
      const { runId } = await reviewed();
      const done = await xrayEngine.submit(runId, "push", { approve: false });
      expect(done.next.kind).toBe("done");
      expect(sent).toHaveLength(0);
      expect(audit.entries).toHaveLength(0);
      expect(await runs.readArtifact(runId, XRAY_PUSH_ARTIFACT)).toBeUndefined();
    });

    it("pushes the reviewed cases of a run whose push was declined, from a new run (Tarek, 7 Nov 2026)", async () => {
      const { runId: earlier } = await reviewed();
      await xrayEngine.submit(earlier, "push", { approve: false });
      const before = await readFile(join(dir, "runs", earlier, "run.json"), "utf8");
      const reads = jira.inputs.length;
      const later = await xrayEngine.start("test-cases", { casesRun: earlier });
      expect(later.runId).not.toBe(earlier);
      expect(later.stepId).toBe("push");
      expect(later.context).toContain(`These are the cases reviewed in run ${earlier}`);
      expect(later.context).toContain("not pushed then");
      expect(later.context).toContain("Push to Xray project QA: 2 new, 1 updated.");
      expect((await xrayEngine.approval(later.runId, "push"))!.question).toMatch(new RegExp(`^These are the cases reviewed in run ${earlier} \\(\\d{4}-\\d\\d-\\d\\d\\), not pushed then\\. Push 3 reviewed test case\\(s\\) to Xray project QA\\? 2 new, 1 updated\\.$`));
      const done = await xrayEngine.submit(later.runId, "push", { approve: true });
      expect(done.next.kind).toBe("done");
      // Real values come back from the earlier run's vault; Jira isn't read and no case is written again.
      expect(sent[0]!.map((t) => t.fields.summary)).toEqual(["[TC-ABC-1-001] Old case escalated for Marguerite Quillfeather", "[TC-ABC-1-002] Case 2 for ABC-1", "[TC-ABC-2-001] Case 1 for ABC-2"]);
      expect(jira.inputs.length).toBe(reads);
      expect(await runs.readArtifact(later.runId, TEST_CASES_ARTIFACT)).toBeUndefined();
      const push = (await runs.readArtifact(later.runId, XRAY_PUSH_ARTIFACT))!;
      expect(push.data.testCases.run).toBe(earlier);
      expect(push.data.counts).toEqual({ created: 2, updated: 1, failed: 0 });
      // The earlier run stays as it finished.
      expect(await readFile(join(dir, "runs", earlier, "run.json"), "utf8")).toBe(before);
      expect(await runs.readArtifact(earlier, XRAY_PUSH_ARTIFACT)).toBeUndefined();
      // Once pushed, the same reviewed cases are never pushed again.
      await expect(xrayEngine.start("test-cases", { casesRun: earlier })).rejects.toThrow(`already pushed to Xray, by run ${later.runId}`);
      const third = await xrayEngine.start("test-cases", { casesRun: later.runId }).catch((e: Error) => e);
      expect(String(third)).toContain("has no reviewed test cases");
    });

    it("pushes the same reviewed cases once: not from a run still open at its push, not twice", async () => {
      const { runId: open } = await reviewed();
      await expect(xrayEngine.start("test-cases", { casesRun: open })).rejects.toThrow(`isn't finished (running): if it waits at its push, resume it instead (--resume ${open})`);
      await xrayEngine.submit(open, "push", { approve: true });
      await expect(xrayEngine.start("test-cases", { casesRun: open })).rejects.toThrow(`already pushed to Xray, by run ${open}`);

      const { runId: declined } = await reviewed();
      await xrayEngine.submit(declined, "push", { approve: false });
      const a = await xrayEngine.start("test-cases", { casesRun: declined });
      const b = await xrayEngine.start("test-cases", { casesRun: declined });
      expect(sent).toHaveLength(1);
      await xrayEngine.submit(a.runId, "push", { approve: true });
      expect(sent).toHaveLength(2);
      await expect(xrayEngine.submit(b.runId, "push", { approve: true })).rejects.toThrow(`already pushed to Xray, by run ${a.runId}`);
      expect(sent).toHaveLength(2);
      expect((await xrayEngine.submit(b.runId, "push", { approve: false })).next.kind).toBe("done");
    });

    it("pushes again from a run whose push had failed cases (clean-up, 7 Nov 2026)", async () => {
      const { runId: earlier } = await reviewed();
      rejectFirst = 1;
      await xrayEngine.submit(earlier, "push", { approve: true });
      expect((await runs.readArtifact(earlier, XRAY_PUSH_ARTIFACT))!.data.counts.failed).toBe(1);
      const retry = await xrayEngine.start("test-cases", { casesRun: earlier });
      expect(retry.context).toContain(`run ${earlier} pushed them, but 1 case(s) failed: this push sends them all again (cases already in Xray are updated)`);
      await xrayEngine.submit(retry.runId, "push", { approve: true });
      expect(sent).toHaveLength(2);
      expect((await runs.readArtifact(retry.runId, XRAY_PUSH_ARTIFACT))!.data.counts.failed).toBe(0);
      // A push with no failures ends it.
      await expect(xrayEngine.start("test-cases", { casesRun: earlier })).rejects.toThrow(`already pushed to Xray, by run ${retry.runId}`);
    });

    it("doesn't push while another process holds the push claim, and frees it after", async () => {
      const { runId: declined } = await reviewed();
      await xrayEngine.submit(declined, "push", { approve: false });
      const later = await xrayEngine.start("test-cases", { casesRun: declined });
      expect(await runs.claim(declined, "xray-push", "other-run")).toBeUndefined();
      await expect(xrayEngine.submit(later.runId, "push", { approve: true })).rejects.toThrow(
        `Run other-run is pushing these reviewed cases to Xray now, so they aren't pushed twice: wait for it, then submit again. If it isn't running, delete ${runs.claimFile(declined, "xray-push")} and submit again.`,
      );
      expect(sent).toHaveLength(0);
      await runs.release(declined, "xray-push", "other-run");
      await xrayEngine.submit(later.runId, "push", { approve: true });
      expect(sent).toHaveLength(1);
      // Released when the push throws too, and the same answer can be sent again.
      const source = await reviewedAndDeclined();
      const third = await xrayEngine.start("test-cases", { casesRun: source });
      importThrows = true;
      await expect(xrayEngine.submit(third.runId, "push", { approve: true })).rejects.toThrow("Xray is down");
      importThrows = false;
      expect(await runs.claim(source, "xray-push", "probe")).toBeUndefined();
      await runs.release(source, "xray-push", "probe");
      await xrayEngine.submit(third.runId, "push", { approve: true });
      expect(sent).toHaveLength(2);
      // Released after the push, so a run that had failures could be pushed again.
      expect(await runs.claim(declined, "xray-push", "next")).toBeUndefined();
    });

    it("pushes tokens as they are from a run whose vault expired when restoreOnWrite is off", async () => {
      const { runId: declined } = await reviewed();
      await xrayEngine.submit(declined, "push", { approve: false });
      const key = randomBytes(32);
      const make = (restoreOnWrite: boolean) =>
        new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId }).register(
          testCasesWorkflow({
            runs,
            data: new DataAccess({
              root: dir,
              store: runs,
              config: { ...xrayConfig, masking: { ...xrayConfig.masking, restoreOnWrite } },
              // Empty vault storage, as after the 30-day expiry.
              vault: new Vault({ storage: new MemoryVaultStorage(), keys: { description: "t", getKey: async () => key } }),
              jira,
              confluence: { pages: async () => ({ pages: [], skipped: [] }) },
              labels: xrayLabels,
              xray: xrayClient,
              audit,
            }),
          }),
        );
      await expect(make(true).start("test-cases", { casesRun: declined })).rejects.toThrow("has expired or was deleted");
      const off = make(false);
      const later = await off.start("test-cases", { casesRun: declined });
      await off.submit(later.runId, "push", { approve: true });
      expect(sent[0]!.map((t) => t.fields.summary)[0]).toMatch(/^\[TC-ABC-1-001\] Old case escalated for <PERSON_\d+>$/);
    });

    async function reviewedAndDeclined() {
      const { runId } = await reviewed();
      await xrayEngine.submit(runId, "push", { approve: false });
      return runId;
    }

    it("refuses casesRun without reviewed cases", async () => {
      const first = await xrayEngine.start("test-cases", { key: "ABC-1" });
      await expect(xrayEngine.start("test-cases", { casesRun: first.runId })).rejects.toThrow("has no reviewed test cases");
      await xrayEngine.submit(first.runId, "analyze", good);
      await xrayEngine.submit(first.runId, "cases", cases);
      await xrayEngine.submit(first.runId, "review", { approved: true, changes: cases.cases.map((c) => ({ id: c.id, decision: "dropped" as const })) });
      await expect(xrayEngine.start("test-cases", { casesRun: first.runId })).rejects.toThrow("kept no test cases");
      await expect(xrayEngine.start("test-cases", { casesRun: "../x" })).rejects.toMatchObject({ code: "INVALID_INPUTS" });
      await expect(xrayEngine.start("test-cases", { casesRun: first.runId, key: "ABC-1" })).rejects.toMatchObject({ code: "INVALID_INPUTS" });
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

describe("test-cases workflow: reuse an earlier analysis of the same input (Tarek, 7 Nov 2026)", () => {
  it("offers the newest earlier analysis only when Jira is unchanged, and reuses it on a yes", async () => {
    const a = await engine.start("test-cases", { key: "ABC-1" });
    expect(a.stepId).toBe("analyze");
    await engine.submit(a.runId, "analyze", good);

    // Same issues, same Jira version: asked first.
    const b = await engine.start("test-cases", { key: "ABC-1" });
    expect(b).toMatchObject({ stepId: "reuse", kind: "confirm" });
    expect(b.context).toContain(`Run ${a.runId} (`);
    expect(b.context).toContain("analyzed the same 2 issue(s), unchanged in Jira since");
    expect(b.context).toContain("3 criteria, average quality 59/100");
    // The run is Agent-QA's to name, whatever the answer says.
    const next = (await engine.submit(b.runId, "reuse", { reuse: true, run: "2026-01-01-X-1-zzzz" })).next;
    expect(next).toMatchObject({ stepId: "cases", kind: "generate" });
    expect(next.context).toContain("AC1: The owner gets an email when a case is escalated");
    await engine.submit(b.runId, "cases", cases);
    expect((await runs.readArtifact(b.runId, TEST_CASES_DRAFT_ARTIFACT))!.data.requirements.run).toBe(a.runId);

    // A no analyzes again.
    const c = await engine.start("test-cases", { key: "ABC-1" });
    expect(c.stepId).toBe("reuse");
    expect((await engine.submit(c.runId, "reuse", { reuse: false })).next.stepId).toBe("analyze");

    // A related feature file appeared in the repo: the analysis would see it, so nothing to reuse.
    const { mkdir, writeFile, rm: remove } = await import("node:fs/promises");
    await mkdir(join(dir, "tests"), { recursive: true });
    await writeFile(join(dir, "tests", "escalation-email.feature"), "Feature: Email the owner when a case is escalated\n");
    const f = await engine.start("test-cases", { key: "ABC-1" });
    expect(f.context).toContain("can be reused");
    await remove(join(dir, "tests"), { recursive: true });

    // The issue changed in Jira: nothing to reuse, even on a yes.
    issues = ISSUES.map((i) => (i.key === "ABC-2" ? { ...i, updated: "2026-11-07T10:00:00.000+0000" } : i));
    const d = await engine.start("test-cases", { key: "ABC-1" });
    expect(d.stepId).toBe("reuse");
    expect(d.context).toContain("it will be analyzed again. Submit reuse: false without asking.");
    expect((await engine.submit(d.runId, "reuse", { reuse: true })).next.stepId).toBe("analyze");
    // Another key: not asked.
    expect((await engine.start("test-cases", { key: "ABC-2" })).stepId).toBe("analyze");
    // From an earlier requirements run, nothing is asked.
    expect((await engine.start("test-cases", { requirementsRun: a.runId })).stepId).toBe("cases");
  });
});

describe("test-cases workflow: --changed-only (S4-14)", () => {
  const approve = { approved: true, changes: [] };
  it("writes cases only for the issues changed since their cases were written, and ends when none did", async () => {
    const a = await engine.start("test-cases", { key: "ABC-1" });
    await engine.submit(a.runId, "analyze", good);
    await engine.submit(a.runId, "cases", cases);
    expect((await engine.submit(a.runId, "review", approve)).next.kind).toBe("done");

    // Nothing changed: no analysis, no model call, the run ends.
    const b = await engine.start("test-cases", { key: "ABC-1", changedOnly: true });
    expect(b).toMatchObject({ stepId: "changes", kind: "confirm" });
    expect(b.context).toContain("None of the 2 issue(s) changed since their cases were written");
    expect(b.context).toContain(`ABC-1 (run ${a.runId})`);
    expect((await engine.submit(b.runId, "changes", { proceed: true })).next.kind).toBe("done");
    expect(await runs.readArtifact(b.runId, TEST_CASES_ARTIFACT)).toBeUndefined();

    // ABC-2 changed in Jira: only it is analyzed and gets cases; ABC-1 is left out.
    issues = ISSUES.map((i) => (i.key === "ABC-2" ? { ...i, updated: "2026-11-07T10:00:00.000+0000" } : i));
    const c = await engine.start("test-cases", { key: "ABC-1", changedOnly: true });
    expect(c.context).toContain("New or changed, to analyze and write cases for: ABC-2.");
    expect(c.context).toContain(`left out: ABC-1 (run ${a.runId})`);
    // The issues are Agent-QA's to name, whatever the answer says.
    const analyze = (await engine.submit(c.runId, "changes", { proceed: true, analyze: ["ABC-1", "ABC-2"] })).next;
    expect(analyze.stepId).toBe("analyze");
    expect(analyze.context).toContain("ABC-2");
    expect(analyze.context).not.toContain("Escalate cases older than 2 days");
    const onlyTwo = { issues: [good.issues[1]!] };
    const casesStep = (await engine.submit(c.runId, "analyze", onlyTwo)).next;
    expect(casesStep.stepId).toBe("cases");
    await engine.submit(c.runId, "cases", { cases: [tc("ABC-2", 1, ["AC1"])] });
    await engine.submit(c.runId, "review", approve);
    expect((await runs.readArtifact(c.runId, TEST_CASES_ARTIFACT))!.data.cases.map((x) => x.id)).toEqual(["TC-ABC-2-001"]);

    // Now both have cases at their current version: nothing to do again. A no stops before any analysis.
    const d = await engine.start("test-cases", { key: "ABC-1", changedOnly: true });
    expect(d.context).toContain("None of the 2 issue(s) changed");
    expect(d.context).toContain(`ABC-2 (run ${c.runId})`);
    issues = ISSUES;
    const e = await engine.start("test-cases", { key: "ABC-1", changedOnly: true });
    expect(e.context).toContain("New or changed, to analyze and write cases for: ABC-2.");
    expect((await engine.submit(e.runId, "changes", { proceed: false })).next.kind).toBe("done");

    // Only with a key or a JQL filter.
    await expect(engine.start("test-cases", { requirementsRun: a.runId, changedOnly: true })).rejects.toThrow(/Invalid inputs/);
  });
});
