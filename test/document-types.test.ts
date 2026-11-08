import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JiraCollection, JiraInput, JiraIssue } from "../src/connectors/index.js";
import { configSchema, RunStore, WorkflowEngine } from "../src/core/index.js";
import { DataAccess } from "../src/data/index.js";
import { MemoryVaultStorage, Vault } from "../src/masking/index.js";
import { DOCUMENT_ARTIFACT, DOCUMENT_TYPES, documentWorkflow, levelOf, matrixOf, requirementsWorkflow, scoreOf, TEST_RUN_ARTIFACT, testCasesWorkflow, type TestCase } from "../src/workflows/index.js";

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
  dir = await mkdtemp(join(tmpdir(), "agent-qa-doctypes-"));
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

const errorsOf = (r: { status: string }) => (r.status === "rejected" ? (r as unknown as { errors: Array<{ path: string; message: string }> }).errors : []);

/** A reviewed test-cases run (TC-ABC-1-002 dropped, so ABC-1 AC2 has no case) and a test run naming the cases in titles and tags. */
async function sources(): Promise<{ casesRun: string; testRunRun: string }> {
  const cases = await engine.start("test-cases", { key: "ABC-1" });
  await engine.submit(cases.runId, "analyze", good);
  await engine.submit(cases.runId, "cases", { cases: [tc("ABC-1", 1, ["AC1"], { priority: "P1" }), tc("ABC-1", 2, ["AC2"]), tc("ABC-2", 1, ["AC1"])] });
  await engine.submit(cases.runId, "review", { approved: true, changes: [{ id: "TC-ABC-1-002", decision: "dropped" }] });
  const { id } = await runs.create({ workflow: "run-tests", context: "tests", host: "cli", driver: "api" });
  const row = (title: string, outcome: "passed" | "failed", tags: string[] = [], failure?: string) => ({ title, tags, file: "e2e/a.spec.ts", line: 1, outcome, runs: 1, failedRuns: outcome === "failed" ? 1 : 0, ...(failure ? { failure: { message: failure } } : {}) });
  await runs.writeArtifact(
    id,
    TEST_RUN_ARTIFACT,
    {
      status: "failed",
      folder: ".",
      command: ["npx", "playwright", "test"],
      selection: { tag: "@regression" },
      exitCode: 1,
      timedOut: false,
      durationMs: 1000,
      counts: { passed: 1, failed: 1, flaky: 0, skipped: 0 },
      tests: [row("TC-ABC-1-001 escalates an old case", "passed"), row("emails the owner", "failed", ["@TC-ABC-2-001"], "Expected mail to <PERSON_1>")],
      errors: [],
    },
    { inputs: [], templateVersion: "t" },
  );
  return { casesRun: cases.runId, testRunRun: id };
}

/** Starts a document of `type`, submits `draft`, and returns the run and the draft step's result. */
async function draft(type: string, inputs: Record<string, unknown>, content: unknown) {
  const run = await engine.start("document", { type, ...inputs });
  expect(run.stepId).toBe(`draft-${type}`);
  return { run, result: await engine.submit(run.runId, `draft-${type}`, content) };
}

async function finish(runId: string): Promise<string> {
  expect((await engine.submit(runId, "review", { approved: true, changes: [] })).next.kind).toBe("done");
  const md = await readFile(join(dir, "runs", runId, "document.md"), "utf8");
  for (const s of SECRETS) expect(md, s).not.toContain(s);
  return md;
}

const strategy = {
  summary: "Risk-based testing of escalation and owner email.",
  context: { releaseType: "minor", businessImpact: "medium", targetUsers: ["Support agent"], integrations: ["Email service"], dependencies: [] },
  objectives: ["Escalation works on time"],
  levels: [
    { level: "system", objective: "Flows work end to end", approach: "Scripted cases in UAT.", entryCriteria: ["Deployed"], exitCriteria: ["No P1 open"] },
    { level: "integration", objective: "Email is sent", approach: "Check the email service.", entryCriteria: ["Service up"], exitCriteria: ["Mail received"] },
  ],
  types: [
    { type: "functional", reason: "Core behaviour", requirements: [] },
    { type: "regression", reason: "Existing escalation", requirements: ["ABC-1"] },
    { type: "integration", reason: "Email service", requirements: ["ABC-2"] },
  ],
  automation: { approach: "Automate the P1 cases first.", candidates: ["ABC-1"] },
  environments: ["UAT"],
  tools: ["Playwright"],
  defects: "Logged in Jira, triaged daily.",
  metrics: ["Pass rate"],
  risks: [{ risk: "Mail delays", mitigation: "Poll the inbox" }],
  assumptions: [],
};

const charter = {
  mission: "Learn how escalation behaves around the 2-day boundary.",
  inScope: ["Escalation"],
  outOfScope: [],
  areas: { complex: [{ area: "Business hours", requirements: ["ABC-1"] }], edgeCases: [], integrations: [{ area: "Email", requirements: ["ABC-2"] }], unclear: [{ area: "Who the owner is", requirements: ["ABC-2"] }] },
  techniques: ["Boundary exploration"],
  heuristics: [],
  sessions: [
    { title: "Boundary", focus: "Cases aged around 2 days", timeboxMinutes: 60, requirements: ["ABC-1"] },
    { title: "Mail", focus: "Owner email", timeboxMinutes: 30, requirements: ["ABC-2"] },
  ],
  personas: ["Support agent"],
  testData: [],
  debrief: "Notes per session, defects logged.",
  risks: [],
};

const risk = (n: number, over: Record<string, unknown> = {}) => ({
  title: `Risk ${n}`,
  description: "Something may go wrong.",
  category: "requirements",
  probability: 3,
  impact: 4,
  response: "mitigate",
  mitigation: "Ask the PO",
  contingency: "Delay the release",
  trigger: "Questions stay open",
  owner: "QA lead",
  requirements: ["ABC-2"],
  ...over,
});

const set = (n: number, requirement: string, kind: string, cases: string[] = []) => ({
  requirement,
  kind,
  description: `${kind} data`,
  fields: [{ name: "age (days)", value: kind === "valid" ? "3" : kind === "empty" ? "" : "-1" }],
  expected: kind === "valid" ? "Escalated" : "Refused",
  cases,
});

describe("document types (S4-4)", () => {
  it("registers the seven types, each with its own draft step", () => {
    expect(DOCUMENT_TYPES.map((t) => t.id)).toEqual(["test-strategy", "test-plan", "test-charter", "risk-register", "test-data", "traceability", "release-notes"]);
  });

  it("writes a test strategy, with functional and regression testing always", async () => {
    const { casesRun } = await sources();
    const { run, result } = await draft("test-strategy", { testCasesRun: casesRun }, { ...strategy, types: [strategy.types[2], strategy.types[2]], automation: { approach: "x", candidates: ["XYZ-1"] } });
    expect(errorsOf(result)).toEqual(
      expect.arrayContaining([
        { path: "$.types.1.type", message: "integration is listed more than once" },
        { path: "$.types", message: "a strategy always has functional testing" },
        { path: "$.types", message: "a strategy always has regression testing" },
        { path: "$.automation.candidates.0", message: "XYZ-1 isn't an issue of the context" },
      ]),
    );
    await engine.submit(run.runId, "draft-test-strategy", strategy);
    const md = await finish(run.runId);
    expect(md.indexOf("### Integration testing")).toBeLessThan(md.indexOf("### System testing"));
    expect(md).toContain("| integration | Email service | ABC-2 |");
    expect(md).toContain("Reviewed test cases (run");
  });

  it("writes a test charter whose sessions explore every issue", async () => {
    const req = await engine.start("requirements", { key: "ABC-1" });
    await engine.submit(req.runId, "analyze", good);
    const { run, result } = await draft("test-charter", { requirementsRun: req.runId }, { ...charter, sessions: [charter.sessions[0]] });
    expect(errorsOf(result)).toEqual([{ path: "$.sessions", message: "no session explores ABC-2" }]);
    await engine.submit(run.runId, "draft-test-charter", charter);
    const md = await finish(run.runId);
    expect(md).toContain("2 session(s), 1.5 h in all.");
    expect(md).toContain("- Who the owner is (ABC-2)");
  });

  it("writes a risk register, scored and ranked by Agent-QA, naming every weak issue", async () => {
    expect([scoreOf({ probability: 3, impact: 5 }), levelOf(15), levelOf(8), levelOf(7)]).toEqual([15, "high", "medium", "low"]);
    const { casesRun } = await sources();
    const { run, result } = await draft("risk-register", { testCasesRun: casesRun }, { summary: "s", risks: [risk(2, { requirements: ["ABC-1"] })], assumptions: [] });
    expect(errorsOf(result)).toEqual([
      { path: "$.risks", message: "ABC-2 score below 60 for quality: name each in at least one risk" },
    ]);
    await engine.submit(run.runId, "draft-risk-register", { summary: "s", risks: [risk(1, { probability: 1, impact: 2 }), risk(2, { probability: 5, impact: 4, requirements: [] })], assumptions: [] });
    const md = await finish(run.runId);
    expect(md).toContain("2 risk(s): 1 high, 0 medium, 1 low.");
    expect(md.indexOf("| R-002 |")).toBeLessThan(md.indexOf("| R-001 |"));
    expect(md).toContain("- ABC-1 AC2");
    expect(md).toContain("### R-002: Risk 2");
  });

  it("numbers risks and data sets itself, so the review can remove one in the middle", async () => {
    const req = await engine.start("requirements", { key: "ABC-1" });
    await engine.submit(req.runId, "analyze", good);
    const { run } = await draft("risk-register", { requirementsRun: req.runId }, { summary: "s", risks: [risk(1), risk(2), risk(3)], assumptions: [] });
    expect((await engine.submit(run.runId, "review", { approved: true, changes: [{ path: "$.risks.1" }] })).next.kind).toBe("done");
    const md = await readFile(join(dir, "runs", run.runId, "document.md"), "utf8");
    expect(md).toContain("### R-002: Risk 3");
    expect(md).not.toContain("R-003");
  });

  it("writes test data with valid and invalid sets per issue, tied to cases of the same issue", async () => {
    const { casesRun } = await sources();
    const bad = { summary: "s", sets: [set(1, "ABC-1", "valid", ["TC-ABC-2-001", "TC-ABC-9-001"]), set(2, "ABC-2", "invalid")], setup: [], rules: [] };
    const { run, result } = await draft("test-data", { testCasesRun: casesRun }, bad);
    expect(errorsOf(result)).toEqual([
      { path: "$.sets.0.cases.0", message: "TC-ABC-2-001 is a case of ABC-2, not of this set's issue" },
      { path: "$.sets.0.cases.1", message: "TC-ABC-9-001 isn't a reviewed case of the context" },
      { path: "$.sets", message: "ABC-1 has no invalid, boundary or empty data set" },
      { path: "$.sets", message: "ABC-2 has no valid data set" },
    ]);
    await engine.submit(run.runId, "draft-test-data", { summary: "s", sets: [set(1, "ABC-1", "valid", ["TC-ABC-1-001"]), set(2, "ABC-1", "empty"), set(3, "ABC-2", "valid"), set(4, "ABC-2", "boundary")], setup: [], rules: [] });
    const md = await finish(run.runId);
    expect(md).toContain("| ABC-1 | 1 | 0 | 0 | 1 | 0 |");
    expect(md).toContain("| age (days) | (empty) |");
    expect(md).toContain("### TD-004 (boundary)");
    expect(md).toContain("Used by TC-ABC-1-001.");
  });

  it("echoes no requirement the person types in the review, whatever its case", async () => {
    const { casesRun } = await sources();
    const { run } = await draft("test-data", { testCasesRun: casesRun }, { summary: "s", sets: [set(1, "ABC-1", "valid", ["TC-ABC-1-001"]), set(2, "ABC-1", "empty"), set(3, "ABC-2", "valid"), set(4, "ABC-2", "boundary")], setup: [], rules: [] });
    const errors = errorsOf(await engine.submit(run.runId, "review", { approved: true, changes: [{ path: "$.sets.0.requirement", value: "marguerite quillfeather" }] }));
    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors).toUpperCase()).not.toContain("MARGUERITE");
  });

  it("builds the traceability matrix from the cases and the test run, and makes the model name every gap", async () => {
    const { casesRun, testRunRun } = await sources();
    await expect(engine.start("document", { type: "traceability", key: "ABC-1" })).rejects.toThrow("give testCasesRun");
    const run = await engine.start("document", { type: "traceability", testCasesRun: casesRun, testRunRun });
    // The test run's tokens belong to another vault: hidden.
    expect(run.context).toContain("failed | emails the owner | Expected mail to [masked]");
    expect(run.context).toContain("ABC-1 | AC2 | no case");
    expect(run.context).toContain("ABC-2 | AC1 | TC-ABC-2-001 | failed");
    const rejected = await engine.submit(run.runId, "draft-traceability", { summary: "s", gaps: [{ requirement: "ABC-1", criterion: "AC9", note: "n" }], recommendations: [] });
    expect(errorsOf(rejected)).toEqual([
      { path: "$.gaps.0.criterion", message: "ABC-1 has no AC9" },
      { path: "$.gaps", message: "the matrix shows gaps the answer doesn't name: ABC-1 AC2, ABC-2 AC1" },
    ]);
    await engine.submit(run.runId, "draft-traceability", { summary: "s", gaps: [{ requirement: "ABC-1", criterion: "AC2", note: "No case" }, { requirement: "ABC-2", note: "Its case fails" }], recommendations: ["Add a case for AC2"] });
    const md = await finish(run.runId);
    expect(md).toContain("2 of 3 criteria have a reviewed case; 1 passed in the test run");
    expect(md).toContain("| ABC-1 | AC1 | TC-ABC-1-001 | passed |");
    expect(md).toContain("| ABC-1 | AC2 | none | no case |");
    expect(md).not.toContain("[masked]");
    const doc = (await runs.readArtifact(run.runId, DOCUMENT_ARTIFACT))!;
    expect(doc.inputs.map((i) => i.ref)).toEqual([`${casesRun}/requirements`, `${casesRun}/test-cases`, `${testRunRun}/test-run`]);
  });

  it("writes release notes with every issue once, the fix version and the testing figures", async () => {
    issues = issues.map((i) => ({ ...i, fixVersions: ["2026.11"] }));
    const { casesRun, testRunRun } = await sources();
    const { run, result } = await draft("release-notes", { testCasesRun: casesRun, testRunRun }, { summary: "s", highlights: [], items: [{ key: "ABC-1", category: "feature", note: "n" }], knownIssues: [{ description: "d", requirements: ["XYZ-1"] }], upgradeNotes: [] });
    expect(errorsOf(result)).toEqual([
      { path: "$.items", message: "no entry for ABC-2" },
      { path: "$.knownIssues.0.requirements.0", message: "XYZ-1 isn't an issue of the context" },
    ]);
    expect(run.context).toContain('"2026.11"');
    await engine.submit(run.runId, "draft-release-notes", { summary: "Escalation arrives.", highlights: ["Old cases escalate"], items: [{ key: "ABC-1", category: "feature", note: "Old cases escalate" }, { key: "abc-2", category: "improvement", note: "Owners get an email" }], knownIssues: [{ description: "Owner mail fails", requirements: ["ABC-2"] }], upgradeNotes: [] });
    const md = await finish(run.runId);
    expect(md).toContain("# Release notes: 2026.11");
    expect(md).toContain("## Improvements\n\n- **ABC-2** (Email the owner): Owners get an email");
    expect(md).toContain("- 2 reviewed test case(s) (run");
    expect(md).toContain(": failed, 1 passed, 1 failed, 0 flaky, 0 skipped.");
    expect(md).toContain("## Upgrade notes\n\nNothing to do.");
  });

  it("keeps test data values exact in the tables", async () => {
    const req = await engine.start("requirements", { key: "ABC-1" });
    await engine.submit(req.runId, "analyze", good);
    const odd = { ...set(1, "ABC-1", "boundary"), fields: [{ name: "input", value: "a|b `c`\nd" }, { name: "spaces", value: "  " }] };
    const { run } = await draft("test-data", { requirementsRun: req.runId }, { summary: "s", sets: [set(1, "ABC-1", "valid"), odd, set(3, "ABC-2", "valid"), set(4, "ABC-2", "empty")], setup: [], rules: [] });
    const md = await finish(run.runId);
    expect(md).toContain("| input | `` a\\|b `c`\\nd `` |");
    expect(md).toContain("| spaces | `  ` |");
  });

  it("counts a criterion as passed only when every case of it passed, matching whole case ids", () => {
    const req = (keys: Record<string, string[]>) => ({
      run: "r",
      data: { input: { key: "AB-1" }, truncated: false, unreachable: [], requirements: Object.entries(keys).map(([key, acs]) => ({ key, acceptanceCriteria: acs.map((id) => ({ id, text: id, origin: "jira" })) }) as never) },
    });
    const c = (id: string, covers: string[]) => ({ ...tc("AB-1", Number(id.slice(-3)), covers), id });
    const testCases = { run: "c", data: { cases: [c("TC-AB-1-001", ["AC1"]), c("TC-AB-1-002", ["AC1"]), c("TC-AB-1-003", ["AC2"]), c("TC-AB-1-004", ["AC3"])], uncovered: [], skipped: [] } as never };
    const t = (title: string, outcome: string) => ({ title, tags: [], file: "f", line: 1, outcome, runs: 1, failedRuns: 0 });
    const testRun = { run: "t", data: { tests: [t("TC-AB-1-001 ok", "passed"), t("TC-AB-1-003 skipped", "skipped"), t("TC-AB-1-0045 other", "failed"), t("TC-AB-1-004 ok", "passed")] } as never };
    const rows = matrixOf({ requirements: req({ "AB-1": ["AC1", "AC2", "AC3"] }), testCases, testRun });
    // AC1: one case passed, one never ran. AC2: skipped. AC3: TC-AB-1-0045's failure isn't TC-AB-1-004's.
    expect(rows.map((r) => [r.criterion, r.result])).toEqual([
      ["AC1", "not run"],
      ["AC2", "skipped"],
      ["AC3", "passed"],
    ]);
  });

  it("builds a matrix row for an issue with no criteria", () => {
    const rows = matrixOf({ requirements: { run: "r", data: { input: { key: "A-1" }, truncated: false, unreachable: [], requirements: [{ key: "A-1", acceptanceCriteria: [] } as never] } } });
    expect(rows).toEqual([{ key: "A-1", criterion: "", cases: [], result: "" }]);
  });
});
