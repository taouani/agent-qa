import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RunStore, WorkflowEngine } from "../src/core/index.js";
import { listFolderFiles, type FrameworkProfile, type SavedProfile } from "../src/data/index.js";
import { EXPLORATION_ARTIFACT, lightningHelpersSource, SCRIPTS_DRAFT_ARTIFACT, scriptsWorkflow, TEST_CASES_ARTIFACT, withHelper, type Exploration, type ScriptsDeps, type TestCases } from "../src/workflows/index.js";
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

function fakeData(over: Partial<ScriptsDeps["data"]> = {}): ScriptsDeps["data"] {
  return {
    frameworkProfile: async () => PROFILE,
    savedProfile: async () => SAVED,
    frameworkFiles: async () => ["src/fixtures/fixtures.ts", "src/pages/approval-app-main-page.ts", "tests/features/ROPS-227-FRA.feature", "playwright.config.ts"],
    maskTexts: async (_run, texts) => texts.map((t) => t.replace(/Jane Doe/g, "<PERSON_1>")),
    ...over,
  };
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

  const engine = (data = fakeData()) => new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId }).register(scriptsWorkflow({ data, runs }));

  it("shows the repo, the pack, the cases and the exploration, then keeps the checked draft", async () => {
    const e = engine();
    const first = await e.start("scripts", { testCasesRun: "tc-run", explorationRun: "ex-run" });
    expect(first).toMatchObject({ stepId: "draft", kind: "generate" });
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
    expect(result.next.kind).toBe("done");
    const art = (await runs.readArtifact(first.runId, SCRIPTS_DRAFT_ARTIFACT))!.data;
    expect(art).toMatchObject({ folder: ".", kind: "playwright-bdd", testCases: { run: "tc-run" }, exploration: { run: "ex-run" }, notes: ["Step 2: ask <PERSON_1> which Region to pick"] });
    // The steps import the helper file, so the server added the pack's copy.
    expect(art.files.map((f) => f.path)).toEqual([...DRAFT.files.map((f) => f.path), "src/support/lightning.ts"]);
    expect(art.files.at(-1)!.content).toBe(lightningHelpersSource());
  });

  it("refuses a draft that replaces a repo file or writes the helper itself", async () => {
    const e = engine();
    const first = await e.start("scripts", { testCasesRun: "tc-run" });
    const replaced = await e.submit(first.runId, "draft", { ...DRAFT, files: [...DRAFT.files, { path: "SRC/Pages/approval-app-main-page.ts", role: "page", content: "export class X {}" }] });
    expect(replaced.status).toBe("rejected");
    expect(replaced.status === "rejected" && replaced.errors.map((x) => x.message).join("\n")).toContain("already exists");
    const helper = await e.submit(first.runId, "draft", { ...DRAFT, files: [...DRAFT.files, { path: "src/support/lightning.ts", role: "helper", content: "x" }] });
    expect(helper.status === "rejected" && helper.errors).toEqual([expect.objectContaining({ path: "$.files[3].role" })]);
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
    await expect(engine(fakeData({ savedProfile: async () => undefined })).start("scripts", { testCasesRun: "tc-run" })).rejects.toMatchObject({ code: "INVALID_INPUTS", message: expect.stringContaining("no reviewed framework profile") });
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
    expect(listFolderFiles(join(dir, "repo"))).toEqual([".husky/pre-commit", "dist/a.js", ...(link ? ["linked"] : []), "src/b.ts"]);
  });
});
