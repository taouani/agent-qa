import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RunStore, WorkflowEngine } from "../src/core/index.js";
import { listFolderFiles, type FrameworkProfile, type SavedProfile, type TypeDiagnostic } from "../src/data/index.js";
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

/** The data layer, faked: records which vault each mask call used. */
function fakeData(over: Partial<ScriptsDeps["data"]> = {}, profile: FrameworkProfile = PROFILE, typeErrors: (files: ReadonlyArray<{ path: string; content: string }>) => TypeDiagnostic[] = () => []) {
  const vaults: string[] = [];
  const checked: string[][] = [];
  const data: ScriptsDeps["data"] = {
    frameworkProfile: async (_run, _folder, tokensRun) => {
      vaults.push(`profile:${tokensRun}`);
      return profile;
    },
    savedProfile: async () => SAVED,
    typeCheckReadiness: async () => ({ ready: true }),
    typeCheck: async (_run, tokensRun, files, approved) => {
      vaults.push(`typecheck:${tokensRun}`);
      if (!approved) return { status: "declined" };
      checked.push(files.map((f) => f.path));
      return { status: "done", diagnostics: typeErrors(files) };
    },
    frameworkFiles: async () => ({ files: ["src/fixtures/fixtures.ts", "src/pages/approval-app-main-page.ts", "tests/features/ROPS-227-FRA.feature", "playwright.config.ts", "tests/shared"], links: ["tests/shared"] }),
    maskTexts: async (run, texts) => {
      vaults.push(`notes:${run}`);
      return texts.map((t) => t.replace(/Jane Doe/g, "<PERSON_1>"));
    },
    ...over,
  };
  return Object.assign(data, { vaults, checked });
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
    expect(result.next.kind).toBe("done");
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
