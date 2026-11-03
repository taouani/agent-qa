import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JiraCollection, JiraInput, JiraIssue } from "../src/connectors/index.js";
import { configSchema, RunStore, WorkflowEngine } from "../src/core/index.js";
import { DataAccess } from "../src/data/index.js";
import { MemoryVaultStorage, Vault } from "../src/masking/index.js";
import { requirementsWorkflow, TEST_CASES_ARTIFACT, TEST_CASES_DRAFT_ARTIFACT, testCasesWorkflow, type TestCase } from "../src/workflows/index.js";

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
});
