import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RunStore, WorkflowEngine } from "../src/core/index.js";
import { fixSkeleton, listFolderFiles, scanGeneratedCode, type FrameworkProfile, type SavedProfile, type TestRunOutcome, type TypeDiagnostic } from "../src/data/index.js";
import { checkFix, EXPLORATION_ARTIFACT, lightningHelpersSource, SCRIPTS_PR_ARTIFACT, SCRIPTS_RUN_ARTIFACT, SCRIPTS_DRAFT_ARTIFACT, SCRIPTS_WRITTEN_ARTIFACT, scriptsWorkflow, TEST_CASES_ARTIFACT, withHelper, type Exploration, type ScriptsDeps, type TestCases } from "../src/workflows/index.js";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";

const HASH = "a".repeat(64);
const step = (action: string, expected: string) => ({ action, data: "", expected });
const CASES: TestCases = {
  requirements: { run: "req-run", sourceHash: HASH },
  cases: [{ id: "TC-ABC-1-001", requirement: "ABC-1", title: "Create an approval request", type: "positive", priority: "P1", preconditions: ["A store manager user"], steps: [step("Sign in as <PERSON_1>", "The app opens"), step("Create a request", "A toast says it was created")], covers: ["AC1"], review: "kept" }],
  dropped: [],
  skipped: [],
  uncovered: [],
  review: { generated: 1, kept: 1, edited: 0, dropped: 0, keptRate: 1 },
};

const PROFILE: FrameworkProfile = {
  folder: ".",
  kind: "playwright-bdd",
  packages: { playwright: "^1.58.0", playwrightBdd: "^8.5.1", faker: "^10.0.0" },
  config: { file: "playwright.config.ts", reporters: ["html"], projects: [], bdd: { features: ["tests/features"], steps: ["tests/step-definitions"] } },
  aliases: { "@pages/*": ["src/pages/*"] },
  steps: [
    { keyword: "Given", pattern: "I am logged into Salesforce as {string}", kind: "expression", file: "tests/step-definitions/authentication/login.steps.ts", line: 5, fixtures: ["pages"] },
    { keyword: "Then", pattern: "I see the toast {string}", kind: "expression", file: "tests/step-definitions/common/toast.steps.ts", line: 3, fixtures: ["pages"] },
  ],
  pages: [{ name: "ApprovalAppMainPage", file: "src/pages/approval-app-main-page.ts", extends: "BasePage", methods: ["navigateToNewForm"], signatures: { navigateToNewForm: "(): Promise<void>" } }],
  fixtures: [{ name: "pages", file: "src/fixtures/fixtures.ts" }],
  features: [{ file: "tests/features/ROPS-227-FRA.feature", scenarios: 3, tags: ["@positive"] }],
  locators: { getByRole: 10, getByLabel: 4, getByText: 0, getByTestId: 0, getByPlaceholder: 0, getByTitle: 0, getByAltText: 0, css: 3, xpath: 0 },
  locatorRanking: ["getByRole", "getByLabel", "css"],
  authFiles: ["src/auth/jwt.ts"],
  testData: { faker: true },
  files: 40,
  truncated: false,
  unparsed: [],
};

const EXPLORED: Exploration = {
  testCases: { run: "tc-run", sourceHash: HASH },
  target: { kind: "salesforce", host: "acme--uat.sandbox.my.salesforce.com", role: "StoreManager-FRA" },
  start: "/lightning/n/Approval_App",
  cases: [
    {
      id: "TC-ABC-1-001",
      title: "Create an approval request",
      status: "partial",
      endedBy: "finish",
      steps: [
        { index: 1, action: "Sign in", expected: "The app opens", status: "verified", actions: [{ action: { type: "verify", target: { role: "heading", name: "Approvals" } }, outcome: "ok", page: "/lightning/n/Approval_App", settledMs: 5, busy: false }] },
        { index: 2, action: "Create a request", expected: "A toast", status: "unverifiable", reason: "No toast appeared", actions: [{ action: { type: "click", target: { role: "button", name: "Save" } }, outcome: "ok", page: "/lightning/n/Approval_App", settledMs: 900, busy: true }] },
      ],
      deviations: [{ step: 2, note: "A required Region field appeared" }],
      pages: ["/lightning/n/Approval_App"],
    },
  ],
};

const FEATURE = `Feature: Approval requests

  @TC-ABC-1-001 @positive
  Scenario: Create an approval request
    Given I am logged into Salesforce as "StoreManager-FRA"
    When I create an approval request from the test data
    Then I see the toast "was created"
`;
const STEPS = `import { createBdd } from 'playwright-bdd';
import { test } from '@fixtures/fixtures';
import { expectToast } from '../../../src/support/lightning';

const { When } = createBdd(test);

When('I create an approval request from the test data', async ({ pages }) => {
  await pages.approvalAppMainPage.navigateToNewForm();
  await expectToast(pages.page, 'was created');
});
`;
const DRAFT = {
  files: [
    { path: "tests/features/ABC-1.feature", role: "feature", content: FEATURE },
    { path: "tests/step-definitions/approval-request/abc-1.steps.ts", role: "steps", content: STEPS },
    { path: "test-data/ABC-1.json", role: "data", content: JSON.stringify({ "Create an approval request": { reason: "Restock" } }) },
  ],
  cases: [{ id: "TC-ABC-1-001", steps: [{ step: 1, file: "tests/features/ABC-1.feature", line: 5 }, { step: 2, file: "tests/features/ABC-1.feature", line: 6 }, { step: 2, file: "tests/features/ABC-1.feature", line: 7 }] }],
  notes: ["Step 2: ask Jane Doe which Region to pick"],
};

const SAVED = { version: 1, folder: ".", kind: "playwright-bdd", commands: {}, reviewedAt: "2026-11-04T10:00:00.000Z" } as unknown as SavedProfile;

/** The data layer, faked: records which vault each mask call used. */
const TITLE = "Approval requests › Create an approval request";
const pass = (runs = 1): TestRunOutcome => ({ status: "done", exitCode: 0, timedOut: false, durationMs: 10, errors: [], tests: [{ title: TITLE, tags: ["@TC-ABC-1-001"], file: ".features-gen/ABC-1.feature.spec.js", line: 6, outcome: "passed", runs, failedRuns: 0 }] });
const fail = (message = "TimeoutError: locator.click: Timeout 5000ms exceeded.\nCall log:\n  - waiting for getByRole('button', { name: 'Save' })"): TestRunOutcome => ({
  status: "done",
  exitCode: 1,
  timedOut: false,
  durationMs: 10,
  errors: [],
  tests: [{ title: TITLE, tags: ["@TC-ABC-1-001"], file: ".features-gen/ABC-1.feature.spec.js", line: 6, outcome: "failed", runs: 1, failedRuns: 1, failure: { message, snippet: "> 8 | await pages.approvalAppMainPage.navigateToNewForm();", snapshot: "- button \"Save draft\"" } }],
});

function fakeData(over: Partial<ScriptsDeps["data"]> = {}, profile: FrameworkProfile = PROFILE, typeErrors: (files: ReadonlyArray<{ path: string; content: string }>) => TypeDiagnostic[] = () => []) {
  const vaults: string[] = [];
  const checked: string[][] = [];
  const writes: string[][] = [];
  const folders: string[] = [];
  const testRuns: Array<{ files: string[]; repeatEach?: number }> = [];
  const replaced: Array<Array<{ path: string; sha256: string }>> = [];
  const results: TestRunOutcome[] = [];
  const prs: Array<{ folder: string; files: ReadonlyArray<{ path: string; sha256: string }>; title: string; body: string; draft: boolean }> = [];
  const data: ScriptsDeps["data"] = {
    frameworkProfile: async (_run, _folder, tokensRun) => {
      vaults.push(`profile:${tokensRun}`);
      return profile;
    },
    savedProfile: async () => SAVED,
    typeCheckReadiness: async () => ({ ready: true }),
    testRunReadiness: async () => ({ ready: false, reason: "not in this test" }),
    runGeneratedTests: async (_run, _tokens, _folder, request, approved) => {
      if (!approved) return { status: "declined" };
      testRuns.push(request);
      return results.shift() ?? pass();
    },
    replaceGeneratedFiles: async (_run, _tokens, _folder, files, approved) => {
      if (!approved) return { status: "declined" };
      replaced.push(files.map((f) => ({ path: f.path, sha256: f.sha256 })));
      return { status: "done", written: files.map((f) => f.path) };
    },
    writeGeneratedFiles: async (_run, tokensRun, folder, files, approved) => {
      vaults.push(`write:${tokensRun}`);
      folders.push(folder);
      if (!approved) return { status: "declined" };
      writes.push(files.map((f) => f.path));
      return { status: "done", written: files.map((f) => f.path) };
    },
    typeCheck: async (_run, tokensRun, files, approved) => {
      vaults.push(`typecheck:${tokensRun}`);
      if (!approved) return { status: "declined" };
      checked.push(files.map((f) => f.path));
      return { status: "done", diagnostics: typeErrors(files) };
    },
    frameworkFiles: async () => ({ files: ["src/fixtures/fixtures.ts", "src/pages/approval-app-main-page.ts", "tests/features/ROPS-227-FRA.feature", "playwright.config.ts", "tests/shared"], links: ["tests/shared"] }),
    pullRequestReadiness: async () => ({ ready: false, reason: "not in this test" }),
    openPullRequest: async (_run, _tokens, folder, pr) => {
      prs.push({ folder, ...pr });
      return { status: "done", number: 7, url: "https://github.com/o/r/pull/7", base: "main", branch: "agent-qa/run", draft: pr.draft, created: true };
    },
    maskTexts: async (run, texts) => {
      vaults.push(`notes:${run}`);
      return texts.map((t) => t.replace(/Jane Doe/g, "<PERSON_1>"));
    },
    ...over,
  };
  return Object.assign(data, { vaults, checked, writes, folders, testRuns, replaced, results, prs });
}

describe("scripts workflow", () => {
  let dir: string;
  let runs: RunStore;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-scripts-"));
    runs = new RunStore(join(dir, "runs"));
    await runs.create({ workflow: "test-cases", context: "ABC-1", host: "cli", driver: "api", id: "tc-run" });
    await runs.writeArtifact("tc-run", TEST_CASES_ARTIFACT, CASES, { inputs: [], templateVersion: "test-cases-1" });
    await runs.create({ workflow: "explore", context: "ABC-1", host: "cli", driver: "api", id: "ex-run" });
    await runs.writeArtifact("ex-run", EXPLORATION_ARTIFACT, EXPLORED, { inputs: [], templateVersion: "exploration-1" });
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  /** Starts a run and answers the type-check question (the person's own answer). */
  const begin = async (e: WorkflowEngine, inputs: Record<string, unknown>, approve = true) => {
    const first = await e.start("scripts", inputs);
    expect(first.stepId).toBe("typecheck");
    const next = (await e.submit(first.runId, "typecheck", { approve }, { byPerson: true })).next;
    return { runId: first.runId, context: next.context, next };
  };
  const engine = (data: ScriptsDeps["data"] = fakeData()) => new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId }).register(scriptsWorkflow({ data, runs }));

  it("shows the repo, the pack, the cases and the exploration, then keeps the checked draft", async () => {
    const e = engine();
    const first = await begin(e, { testCasesRun: "tc-run", explorationRun: "ex-run" });
    expect(first.next).toMatchObject({ stepId: "draft", kind: "generate" });
    const ctx = first.context!;
    expect(ctx).toContain("## The repo: playwright-bdd in .");
    expect(ctx).toContain("| Given | I am logged into Salesforce as {string} | expression | tests/step-definitions/authentication/login.steps.ts:5 |");
    expect(ctx).toContain("- ApprovalAppMainPage extends BasePage (src/pages/approval-app-main-page.ts): navigateToNewForm(): Promise<void>");
    expect(ctx).toContain("@faker-js/faker is installed");
    expect(ctx).toContain("## Salesforce Lightning rules");
    expect(ctx).toContain("The pack's helper file goes at src/support/lightning.ts");
    expect(ctx).toContain("| 1 | Sign in as <PERSON_1> |  | The app opens |");
    expect(ctx).toContain('- Step 2: unverifiable (No toast appeared)');
    expect(ctx).toContain('  - click button "Save" → ok on /lightning/n/Approval_App, waited for a spinner');
    expect(ctx).toContain("- Note on step 2: A required Region field appeared");

    const result = await e.submit(first.runId, "draft", DRAFT);
    expect(result.status, JSON.stringify(result)).toBe("accepted");
    expect(result.next).toMatchObject({ stepId: "review", kind: "confirm" });
    const art = (await runs.readArtifact(first.runId, SCRIPTS_DRAFT_ARTIFACT))!.data;
    expect(art).toMatchObject({ folder: ".", kind: "playwright-bdd", testCases: { run: "tc-run" }, exploration: { run: "ex-run" }, notes: ["Step 2: ask <PERSON_1> which Region to pick"] });
    // The steps import the helper file, so the server added the pack's copy.
    expect(art.files.map((f) => f.path)).toEqual([...DRAFT.files.map((f) => f.path), "src/support/lightning.ts"]);
    expect(art.files.at(-1)!.content).toBe(lightningHelpersSource());
    expect(art.typeCheck).toEqual({ status: "passed" });
  });

  it("asks before the type check, sends its errors back to the model, and records a no", async () => {
    const e0 = engine();
    const asked = await e0.start("scripts", { testCasesRun: "tc-run" });
    expect(await e0.approval(asked.runId, "typecheck")).toMatchObject({ question: expect.stringContaining("Type-check the generated code with your repo's TypeScript (in the repo root)? Agent-QA runs the typescript package from your node_modules") });
    await expect(e0.submit(asked.runId, "typecheck", { approve: true })).rejects.toMatchObject({ code: "NEEDS_PERSON" });

    const data = fakeData({}, PROFILE, (files) => (files.some((f) => f.content.includes("navigateToNewForm(1)")) ? [{ file: "tests/step-definitions/approval-request/abc-1.steps.ts", line: 8, code: 2554, message: "Expected 0 arguments, but got 1." }] : []));
    const e = engine(data);
    const run = await begin(e, { testCasesRun: "tc-run" });
    const bad = { ...DRAFT, files: [DRAFT.files[0]!, { ...DRAFT.files[1]!, content: STEPS.replace("navigateToNewForm()", "navigateToNewForm(1)") }, DRAFT.files[2]!] };
    const rejected = await e.submit(run.runId, "draft", bad);
    expect(rejected.status === "rejected" && rejected.errors).toEqual([{ path: "$.files[1].content", message: "line 8: TS2554 Expected 0 arguments, but got 1." }]);
    // The feature isn't TypeScript; the data file and the helper the server adds are checked with the code.
    expect(data.checked[0]).toEqual(["tests/step-definitions/approval-request/abc-1.steps.ts", "test-data/ABC-1.json", "src/support/lightning.ts"]);
    expect((await e.submit(run.runId, "draft", DRAFT)).status).toBe("accepted");

    const no = await begin(engine(), { testCasesRun: "tc-run" }, false);
    expect((await engine().submit(no.runId, "draft", DRAFT)).status).toBe("accepted");
    expect((await runs.readArtifact(no.runId, SCRIPTS_DRAFT_ARTIFACT))!.data.typeCheck).toEqual({ status: "skipped", reason: "not approved: the person said no, or nobody was asked (an unattended run)" });
  });

  it("asks nothing when a type check couldn't run, and records why", async () => {
    const data = fakeData({ typeCheckReadiness: async () => ({ ready: false, reason: "TypeScript isn't installed in the repo" }) });
    const e = engine(data);
    const first = await e.start("scripts", { testCasesRun: "tc-run" });
    expect(first.stepId).toBe("draft");
    expect((await e.submit(first.runId, "draft", DRAFT)).status).toBe("accepted");
    expect(data.checked).toEqual([]);
    expect((await runs.readArtifact(first.runId, SCRIPTS_DRAFT_ARTIFACT))!.data.typeCheck).toEqual({ status: "unavailable", reason: "TypeScript isn't installed in the repo" });
  });

  it("type-checks only code that passed the other checks", async () => {
    const data = fakeData();
    const e = engine(data);
    const run = await begin(e, { testCasesRun: "tc-run" });
    await e.submit(run.runId, "draft", { ...DRAFT, files: [{ ...DRAFT.files[0]!, content: FEATURE.replace("@TC-ABC-1-001 ", "") }, ...DRAFT.files.slice(1)] });
    expect(data.checked).toEqual([]);
  });

  it("keeps the draft when the repo can't type-check, and says why", async () => {
    const e = engine(fakeData({ typeCheck: async () => ({ status: "unavailable", reason: "TypeScript isn't installed in the repo" }) }));
    const run = await begin(e, { testCasesRun: "tc-run" });
    expect((await e.submit(run.runId, "draft", DRAFT)).status).toBe("accepted");
    expect((await runs.readArtifact(run.runId, SCRIPTS_DRAFT_ARTIFACT))!.data.typeCheck).toEqual({ status: "unavailable", reason: "TypeScript isn't installed in the repo" });
  });

  it("shows the files for review and writes them only on the person's yes", async () => {
    const data = fakeData();
    const e = engine(data);
    const run = await begin(e, { testCasesRun: "tc-run" });
    const review = (await e.submit(run.runId, "draft", DRAFT)).next;
    expect(review.context).toContain("### tests/features/ABC-1.feature (feature)");
    expect(review.context).toContain("```gherkin\nFeature: Approval requests");
    expect(review.context).toContain("### src/support/lightning.ts (helper, the Salesforce pack's helpers, unchanged)");
    expect(review.context).toContain("Type check: passed.");
    expect(review.context).toContain("- Step 2: ask <PERSON_1> which Region to pick");
    expect(await e.approval(run.runId, "review")).toMatchObject({ question: `Write these 4 new file(s) to the repo root: ${[...DRAFT.files.map((f) => f.path), "src/support/lightning.ts"].join(", ")}? Agent-QA only creates files: if one exists by then with other content, nothing is written.` });
    await expect(e.submit(run.runId, "review", { write: true })).rejects.toMatchObject({ code: "NEEDS_PERSON" });
    expect((await e.submit(run.runId, "review", { write: true }, { byPerson: true })).next.kind).toBe("done");
    expect(data.writes).toEqual([[...DRAFT.files.map((f) => f.path), "src/support/lightning.ts"]]);
    const written = (await runs.readArtifact(run.runId, SCRIPTS_WRITTEN_ARTIFACT))!.data;
    expect(written).toMatchObject({ status: "written", folder: "." });
    expect(written.files.map((f) => f.path)).toEqual(data.writes[0]);

    const no = await begin(e, { testCasesRun: "tc-run" });
    await e.submit(no.runId, "draft", DRAFT);
    await e.submit(no.runId, "review", { write: false });
    expect(data.writes).toHaveLength(1);
    expect((await runs.readArtifact(no.runId, SCRIPTS_WRITTEN_ARTIFACT))!.data).toEqual({ status: "declined", folder: ".", files: [] });
  });

  it("writes only the draft the review showed, and keeps the step open when the write fails", async () => {
    let fail = true;
    const data = fakeData({});
    const write = data.writeGeneratedFiles;
    data.writeGeneratedFiles = async (...args) => {
      if (fail && args[4]) {
        fail = false;
        throw new Error("disk full");
      }
      return write(...args);
    };
    const e = engine(data);
    const run = await begin(e, { testCasesRun: "tc-run" });
    await e.submit(run.runId, "draft", DRAFT);
    await e.approval(run.runId, "review");
    // The folder the person was told is the folder passed to the write.
    await expect(e.submit(run.runId, "review", { write: true }, { byPerson: true })).rejects.toThrow(/disk full/);
    expect((await e.next(run.runId)).stepId).toBe("review");
    expect(await runs.readArtifact(run.runId, SCRIPTS_WRITTEN_ARTIFACT)).toBeUndefined();
    // The draft changed in the run folder after the review showed it: nothing is written.
    const art = (await runs.readArtifact(run.runId, SCRIPTS_DRAFT_ARTIFACT))!;
    const changed = { ...art.data, files: art.data.files.map((f, i) => (i === 0 ? { ...f, content: `${f.content}// changed\n` } : f)) };
    await runs.writeArtifact(run.runId, SCRIPTS_DRAFT_ARTIFACT, changed, { inputs: [], templateVersion: "t" });
    await expect(e.submit(run.runId, "review", { write: true }, { byPerson: true })).rejects.toThrow(/changed after the review showed it/);
    expect(data.writes).toEqual([]);
    // The question doesn't take the changed draft as shown either (in MCP it comes inside the submit).
    await expect(e.approval(run.runId, "review")).rejects.toThrow(/changed after the review showed it/);
    await expect(e.submit(run.runId, "review", {}, { approve: async (a) => a.yes })).rejects.toThrow(/changed after the review showed it/);
    expect(data.writes).toEqual([]);
    // Shown again, it can be written.
    await e.next(run.runId);
    await e.approval(run.runId, "review");
    expect((await e.submit(run.runId, "review", { write: true }, { byPerson: true })).next.kind).toBe("done");
    expect(data.writes).toHaveLength(1);
    expect(data.folders).toEqual(["."]);
  });

  it("masks the profile and the notes with the cases' vault", async () => {
    const data = fakeData();
    const e = engine(data);
    const first = await begin(e, { testCasesRun: "tc-run" });
    await e.submit(first.runId, "draft", DRAFT);
    expect(new Set(data.vaults)).toEqual(new Set(["profile:req-run", "notes:req-run", "typecheck:req-run"]));
  });

  it("refuses a draft that replaces a repo file or writes the helper itself", async () => {
    const e = engine();
    const first = await begin(e, { testCasesRun: "tc-run" });
    // Each draft in a run of its own: three rejections end a run.
    const fresh = async () => (await begin(e, { testCasesRun: "tc-run" })).runId;
    const replaced = await e.submit(first.runId, "draft", { ...DRAFT, files: [...DRAFT.files, { path: "SRC/Pages/approval-app-main-page.ts", role: "page", content: "export class X {}" }] });
    expect(replaced.status).toBe("rejected");
    expect(replaced.status === "rejected" && replaced.errors.map((x) => x.message).join("\n")).toContain("already exists");
    const helper = await e.submit(await fresh(), "draft", { ...DRAFT, files: [...DRAFT.files, { path: "src/support/lightning.ts", role: "helper", content: "x" }] });
    expect(helper.status === "rejected" && helper.errors).toEqual([expect.objectContaining({ path: "$.files[3]" })]);
    const sameAsHelper = await e.submit(await fresh(), "draft", { ...DRAFT, files: [...DRAFT.files, { path: "src/support/lightning.ts", role: "page", content: "export {};" }] });
    expect(sameAsHelper.status === "rejected" && sameAsHelper.errors).toEqual([expect.objectContaining({ path: "$.files[3]" })]);
    const alias = await e.submit(await fresh(), "draft", { ...DRAFT, files: [DRAFT.files[0]!, { ...DRAFT.files[1]!, content: STEPS.replace("'../../../src/support/lightning'", "'@support/lightning'") }, DRAFT.files[2]!] });
    expect(alias.status === "rejected" && alias.errors.map((x) => x.message)).toEqual(["imports @support/lightning: import the helper file with a relative path"]);
    const linked = await e.submit(await fresh(), "draft", { ...DRAFT, files: [...DRAFT.files, { path: "tests/Shared/pages/request.ts", role: "page", content: "export class Request {}" }] });
    expect(linked.status === "rejected" && linked.errors.map((x) => x.message).join("\n")).toContain("under a symbolic link");
    // 30 files and the helper the server adds would be 31: refused as an error the model can fix.
    const many = Array.from({ length: 27 }, (_, i) => ({ path: `test-data/extra-${i}.json`, role: "data", content: "{}" }));
    const full = await e.submit(await fresh(), "draft", { ...DRAFT, files: [...DRAFT.files, ...many] });
    expect(full.status === "rejected" && full.errors).toEqual([expect.objectContaining({ path: "$.files", message: expect.stringContaining("at most 29 files") })]);
    // Without an exploration the context says nothing about one.
    expect(first.context).not.toContain("Not explored");
  });

  it("refuses bad inputs before a run is saved", async () => {
    const e = engine();
    await expect(e.start("scripts", { testCasesRun: "nope" })).rejects.toMatchObject({ code: "INVALID_INPUTS" });
    await expect(e.start("scripts", { testCasesRun: "tc-run", cases: ["TC-ABC-1-009"] })).rejects.toMatchObject({ code: "INVALID_INPUTS" });
    await expect(e.start("scripts", { testCasesRun: "tc-run", explorationRun: "tc-run" })).rejects.toMatchObject({ code: "INVALID_INPUTS" });
    await runs.writeArtifact("ex-run", EXPLORATION_ARTIFACT, { ...EXPLORED, testCases: { run: "other", sourceHash: HASH } }, { inputs: [], templateVersion: "exploration-1" });
    await expect(e.start("scripts", { testCasesRun: "tc-run", explorationRun: "ex-run" })).rejects.toMatchObject({ code: "INVALID_INPUTS", message: expect.stringContaining("explored the cases of run other") });
    const many = { ...CASES, cases: Array.from({ length: 21 }, (_, i) => ({ ...CASES.cases[0]!, id: `TC-ABC-1-${String(i + 1).padStart(3, "0")}` })) };
    await runs.writeArtifact("tc-run", TEST_CASES_ARTIFACT, many, { inputs: [], templateVersion: "test-cases-1" });
    await expect(e.start("scripts", { testCasesRun: "tc-run" })).rejects.toMatchObject({ code: "INVALID_INPUTS", message: expect.stringContaining("has 21 reviewed cases; name at most 20") });
    await expect(engine(fakeData({ savedProfile: async () => undefined })).start("scripts", { testCasesRun: "tc-run", cases: ["TC-ABC-1-001"] })).rejects.toMatchObject({ code: "INVALID_INPUTS", message: expect.stringContaining("no reviewed framework profile") });
  });

  it("writes plain specs for a web app, with no Salesforce pack or helper", async () => {
    const plain: FrameworkProfile = { ...PROFILE, kind: "playwright", steps: [], features: [], config: { ...PROFILE.config, bdd: undefined } as FrameworkProfile["config"] };
    delete (plain.config as { bdd?: unknown }).bdd;
    const web = { ...EXPLORED, target: { kind: "web" as const, host: "shop.example.com" }, cases: [] };
    await runs.writeArtifact("ex-run", EXPLORATION_ARTIFACT, web, { inputs: [], templateVersion: "exploration-1" });
    const e = engine(fakeData({ savedProfile: async () => ({ ...SAVED, kind: "playwright" }) }, plain));
    const first = await begin(e, { testCasesRun: "tc-run", explorationRun: "ex-run" });
    expect(first.context).toContain("## Rules (a web app, not Salesforce)");
    expect(first.context).not.toContain("Salesforce Lightning rules");
    expect(first.context).not.toContain("helper file");
    expect(first.context).toContain("Not explored.");
    const spec = `import { test } from '@playwright/test';
import { x } from './support/lightning';

test('TC-ABC-1-001 Create an approval request', async ({ page }) => {
  await test.step('1. Sign in', async () => {});
  await test.step('2. Create a request', async () => {});
});
`;
    const draft = (content: string) => ({ files: [{ path: "tests/abc-1.spec.ts", role: "spec", content }], cases: [{ id: "TC-ABC-1-001", steps: [{ step: 1, file: "tests/abc-1.spec.ts", line: 5 }, { step: 2, file: "tests/abc-1.spec.ts", line: 6 }] }], notes: [] });
    // A web app has no helper file to import.
    const helper = await e.submit(first.runId, "draft", draft(spec.replace("import { x } from './support/lightning';", "import { x } from '../src/support/lightning';")));
    expect(helper.status === "rejected" && helper.errors.map((x) => x.message)).toEqual(["this is a web app, not Salesforce: there is no helper file to import"]);
    const result = await e.submit(first.runId, "draft", draft(spec.replace("import { x } from './support/lightning';", "import { expect } from '@playwright/test';")));
    expect(result.status, JSON.stringify(result)).toBe("accepted");
    expect((await runs.readArtifact(first.runId, SCRIPTS_DRAFT_ARTIFACT))!.data.files.map((f) => f.path)).toEqual(["tests/abc-1.spec.ts"]);
  });

  it("refuses a repo that changed kind since the profile was reviewed", async () => {
    const e = engine(fakeData({ savedProfile: async () => ({ ...SAVED, kind: "playwright" }) }));
    await expect(begin(e, { testCasesRun: "tc-run" })).rejects.toThrow(/the repo is now playwright-bdd, but the reviewed profile says playwright/);
  });

  it("reads an exploration again for each run", async () => {
    const e = engine();
    await runs.writeArtifact("ex-run", EXPLORATION_ARTIFACT, { ...EXPLORED, cases: [] }, { inputs: [], templateVersion: "exploration-1" });
    expect((await begin(e, { testCasesRun: "tc-run", explorationRun: "ex-run" })).context).toContain("Not explored.");
    await runs.writeArtifact("ex-run", EXPLORATION_ARTIFACT, EXPLORED, { inputs: [], templateVersion: "exploration-1" });
    expect((await begin(e, { testCasesRun: "tc-run", explorationRun: "ex-run" })).context).not.toContain("Not explored.");
  });

  /** A run written to the repo, at the run step; `ready` says whether the tests can run. */
  const written = async (data = fakeData({ testRunReadiness: async () => ({ ready: true }) }), inputs: Record<string, unknown> = {}) => {
    const e = engine(data);
    const run = await begin(e, { testCasesRun: "tc-run", ...inputs });
    await e.submit(run.runId, "draft", DRAFT);
    const next = (await e.submit(run.runId, "review", { write: true }, { byPerson: true })).next;
    return { e, data, runId: run.runId, next };
  };
  const steps = "tests/step-definitions/approval-request/abc-1.steps.ts";
  const fixedSteps = STEPS.replace("await pages.approvalAppMainPage.navigateToNewForm();", "await pages.approvalAppMainPage.navigateToNewForm();\n  await expect(pages.page.getByRole('button', { name: 'Save draft' })).toBeVisible();");

  it("asks before running the tests, runs the features, then again to see they are stable", async () => {
    const { e, data, runId, next } = await written();
    expect(next.stepId).toBe("run");
    expect(await e.approval(runId, "run")).toMatchObject({ question: expect.stringContaining("Run the generated tests with your repo's Playwright in the repo root?") });
    await expect(e.submit(runId, "run", { run: true })).rejects.toMatchObject({ code: "NEEDS_PERSON" });
    expect((await e.submit(runId, "run", { run: true }, { byPerson: true })).next.kind).toBe("done");
    expect(data.testRuns).toEqual([{ files: ["tests/features/ABC-1.feature"] }, { files: ["tests/features/ABC-1.feature"], repeatEach: 3 }]);
    const r = (await runs.readArtifact(runId, SCRIPTS_RUN_ARTIFACT))!.data;
    expect(r).toMatchObject({ status: "passed", reason: "every test passed, then 3 more time(s) in a row", rounds: 0 });
    expect(r.attempts.map((a) => a.kind)).toEqual(["run", "stability"]);

    // No: nothing runs; and with no way to run, nobody is asked.
    const no = await written();
    expect((await no.e.submit(no.runId, "run", { run: false })).next.kind).toBe("done");
    expect(no.data.testRuns).toEqual([]);
    expect((await runs.readArtifact(no.runId, SCRIPTS_RUN_ARTIFACT))!.data.status).toBe("declined");
    const none = await written(fakeData());
    expect(none.next.kind).toBe("done");
  });

  it("fixes a selector in the files it wrote, runs again, and stops once they pass", async () => {
    const { e, data, runId } = await written();
    data.results.push(fail());
    const fix = (await e.submit(runId, "run", { run: true }, { byPerson: true })).next;
    expect(fix).toMatchObject({ stepId: "fix_1", kind: "generate" });
    expect(fix.context).toContain("## Fix round 1 of 3");
    expect(fix.context).toContain(`### ${TITLE}`);
    expect(fix.context).toContain("waiting for getByRole('button', { name: 'Save' })");
    expect(fix.context).toContain('- button "Save draft"');
    expect(fix.context).toContain("### tests/features/ABC-1.feature (feature, never changed)");
    const changed = { failures: [{ test: TITLE, kind: "selector", reason: "the button is Save draft" }], files: [{ path: steps, content: fixedSteps }] };
    const done = await e.submit(runId, "fix_1", changed);
    expect(done.status, JSON.stringify(done)).toBe("accepted");
    expect(done.next.kind).toBe("done");
    expect(data.replaced).toEqual([[{ path: steps, sha256: createHash("sha256").update(STEPS).digest("hex") }]]);
    const r = (await runs.readArtifact(runId, SCRIPTS_RUN_ARTIFACT))!.data;
    expect(r).toMatchObject({ status: "passed", rounds: 1 });
    expect(r.attempts.map((a) => [a.kind, a.changed])).toEqual([["run", []], ["run", [steps]], ["stability", []]]);
    expect(r.files.find((f) => f.path === steps)).toMatchObject({ content: fixedSteps, sha256: createHash("sha256").update(fixedSteps).digest("hex") });
  });

  it("refuses fixes that change the scenarios, weaken a check or hide a failure", async () => {
    const { e, data, runId } = await written();
    data.results.push(fail());
    await e.submit(runId, "run", { run: true }, { byPerson: true });
    const r = await e.submit(runId, "fix_1", {
      failures: [{ test: "Something else", kind: "selector", reason: "x" }],
      files: [{ path: "tests/features/ABC-1.feature", content: FEATURE.replace("was created", "was saved") }, { path: "src/pages/approval-app-main-page.ts", content: "x" }],
    });
    expect(r.status).toBe("rejected");
    const messages = (r as { errors: { message: string }[] }).errors.map((x) => x.message).join("\n");
    expect(messages).toContain("isn't a failure of the last run");
    expect(messages).toContain(`say what kind of failure ${JSON.stringify(TITLE)} is`);
    expect(messages).toContain("a fix never changes a feature file");
    expect(messages).toContain("isn't a file Agent-QA wrote");
    expect(data.replaced).toEqual([]);
  });

  it("stops on a real defect and changes nothing", async () => {
    const { e, data, runId } = await written();
    data.results.push(fail("Error: expect(locator).toHaveText(expected)\nExpected: was created\nReceived: Something went wrong"));
    await e.submit(runId, "run", { run: true }, { byPerson: true });
    const withFiles = await e.submit(runId, "fix_1", { failures: [{ test: TITLE, kind: "defect", reason: "the app shows an error" }], files: [{ path: steps, content: fixedSteps }] });
    expect(withFiles.status).toBe("rejected");
    const done = await e.submit(runId, "fix_1", { failures: [{ test: TITLE, kind: "defect", reason: "the app shows an error instead of the toast" }] });
    expect(done.next.kind).toBe("done");
    expect(data.replaced).toEqual([]);
    expect(data.testRuns).toHaveLength(1);
    expect((await runs.readArtifact(runId, SCRIPTS_RUN_ARTIFACT))!.data).toMatchObject({ status: "defect", reason: `a real defect: ${TITLE}: the app shows an error instead of the toast`, stoppedOn: [{ kind: "defect" }] });
  });

  it("gives up after the last fix round, and says when tests pass only some of the time", async () => {
    const { e, data, runId } = await written(undefined, { fixRounds: 1 });
    data.results.push(fail(), fail());
    const fix = (await e.submit(runId, "run", { run: true }, { byPerson: true })).next;
    expect(fix.stepId).toBe("fix");
    expect((await e.submit(runId, "fix", { failures: [{ test: TITLE, kind: "flake", reason: "the toast came late once" }] })).next.kind).toBe("done");
    expect((await runs.readArtifact(runId, SCRIPTS_RUN_ARTIFACT))!.data).toMatchObject({ status: "gave-up", reason: "still failing after 1 fix round(s)" });

    const flaky = await written(undefined, { fixRounds: 0 });
    const three = pass(3) as Extract<TestRunOutcome, { status: "done" }>;
    flaky.data.results.push(pass(), { ...three, exitCode: 1, tests: [{ ...three.tests[0]!, outcome: "flaky", failedRuns: 1 }] });
    expect((await flaky.e.submit(flaky.runId, "run", { run: true }, { byPerson: true })).next.kind).toBe("done");
    expect((await runs.readArtifact(flaky.runId, SCRIPTS_RUN_ARTIFACT))!.data.status).toBe("unstable");
  });

  it("goes on after a stop halfway through a fix round, from what is in the repo", async () => {
    const { e, data, runId } = await written();
    data.results.push(fail());
    await e.submit(runId, "run", { run: true }, { byPerson: true });
    const run = data.runGeneratedTests;
    let broken = true;
    data.runGeneratedTests = async (...args) => {
      if (broken) {
        broken = false;
        throw new Error("the IDE closed");
      }
      return run(...args);
    };
    const fix = { failures: [{ test: TITLE, kind: "selector", reason: "the button is Save draft" }], files: [{ path: steps, content: fixedSteps }] };
    await expect(e.submit(runId, "fix_1", fix)).rejects.toThrow(/the IDE closed/);
    // The fix is in the repo and in the record, its run still owed.
    const mid = (await runs.readArtifact(runId, SCRIPTS_RUN_ARTIFACT))!.data;
    expect(mid).toMatchObject({ status: "failing", rounds: 1, pending: { changed: [steps] } });
    expect(mid.files.find((f) => f.path === steps)!.content).toBe(fixedSteps);
    // Another answer for the same round changes nothing more: only the owed run happens.
    const other = { failures: [{ test: TITLE, kind: "timing", reason: "slow" }], files: [{ path: steps, content: `${fixedSteps}\n` }] };
    expect((await e.submit(runId, "fix_1", other)).next.kind).toBe("done");
    expect(data.replaced).toHaveLength(1);
    const end = (await runs.readArtifact(runId, SCRIPTS_RUN_ARTIFACT))!.data;
    expect(end).toMatchObject({ status: "passed" });
    expect(end.pending).toBeUndefined();
    expect(end.attempts[1]).toMatchObject({ changed: [steps], classified: [{ kind: "selector" }] });
  });

  /** CI: the files are in the job's checkout, and leave only as a pull request. */
  const inCi = (over: Partial<ScriptsDeps["data"]> = {}) =>
    fakeData({
      testRunReadiness: async () => ({ ready: true }),
      pullRequestReadiness: async () => ({ ready: true, repo: "o/r" }),
      writeGeneratedFiles: async (_run, _tokens, _folder, files, approved) => (approved ? { status: "done", written: files.map((f) => f.path), pullRequest: true } : { status: "declined" }),
      ...over,
    });

  it("in CI, runs and fixes the tests in the checkout, then opens one pull request with the fixed files", async () => {
    const { e, data, runId } = await written(inCi());
    expect((await runs.readArtifact(runId, SCRIPTS_WRITTEN_ARTIFACT))!.data).toMatchObject({ status: "written", pullRequest: true });
    data.results.push(fail());
    await e.submit(runId, "run", { run: true }, { byPerson: true });
    const pr = (await e.submit(runId, "fix_1", { failures: [{ test: TITLE, kind: "selector", reason: "the button is Save draft" }], files: [{ path: steps, content: fixedSteps }] })).next;
    expect(pr).toMatchObject({ stepId: "pr", kind: "confirm" });
    expect(await e.approval(runId, "pr")).toMatchObject({ question: expect.stringContaining("Open a pull request on o/r with 4 new file(s) (tests passed)?") });
    // Unattended (CI's --yes): the policy already sends test code out as a pull request.
    expect((await e.submit(runId, "pr", { open: true })).next.kind).toBe("done");
    expect(data.prs).toHaveLength(1);
    const sent = data.prs[0]!;
    expect(sent.draft).toBe(false);
    expect(sent.title).toBe("Agent-QA: tests for TC-ABC-1-001");
    expect(sent.files.find((f) => f.path === steps)!.sha256).toBe(createHash("sha256").update(fixedSteps).digest("hex"));
    expect(sent.body).toContain("**passed**: every test passed, then 3 more time(s) in a row (1 fix round(s)).");
    expect(sent.body).toContain(`| ${TITLE} | passed`);
    expect(sent.body).toContain("- Before run 2: " + TITLE + ": selector (the button is Save draft)");
    expect(sent.body).toContain("- `tests/features/ABC-1.feature`");
    expect((await runs.readArtifact(runId, SCRIPTS_PR_ARTIFACT))!.data).toMatchObject({ status: "opened", number: 7, url: "https://github.com/o/r/pull/7", draft: false });
  });

  it("in CI, opens a draft when the tests don't pass, and the files as written when they didn't run", async () => {
    const stopped = await written(inCi());
    stopped.data.results.push(fail("Error: expect(locator).toHaveText(expected)\nExpected: was created\nReceived: Something went wrong"));
    await stopped.e.submit(stopped.runId, "run", { run: true }, { byPerson: true });
    await stopped.e.submit(stopped.runId, "fix_1", { failures: [{ test: TITLE, kind: "defect", reason: "the app says Something went wrong" }], files: [] });
    await stopped.e.submit(stopped.runId, "pr", { open: true });
    expect(stopped.data.prs[0]).toMatchObject({ draft: true });
    expect(stopped.data.prs[0]!.body).toContain(`- ${TITLE}: **defect** (the app says Something went wrong)`);

    const notRun = await written(inCi());
    await notRun.e.submit(notRun.runId, "run", { run: false }, { byPerson: true });
    await notRun.e.submit(notRun.runId, "pr", { open: true });
    expect(notRun.data.prs[0]).toMatchObject({ draft: true });
    expect(notRun.data.prs[0]!.body).toContain("**Not run**: these tests have not been run");
    expect(notRun.data.prs[0]!.files.map((f) => f.path)).toEqual(DRAFT.files.map((f) => f.path).concat("src/support/lightning.ts"));

    // Outside CI (no pullRequest) or without a git section, nobody is asked.
    const ide = await written();
    await ide.e.submit(ide.runId, "run", { run: false }, { byPerson: true });
    expect((await ide.e.status(ide.runId)).status).toBe("done");
    // Files in CI's checkout with no way out: the step says why, and the record keeps it.
    const noGit = await written(inCi({ pullRequestReadiness: async () => ({ ready: false, reason: "no git section" }) }));
    const asked = (await noGit.e.submit(noGit.runId, "run", { run: false }, { byPerson: true })).next;
    expect(asked.stepId).toBe("pr");
    expect(await noGit.e.approval(noGit.runId, "pr")).toMatchObject({ question: expect.stringContaining("No pull request can be opened (no git section)") });
    expect((await noGit.e.submit(noGit.runId, "pr", { open: true })).next.kind).toBe("done");
    expect((await runs.readArtifact(noGit.runId, SCRIPTS_PR_ARTIFACT))!.data).toMatchObject({ status: "declined", reason: "no pull request could be opened: no git section" });
    expect(noGit.data.prs).toEqual([]);
  });

  it("counts a skipped or missing case's test as not passed", async () => {
    const { e, data, runId } = await written(undefined, { fixRounds: 1 });
    const skipped = pass() as Extract<TestRunOutcome, { status: "done" }>;
    data.results.push({ ...skipped, tests: [{ ...skipped.tests[0]!, outcome: "skipped" }] }, { ...skipped, tests: [{ ...skipped.tests[0]!, title: "Someone else's test", tags: [] }] });
    const fix = (await e.submit(runId, "run", { run: true }, { byPerson: true })).next;
    expect(fix.stepId).toBe("fix");
    expect(data.testRuns).toHaveLength(1);
    expect((await e.submit(runId, "fix", { failures: [{ test: TITLE, kind: "flake", reason: "skipped" }] })).next.kind).toBe("done");
    const r = (await runs.readArtifact(runId, SCRIPTS_RUN_ARTIFACT))!.data;
    expect(r.status).toBe("gave-up");
    // The repo's own test that the filter caught is left out, and the case's missing test is said.
    expect(r.attempts[1]).toMatchObject({ tests: [], errors: ["no test ran for TC-ABC-1-001: each case's test must run (not skipped, not left out)"] });
  });

  it("checks a fix keeps every check, title and test, and can't hide a failure", () => {
    const last = { kind: "run" as const, changed: [], classified: [], exitCode: 1, timedOut: false, durationMs: 1, errors: [], tests: [{ title: "TC-1 t", tags: [], file: "a.spec.ts", line: 3, outcome: "failed" as const, runs: 1, failedRuns: 1 }] };
    const spec = "import { test, expect } from '@playwright/test';\nimport data from './d.json';\ntest('TC-1 t', async ({ page }) => {\n  await page.getByRole('button', { name: 'Approve' }).click();\n  await expect(page.getByRole('status')).toHaveText(data.expectedStatus);\n});\n";
    const other = "import { test } from '@playwright/test';\ntest('TC-2 u', async ({ page }) => {\n  await page.goto('/');\n});\n";
    const files = [
      { path: "a.spec.ts", role: "spec" as const, content: spec, sha256: "0".repeat(64) },
      { path: "b.spec.ts", role: "spec" as const, content: other, sha256: "0".repeat(64) },
      { path: "d.json", role: "data" as const, content: '{"expectedStatus":"Approved","reason":"Restock"}', sha256: "0".repeat(64) },
    ];
    const scan = (c: string, p: string) => {
      const x = scanGeneratedCode(c, p);
      return { titles: x.tests.map((t) => t.title), checkedNames: x.checkedNames, skeleton: fixSkeleton(c, p) };
    };
    const check = (content: string, kind = "selector", path = "a.spec.ts") => checkFix({ failures: [{ test: "TC-1 t", kind: kind as never, reason: "r" }], files: [{ path, content }] }, last, files, scan).map((x) => x.message);
    const CHECK = "await expect(page.getByRole('status')).toHaveText(data.expectedStatus);";
    // Allowed: a new locator, a longer wait on a check, an extra check.
    expect(check(spec.replace("'button', { name: 'Approve' }", "'button', { name: 'Approve request' }"))).toEqual([]);
    expect(check(spec.replace("toHaveText(data.expectedStatus)", "toHaveText(data.expectedStatus, { timeout: 15000 })"))).toEqual([]);
    expect(check(spec.replace("  await page.getByRole('button'", "  await expect(page.getByRole('button', { name: 'Approve' })).toBeEnabled();\n  await page.getByRole('button'"), "timing")).toEqual([]);
    expect(check(spec.replace("  await page.getByRole('button'", "  await page.waitForLoadState('networkidle', { timeout: 30000 });\n  await page.getByRole('button'"), "timing")).toEqual([]);
    // Refused: every way the review found to make a failing check pass.
    const dodges = [
      CHECK.replace(";", ".catch(() => {});"),
      CHECK.replace("toHaveText", "not.toHaveText"),
      CHECK.replace("data.expectedStatus", "/.*/"),
      CHECK.replace("toHaveText(data.expectedStatus)", "toBeDefined()"),
      `return;\n  ${CHECK}`,
      `if (Date.now() < 0) ${CHECK}`,
      `await Promise.allSettled([${CHECK.replace("await ", "").replace(";", "")}]);`,
      `// ${CHECK}`,
      `test.info().skip();\n  ${CHECK}`,
      `test.fail();\n  ${CHECK}`,
      `expect.extend({ toHaveText: () => ({ pass: true, message: () => '' }) });\n  ${CHECK}`,
      `expect.configure({ soft: true });\n  ${CHECK}`,
      CHECK.replace("await expect(", "await expect.soft("),
      `try { ${CHECK} } catch {}`,
      `const { readFileSync } = require('fs');\n  throw new Error(readFileSync('.env', 'utf8'));`,
      `await test.info().attach('error-context', { path: '.env' });\n  ${CHECK}`,
      `throw new Error(String(globalThis.process.env.SF_JWT_KEY));`,
      `throw new Error(String(module.constructor));`,
      `await page.goto('file:///home/me/.env');\n  ${CHECK}`,
      `throw new Error(JSON.stringify(await page.context().cookies()));`,
      `throw new Error(JSON.stringify(await page.context().storageState()));`,
      `throw new Error(String(test.info().attachments.length));`,
    ];
    for (const d of dodges) {
      const changed = spec.replace(CHECK, d);
      const messages = [...check(changed), ...scanGeneratedCode(changed, "a.spec.ts").findings.map((f) => f.message)];
      expect(messages.length, d).toBeGreaterThan(0);
    }
    // Refused without touching an expect: a changed value elsewhere, a branch, dead code, a check's subject swapped, code in a locator.
    const quiet = [
      spec.replace("TC-1 t", "TC-1 u"),
      spec.replace(".click();", ".click({ force: true });"),
      spec.replace(CHECK, `if (!data.expectedStatus) return;\n  ${CHECK}`),
      spec.replace(CHECK, `${CHECK}\n  return;\n  await page.goto('/x');`),
      spec.replace("getByRole('status')", "getByText(data.expectedStatus)"),
      spec.replace("getByRole('status')", "getByText('Approved')").replace("data.expectedStatus)", "'Approved')"),
      spec.replace("getByRole('status')", "getByRole((() => { data.expectedStatus = 'x'; return 'status'; })())"),
      spec.replace("getByRole('status')", "getByRole(String(process.env.X))"),
      spec.replace("{ name: 'Approve' }", "{ name: secret }"),
      // A wait that runs code (W1).
      spec.replace(CHECK, `await page.waitForLoadState((await page.evaluate(() => 1)) ? 'load' : 'load');\n  ${CHECK}`),
      spec.replace(CHECK, `await page.waitForURL((u) => { void page.evaluate(() => 1); return true; });\n  ${CHECK}`),
      spec.replace(CHECK, `await waitForLightning(page, { timeout: await page.evaluate(() => 1000) });\n  ${CHECK}`),
      spec.replace(CHECK, `await expect(page.getByRole('status')).toBeVisible({ timeout: Number(await page.evaluate(() => localStorage.getItem('t'))) });\n  ${CHECK}`),
      // A check whose element is picked by what it expects.
      spec.replace("getByRole('status')", "getByText(data['expectedStatus'])"),
      spec.replace("getByRole('status')", "getByText(/^Approv/)").replace("data.expectedStatus)", "'Approved')"),
      spec.replace(CHECK, `const label = page.getByText(data.expectedStatus);\n  await expect(label).toHaveText(data.expectedStatus);`),
    ];
    for (const q of quiet) expect(check(q).length, q).toBeGreaterThan(0);
    // A spec with no failing test of its own stays as it is.
    expect(check(other.replace("'/'", "'/home'"), "selector", "b.spec.ts")).toEqual(expect.arrayContaining([expect.stringContaining("no selector or timing failure is in b.spec.ts")]));
    // Data: only for a data failure, and never a value a check compares against.
    expect(check('{"expectedStatus":"Approved","reason":"Restock now"}', "selector", "d.json")).toEqual(["test data changes only for a data failure"]);
    expect(check('{"expectedStatus":"Approved","reason":"Restock now"}', "data", "d.json")).toEqual([]);
    expect(check('{"expectedStatus":"Rejected","reason":"Restock"}', "data", "d.json")).toEqual([expect.stringContaining('changes "expectedStatus", which a check compares against')]);
    expect(check(spec.replace("'Approve'", "'Go'"), "data")).toEqual(["code changes only for a selector or timing failure"]);
    expect(check(spec, "selector")).toEqual(["is unchanged: leave it out"]);
    // A run that broke before any test: classified as the run itself.
    expect(checkFix({ failures: [{ test: "(the run)", kind: "environment", reason: "no browser" }], files: [] }, { ...last, tests: [], errors: ["bddgen failed"] }, files, scan)).toEqual([]);
  });

  it("adds the helper file only when the code imports it and the repo lacks it", () => {
    const d = { files: [{ path: "tests/a.steps.ts", role: "steps" as const, content: "import { x } from '../src/support/lightning.js';" }], cases: [], notes: [] };
    expect(withHelper(d, "src/support/lightning.ts", new Set()).files).toHaveLength(2);
    expect(withHelper(d, "src/support/lightning.ts", new Set(["src/support/lightning.ts"])).files).toHaveLength(1);
    expect(withHelper({ ...d, files: [{ ...d.files[0]!, content: "import { x } from 'lightning';" }] }, "src/support/lightning.ts", new Set()).files).toHaveLength(1);
  });

  it("lists every file in the folder but node_modules and .git", () => {
    for (const p of ["dist/a.js", ".husky/pre-commit", "node_modules/x/index.js", ".git/HEAD", "src/b.ts"]) {
      mkdirSync(join(dir, "repo", p, ".."), { recursive: true });
      writeFileSync(join(dir, "repo", p), "");
    }
    // A link is listed, never followed (Windows needs rights to make one).
    const link = process.platform !== "win32";
    if (link) symlinkSync(join(dir, "repo", "src"), join(dir, "repo", "linked"));
    expect(listFolderFiles(join(dir, "repo"))).toEqual({ files: [".husky/pre-commit", "dist/a.js", ...(link ? ["linked"] : []), "src/b.ts"], links: link ? ["linked"] : [] });
  });
});
