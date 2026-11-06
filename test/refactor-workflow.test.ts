import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RunStore, WorkflowEngine } from "../src/core/index.js";
import { applyRefactor, dependentSpecs, ProfileError, type FrameworkProfile, type SavedProfile, type TypeDiagnostic } from "../src/data/index.js";
import { AUDIT_ARTIFACT, checkRefactored, REFACTOR_REPORT_ARTIFACT, refactorWorkflow, simulatePlan, type Audit, type RefactorDeps, type RefactorPlan } from "../src/workflows/index.js";

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const PAGE = `export class RequestPage {
  constructor(private readonly page: Page) {}

  async clickButton3() {
    await this.page.getByRole('button', { name: 'Submit' }).click();
  }
}
`;
const SPEC = (n: number) => `import { test, expect } from '@playwright/test';
import { RequestPage } from '@pages/request-page';

test('submits request ${n} of <PERSON_1>', async ({ page }) => {
  await new RequestPage(page).clickButton3();
  await expect(page.getByRole('status')).toHaveText('Submitted');
});
`;
const OTHER = "import { test } from '@playwright/test';\ntest('lists requests', async ({ page }) => {\n  await page.goto('/requests');\n});\n";
const SAVED = { version: 1, folder: ".", kind: "playwright", commands: { test: ["npx", "playwright", "test"] }, reviewedAt: "2026-11-06T00:00:00.000Z" } as unknown as SavedProfile;
const PROFILE = { kind: "playwright", aliases: { "@pages/*": ["./tests/pages/*"] }, pages: [{ name: "RequestPage", file: "tests/pages/request-page.ts" }], fixtures: [], steps: [] } as unknown as FrameworkProfile;

const AUDIT: Audit = {
  folder: ".",
  inventory: { files: 4, roles: [], largest: [], entryPoints: [], locators: {}, unread: [] },
  sample: { population: 4, files: [] },
  counts: { critical: 0, high: 0, medium: 1, low: 1 },
  scores: [],
  ranking: "",
  findings: [
    { id: "AF-001", source: "model", area: "naming", title: "Mechanics names", severity: "low", impact: "medium", risk: "low", effort: 3, problem: "clickButton3 says how, not what", good: "submitRequest", evidence: [{ path: "tests/pages/request-page.ts", line: 4 }], dependsOn: [] },
    { id: "AF-002", source: "model", area: "reuse", title: "Status checked inline", severity: "medium", impact: "medium", risk: "low", effort: 2, problem: "p", good: "g", evidence: [{ path: "tests/a.spec.ts", line: 6 }], dependsOn: ["AF-001"] },
  ],
  notAssessed: [],
};

const RENAME: RefactorPlan = {
  phases: [
    { goal: "Page-object methods say what the user does", tasks: [{ key: "rename-submit", findings: ["AF-001"], title: "Rename clickButton3 to submitRequest", why: "the name says what the user does", operations: [{ op: "rename", path: "tests/pages/request-page.ts", within: "RequestPage", symbol: "clickButton3", to: "submitRequest" }] }] },
    { goal: "Checks read from the page object", tasks: [{ key: "status-locator", findings: ["AF-002"], title: "A status locator in the page object", why: "w", operations: [{ op: "edit", path: "tests/pages/request-page.ts", old: "  constructor(private readonly page: Page) {}\n", new: "  constructor(private readonly page: Page) {}\n\n  async submit() {\n    await this.submitRequest();\n  }\n" }] }] },
  ],
};

describe("refactor workflow (S3-6)", () => {
  let dir: string;
  let runs: RunStore;
  let files: Map<string, string>;
  let diagnostics: (f: ReadonlyArray<{ path: string; content: string }>) => TypeDiagnostic[];
  let outcomes: Array<"passed" | "failed">;
  const calls: string[] = [];
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-refactor-"));
    runs = new RunStore(dir);
    files = new Map([
      ["tests/pages/request-page.ts", PAGE],
      ["tests/a.spec.ts", SPEC(1)],
      ["tests/b.spec.ts", SPEC(2)],
      ["tests/c.spec.ts", OTHER],
      ["playwright.config.ts", "export default {};\n"],
    ]);
    diagnostics = () => [];
    outcomes = ["passed", "passed"];
    calls.length = 0;
    await runs.create({ workflow: "audit", context: "audit", host: "cli", driver: "api", id: "audit-run" });
    await runs.writeArtifact("audit-run", AUDIT_ARTIFACT, AUDIT, { inputs: [], templateVersion: "audit-1" });
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const fake = (over: Partial<RefactorDeps["data"]> = {}): RefactorDeps["data"] => ({
    savedProfile: async () => SAVED,
    frameworkProfile: async () => PROFILE,
    frameworkFiles: async () => ({ files: [...files.keys()].sort(), links: [] }) as never,
    readTestFiles: async (_r, _t, _f, paths) =>
      paths.map((p) => {
        const content = files.get(p);
        if (content === undefined) throw new ProfileError(`${p} isn't in the repo`);
        return { path: p, content, sha256: sha(content), gitBlob: `blob-${sha(content).slice(0, 8)}` };
      }),
    editTestFiles: async (_r, _t, _f, e) => {
      calls.push(`edit ${e.map((x) => x.path).join(",")}`);
      for (const x of e) if (sha(files.get(x.path)!) !== x.sha256) throw new ProfileError(`${x.path} changed since Agent-QA read it: it is never overwritten. Nothing was changed.`);
      for (const x of e) files.set(x.path, x.content);
      return { status: "done", written: e.map((x) => ({ path: x.path, sha256: sha(x.content) })) };
    },
    writeGeneratedFiles: async (_r, _t, _f, w) => {
      calls.push(`create ${w.map((x) => x.path).join(",")}`);
      for (const x of w) files.set(x.path, x.content);
      return { status: "done", written: w.map((x) => x.path) };
    },
    removeTestFiles: async (_r, _t, _f, w) => {
      calls.push(`remove ${w.map((x) => x.path).join(",")}`);
      for (const x of w) files.delete(x.path);
      return { status: "done", removed: w.map((x) => x.path) };
    },
    typeCheckReadiness: async () => ({ ready: true }),
    typeCheck: async (_r, _t, f) => ({ status: "done", diagnostics: diagnostics(f) }),
    testRunReadiness: async () => ({ ready: true }),
    runTests: async (_r, _t, _f, sel) => {
      calls.push(`run ${(sel.files ?? []).join(",")}`);
      return { status: "done", exitCode: 0, timedOut: false, durationMs: 1, errors: [], tests: (sel.files ?? []).map((file, i) => ({ title: "t", tags: [], file, line: 1, outcome: outcomes[i] ?? "passed", runs: 1, failedRuns: 0 })) };
    },
    pullRequestReadiness: async () => ({ ready: false, reason: "pull requests are opened from CI only" }),
    openPullRequest: async () => ({ status: "declined" }) as never,
    ...over,
  });
  const engine = (data = fake()) => new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId }).register(refactorWorkflow({ data, runs }));
  const report = async (runId: string) => (await runs.readArtifact(runId, REFACTOR_REPORT_ARTIFACT))!.data;

  it("plans from the audit, renames across files on the person's yes, and runs the tests the change reaches", async () => {
    const e = engine();
    const first = await e.start("refactor", { auditRun: "audit-run" });
    expect(first.stepId).toBe("plan");
    expect(first.context).toContain("- AF-001 (naming, low; impact medium, risk low): Mechanics names.");
    expect(first.context).toContain("Path aliases: @pages/* → tests/pages/*.");
    expect(first.context).not.toContain("playwright.config.ts");
    expect((await e.submit(first.runId, "plan", RENAME)).next.stepId).toBe("apply");
    const planned = await report(first.runId);
    expect(planned.phases.map((p) => [p.number, p.tasks])).toEqual([
      [1, ["T-1"]],
      [2, ["T-2"]],
    ]);
    // The rename reaches both specs through the alias.
    expect(planned.tasks[0]!.files).toEqual(["tests/a.spec.ts", "tests/b.spec.ts", "tests/pages/request-page.ts"]);
    const question = (await e.approval(first.runId, "apply"))?.question ?? "";
    expect(question).toMatch(/^Carry out phase 1 of 2 \(Page-object methods say what the user does\): T-1 Rename clickButton3 to submitRequest, changing 3 file\(s\)/);
    expect(question).toContain("+  await new RequestPage(page).submitRequest();");
    await expect(e.submit(first.runId, "apply", { apply: true })).rejects.toMatchObject({ code: "NEEDS_PERSON" });
    expect((await e.submit(first.runId, "apply", { apply: true }, { byPerson: true })).next.stepId).toBe("run");
    expect(files.get("tests/a.spec.ts")).toContain("submitRequest()");
    expect(files.get("tests/pages/request-page.ts")).toContain("async submitRequest()");
    expect(await report(first.runId)).toMatchObject({ status: "applied", affected: ["tests/a.spec.ts", "tests/b.spec.ts"], typeCheck: "passed" });
    expect((await e.submit(first.runId, "run", { run: true })).next.kind).toBe("done");
    expect(calls).toContain("run tests/a.spec.ts,tests/b.spec.ts");
    const done = await report(first.runId);
    expect(done).toMatchObject({ status: "passed", tests: { passed: 2, failed: 0 } });
    // Phase 2 was planned, not carried out.
    expect(done.tasks[1]).toMatchObject({ id: "T-2", phase: 2, status: "planned" });
    const md = await readFile(join(dir, first.runId, "refactor-report.md"), "utf8");
    expect(md).toContain("## T-1: Rename clickButton3 to submitRequest (applied)");
    expect(md).toContain("- Phase 2: Checks read from the page object (T-2)");
  });

  it("puts the phase back when a test it reaches fails", async () => {
    outcomes = ["passed", "failed"];
    const e = engine();
    const plan: RefactorPlan = { phases: [{ goal: "g", tasks: [{ key: "helper", findings: ["AF-001"], title: "A helper file", why: "w", operations: [{ op: "create", path: "tests/support/steps.ts", content: "export function step() {}\n" }, { op: "rename", path: "tests/pages/request-page.ts", within: "RequestPage", symbol: "clickButton3", to: "submitRequest" }] }] }] };
    const first = await e.start("refactor", { auditRun: "audit-run", findings: ["AF-001"] });
    await e.submit(first.runId, "plan", plan);
    await e.submit(first.runId, "apply", { apply: true }, { byPerson: true });
    expect(files.has("tests/support/steps.ts")).toBe(true);
    await e.submit(first.runId, "run", { run: true });
    const r = await report(first.runId);
    expect(r).toMatchObject({ status: "rolled-back", tests: { failed: 1, failing: ["tests/b.spec.ts: t"] }, changes: [] });
    expect(r.tasks[0]!.status).toBe("rolled-back");
    expect(files.get("tests/a.spec.ts")).toBe(SPEC(1));
    expect(files.get("tests/pages/request-page.ts")).toBe(PAGE);
    expect(files.has("tests/support/steps.ts")).toBe(false);
  });

  it("writes no task that adds a type error, and stops the phase there", async () => {
    diagnostics = (f) => (f.some((x) => x.content.includes("submitRequest")) ? [{ file: "tests/c.spec.ts", line: 2, code: 2339, message: "Property 'clickButton3' does not exist." }] : []);
    const two: RefactorPlan = {
      phases: [
        {
          goal: "g",
          tasks: [
            { key: "rename", findings: ["AF-001"], title: "Rename", why: "w", operations: [{ op: "rename", path: "tests/pages/request-page.ts", within: "RequestPage", symbol: "clickButton3", to: "submitRequest" }] },
            { key: "other", findings: ["AF-001"], title: "Other", why: "w", operations: [{ op: "edit", path: "tests/c.spec.ts", old: "  await page.goto('/requests');\n", new: "  await page.goto('/requests');\n  await page.reload();\n" }] },
          ],
        },
      ],
    };
    const e = engine();
    const first = await e.start("refactor", { auditRun: "audit-run", findings: ["AF-001"] });
    await e.submit(first.runId, "plan", two);
    expect((await e.submit(first.runId, "apply", { apply: true }, { byPerson: true })).next.kind).toBe("done");
    const r = await report(first.runId);
    expect(r).toMatchObject({ status: "stopped", typeCheck: "T-1 adds type errors" });
    expect(r.tasks.map((t) => t.status)).toEqual(["type-errors", "skipped"]);
    expect(r.tasks[0]!.typeErrors).toEqual([{ file: "tests/c.spec.ts", line: 2, message: "Property 'clickButton3' does not exist." }]);
    expect(calls).toEqual([]);
  });

  it("refuses plans that change what the tests check, overlap in a phase, or come before what they depend on", async () => {
    const start = new Map(files);
    start.delete("playwright.config.ts");
    const task = (key: string, findings: string[], operations: RefactorPlan["phases"][0]["tasks"][0]["operations"]) => ({ key, findings, title: key, why: "w", operations });
    const errs = (plan: RefactorPlan, chosen = ["AF-001", "AF-002"]) => simulatePlan(plan, start, { "@pages/*": ["tests/pages/*"] }, AUDIT, chosen).errors.map((x) => x.message).join("\n");
    const one = (op: RefactorPlan["phases"][0]["tasks"][0]["operations"][0]) => errs({ phases: [{ goal: "g", tasks: [task("x", ["AF-001"], [op])] }] });
    expect(one({ op: "rename", path: "tests/pages/request-page.ts", within: "RequestPage", symbol: "clickButton3", to: "submitRequest" })).toBe("");
    expect(one({ op: "edit", path: "tests/a.spec.ts", old: "toHaveText('Submitted')", new: "toHaveText('Rejected')" })).toMatch(/changes what the tests check[^]*brings in a value the code didn't hold \("Rejected"\)/);
    expect(one({ op: "edit", path: "tests/a.spec.ts", old: "submits request 1", new: "sends request 1" })).toMatch(/changes a test's title/);
    expect(one({ op: "edit", path: "tests/c.spec.ts", old: "  await page.goto('/requests');\n", new: "  await page.goto('/requests');\n  await page.waitForTimeout(1000);\n" })).toMatch(/brings in a value[^]*adds what the code scan reports \(fixed-wait\)/);
    expect(one({ op: "edit", path: "tests/c.spec.ts", old: "test('lists requests'", new: "const who = '<PERSON_1>';\ntest('lists requests'" })).toMatch(/tests\/c.spec.ts would hold <PERSON_1>, which it doesn't/);
    expect(one({ op: "create", path: "tests/n.ts", content: "export const who = '<PERSON_1>';\n" })).toMatch(/tests\/n.ts would hold <PERSON_1>[^]*a new file holds none/);
    expect(one({ op: "rename", path: "tests/pages/request-page.ts", within: "RequestPage", symbol: "nope", to: "x" })).toMatch(/RequestPage has no member nope/);
    expect(one({ op: "edit", path: "playwright.config.ts", old: "{}", new: "{ a: 1 }" })).toMatch(/playwright.config.ts isn't one of the folder's files shown/);
    expect(
      errs({
        phases: [
          {
            goal: "g",
            tasks: [
              task("a", ["AF-001"], [{ op: "rename", path: "tests/pages/request-page.ts", within: "RequestPage", symbol: "clickButton3", to: "submitRequest" }]),
              task("b", ["AF-001"], [{ op: "edit", path: "tests/a.spec.ts", old: "import { test, expect }", new: "import { expect, test }" }]),
            ],
          },
        ],
      }),
    ).toMatch(/tests\/a.spec.ts is changed by a too/);
    expect(
      errs({
        phases: [
          { goal: "g", tasks: [task("b", ["AF-002"], [{ op: "edit", path: "tests/c.spec.ts", old: "import { test }", new: "import { test as t }" }])] },
          { goal: "h", tasks: [task("a", ["AF-001"], [{ op: "rename", path: "tests/pages/request-page.ts", within: "RequestPage", symbol: "clickButton3", to: "submitRequest" }])] },
        ],
      }),
    ).toMatch(/AF-002 depends on AF-001, which is planned in a later phase \(2\)/);
    expect(errs({ phases: [{ goal: "g", tasks: [task("x", ["AF-002"], [{ op: "edit", path: "tests/c.spec.ts", old: "import { test }", new: "import { test as t }" }])] }] }, ["AF-001"])).toMatch(/AF-002 isn't one of the findings to act on/);
    const e = engine();
    await expect(e.start("refactor", { auditRun: "audit-run", findings: ["AF-009"] })).rejects.toThrow(/AF-009 isn't a finding of audit run audit-run/);
    await expect(e.start("refactor", { auditRun: "nope" })).rejects.toThrow(/run nope has no audit/);
  });

  it("writes nothing when a file changed since the plan, or the person says no", async () => {
    const e = engine();
    const no = await e.start("refactor", { auditRun: "audit-run" });
    await e.submit(no.runId, "plan", RENAME);
    await e.submit(no.runId, "apply", { apply: false });
    expect((await report(no.runId)).status).toBe("declined");
    const stale = await e.start("refactor", { auditRun: "audit-run" });
    await e.submit(stale.runId, "plan", RENAME);
    files.set("tests/b.spec.ts", `${SPEC(2)}// edited\n`);
    await e.submit(stale.runId, "apply", { apply: true }, { byPerson: true });
    expect(await report(stale.runId)).toMatchObject({ status: "stale", reason: expect.stringContaining("tests/b.spec.ts changed since the plan") });
    expect(calls).toEqual([]);
  });
});

describe("refactor operations (ts-morph)", () => {
  const files = [
    { path: "tests/pages/p.ts", content: "export class P {\n  async clickButton3() {}\n}\nexport function helper() {}\n" },
    { path: "tests/a.spec.ts", content: "import { P, helper } from './pages/p';\nhelper();\nnew P().clickButton3();\n" },
    { path: "tests/b.ts", content: "import { helper } from '@pages/p';\nexport const x = helper;\n" },
    { path: "tests/c.spec.ts", content: "import { x } from './b';\nx();\n" },
  ];
  const aliases = { "@pages/*": ["tests/pages/*"] };

  it("renames a function and its references, aliases and all", () => {
    const r = applyRefactor(files, [{ op: "rename", path: "tests/pages/p.ts", symbol: "helper", to: "openRequests" }], aliases);
    expect(r.errors).toEqual([]);
    expect(r.changed).toEqual(["tests/a.spec.ts", "tests/b.ts", "tests/pages/p.ts"]);
    expect(r.files.get("tests/b.ts")).toBe("import { openRequests } from '@pages/p';\nexport const x = openRequests;\n");
  });

  it("finds the specs that import a changed file, directly or not", () => {
    expect(dependentSpecs(files, ["tests/pages/p.ts"], (p) => p.endsWith(".spec.ts"), aliases)).toEqual(["tests/a.spec.ts", "tests/c.spec.ts"]);
    expect(dependentSpecs(files, ["tests/b.ts"], (p) => p.endsWith(".spec.ts"), aliases)).toEqual(["tests/c.spec.ts"]);
  });

  it("refuses edits that don't apply and files that exist", () => {
    const r = applyRefactor(files, [
      { op: "edit", path: "tests/b.ts", old: "nope", new: "x" },
      { op: "create", path: "tests/b.ts", content: "x" },
      { op: "rename", path: "tests/b.ts", symbol: "x", to: "not a name" },
    ]);
    expect(r.errors.map((e) => e.at)).toEqual([0, 1, 2]);
    expect(r.changed).toEqual([]);
  });

  it("lets a check move between files", () => {
    const before = new Map([
      ["a.spec.ts", "test('a', async ({ page }) => {\n  await expect(page.getByRole('status')).toHaveText('Done');\n});\n"],
      ["p.ts", "export const status = (page) => page.getByRole('status');\n"],
    ]);
    const after = new Map([
      ["a.spec.ts", "test('a', async ({ page }) => {\n  await expect(status(page)).toHaveText('Done');\n});\n"],
      ["p.ts", "export const status = (page) => page.getByRole('status');\n"],
    ]);
    expect(checkRefactored(before, after, [])).toEqual([]);
  });
});
