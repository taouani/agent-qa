import { describe, expect, it } from "vitest";
import { apiTestProblems, scanSource } from "../src/data/index.js";
import { checkDraft, lightningHelpersSource, scriptsDraftSchema, type CheckContext, type ScriptsDraft } from "../src/workflows/index.js";

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

const EXISTING = ["src/fixtures/fixtures.ts", "tests/step-definitions/common/toast.steps.ts", "README.md"];
const check = (d: ScriptsDraft, ctx: Partial<CheckContext> = {}) => checkDraft(d, { profile, cases: CASES, existingFiles: EXISTING, ...ctx });
/** The draft with one more Given step and its definition, to test how a pattern matches. */
function matches(pattern: string, text: string, kind: "expression" | "regex" = "expression"): boolean {
  const d = draft();
  d.files[0] = { ...d.files[0]!, content: FEATURE.replace('    When I create', `    And ${text}\n    When I create`) };
  const def = kind === "regex" ? `/${pattern}/` : `'${pattern.replace(/[\\']/g, (c) => `\\${c}`)}'`;
  d.files[1] = { ...d.files[1]!, content: `${STEPS}\nWhen(${def}, async () => {});\n` };
  return !check(d).some((e) => e.message.includes("no step definition matches"));
}

describe("generated code checks", () => {
  it("passes a BDD draft that reuses the repo's steps and adds its own", () => {
    expect(check(draft())).toEqual([]);
  });

  it("matches steps the way Cucumber expressions do", () => {
    expect(matches("I have {int} cucumber(s) in my belly/stomach", "I have 1 cucumber in my stomach")).toBe(true);
    expect(matches("I have {int} cucumber(s) in my belly/stomach", "I have 2 cucumbers in my belly")).toBe(true);
    expect(matches("I go by bus/train/car", "I go by train")).toBe(true);
    expect(matches("I go by bus/train/car", "I go by bike")).toBe(false);
    expect(matches("I open {word} with {float} and {}", "I open Accounts with 1.5 and anything at all")).toBe(true);
    expect(matches("price is \\(net\\) {int}", "price is (net) 4")).toBe(true);
    expect(matches("I type {string}", 'I type "say \\"hi\\""')).toBe(true);
    expect(matches("a.b", "axb")).toBe(false);
    expect(matches("^I wait for (\\d+) records$", "I wait for 3 records", "regex")).toBe(true);
  });

  it("refuses existing, protected and sign-in paths, and odd ones", () => {
    const paths = ["tests/features/ROPS-227-FRA.feature", "tests/Features/rops-227-fra.feature", "SRC/fixtures/fixtures.ts", "Package.json", ".VSCode/settings.ts", "package.json", "playwright.config.ts", "src/auth/new-auth.steps.ts", "../outside.spec.ts", "/abs.spec.ts", "tests\\win.spec.ts", ".github/workflows/x.ts"];
    const errors = check(draft({ files: [...draft().files, ...paths.map((path) => ({ path, role: "page" as const, content: "export class X {}" }))] }));
    for (const [i] of paths.entries()) expect(errors.some((e) => e.path === `$.files[${i + 4}].path`), paths[i]).toBe(true);
    // Only code is held to the sign-in rule: a feature about session timeouts is fine.
    const ok = draft({ files: [...draft().files, { path: "test-data/session-timeout.json", role: "data", content: "{}" }, { path: "src/pages/user-settings-page.ts", role: "page", content: "export class UserSettingsPage {}" }, { path: "tests/step-definitions/user-management/abc.steps.ts", role: "steps", content: "export {};" }] });
    expect(check(ok)).toEqual([]);
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
      "setTimeout(() => {}, 500);",
      "await page['waitForTimeout'](500);",
      "test.describe.skip('x', () => {});",
      "await page.locator('[data-aura-rendered-by=\"12:0\"]').click();",
      "const x = ;",
    ];
    for (const line of bad) {
      const d = draft();
      d.files[1] = { ...d.files[1]!, content: `${STEPS}\n${line}\n` };
      expect(check(d).map((e) => e.path), line).toContain("$.files[1].content");
    }
    const fine = draft();
    fine.files[1] = { ...fine.files[1]!, content: `${STEPS}\nconst runtime = '[data-aura-class="forceFlexipageRuntime"]';\ntest.setTimeout(180_000);\nconst file = join(__dirname, '..', 'data.json');\nconst api = { setTimeout: 1 };\n` };
    expect(check(fine)).toEqual([]);
    const bound = draft();
    bound.files[1] = { ...bound.files[1]!, content: `${STEPS}\nconst wait = page.waitForTimeout.bind(page);\nglobalThis.setTimeout(() => {}, 1);\n` };
    expect(check(bound).filter((e) => e.message.includes("fixed wait"))).toHaveLength(2);
    const data = draft();
    data.files[2] = { ...data.files[2]!, content: JSON.stringify({ id: "001000000000001AAA", url: "https://acme.my.salesforce.com/x" }) };
    expect(check(data).map((e) => e.path)).toEqual(["$.files[2].content", "$.files[2].content"]);
    const spaced = draft();
    spaced.files[2] = { ...spaced.files[2]!, content: JSON.stringify({ requester: "< PERSON_1 >" }).replace("< PERSON_1 >", "<PERSON\n_1>") };
    expect(check(spaced).map((e) => e.path)).toContain("$.files[2].content");
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
    const elsewhere = draft();
    elsewhere.files[0] = { ...elsewhere.files[0]!, content: `${FEATURE}\n  @other\n  Scenario: Something else\n    Given I am logged into Salesforce as "X"\n    Then I see the toast "y"\n` };
    elsewhere.cases[0]!.steps[1] = { step: 2, file: "tests/features/ABC-1.feature", line: 13 };
    expect(check(elsewhere).map((e) => e.message)).toContain("line 13 of tests/features/ABC-1.feature isn't a step of the scenario tagged @TC-ABC-1-001 (or its Background)");
    const other = draft({ cases: [{ id: "TC-ABC-1-009", steps: [{ step: 1, file: "tests/features/ABC-1.feature", line: 5 }] }] });
    expect(check(other).map((e) => e.path)).toEqual(["$.cases[0].id", "$.cases"]);
  });

  it("finds Gherkin steps with no definition, defined twice, or matching two", () => {
    const unknown = draft();
    unknown.files[0] = { ...unknown.files[0]!, content: FEATURE.replace("Then I see the toast", "Then I squint at the toast") };
    expect(check(unknown)).toEqual([expect.objectContaining({ message: expect.stringContaining('line 7: no step definition matches "I squint') })]);
    const twice = draft();
    twice.files[1] = { ...twice.files[1]!, content: `${STEPS}\nWhen('I am logged into Salesforce as {string}', async () => {});\n` };
    expect(check(twice).map((e) => e.message).join("\n")).toContain("defined already in tests/step-definitions/authentication/login.steps.ts");
    const acrossFiles = draft();
    acrossFiles.files.push({ path: "tests/step-definitions/approval-request/more.steps.ts", role: "steps", content: STEPS });
    const across = check(acrossFiles).map((e) => e.message).join("\n");
    expect(across).toContain("defined already in tests/step-definitions/approval-request/abc-1.steps.ts");
    expect(across).toContain("matches 2 step definitions");
    const custom = draft({}, );
    custom.files[0] = { ...custom.files[0]!, content: FEATURE.replace("    When I create", "    And I am a store manager\n    When I create") };
    expect(check(custom, { profile: { ...profile, steps: [...profile.steps, { keyword: "Given", pattern: "I am a {role}", kind: "expression", file: "tests/step-definitions/common/role.steps.ts", line: 1, fixtures: [] }] } })).toEqual([]);
    const broken = draft();
    broken.files[1] = { ...broken.files[1]!, content: `${STEPS}\nWhen('I see (oops', async () => {});\n` };
    expect(check(broken).map((e) => e.message).join("\n")).toContain("doesn't compile");
  });

  it("reads features with Gherkin: focus tags, outlines and bad syntax", () => {
    const focused = draft();
    focused.files[0] = { ...focused.files[0]!, content: FEATURE.replace("@positive", "@positive @only") };
    expect(check(focused).map((e) => e.message)).toEqual(["uses the @only tag, which would run some scenarios and not others"]);
    const outline = (examples: string, then = 'Then I see the toast "<message>"') => {
      const d = draft();
      d.files[0] = { ...d.files[0]!, content: FEATURE.replace("Scenario:", "Scenario Outline:").replace('Then I see the toast "was created"', then) + examples };
      return check(d).map((e) => e.message);
    };
    expect(outline(`\n    Examples:\n      | message |\n      | was created |\n`)).toEqual([]);
    expect(outline(`\n    Examples:\n      | message |\n      | was created |\n`, "Then I frown at <message>")).toEqual(['line 7: no step definition matches "I frown at was created"']);
    expect(outline(`\n    Examples:\n      | other |\n      | x |\n`)[0]).toContain("has a <placeholder> with no Examples value");
    const bad = draft();
    bad.files[0] = { ...bad.files[0]!, content: "Feature: x\n  Scenario: y\n    Given a\n  Examples oops\n    | a |\n" };
    expect(check(bad).some((e) => e.message.startsWith("isn't valid Gherkin"))).toBe(true);
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
    // Prettier's wrapped titles and an id on the describe both count.
    const wrapped = `import { test } from '@playwright/test';

test.describe('TC-ABC-1-001 Create an approval request', () => {
  test(
    'the long title',
    async ({ page }) => {
      await test.step('1. Sign in as a store manager', async () => {});
      await test.step('2. Create a request', async () => {});
    },
  );
});
`;
    const w = draft({ files: [{ path: "tests/abc-1.spec.ts", role: "spec", content: wrapped }], cases: [{ id: "TC-ABC-1-001", steps: [{ step: 1, file: "tests/abc-1.spec.ts", line: 7 }, { step: 2, file: "tests/abc-1.spec.ts", line: 8 }] }] });
    expect(check(w, { profile: plain })).toEqual([]);
    const none = draft({ files: [{ path: "tests/abc-1.spec.ts", role: "spec", content: wrapped.replace("TC-ABC-1-001 ", "") }], cases: w.cases });
    expect(check(none, { profile: plain }).map((e) => e.path)).toEqual(["$.cases[0].id"]);
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
    const tricky = `export class P {
  open(path: string): Promise<void>;
  open(path: string, wait: boolean): Promise<void>;
  open(path: string, wait = false) { return Promise.resolve(); }
  find<T extends string>({ name, exact }: { name: T; exact?: boolean }) { return name; }
}`;
    expect(scanSource(tricky, "src/pages/p.ts")!.pages[0]!.signatures).toEqual({
      open: "(path: string): Promise<void>; (path: string, wait: boolean): Promise<void>",
      find: "<T extends string>(options: { name: T; exact?: boolean })",
    });
  });
});

describe("API test checks (S3-8)", () => {
  const spec = `import { test, expect } from '@playwright/test';

test('TC-ABC-1-001 Create an approval request', async ({ request }) => {
  await test.step('1. Sign in', async () => {});
  await test.step('2. Create a request', async () => {
    const res = await request.post('/services/data/v62.0/sobjects/Approval__c', { data: { Reason__c: 'Restock' } });
    expect(res.status()).toBe(201);
  });
});
`;
  const plain = { ...profile, kind: "playwright" as const, steps: [], features: [] };
  const d = (content: string) => scriptsDraftSchema.parse({ files: [{ path: "tests/api/abc-1.spec.ts", role: "spec", content }], cases: [{ id: "TC-ABC-1-001", steps: [{ step: 1, file: "tests/api/abc-1.spec.ts", line: 4 }, { step: 2, file: "tests/api/abc-1.spec.ts", line: 5 }] }] });
  it("accepts a request test, and refuses one that drives a browser or sends nothing", () => {
    expect(check(d(spec), { profile: plain, api: true })).toEqual([]);
    // The same code is a fine UI-less spec when api isn't asked for.
    expect(check(d(spec), { profile: plain })).toEqual([]);
    expect(check(d(spec.replace("async ({ request })", "async ({ page })")), { profile: plain, api: true }).map((e) => e.message).join()).toMatch(/not page/);
    expect(check(d(spec.replace("request.post(", "request.post(`https://x.my.salesforce.com${''}` + ")), { profile: plain, api: true }).map((e) => e.message).join()).toMatch(/full URL|org URL/);
  });
  const problems = (code: string) => apiTestProblems(code, "tests/api/x.spec.ts");
  const msgs = (code: string) => problems(code).problems.join("\n");
  const wrap = (body: string, params = "{ request }") => `import { test, expect } from '@playwright/test';\ntest('t', async (${params}) => {\n${body}\n});\n`;
  it("refuses every way to another host: full URLs in any string, a variable URL, a baseURL of its own, the global fetch (B1)", () => {
    expect(problems(wrap("await request.get('/services/data/v62.0/limits');"))).toEqual({ problems: [], sends: 1 });
    for (const body of [
      "const host = 'https://evil.example';\nawait request.get(`${host}/x`);",
      "await request.get(`${'h'}/x`);",
      "const url = '/x';\nawait request.get(url);",
      "await request.get('//evil.example/x');",
      "await request.get(`https://evil.example/${1}`);",
      "test.use({ baseURL: '/x' });",
      "const api = await request.newContext({ baseURL: process.env.X });",
      "await fetch('/x');",
      "await globalThis.fetch('/x');",
    ]) expect(msgs(wrap(body)), body).toMatch(/full URL|isn't a path|built elsewhere|baseURL of its own|global fetch/);
  });
  it("refuses a browser however it's reached, and doesn't refuse a helper's own page parameter (M1, M2)", () => {
    for (const [code, re] of [
      ["import { chromium } from 'playwright';\n", /chromium is a browser/],
      [wrap("const b = await playwright.webkit.launch();"), /webkit is a browser|launch\(\) drives/],
      [wrap("await f.page.goto('/');", "f"), /not page/],
      [wrap("const p = await x.newPage();"), /newPage\(\) drives/],
      ["import { test as base } from '@playwright/test';\nexport const test = base.extend({ thing: async ({ page }, use) => use(page) });\n", /not page/],
      ["import { createBdd } from 'playwright-bdd';\nconst { Given } = createBdd();\nGiven('x', async ({ context }) => {});\n", /not context/],
    ] as const) expect(msgs(code), code).toMatch(re);
    expect(msgs("export function helper({ page }: { page: unknown }) { return page; }\n")).toBe("");
  });
  it("refuses credentials in test code (M3), and counts only sends on a request context (low)", () => {
    for (const body of [
      "await request.post('/services/oauth2/token');",
      "await request.get('/x', { headers: { Authorization: 'Bearer x' } });",
      "await request.get('/x', { headers: { 'authorization': 'x' } });",
      "await request.post('/x', { form: { client_secret: 'x', grant_type: 'password' } });",
    ]) expect(msgs(wrap(body)), body).toMatch(/OAuth path|handles credentials/);
    expect(problems(wrap("const m = new Map();\nm.get('k');\nresponse.headers().get;")).sends).toBe(0);
    expect(problems(wrap("await api.get('/x');", "{ api }")).sends).toBe(1);
    expect(problems(wrap("const ctx = await request.newContext();\nawait ctx.post('/x');")).sends).toBe(1);
    expect(problems("import type { APIRequestContext } from '@playwright/test';\nexport async function make(c: APIRequestContext) { return c.post('/x'); }\n").sends).toBe(1);
  });
  it("refuses a path that still names a host, and follows a context through aliases, casts and this file's helpers (B1, second review)", () => {
    for (const body of [
      "await request.get('/\\\\api.example.com/v1/x');",
      "const h = '/api.example.com';\nawait request.get(`/${h}/v1/x`);",
      "const r = request;\nconst url = ['https:', '', 'api.example.com'].join('/');\nawait r.get(url);",
      "const url = atob('x');\nawait (request as any).get(url);",
      "const send = (c: any, u: string) => c.get(u);\nawait send(request, atob('x'));",
      "function send(c: any, u: string) { return c.post(u); }\nawait send(request, atob('x'));",
    ]) expect(msgs(wrap(body)), body).toMatch(/backslash|first segment written out|built elsewhere/);
    expect(problems(wrap("await request.get(`/services/data/v62.0/sobjects/Account/${'id'}`);"))).toEqual({ problems: [], sends: 1 });
    // A function another generated file declares can't be followed; the repo's own helpers can be called.
    const draft = new Set(["tests/api/helpers.ts", "tests/api/x.spec.ts"]);
    const imp = (from: string) => `import { make } from '${from}';\n${wrap("await make(request);")}`;
    expect(apiTestProblems(imp("./helpers.js"), "tests/api/x.spec.ts", draft).problems.join()).toMatch(/another generated file declares/);
    expect(apiTestProblems(imp("../../src/api/helpers"), "tests/api/x.spec.ts", draft).problems).toEqual([]);
    // A browser fixture taken apart inside the body.
    expect(msgs(wrap("const { page: p } = fx;\nawait p.evaluate(() => 1);", "fx"))).toMatch(/not page/);
  });
  it("refuses a request context handed on in any way it can't follow (B1, third review)", () => {
    const u = "const u = ['https:', '', 'api.example.com', 'v1'].join('/');\n";
    for (const body of [
      "const api = { r: request };\nawait api.r.get(u);",
      "const [r] = [request];\nawait r.get(u);",
      "const g = request.get.bind(request);\nawait g(u);",
      "await request.get.call(request, u);",
      "await Reflect.apply(request.get, request, [u]);",
      "class W { constructor(private r: any) {} go(x: string) { return this.r.get(x); } }\nawait new W(request).go(u);",
      "const h = { send: (c: any, x: string) => c.get(x) };\nawait h.send(request, u);",
      "await Promise.all([request].map((c) => c.get(u)));",
      "const s = (...a: any[]) => a[0].get(a[1]);\nawait s(request, u);",
      "const o = { request };\nawait o.request.get(u);",
    ]) expect(msgs(wrap(u + body)), body).toMatch(/hands on the request context|built elsewhere/);
    // What tests do with it stays fine: send, dispose, the repo's helpers, a fixture's use, this file's functions, this.<ctx>.
    expect(problems(`import { test as base } from '@playwright/test';\nimport { createRecord } from '../../src/api/records';\nimport type { APIRequestContext } from '@playwright/test';\nexport const test = base.extend({ api: async ({ request }, use) => { await use(request); } });\ntest('t', async ({ request, playwright }) => {\n  await createRecord(request, 'Account');\n  const ctx = await playwright.request.newContext();\n  await ctx.get('/x');\n  await ctx.dispose();\n  const send = (c: typeof request) => c.post('/y');\n  await send(request);\n});\nclass Client { constructor(private api: APIRequestContext) {} list() { return this.api.get('/z'); } }\n`).problems).toEqual([]);
    expect(problems(wrap("await fx.request.get('/x');", "fx"))).toEqual({ problems: [], sends: 1 });
    expect(problems(wrap("const res = await request.post('/x', { data: { Name: testData.name } });\nexpect((await res.json()).Name).toBe(testData.name);", "{ request, testData }"))).toEqual({ problems: [], sends: 1 });
    expect(msgs(wrap("const g = sfApi.get;\nawait g(atob('x'));", "{ sfApi }"))).toMatch(/hands on the request context \(\.get\)/);
  });
});

