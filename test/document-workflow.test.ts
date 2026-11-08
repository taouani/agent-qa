import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JiraCollection, JiraInput, JiraIssue } from "../src/connectors/index.js";
import { configSchema, RunStore, WorkflowEngine } from "../src/core/index.js";
import { DataAccess } from "../src/data/index.js";
import { MemoryVaultStorage, Vault } from "../src/masking/index.js";
import { DOCUMENT_ARTIFACT, DOCUMENT_DRAFT_ARTIFACT, documentWorkflow, requirementsWorkflow, testCasesWorkflow, type TestCase, type TestPlan } from "../src/workflows/index.js";

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
  dir = await mkdtemp(join(tmpdir(), "agent-qa-doc-"));
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
  engine = new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId }).register(requirementsWorkflow({ data, runs })).register(testCasesWorkflow({ data, runs })).register(documentWorkflow({ data, runs }));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const good = {
  issues: [
    { key: "ABC-1", quality: { score: 72, missing: ["error-handling"] }, openQuestions: ["Who is the owner when <PERSON_1> is away?"], inferredCriteria: [] },
    { key: "ABC-2", quality: { score: 45, missing: ["acceptance-criteria"] }, openQuestions: [], inferredCriteria: ["The owner gets an email when a case is escalated"] },
  ],
};

const plan = (over: Partial<TestPlan> = {}): TestPlan => ({
  summary: "Tests the escalation of old cases and the email to their owner.",
  objectives: ["Old cases are escalated on time", "Owners are told"],
  inScope: ["Escalation of cases older than 2 days", "Owner email"],
  outOfScope: ["Case creation"],
  approach: "Functional and negative tests in a sandbox, run by hand first.",
  requirements: [
    { key: "ABC-1", risk: "high", focus: "The 2-day boundary" },
    { key: "ABC-2", risk: "medium", focus: "The email reaches <PERSON_1>" },
  ],
  risks: [{ risk: "Time zones move the boundary", impact: "high", mitigation: "Test around midnight", requirements: ["ABC-1"] }],
  environments: ["UAT sandbox"],
  testData: ["Cases aged 1, 2 and 3 days"],
  entryCriteria: ["Stories done"],
  exitCriteria: ["No open P1 defect"],
  assumptions: ["The owner is the case owner field"],
  ...over,
});

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

const errorsOf = (r: { status: string }) => (r.status === "rejected" ? (r as unknown as { errors: unknown[] }).errors : []);

describe("document workflow (S4-3)", () => {
  it("writes a test plan from a key: analysis, draft, review, document@1", async () => {
    const first = await engine.start("document", { type: "test-plan", key: "ABC-1" });
    expect(first.stepId).toBe("analyze");
    const drafting = await engine.submit(first.runId, "analyze", good);
    expect(drafting.next).toMatchObject({ stepId: "draft-test-plan", kind: "generate" });
    expect(drafting.next.context).toContain('"document": "Test plan"');
    expect(drafting.next.context).toContain("AC1: The owner gets an email when a case is escalated (inferred, not written in the issue)");
    expect(drafting.next.context).not.toContain("testCases");

    const reviewing = await engine.submit(first.runId, "draft-test-plan", plan());
    expect(reviewing.next).toMatchObject({ stepId: "review", kind: "confirm" });
    expect(reviewing.next.context).toContain("$.objectives.1: Owners are told");
    expect(reviewing.next.context).toContain("$.requirements.1.focus: The email reaches <PERSON_1>");
    const draft = await readFile(join(dir, "runs", first.runId, "document-draft.md"), "utf8");
    expect(draft).toContain("# Test plan: ABC-1");
    expect(draft).toContain("| ABC-1 | Escalate old cases for <PERSON_1> | high | The 2-day boundary |");

    const done = await engine.submit(first.runId, "review", {
      approved: true,
      changes: [
        { path: "$.exitCriteria.0", value: "Marguerite Quillfeather signs off" },
        { path: "$.outOfScope.0" },
      ],
    });
    expect(done.next.kind).toBe("done");
    const doc = (await runs.readArtifact(first.runId, DOCUMENT_ARTIFACT))!;
    expect(doc.data).toMatchObject({ type: "test-plan", title: "Test plan", templateVersion: "document-1/test-plan-1", review: { edited: 2 } });
    expect(doc.data.content).toMatchObject({ exitCriteria: ["<PERSON_1> signs off"], outOfScope: [] });
    expect(doc.data.sources.requirements.run).toBe(first.runId);
    expect(doc.inputs).toEqual([{ kind: "artifact", ref: `${first.runId}/requirements`, hash: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
    const md = await readFile(join(dir, "runs", first.runId, "document.md"), "utf8");
    for (const heading of ["## Summary", "## Scope", "## Requirements", "## Risks", "## Exit criteria", "## Assumptions and open questions"]) expect(md).toContain(heading);
    expect(md).toContain("- <PERSON_1> signs off");
    expect(md).not.toContain("## Coverage");
    const all = [md, await readFile(join(dir, "runs", first.runId, "document.json"), "utf8"), await readFile(join(dir, "runs", first.runId, "steps", "state.json"), "utf8")].join("\n");
    for (const s of SECRETS) expect(all, s).not.toContain(s);
  });

  it("rejects a plan that misses or repeats an issue, names an unknown one, or makes up a token", async () => {
    const first = await engine.start("document", { type: "test-plan", key: "ABC-1" });
    await engine.submit(first.runId, "analyze", good);
    const bad = plan({
      requirements: [
        { key: "ABC-1", risk: "high", focus: "x" },
        { key: "abc-1", risk: "low", focus: "y" },
        { key: "XYZ-9", risk: "low", focus: "z" },
      ],
      risks: [{ risk: "r", impact: "low", mitigation: "m", requirements: ["XYZ-9"] }],
      summary: "Ask <PERSON_7> first.",
    });
    expect(errorsOf(await engine.submit(first.runId, "draft-test-plan", bad))).toEqual(
      expect.arrayContaining([
        { path: "$.requirements.1.key", message: "ABC-1 is listed more than once" },
        { path: "$.requirements.2.key", message: expect.stringContaining("XYZ-9 isn't an issue of the context") },
        { path: "$.requirements", message: "no entry for ABC-2" },
        { path: "$.risks.0.requirements.0", message: "XYZ-9 isn't an issue of the context" },
        { path: "$.summary", message: expect.stringContaining("<PERSON_7>") },
      ]),
    );
  });

  it("starts from a test-cases run: its requirements, no Jira read, and a coverage table of the reviewed cases", async () => {
    const cases = await engine.start("test-cases", { key: "ABC-1" });
    await engine.submit(cases.runId, "analyze", good);
    await engine.submit(cases.runId, "cases", { cases: [tc("ABC-1", 1, ["AC1"], { priority: "P1" }), tc("ABC-1", 2, ["AC2"]), tc("ABC-2", 1, ["AC1"])] });
    await engine.submit(cases.runId, "review", { approved: true, changes: [{ id: "TC-ABC-1-002", decision: "dropped" }] });
    const reads = jira.inputs.length;

    const first = await engine.start("document", { type: "test-plan", testCasesRun: cases.runId });
    expect(first.stepId).toBe("draft-test-plan");
    expect((await engine.status(first.runId)).inputs).toMatchObject({ requirementsRun: cases.runId, testCasesRun: cases.runId });
    expect(first.context).toContain("TC-ABC-1-001 | P1 | positive | Case 1 for ABC-1");
    expect(first.context).toContain('"ABC-1 AC2"');
    await engine.submit(first.runId, "draft-test-plan", plan());
    await engine.submit(first.runId, "review", { approved: true, changes: [], unattended: true });
    expect(jira.inputs).toHaveLength(reads);
    const doc = (await runs.readArtifact(first.runId, DOCUMENT_ARTIFACT))!;
    expect(doc.data.sources.testCases?.run).toBe(cases.runId);
    expect(doc.inputs.map((i) => i.ref)).toEqual([`${cases.runId}/requirements`, `${cases.runId}/test-cases`]);
    const md = await readFile(join(dir, "runs", first.runId, "document.md"), "utf8");
    expect(md).toContain("> Not reviewed: written unattended (--yes).");
    expect(md).toContain("## Coverage");
    expect(md).toContain("| ABC-1 | 1 | 1 | 0 | 0 | 0 | AC2 |");
    expect(md).toContain("| ABC-2 | 1 | 0 | 1 | 0 | 0 | none |");
    expect(md).toContain(`and test cases run ${cases.runId} (2 reviewed case(s))`);

    const requirements = await engine.start("requirements", { key: "ABC-1" });
    await engine.submit(requirements.runId, "analyze", good);
    await expect(engine.start("document", { type: "test-plan", testCasesRun: cases.runId, requirementsRun: requirements.runId })).rejects.toMatchObject({
      code: "INVALID_INPUTS",
      message: expect.stringContaining(`were written from the requirements of run ${cases.runId}`),
    });
    const fromRequirements = await engine.start("document", { type: "test-plan", requirementsRun: requirements.runId });
    expect(fromRequirements.stepId).toBe("draft-test-plan");
  });

  it("refuses inputs it can't write from", async () => {
    const refused = (inputs: Record<string, unknown>) => expect(engine.start("document", { type: "test-plan", ...inputs })).rejects.toMatchObject({ code: "INVALID_INPUTS" });
    await refused({});
    await refused({ key: "ABC-1", testCasesRun: "x" });
    await refused({ key: "ABC-1", jql: "project = ABC" });
    await refused({ requirementsRun: "nope" });
    await refused({ testCasesRun: "nope" });
    await refused({ key: "ABC-1", testRunRun: "some-run" });
    await expect(engine.start("document", { type: "novel", key: "ABC-1" })).rejects.toMatchObject({ code: "INVALID_INPUTS" });
    await expect(engine.start("document", { type: "test-plan", key: "ABC-1", testRunRun: "r" })).rejects.toThrow("doesn't use test results");
  });

  it("rejects review changes it can't make, without echoing the person's words", async () => {
    const first = await engine.start("document", { type: "test-plan", key: "ABC-1" });
    await engine.submit(first.runId, "analyze", good);
    await engine.submit(first.runId, "draft-test-plan", plan());
    const result = await engine.submit(first.runId, "review", {
      approved: true,
      changes: [
        { path: "$.objectives.9", value: "Marguerite" },
        { path: "$.summary" },
        { path: "$.approach", value: " " },
        { path: "$.requirements.0", value: "Quillfeather" },
        { path: "$.approach", value: "again" },
      ],
    });
    const errors = errorsOf(result);
    expect(errors).toEqual([
      { path: "$.changes.0.path", message: "isn't a text of the draft: use a path the context lists" },
      { path: "$.changes.1.path", message: "only an item of a list can be removed; give a value to change this text" },
      { path: "$.changes.2.path", message: "a new text can't be empty; leave out value to remove a list item" },
      { path: "$.changes.3.path", message: "isn't a text of the draft: use a path the context lists" },
      { path: "$.changes.4.path", message: "this text is changed more than once" },
    ]);
    for (const s of SECRETS) expect(JSON.stringify(errors)).not.toContain(s);

    // Removing every objective, an issue's entry, or adding a token the document doesn't have.
    const broken = errorsOf(
      await engine.submit(first.runId, "review", {
        approved: true,
        changes: [{ path: "$.objectives.0" }, { path: "$.objectives.1" }, { path: "$.requirements.1" }, { path: "$.summary", value: "Ask <PERSON_8>" }],
      }),
    );
    expect(broken).toEqual(
      expect.arrayContaining([
        { path: "$.changes.3.value", message: "uses <PERSON_8>, which the document doesn't have" },
        { path: "$.objectives", message: expect.stringContaining("doesn't fit the test plan once changed") },
      ]),
    );

    // Stopping needs no fix, and saves nothing.
    const stopped = await engine.submit(first.runId, "review", { approved: false, changes: [{ path: "$.nope" }] });
    expect(stopped.status).toBe("accepted");
    expect(await runs.readArtifact(first.runId, DOCUMENT_ARTIFACT)).toBeUndefined();
    expect(await runs.readArtifact(first.runId, DOCUMENT_DRAFT_ARTIFACT)).toBeDefined();
  });

  it("removes several items of one list and nested items in one review", async () => {
    const first = await engine.start("document", { type: "test-plan", key: "ABC-1" });
    await engine.submit(first.runId, "analyze", good);
    await engine.submit(first.runId, "draft-test-plan", plan({ inScope: ["a", "b", "c", "d"], risks: [{ risk: "r", impact: "low", mitigation: "m", requirements: ["ABC-1", "ABC-2"] }] }));
    await engine.submit(first.runId, "review", {
      approved: true,
      changes: [{ path: "$.inScope.1" }, { path: "$.inScope.3" }, { path: "$.risks.0.requirements.0" }, { path: "$.inScope.2", value: "C" }],
    });
    const doc = (await runs.readArtifact(first.runId, DOCUMENT_ARTIFACT))!;
    expect(doc.data.content).toMatchObject({ inScope: ["a", "C"], risks: [{ requirements: ["ABC-2"] }] });
  });
});
