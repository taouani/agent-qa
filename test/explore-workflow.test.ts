import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EngineError, RunStore, WorkflowEngine } from "../src/core/index.js";
import type { BrowserAction, ExplorerData, ExploreSetup, MaskedPage, MaskedResult } from "../src/data/index.js";
import { EXPLORATION_ARTIFACT, exploreWorkflow, progressOf, TEST_CASES_ARTIFACT, type TestCases } from "../src/workflows/index.js";

const HASH = "a".repeat(64);
const step = (action: string, expected: string) => ({ action, data: "", expected });
const CASES: TestCases = {
  requirements: { run: "req-run", sourceHash: HASH },
  cases: [
    { id: "TC-ABC-1-001", requirement: "ABC-1", title: "Create an approval request", type: "positive", priority: "P1", preconditions: [], steps: [step("Click New", "The form opens"), step("Save", "A toast says it was created")], covers: ["AC1"], review: "kept" },
    { id: "TC-ABC-1-002", requirement: "ABC-1", title: "Cancel an approval request", type: "negative", priority: "P2", preconditions: [], steps: [step("Click Cancel", "Nothing is saved")], covers: ["AC2"], review: "kept" },
  ],
  dropped: [],
  skipped: [],
  uncovered: [],
  review: { generated: 2, kept: 2, edited: 0, dropped: 0, keptRate: 1 },
};

/** The explorer, faked: records what it was asked, and answers every action with ok. */
function fakeExplorer() {
  const syncs: Array<{ caseId: string; actions: BrowserAction[]; approved: boolean; setup: ExploreSetup }> = [];
  const closed: string[] = [];
  const page: MaskedPage = { path: "/lightning/n/Approval_App", title: "Approvals | Salesforce", aria: '- button "New"\n- button "Save"', truncated: false, signedOut: false, settledMs: 5, busy: false };
  const data: ExplorerData & { maskTexts: (runId: string, texts: string[]) => Promise<string[]> } = {
    explorerTarget: async (role) => ({ kind: "salesforce", host: "acme--uat.sandbox.my.salesforce.com", ...(role ? { role } : {}) }),
    explorerSync: async (_runId, setup, caseId, actions, approved) => {
      syncs.push({ caseId, actions, approved, setup });
      const results: MaskedResult[] = actions.map((a) => ({ outcome: a.type === "verify" && a.text === "nope" ? "mismatch" : "ok", settledMs: 5, busy: false, page: "/lightning/n/Approval_App" }));
      return { results, page };
    },
    explorerClose: async (runId) => {
      closed.push(runId);
    },
    // A name the model typed is masked like any free text.
    maskTexts: async (_runId, texts) => texts.map((t) => t.replace(/Jane Doe/g, "<PERSON_1>")),
  };
  return { data, syncs, closed };
}

describe("explore workflow", () => {
  let dir: string;
  let runs: RunStore;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-explore-"));
    runs = new RunStore(join(dir, "runs"));
    await runs.create({ workflow: "test-cases", context: "ABC-1", host: "cli", driver: "api", id: "tc-run" });
    await runs.writeArtifact("tc-run", TEST_CASES_ARTIFACT, CASES, { inputs: [], templateVersion: "test-cases-1" });
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  function engine(fake: ReturnType<typeof fakeExplorer>) {
    return new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId }).register(exploreWorkflow({ data: fake.data, runs }));
  }
  const inputs = { testCasesRun: "tc-run", role: "StoreManager-FRA", start: "/lightning/n/Approval_App", maxActions: 5 };

  it("asks the person first, and a no ends the run with no browser", async () => {
    const fake = fakeExplorer();
    const e = engine(fake);
    const first = await e.start("explore", inputs);
    expect(first).toMatchObject({ stepId: "approve", kind: "confirm", approval: { yes: { approve: true } } });
    expect(first.context).toContain("acme--uat.sandbox.my.salesforce.com, as StoreManager-FRA");
    expect(first.context).toContain("TC-ABC-1-001: Create an approval request (2 step(s))");
    expect(await e.approval(first.runId, "approve")).toMatchObject({ question: expect.stringContaining("Explore 2 test case(s) in a browser signed in as StoreManager-FRA") });
    // The model's yes alone is refused: only the person may approve.
    await expect(e.submit(first.runId, "approve", { approve: true })).rejects.toMatchObject({ code: "NEEDS_PERSON" });
    expect((await e.submit(first.runId, "approve", { approve: false })).next.kind).toBe("done");
    expect(fake.syncs).toHaveLength(0);
  });

  it("walks each case one action at a time and writes exploration@1 as cases finish", async () => {
    const fake = fakeExplorer();
    const e = engine(fake);
    const first = await e.start("explore", inputs);
    let step = (await e.submit(first.runId, "approve", { approve: true }, { byPerson: true })).next;
    expect(step).toMatchObject({ stepId: "act_1", kind: "generate" });
    expect(step.context).toContain("## Case 1 of 2: TC-ABC-1-001");
    expect(step.context).toContain('- button "New"');
    expect(step.context).toContain("| 1 | Click New |  | The form opens | not-reached |");
    const answers = [
      { step: 1, action: { type: "click", target: { role: "button", name: "New" } } },
      { step: 1, action: { type: "verify", target: { role: "heading", name: "New request" } } },
      { step: 2, action: { type: "fill", target: { label: "Requester" }, value: "Jane Doe" }, note: "A required Region field appeared" },
      { step: 2, action: { type: "unverifiable", reason: "No toast appeared" } },
      { step: 2, action: { type: "finish", summary: "Saved without a toast" } },
    ];
    for (const [i, answer] of answers.entries()) {
      const result = await e.submit(first.runId, `act_${i + 1}`, answer);
      expect(result.status, JSON.stringify(result)).toBe("accepted");
      step = result.next;
    }
    // Case 2 starts with its own case id and no actions.
    expect(step.stepId).toBe("act_6");
    expect(step.context).toContain("## Case 2 of 2: TC-ABC-1-002");
    expect(fake.syncs.at(-1)).toMatchObject({ caseId: "TC-ABC-1-002", actions: [], approved: true, setup: { tokensRun: "req-run", role: "StoreManager-FRA" } });
    // The run state keeps the masked value, and the browser got it as the model's token.
    const fills = fake.syncs.flatMap((s) => s.actions).filter((a) => a.type === "fill");
    expect(fills.every((a) => a.type === "fill" && a.value === "<PERSON_1>")).toBe(true);
    const exploration = (await runs.readArtifact(first.runId, EXPLORATION_ARTIFACT))!.data;
    expect(exploration.cases).toHaveLength(1);
    const c = exploration.cases[0]!;
    expect(c).toMatchObject({ id: "TC-ABC-1-001", status: "complete", endedBy: "finish", summary: "Saved without a toast", deviations: [{ step: 2, note: "A required Region field appeared" }] });
    expect(c.steps.map((s) => s.status)).toEqual(["verified", "unverifiable"]);
    expect(c.steps[0]!.actions[0]).toMatchObject({ action: { type: "click" }, outcome: "ok" });
    expect(JSON.stringify(exploration)).not.toContain("Jane Doe");
    // Case 2: three unverifiable steps in a row end it, and the run.
    for (let i = 6; i <= 8; i++) step = (await e.submit(first.runId, `act_${i}`, { step: 1, action: { type: "unverifiable", reason: "No Cancel button" } })).next;
    expect(step.kind).toBe("done");
    const done = (await runs.readArtifact(first.runId, EXPLORATION_ARTIFACT))!.data;
    expect(done.cases.map((x) => [x.id, x.status, x.endedBy])).toEqual([
      ["TC-ABC-1-001", "complete", "finish"],
      ["TC-ABC-1-002", "partial", "unverifiable-streak"],
    ]);
    expect(fake.closed).toEqual([first.runId]);
  });

  it("checks the step number and the target, and caps a case's actions", async () => {
    const fake = fakeExplorer();
    const e = engine(fake);
    const first = await e.start("explore", { ...inputs, cases: ["TC-ABC-1-002"] });
    await e.submit(first.runId, "approve", { approve: true }, { byPerson: true });
    const bad = await e.submit(first.runId, "act_1", { step: 4, action: { type: "click", target: { role: "button", label: "x" } } });
    expect(bad.status).toBe("rejected");
    expect(bad.status === "rejected" && bad.errors.map((x) => x.path)).toEqual(["$.step", "$.action.target"]);
    let next;
    for (let i = 1; i <= 5; i++) next = (await e.submit(first.runId, `act_${i}`, { step: 1, action: { type: "click", target: { role: "button", name: "Cancel" } } })).next;
    expect(next!.kind).toBe("done");
    expect((await runs.readArtifact(first.runId, EXPLORATION_ARTIFACT))!.data.cases[0]).toMatchObject({ status: "partial", endedBy: "cap" });
  });

  it("refuses unknown case ids and a missing test-cases run", async () => {
    const e = engine(fakeExplorer());
    await expect(e.start("explore", { ...inputs, cases: ["TC-ABC-1-009"] })).rejects.toBeInstanceOf(EngineError);
    await expect(e.start("explore", { ...inputs, testCasesRun: "nope" })).rejects.toMatchObject({ code: "CONTEXT_FAILED" });
  });

  it("counts progress from the accepted actions alone", () => {
    const a = (type: string) => ({ step: 1, action: (type === "finish" ? { type } : type === "unverifiable" ? { type, reason: "x" } : { type, target: { role: "button" } }) as never });
    expect(progressOf([a("click"), a("finish"), a("click")], 2, 10)).toMatchObject({ index: 1, startAt: 2, done: false });
    expect(progressOf([a("click"), a("click")], 1, 2)).toMatchObject({ index: 1, done: true, ended: [{ from: 0, to: 2, endedBy: "cap" }] });
    expect(progressOf([a("unverifiable"), a("click"), a("unverifiable"), a("unverifiable"), a("unverifiable")], 1, 10)).toMatchObject({ done: true, ended: [{ endedBy: "unverifiable-streak", to: 5 }] });
  });
});
