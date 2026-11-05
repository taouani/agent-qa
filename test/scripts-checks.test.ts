import { describe, expect, it } from "vitest";
import { scanSource } from "../src/data/index.js";
import { checkDraft, cucumberRegExp, lightningHelpersSource, scriptsDraftSchema, type CheckContext, type ScriptsDraft } from "../src/workflows/index.js";

const step = (action: string, expected: string) => ({ action, data: "", expected });
const CASES: CheckContext["cases"] = [
  { id: "TC-ABC-1-001", requirement: "ABC-1", title: "Create an approval request", type: "positive", priority: "P1", preconditions: [], steps: [step("Sign in as a store manager", "The app opens"), step("Create a request", "A toast says it was created")], covers: ["AC1"], review: "kept" },
];

const profile: CheckContext["profile"] = {
  kind: "playwright-bdd",
  config: { file: "playwright.config.ts", reporters: [], projects: [] },
  authFiles: ["src/auth/jwt.ts"],
  features: [{ file: "tests/features/ROPS-227-FRA.feature", scenarios: 3, tags: [] }],
  pages: [{ name: "ApprovalAppMainPage", file: "src/pages/approval-app-main-page.ts", methods: ["navigateToNewForm"] }],
  steps: [
    { keyword: "Given", pattern: "I am logged into Salesforce as {string}", kind: "expression", file: "tests/step-definitions/authentication/login.steps.ts", line: 5, fixtures: ["pages"] },
    { keyword: "Then", pattern: "^I see the toast \"(.*)\"$", kind: "regex", file: "tests/step-definitions/common/toast.steps.ts", line: 3, fixtures: ["pages"] },
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

When('I create an approval request from the test data', async ({ pages, testData }) => {
  await pages.approvalAppMainPage.navigateToNewForm();
  await pages.page.getByRole('button', { name: 'Save', exact: true }).click();
});
`;

function draft(over: Partial<ScriptsDraft> = {}): ScriptsDraft {
  return scriptsDraftSchema.parse({
    files: [
      { path: "tests/features/ABC-1.feature", role: "feature", content: FEATURE },
      { path: "tests/step-definitions/approval-request/abc-1.steps.ts", role: "steps", content: STEPS },
      { path: "test-data/ABC-1.json", role: "data", content: JSON.stringify({ "Create an approval request": { reason: "Restock" } }) },
      { path: "src/support/lightning.ts", role: "helper", content: lightningHelpersSource() },
    ],
    cases: [{ id: "TC-ABC-1-001", steps: [{ step: 1, file: "tests/features/ABC-1.feature", line: 5 }, { step: 2, file: "tests/features/ABC-1.feature", line: 6 }, { step: 2, file: "tests/features/ABC-1.feature", line: 7 }] }],
    ...over,
  });
}

const check = (d: ScriptsDraft, ctx: Partial<CheckContext> = {}) => checkDraft(d, { profile, cases: CASES, ...ctx });

describe("generated code checks", () => {
  it("passes a BDD draft that reuses the repo's steps and adds its own", () => {
    expect(check(draft())).toEqual([]);
  });

  it("turns Cucumber expressions into patterns", () => {
    expect(cucumberRegExp("I am logged into Salesforce as {string}").test('I am logged into Salesforce as "X"')).toBe(true);
    expect(cucumberRegExp("I have {int} cucumber(s) in my belly/stomach").test("I have 1 cucumber in my stomach")).toBe(true);
    expect(cucumberRegExp("I have {int} cucumber(s) in my belly/stomach").test("I have 2 cucumbers in my belly")).toBe(true);
    expect(cucumberRegExp("I open {word} with {float} and {}").test("I open Accounts with 1.5 and anything at all")).toBe(true);
    expect(cucumberRegExp("price is \\(net\\) {int}").test("price is (net) 4")).toBe(true);
    expect(cucumberRegExp("a.b").test("axb")).toBe(false);
  });

  it("refuses existing, protected and sign-in paths, and odd ones", () => {
    const paths = ["tests/features/ROPS-227-FRA.feature", "package.json", "playwright.config.ts", "src/auth/new-auth.steps.ts", "../outside.spec.ts", "/abs.spec.ts", "tests\\win.spec.ts", ".github/workflows/x.ts"];
    const errors = check(draft({ files: [...draft().files, ...paths.map((path) => ({ path, role: "page" as const, content: "export class X {}" }))] }));
    for (const [i] of paths.entries()) expect(errors.some((e) => e.path === `$.files[${i + 4}].path`), paths[i]).toBe(true);
  });

  it("refuses tokens, fixed waits, XPath, Aura ids, record ids and org URLs", () => {
    const bad = [
      "await page.waitForTimeout(2000);",
      "await page.locator('//div[@id=\"x\"]').click();",
      "await page.locator('xpath=//button').click();",
      "await page.locator('#input-123').fill('x');",
      "await page.goto('/lightning/r/Account/001000000000001AAA/view');",
      "await page.goto('https://acme--uat.sandbox.my.salesforce.com/');",
      "test.only('x', async () => {});",
      "await page.pause();",
    ];
    for (const line of bad) {
      const d = draft();
      d.files[1] = { ...d.files[1]!, content: `${STEPS}\n${line}\n` };
      expect(check(d).map((e) => e.path), line).toContain("$.files[1].content");
    }
    const tokens = draft();
    tokens.files[2] = { ...tokens.files[2]!, content: JSON.stringify({ requester: "<PERSON_1>" }) };
    expect(check(tokens)[0]).toMatchObject({ path: "$.files[2].content", message: expect.stringContaining("<PERSON_1>") });
    const helper = draft();
    helper.files[3] = { ...helper.files[3]!, content: `${lightningHelpersSource()}\n// mine` };
    expect(check(helper)).toEqual([expect.objectContaining({ path: "$.files[3].content" })]);
  });

  it("maps every step of every case to a Gherkin step of a tagged scenario", () => {
    const noStep2 = draft({ cases: [{ id: "TC-ABC-1-001", steps: [{ step: 1, file: "tests/features/ABC-1.feature", line: 5 }] }] });
    expect(check(noStep2)).toEqual([expect.objectContaining({ path: "$.cases[0].steps", message: expect.stringContaining("step(s) 2") })]);
    const badLine = draft({ cases: [{ id: "TC-ABC-1-001", steps: [{ step: 1, file: "tests/features/ABC-1.feature", line: 4 }, { step: 2, file: "tests/features/ABC-1.feature", line: 99 }] }] });
    expect(check(badLine).map((e) => e.path)).toEqual(["$.cases[0].steps[0].line", "$.cases[0].steps[1].line", "$.cases[0].steps"]);
    const untagged = draft();
    untagged.files[0] = { ...untagged.files[0]!, content: FEATURE.replace("@TC-ABC-1-001 ", "") };
    expect(check(untagged).map((e) => e.message)).toEqual(["the scenario for TC-ABC-1-001 must be tagged @TC-ABC-1-001"]);
    const other = draft({ cases: [{ id: "TC-ABC-1-009", steps: [{ step: 1, file: "tests/features/ABC-1.feature", line: 5 }] }] });
    expect(check(other).map((e) => e.path)).toEqual(["$.cases[0].id", "$.cases"]);
  });

  it("finds Gherkin steps with no definition, defined twice, or matching two", () => {
    const unknown = draft();
    unknown.files[0] = { ...unknown.files[0]!, content: FEATURE.replace("Then I see the toast", "Then I squint at the toast") };
    expect(check(unknown)).toEqual([expect.objectContaining({ message: expect.stringContaining('line 7: no step definition matches "I squint') })]);
    const twice = draft();
    twice.files[1] = { ...twice.files[1]!, content: `${STEPS}\nWhen('I am logged into Salesforce as {string}', async () => {});\n` };
    expect(check(twice).map((e) => e.message).join("\n")).toContain("reuse the one in tests/step-definitions/authentication/login.steps.ts");
  });

  it("asks a plain Playwright repo for specs with one test.step per test step", () => {
    const spec = `import { test } from '@playwright/test';

test('TC-ABC-1-001 Create an approval request', async ({ page }) => {
  await test.step('1. Sign in as a store manager', async () => {});
  await test.step('2. Create a request', async () => {});
});
`;
    const plain = { ...profile, kind: "playwright" as const, steps: [] };
    const d = draft({ files: [{ path: "tests/abc-1.spec.ts", role: "spec", content: spec }], cases: [{ id: "TC-ABC-1-001", steps: [{ step: 1, file: "tests/abc-1.spec.ts", line: 4 }, { step: 2, file: "tests/abc-1.spec.ts", line: 5 }] }] });
    expect(check(d, { profile: plain })).toEqual([]);
    expect(check({ ...d, cases: [{ id: "TC-ABC-1-001", steps: [{ step: 1, file: "tests/abc-1.spec.ts", line: 3 }, { step: 2, file: "tests/abc-1.spec.ts", line: 5 }] }] }, { profile: plain })[0]).toMatchObject({ message: expect.stringContaining("isn't a test.step(...) call") });
  });

  it("scans a file's steps and page objects, with method signatures", () => {
    const page = `export class RequestPage extends BasePage {
  async fill(label: string, value = 'Jane Doe', ...rest: string[]): Promise<void> {}
  verify(expected?: Record<string, string>) { return expected; }
  private hidden() {}
}`;
    expect(scanSource(page, "src/pages/request-page.ts")).toEqual({
      steps: [],
      pages: [{ name: "RequestPage", file: "src/pages/request-page.ts", extends: "BasePage", methods: ["fill", "verify"], signatures: { fill: "(label: string, value?, ...rest: string[]): Promise<void>", verify: "(expected?: Record<string, string>)" } }],
    });
    expect(scanSource(STEPS, "x.steps.ts")!.steps.map((s) => s.pattern)).toEqual(["I create an approval request from the test data"]);
    expect(scanSource("export class {", "x.ts")).toBeUndefined();
  });
});
