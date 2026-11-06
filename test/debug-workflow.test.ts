import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RunStore, WorkflowEngine } from "../src/core/index.js";
import { ProfileError, type SavedProfile, type TestRunOutcome, type TestSelection } from "../src/data/index.js";
import { checkDebugFix, DEBUG_REPORT_ARTIFACT, debugWorkflow, roleOf, type DebugDeps, type RunAttempt } from "../src/workflows/index.js";

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const SPEC = `import { test, expect } from '@playwright/test';

test('TC-ABC-1-001 saves a request for <PERSON_1>', async ({ page }) => {
  await page.goto('/requests');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
});
`;
const FIXED = SPEC.replace("name: 'Save' }", "name: 'Save draft' }");
const TITLE = "TC-ABC-1-001 saves a request for <PERSON_1>";
const SAVED = { version: 1, folder: ".", kind: "playwright", commands: { test: ["npx", "playwright", "test"] }, reviewedAt: "2026-11-06T00:00:00.000Z" } as unknown as SavedProfile;

const result = (outcome: "passed" | "failed" | "flaky" | "skipped", message = "TimeoutError: locator.click: Timeout 5000ms exceeded.\n  - waiting for getByRole('button', { name: 'Save' })", title = TITLE) => ({
  title,
  tags: [],
  file: "tests/a.spec.ts",
  line: 3,
  outcome,
  runs: 1,
  failedRuns: outcome === "passed" || outcome === "skipped" ? 0 : 1,
  ...(outcome === "failed" || outcome === "flaky" ? { failure: { message, at: { file: "tests/a.spec.ts", line: 5 }, snapshot: '- button "Save draft"' } } : {}),
});
const done = (...tests: ReturnType<typeof result>[]): TestRunOutcome => ({ status: "done", exitCode: tests.some((t) => t.outcome === "failed") ? 1 : 0, timedOut: false, durationMs: 5, errors: [], tests });

describe("debug workflow (S3-3)", () => {
  let dir: string;
  let runs: RunStore;
  let files: Map<string, string>;
  let outcomes: TestRunOutcome[];
  const ran: TestSelection[] = [];
  const edits: Array<ReadonlyArray<{ path: string; content: string; sha256: string }>> = [];
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-debug-"));
    runs = new RunStore(dir);
    files = new Map([["tests/a.spec.ts", SPEC]]);
    outcomes = [];
    ran.length = 0;
    edits.length = 0;
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const fake = (over: Partial<DebugDeps["data"]> = {}): DebugDeps["data"] => ({
    savedProfile: async () => SAVED,
    maskTexts: async (_r, texts) => texts.map((t) => t.replaceAll("jane.doe@example.com", "<EMAIL_1>")),
    testRunReadiness: async () => ({ ready: true }),
    selectTests: async (_r, _f, s) => {
      if (!s.files && !s.grep && !s.tag && !s.failedIn) throw new Error("pick the tests");
      return { command: ["npx", "playwright", "test"], args: ["--reporter=json", ...(s.grep ? [`--grep=${s.grep}`] : []), ...(s.files ?? [])] };
    },
    runTests: async (_r, _t, _f, s) => {
      ran.push(s);
      const next = outcomes.shift();
      if (!next) throw new Error("no more runs planned");
      return next;
    },
    readTestFiles: async (_r, _t, _f, paths) =>
      paths.map((p) => {
        const content = files.get(p);
        if (content === undefined) throw new Error(`${p} isn't in the repo`);
        return { path: p, content, sha256: sha(content), gitBlob: `blob-${sha(content).slice(0, 8)}` };
      }),
    editTestFiles: async (_r, _t, _f, e) => {
      edits.push(e);
      for (const x of e) {
        if (sha(files.get(x.path)!) !== x.sha256) throw new ProfileError(`${x.path} changed since it was read`);
        files.set(x.path, x.content);
      }
      return { status: "done", written: e.map((x) => ({ path: x.path, sha256: sha(x.content) })) };
    },
    ...over,
  });
  const engine = (data = fake()) => new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId }).register(debugWorkflow({ data, runs }));
  const report = async (runId: string) => (await runs.readArtifact(runId, DEBUG_REPORT_ARTIFACT))!.data;
  const FIX = { failures: [{ test: TITLE, kind: "selector", reason: "the button is now called Save draft" }], files: [{ path: "tests/a.spec.ts", content: FIXED }] };

  it("runs, proposes a selector fix as a diff, writes it on the person's own yes, then proves it stable", async () => {
    const e = engine();
    const first = await e.start("debug", { files: ["tests/a.spec.ts"], stabilityRuns: 2 });
    expect(first.stepId).toBe("run");
    // Running the person's suite takes their own yes.
    await expect(e.submit(first.runId, "run", { run: true })).rejects.toMatchObject({ code: "NEEDS_PERSON" });
    outcomes.push(done(result("failed"), result("skipped", "", "TC-ABC-1-009 later")));
    const fix = (await e.submit(first.runId, "run", { run: true }, { byPerson: true })).next;
    expect(fix.stepId).toBe("fix-1");
    const shown = fix.context;
    expect(shown).toContain("locator.click: Timeout");
    expect(shown).toContain("### tests/a.spec.ts (spec)");
    expect(shown).toContain("name: 'Save' }");
    // The skipped test isn't a failure to classify.
    expect(shown).not.toContain("TC-ABC-1-009");

    const apply = (await e.submit(first.runId, "fix-1", FIX)).next;
    expect(apply.stepId).toBe("apply-1");
    expect(apply.context).toContain("+  await page.getByRole('button', { name: 'Save draft' }).click();");
    expect((await report(first.runId)).status).toBe("proposed");
    expect(edits).toEqual([]);
    const question = (await e.approval(first.runId, "apply-1"))?.question ?? "";
    expect(question).toMatch(/Write this change to 1 file\(s\) of your repo \(\+1 −1 lines\): tests\/a\.spec\.ts\?/);
    // The prompt itself shows the diff: with an IDE prompt, it is all the person may see.
    expect(question).toContain("+  await page.getByRole('button', { name: 'Save draft' }).click();");
    await expect(e.submit(first.runId, "apply-1", { apply: true })).rejects.toMatchObject({ code: "NEEDS_PERSON" });

    outcomes.push(done(result("passed")), done({ ...result("passed"), runs: 2 }));
    expect((await e.submit(first.runId, "apply-1", { apply: true }, { byPerson: true })).next.kind).toBe("done");
    expect(edits).toEqual([[{ path: "tests/a.spec.ts", content: FIXED, sha256: sha(SPEC) }]]);
    expect(ran.map((s) => s.repeatEach)).toEqual([undefined, undefined, 2]);
    const r = await report(first.runId);
    expect(r).toMatchObject({ status: "passed", rounds: 1, changes: [{ round: 1, path: "tests/a.spec.ts", sha256: sha(FIXED), gitBlob: `blob-${sha(SPEC).slice(0, 8)}`, added: 1, removed: 1 }] });
    expect(r.proposal).toBeUndefined();
    expect(r.attempts.map((a) => a.kind)).toEqual(["run", "run", "stability"]);
    expect(await readFile(join(dir, first.runId, "debug-report.md"), "utf8")).toContain("round 1: tests/a.spec.ts (+1 −1)");
  });

  it("reports a defect or a broken environment, and changes nothing for it", async () => {
    for (const kind of ["defect", "environment"] as const) {
      const e = engine();
      const first = await e.start("debug", { grep: "jane.doe@example.com" });
      outcomes.push(done(result("failed", 'expect(received).toHaveText(expected)\nExpected: "Saved"\nReceived: "Error"')));
      await e.submit(first.runId, "run", { run: true }, { byPerson: true });
      // A fix sent with a stop is refused: a defect is reported, not fixed in the test.
      const both = await e.submit(first.runId, "fix-1", { ...FIX, failures: [{ test: TITLE, kind, reason: "the app says Error" }] });
      expect(both.status).toBe("rejected");
      expect(JSON.stringify(both)).toMatch(/never fixed in the test/);
      expect((await e.submit(first.runId, "fix-1", { failures: [{ test: TITLE, kind, reason: "the app says Error" }] })).next.kind).toBe("done");
      const r = await report(first.runId);
      expect(r).toMatchObject({ status: kind, stoppedOn: [{ kind }], changes: [], selection: { grep: "<EMAIL_1>" } });
      expect(JSON.stringify(r)).not.toContain("jane");
    }
    expect(edits).toEqual([]);
    expect(files.get("tests/a.spec.ts")).toBe(SPEC);
  });

  it("keeps a declined change as a diff, and writes nothing", async () => {
    const e = engine();
    const first = await e.start("debug", { files: ["tests/a.spec.ts"] });
    outcomes.push(done(result("failed")));
    await e.submit(first.runId, "run", { run: true }, { byPerson: true });
    await e.submit(first.runId, "fix-1", FIX);
    expect((await e.submit(first.runId, "apply-1", { apply: false }, { byPerson: true })).next.kind).toBe("done");
    const r = await report(first.runId);
    expect(r.status).toBe("declined");
    expect(r.proposal?.diff).toContain("+  await page.getByRole('button', { name: 'Save draft' }).click();");
    expect(await readFile(join(dir, first.runId, "debug-report.md"), "utf8")).toContain("## The change you declined (round 1)");
    expect(edits).toEqual([]);
  });

  it("stops when every test passes at once, or none ran, or the person says no", async () => {
    const e = engine();
    const green = await e.start("debug", { tag: "@smoke" });
    outcomes.push(done(result("passed")));
    await e.submit(green.runId, "run", { run: true }, { byPerson: true });
    expect((await report(green.runId)).status).toBe("nothing-to-fix");

    const none = await e.start("debug", { tag: "@smoke" });
    outcomes.push({ status: "done", exitCode: 1, timedOut: false, durationMs: 1, tests: [], errors: ["Error: No tests found"] });
    await e.submit(none.runId, "run", { run: true }, { byPerson: true });
    expect((await report(none.runId)).status).toBe("no-tests");

    const no = await e.start("debug", { tag: "@smoke" });
    await e.submit(no.runId, "run", { run: false }, { byPerson: true });
    expect((await report(no.runId)).status).toBe("declined");
    expect(ran).toHaveLength(2);

    // A selection the suite can't take stops at the start.
    await expect(e.start("debug", { project: "chromium" })).rejects.toThrow();
    await expect(e.start("debug", { grep: "a", tag: "@b" })).rejects.toThrow();
  });

  it("reports a data failure without changing test data", async () => {
    const e = engine();
    const first = await e.start("debug", { files: ["tests/a.spec.ts"] });
    outcomes.push(done(result("failed")));
    await e.submit(first.runId, "run", { run: true }, { byPerson: true });
    expect((await e.submit(first.runId, "fix-1", { failures: [{ test: TITLE, kind: "data", reason: "the name is taken" }] })).next.kind).toBe("done");
    expect(await report(first.runId)).toMatchObject({ status: "data", stoppedOn: [{ kind: "data" }] });
    expect(edits).toEqual([]);
  });

  it("calls a run of only skipped tests no-tests, and a failing test skipped after a fix not fixed", async () => {
    const e = engine();
    const skipped = await e.start("debug", { tag: "@smoke" });
    outcomes.push(done(result("skipped")));
    await e.submit(skipped.runId, "run", { run: true }, { byPerson: true });
    expect(await report(skipped.runId)).toMatchObject({ status: "no-tests", reason: "every selected test was skipped" });

    const tripped = await e.start("debug", { files: ["tests/a.spec.ts"] });
    outcomes.push(done(result("failed"), result("passed", "", "TC-ABC-1-002 other")));
    await e.submit(tripped.runId, "run", { run: true }, { byPerson: true });
    await e.submit(tripped.runId, "fix-1", FIX);
    outcomes.push(done(result("skipped"), result("passed", "", "TC-ABC-1-002 other")));
    await e.submit(tripped.runId, "apply-1", { apply: true }, { byPerson: true });
    expect(await report(tripped.runId)).toMatchObject({ status: "gave-up", reason: expect.stringContaining("doesn't run any more after the fix") });
    expect(ran).toHaveLength(3);
  });

  it("runs again for a flake, and gives up after the last round", async () => {
    const e = engine();
    const first = await e.start("debug", { files: ["tests/a.spec.ts"], fixRounds: 1 });
    outcomes.push(done(result("failed")), done(result("failed")));
    await e.submit(first.runId, "run", { run: true }, { byPerson: true });
    expect((await e.submit(first.runId, "fix-1", { failures: [{ test: TITLE, kind: "flake", reason: "it passed yesterday" }] })).next.kind).toBe("done");
    expect(await report(first.runId)).toMatchObject({ status: "gave-up", rounds: 1 });
    expect(ran).toHaveLength(2);
  });

  it("doesn't write a file that changed since it was read, and proposes again from the file as it is", async () => {
    const e = engine();
    const first = await e.start("debug", { files: ["tests/a.spec.ts"] });
    outcomes.push(done(result("failed")));
    await e.submit(first.runId, "run", { run: true }, { byPerson: true });
    await e.submit(first.runId, "fix-1", FIX);
    files.set("tests/a.spec.ts", `${SPEC}// edited by hand\n`);
    const next = (await e.submit(first.runId, "apply-1", { apply: true }, { byPerson: true })).next;
    expect(files.get("tests/a.spec.ts")).toBe(`${SPEC}// edited by hand\n`);
    expect(await report(first.runId)).toMatchObject({ status: "failing", rounds: 1, reason: expect.stringMatching(/wasn't written: .*changed since it was read/) });
    expect(next.stepId).toBe("fix-2");
    expect(next.context).toContain("// edited by hand");
    expect(ran).toHaveLength(1);
  });
});

describe("what a debug fix may change", () => {
  const last: RunAttempt = { kind: "run", changed: [], classified: [], exitCode: 1, timedOut: false, durationMs: 1, errors: [], tests: [{ ...result("failed"), tags: [] }, { ...result("skipped", "", "TC-ABC-1-009 later"), tags: [] }] };
  const shown = [
    { path: "tests/a.spec.ts", content: SPEC },
    { path: "tests/features/a.feature", content: "Feature: A\n  Scenario: B\n    Given x\n" },
    { path: "tests/test-data/a.json", content: '{"name":"Ann"}' },
  ];
  const kinds = (out: Parameters<typeof checkDebugFix>[0]) => checkDebugFix(out, last, shown).map((x) => x.message);

  it("allows a locator change for a selector failure, nothing else", () => {
    expect(kinds({ failures: [{ test: TITLE, kind: "selector", reason: "r" }], files: [{ path: "tests/a.spec.ts", content: FIXED }] })).toEqual([]);
    expect(kinds({ failures: [{ test: TITLE, kind: "selector", reason: "r" }], files: [{ path: "tests/a.spec.ts", content: SPEC.replace("toHaveText('Saved')", "toHaveText('Error')") }] }).join()).toMatch(/changes more than locators and waits/);
    expect(kinds({ failures: [{ test: TITLE, kind: "selector", reason: "r" }], files: [{ path: "tests/a.spec.ts", content: SPEC.replace("saves a request", "saves") }] }).join()).toMatch(/title|changes more than locators/);
    expect(kinds({ failures: [{ test: TITLE, kind: "selector", reason: "r" }], files: [{ path: "tests/features/a.feature", content: "Feature: A\n" }] }).join()).toMatch(/never changes a feature file/);
    expect(kinds({ failures: [{ test: TITLE, kind: "selector", reason: "r" }], files: [{ path: "tests/other.spec.ts", content: SPEC }] }).join()).toMatch(/isn't one of the files shown/);
    expect(kinds({ failures: [{ test: TITLE, kind: "selector", reason: "r" }], files: [{ path: "tests/test-data/a.json", content: '{"name":"Bob"}' }] }).join()).toMatch(/only for a data failure/);
    // expect(locator).toBeVisible() checks the element itself: its texts stay, even through a variable.
    const shownCheck = `import { test, expect } from '@playwright/test';

test('${TITLE}', async ({ page }) => {
  const done = page.getByText('Saved');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/Saved/)).toBeVisible();
  await expect(done).toBeVisible({ timeout: 5000 });
});
`;
    const visible = (content: string) => checkDebugFix({ failures: [{ test: TITLE, kind: "selector", reason: "r" }], files: [{ path: "tests/a.spec.ts", content }] }, last, [{ path: "tests/a.spec.ts", content: shownCheck }]).map((x) => x.message).join();
    expect(visible(shownCheck.replace("/Saved/", "/Error/"))).toMatch(/changes more than locators and waits/);
    expect(visible(shownCheck.replace("getByText('Saved')", "getByText('Error')"))).toMatch(/changes more than locators and waits/);
    expect(visible(shownCheck.replace("getByText(/Saved/)", "getByRole('status').getByText(/Saved/)"))).toMatch(/changes more than locators and waits/);
    expect(visible(shownCheck.replace("name: 'Save' }", "name: 'Save draft' }"))).toBe("");
    // A masked value only where the file holds it: the snapshot's name may be another file's.
    expect(kinds({ failures: [{ test: TITLE, kind: "selector", reason: "r" }], files: [{ path: "tests/a.spec.ts", content: SPEC.replace("name: 'Save' }", "name: '<PERSON_2>' }") }] }).join()).toMatch(/holds <PERSON_2>, which this file doesn't hold/);
    expect(kinds({ failures: [{ test: TITLE, kind: "selector", reason: "r" }], files: [{ path: "tests/a.spec.ts", content: SPEC.replace("name: 'Save' }", "name: '<PERSON_1>' }") }] })).toEqual([]);
    // A selector fix sends the fix; test data isn't changed by debug.
    expect(kinds({ failures: [{ test: TITLE, kind: "selector", reason: "r" }], files: [] }).join()).toMatch(/send the fix/);
    expect(kinds({ failures: [{ test: TITLE, kind: "data", reason: "r" }], files: [{ path: "tests/test-data/a.json", content: '{"name":"Bob"}' }] }).join()).toMatch(/doesn't change test data yet/);
    // Each failure classified once; the skipped test isn't one.
    expect(kinds({ failures: [], files: [] }).join()).toMatch(/say what kind of failure/);
    expect(kinds({ failures: [{ test: TITLE, kind: "flake", reason: "r" }, { test: "TC-ABC-1-009 later", kind: "flake", reason: "r" }], files: [] }).join()).toMatch(/isn't a failure of the last run/);
  });

  it("keeps a presence check's element as it was, wherever its locator is written", () => {
    const spec = (body: string) => `import { test, expect } from '@playwright/test';\n\ntest('${TITLE}', async ({ page, pages }) => {\n${body}\n});\n`;
    const verdict = (before: string, after: string) =>
      checkDebugFix({ failures: [{ test: TITLE, kind: "selector", reason: "r" }], files: [{ path: "tests/a.spec.ts", content: after }] }, last, [{ path: "tests/a.spec.ts", content: before }])
        .map((x) => x.message)
        .join();
    const refused = /changes more than locators and waits/;
    const row = spec("  await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible();");
    expect(verdict(row, row.replace(".filter({ hasText: name })", ""))).toMatch(refused);
    const exact = spec("  await expect(page.getByText('Saved', { exact: true }).nth(1)).toBeVisible();");
    expect(verdict(exact, exact.replace(", { exact: true }", ""))).toMatch(refused);
    expect(verdict(exact, exact.replace(".nth(1)", ".first()"))).toMatch(refused);
    const soft = spec("  await expect.soft(page.getByText('Saved')).toBeVisible();");
    expect(verdict(soft, soft.replace("'Saved'", "'Error'"))).toMatch(refused);
    const none = spec("  await page.getByRole('button').click();\n  await expect(page.getByText('Error')).toHaveCount(0);");
    expect(verdict(none, none.replace("'Error'", "'Nope'"))).toMatch(refused);
    // The same name in two tests: both stay.
    const twice = `import { test, expect } from '@playwright/test';\n\ntest('${TITLE}', async ({ page }) => {\n  const msg = page.getByText('A');\n  await page.getByRole('button').click();\n  await expect(msg).toBeVisible();\n});\n\ntest('other', async ({ page }) => {\n  const msg = page.getByText('B');\n  await msg.click();\n});\n`;
    expect(verdict(twice, twice.replace("getByText('A')", "getByText('Z')"))).toMatch(refused);
    // A wait for the element the next statement acts on is a wait: its locator may change with the action's.
    const waited = spec("  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();\n  await page.getByRole('button', { name: 'Save' }).click();");
    expect(verdict(waited, waited.replaceAll("name: 'Save' }", "name: 'Save draft' }"))).toBe("");
    // A page object's field a shown spec checks by presence stays too.
    const checks = { path: "tests/a.spec.ts", content: spec("  await pages.loginPage.signIn();\n  await expect(pages.loginPage.toast).toBeVisible();") };
    const page = "export class LoginPage {\n  constructor(private page: any) {}\n  toast = this.page.getByText('Welcome');\n  button = this.page.getByRole('button', { name: 'Sign in' });\n  async signIn() {\n    await this.button.click();\n  }\n}\n";
    const pageFix = (after: string) => checkDebugFix({ failures: [{ test: TITLE, kind: "selector", reason: "r" }], files: [{ path: "src/pages/login-page.ts", content: after }] }, { ...last, tests: [{ ...last.tests[0]!, failure: { message: "x", at: { file: "src/pages/login-page.ts", line: 3 } } }] }, [checks, { path: "src/pages/login-page.ts", content: page }]).map((x) => x.message).join();
    expect(pageFix(page.replace("'Welcome'", "'Error'"))).toMatch(refused);
    expect(pageFix(page.replace("name: 'Sign in' }", "name: 'Log in' }"))).toBe("");
  });

  it("names each file's part from its path", () => {
    expect(["tests/a.spec.ts", "tests/a.feature", "test-data/a.json", "tests/steps/login.ts", "tests/step-definitions/x.ts", "src/pages/login-page.ts"].map(roleOf)).toEqual(["spec", "feature", "data", "steps", "steps", "page"]);
  });
});
