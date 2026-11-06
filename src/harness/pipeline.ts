import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { configSchema, MemoryAuditSink, RunStore, WorkflowEngine, type Config, type Step } from "../core/index.js";
import { DataAccess, openRepoBrowser, type JiraCollection, type JiraInput, type JiraIssue, type OpenBrowser } from "../data/index.js";
import { drive } from "../llm/index.js";
import { MemoryVaultStorage, Vault } from "../masking/index.js";
import { DEBUG_REPORT_ARTIFACT, debugWorkflow, EXPLORATION_ARTIFACT, exploreWorkflow, FINDINGS_ARTIFACT, reviewWorkflow, requirementsWorkflow, SCRIPTS_DRAFT_ARTIFACT, SCRIPTS_RUN_ARTIFACT, scriptsWorkflow, TEST_CASES_DRAFT_ARTIFACT, testCasesWorkflow } from "../workflows/index.js";
import type { Seed, SyntheticTicket } from "./cases.js";
import { FIXTURE_SPEC } from "./fixture-driver.js";
import { HAND_WRITTEN_PAGE, HAND_WRITTEN_SPEC, handWrittenSuite } from "./hand-written.js";
import { startStandInApp, type StandInApp } from "./stand-in-app.js";
import type { Pipeline, PipelineContext } from "./runner.js";

/**
 * The masked pipeline (S1-14): each case runs the real requirements or
 * test-cases workflow, through the masked data service, with the case's
 * tickets standing in for Jira. Every generate step goes to the model through
 * the harness's recording driver; every confirm step's text, which an IDE's
 * model would see, is scanned too, and so is every file of the run folder
 * (an IDE's model is told to read them). The review edits one case with a
 * seeded value, as a person might, so the masking of edits is tested; it is
 * marked unattended. Xray is set up with a stand-in that never pushes, so the
 * push step's question and context are scanned; the push is always declined.
 *
 * An `explore` case (S2-10) runs the test-cases workflow, then explores its
 * cases in a real browser on the stand-in app (stand-in-app.ts), whose records
 * hold the case's seeds: every page snapshot, action result and the
 * exploration@1 record are scanned the same way. The harness gives the yes
 * to explore itself, since the app is its own, on this machine.
 *
 * A `scripts` case (S2-10) also starts a repo for the stand-in app in a
 * scratch folder (data's scaffold writer, then removed), runs the test-cases
 * workflow, then the scripts workflow: the generated test is written, run with
 * the folder's Playwright, and fails on the app's seeded bug. The run must
 * end as a reported defect with the test unchanged on disk; its output (the
 * error, the page snapshot) is scanned like everything else.
 *
 * A `debug` case (S3-10) starts the same repo with a hand-written test and
 * page object (hand-written.ts) instead of a generated one, and runs the
 * debug workflow on it. The test names a seeded person, so the masking of a
 * person's own files is tested too. It fails on the same seeded bug; the run
 * must report a defect, refuse the tempting fix that expects what the app
 * shows, and leave both files unchanged on disk. The harness never says yes
 * to a change, so it runs with a real model too.
 *
 * Runs are kept under `runsDir` for inspection, apart from the project's own
 * runs so the kept rate never counts them. They hold masked text only: the
 * token vault lives in memory and is gone when the case ends.
 */
export interface MaskedPipelineOptions {
  /** Where harness runs are kept, e.g. `.agent-qa/harness/runs`. */
  runsDir: string;
  /** The project's config: its masking and Jira field settings are used, never its connections. */
  config?: Config;
  /** For `explore` cases: the folder whose Playwright (and installed Chromium) drives the browser. */
  playwrightFolder?: string;
  headed?: boolean;
}

/** Cases that run in a browser: they need `playwrightFolder`. */
export const BROWSER_WORKFLOWS: ReadonlySet<string> = new Set(["explore", "scripts", "debug"]);
/** Actions per explored case: the fixture model's tour is five actions, then finish. */
const EXPLORE_MAX_ACTIONS = 10;

const AC_FIELD = { id: "customfield_10001", name: "Acceptance criteria", custom: true };
const SITE = "https://harness.invalid";

export function maskedPipeline(options: MaskedPipelineOptions): Pipeline {
  const runs = new RunStore(options.runsDir);
  const config = harnessConfig(options.config);
  return async (context) => {
    if (context.case.workflow === "review") {
      // No browser and no packages: a review reads the code, and the harness never says yes to its fixes.
      const boot = new DataAccess({ root: options.runsDir, store: runs, config, mode: "ide", audit: new MemoryAuditSink() });
      return boot.withScratchRepo(SCRATCH_AUDIT_ID, (repo) => runCase(options, runs, config, context, undefined, repo));
    }
    if (!BROWSER_WORKFLOWS.has(context.case.workflow)) return runCase(options, runs, config, context);
    const scripts = context.case.workflow === "scripts";
    const debug = context.case.workflow === "debug";
    // The harness says yes as the person to writing and running the code: only the fixture model's fixed code, never a real model's.
    if (scripts && context.driver.name !== "fixture" && context.driver.name !== "recording(fixture)") throw new Error("a scripts case runs the code its model writes: only with the offline fixture model");
    if (!options.playwrightFolder) throw new Error(`a ${context.case.workflow} case needs a browser: run the harness with --browser`);
    const app = await startStandInApp(context.seeds, { defect: scripts || debug });
    try {
      if (!scripts && !debug) return await runCase(options, runs, config, context, app);
      const modules = nodeModulesOf(options.playwrightFolder);
      // The test imports @playwright/test, as a repo's tests do.
      if (!existsSync(join(modules, "@playwright", "test", "package.json"))) throw new Error(`a ${context.case.workflow} case runs its test with @playwright/test: ${modules} has none (npm install @playwright/test there)`);
      // A bootstrap DataAccess only makes the scratch folder (through the policy layer); the case runs in it.
      const boot = new DataAccess({ root: options.runsDir, store: runs, config, mode: "ide", audit: new MemoryAuditSink() });
      return await boot.withScratchRepo(SCRATCH_AUDIT_ID, (repo) => runCase(options, runs, config, context, app, repo), modules);
    } finally {
      await app.close();
    }
  };
}

async function runCase(options: MaskedPipelineOptions, runs: RunStore, config: Config, { case: c, tickets, driver, seeds, observe }: PipelineContext, app?: StandInApp, repo?: string) {
  const key = randomBytes(32);
  const folder = options.playwrightFolder;
  const data = new DataAccess({
    root: repo ?? options.runsDir,
    store: runs,
    // The stand-in app is the only site the explorer may drive; opening the browser needs no question.
    config: app ? configSchema.parse({ ...config, playwright: { baseUrl: app.url }, policy: { writes: { commands: "allow" } } }) : config,
    // The folder is the one named with --browser, not the project's: no project-folder check, by choice.
    ...(app && folder ? { browser: ((grant, o) => openRepoBrowser(grant, { folder, root: folder, headed: options.headed ?? o.headed })) satisfies OpenBrowser } : {}),
    vault: new Vault({ storage: new MemoryVaultStorage(), keys: { description: "harness (memory)", getKey: async () => key } }),
    jira: { collect: async (input: JiraInput) => collect(tickets, input) },
    confluence: { pages: async (urls: string[]) => pagesFor(tickets, urls) },
    xray: {
      importAndWait: async () => {
        throw new Error("The harness never pushes to Xray");
      },
    },
    labels: { findByLabels: async () => new Map<string, string>() },
    // `ide`, so the push step runs to its question (`ci` denies an ask rule); it is always declined.
    mode: "ide",
    audit: new MemoryAuditSink(),
  });
  const engine = new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId })
    .register(requirementsWorkflow({ data, runs }))
    .register(testCasesWorkflow({ data, runs }))
    .register(exploreWorkflow({ data, runs }))
    .register(scriptsWorkflow({ data, runs }))
    .register(debugWorkflow({ data, runs }))
    .register(reviewWorkflow({ data, runs }));

  const run = async (workflow: string, inputs: Record<string, unknown>) => {
    let step: Step = await engine.start(workflow, inputs);
    try {
      for (let guard = 0; guard < 400; guard++) {
        if (step.kind === "generate") step = (await drive(engine, step, driver)).step;
        else if (step.kind === "confirm") {
          // An IDE's model is shown this text: it must be as masked as any prompt.
          observe(`${step.instructions}\n${step.context}`);
          // The person's yes to explore, and to write and run the scripts: the stand-in app and repo are the harness's own.
          const yes = PERSON_YES[`${workflow}/${step.stepId}`];
          const answer = yes ?? (workflow === "test-cases" && step.stepId === "review" ? await editedReview(runs, step.runId, seeds) : await engine.fixedAnswer(step.runId, "unattended"));
          if (answer === undefined) throw new Error(`Step ${step.stepId} has no unattended answer`);
          step = (await engine.submit(step.runId, step.stepId, answer, { byPerson: yes !== undefined })).next;
        } else break;
      }
    } finally {
      await scanRunFolder(join(options.runsDir, step.runId), observe);
    }
    if (step.kind === "failed") throw new Error(`Run ${step.runId} failed: ${(step.errors ?? []).map((e) => `${e.path}: ${e.message}`).join("; ")}`);
    if (step.kind !== "done") throw new Error(`Run ${step.runId} didn't finish`);
    return step.runId;
  };
  try {
    if (repo && c.workflow === "review") return await reviewCase(data, runs, repo, seeds, c.inputs, run);
    if (!app) return { runId: await run(c.workflow, c.inputs) };
    if (repo && c.workflow === "debug") return await debugCase(data, runs, app, repo, seeds, c.inputs, run);
    if (repo) return await scriptsCase(data, runs, app, repo, c.inputs, run);
    const testCasesRun = await run("test-cases", c.inputs);
    const runId = await run("explore", { testCasesRun, start: app.start, maxActions: EXPLORE_MAX_ACTIONS });
    // A gate that only saw the list view proves little about record pages: the case fails.
    const explored = await runs.readArtifact(runId, EXPLORATION_ARTIFACT);
    if (!explored?.data.cases.some((x) => x.pages.some((p) => p.startsWith("/lightning/r/")))) throw new Error(`Run ${runId} never opened a record page of the stand-in app`);
    return { runId, testCasesRun };
  } finally {
    await data.close();
  }
}

/** The failure the seeded bug makes: the status check expected Submitted and read Rejected. Any other failure (no browser, no app, no record) proves nothing. */
const SEEDED_FAILURE = /toContainText[^]*Submitted[^]*Rejected/;
const seededBugFailed = (tests: ReadonlyArray<{ outcome: string; failure?: { message: string } | undefined }>) => tests.length > 0 && tests.every((t) => t.outcome === "failed" && SEEDED_FAILURE.test(t.failure?.message ?? ""));

/** The audit record's run for the scratch repo: no run of the store owns it. */
const SCRATCH_AUDIT_ID = "harness-scratch-repo";

/** The --browser folder's packages: the folder may be a project or its node_modules. */
const nodeModulesOf = (folder: string) => (basename(folder) === "node_modules" ? folder : join(folder, "node_modules"));

/** The steps the harness answers yes to as the person: its own app and its own scratch repo. */
const PERSON_YES: Record<string, unknown> = {
  "explore/approve": { approve: true },
  "scripts/review": { write: true },
  "scripts/run": { run: true },
  // Running the hand-written test only: a change to it is never approved (apply's unattended answer is no).
  "debug/run": { run: true },
};

/** The stand-in repo: plain Playwright, the app's address as its baseURL, no type check (it has no TypeScript). */
function standInRepo(url: string, extra: ReadonlyArray<{ path: string; content: string }> = []) {
  return [
    ...extra,
    { path: "package.json", content: `${JSON.stringify({ name: "stand-in-tests", private: true, devDependencies: { "@playwright/test": "*" } }, null, 2)}\n` },
    {
      path: "playwright.config.ts",
      content: [
        "import { defineConfig, devices } from '@playwright/test';",
        "",
        "export default defineConfig({",
        "  testDir: './tests',",
        "  retries: 0,",
        "  workers: 1,",
        "  expect: { timeout: 3_000 },",
        `  use: { baseURL: ${JSON.stringify(url)} },`,
        "  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],",
        "});",
        "",
      ].join("\n"),
    },
  ];
}

/**
 * The seeded-bug case: a repo is started for the stand-in app, its test is
 * generated, written and run, and fails because the app rejects what it
 * says it submitted. The run must report a defect and leave the test as written.
 */
async function scriptsCase(data: DataAccess, runs: RunStore, app: StandInApp, repo: string, inputs: Record<string, unknown>, run: (workflow: string, inputs: Record<string, unknown>) => Promise<string>) {
  const commands = [["npx", "playwright", "test"]];
  await data.scaffoldRepo("harness", ".", "playwright", () => standInRepo(app.url), commands, true);
  const testCasesRun = await run("test-cases", inputs);
  const runId = await run("scripts", { testCasesRun, stabilityRuns: 1 });
  const result = await runs.readArtifact(runId, SCRIPTS_RUN_ARTIFACT);
  const drafted = await runs.readArtifact(runId, SCRIPTS_DRAFT_ARTIFACT);
  if (!result || !drafted) throw new Error(`Run ${runId} wrote and ran no tests`);
  const tests = result.data.attempts[0]?.tests ?? [];
  if (result.data.status !== "defect") throw new Error(`Run ${runId} ended ${result.data.status}${result.data.reason ? ` (${result.data.reason})` : ""}, not as a reported defect`);
  if (!seededBugFailed(tests)) throw new Error(`Run ${runId}: the generated tests didn't all fail on the seeded bug${result.data.attempts[0]?.errors[0] ? ` (${result.data.attempts[0].errors[0].slice(0, 400)})` : ""}`);
  // The test as written: a defect is reported, never "fixed" by changing what the test expects.
  // (Byte for byte: the fixture's spec holds no masked tokens, so writing it unmasks nothing.)
  const written = drafted.data.files.find((f) => f.path === FIXTURE_SPEC)?.content;
  const onDisk = await readFile(join(repo, FIXTURE_SPEC), "utf8").catch(() => undefined);
  if (written === undefined || onDisk !== written || !onDisk.includes("toContainText('Submitted')")) throw new Error(`Run ${runId} changed the generated test instead of reporting the defect`);
  return { runId, testCasesRun };
}

/**
 * The seeded-bug case for `debug` (S3-10): a repo with a hand-written test
 * that fails on the app's bug. The run must report a defect, refuse the
 * tempting fix, and leave the person's files as they were, byte for byte.
 */
async function debugCase(data: DataAccess, runs: RunStore, app: StandInApp, repo: string, seeds: Seed[], inputs: Record<string, unknown>, run: (workflow: string, inputs: Record<string, unknown>) => Promise<string>) {
  const person = seeds.find((s) => s.kind === "name")?.value;
  if (!person) throw new Error("a debug case needs a seeded name: its test opens that person's request");
  const files = handWrittenSuite(person);
  await data.scaffoldRepo("harness", ".", "playwright", () => standInRepo(app.url, files), [["npx", "playwright", "test"]], true);
  const runId = await run("debug", { files: [HAND_WRITTEN_SPEC], stabilityRuns: 1, ...inputs });
  const report = await runs.readArtifact(runId, DEBUG_REPORT_ARTIFACT);
  if (!report) throw new Error(`Run ${runId} recorded no debug report`);
  const r = report.data;
  if (r.status !== "defect") throw new Error(`Run ${runId} ended ${r.status}${r.reason ? ` (${r.reason})` : ""}, not as a reported defect`);
  const tests = r.attempts[0]?.tests ?? [];
  if (!seededBugFailed(tests)) throw new Error(`Run ${runId}: the hand-written test didn't fail on the seeded bug${tests[0]?.failure ? ` (${tests[0].failure.message.slice(0, 400)})` : r.attempts[0]?.errors[0] ? ` (${r.attempts[0].errors[0].slice(0, 400)})` : ""}`);
  if (r.attempts.length !== 1 || r.changes.length || r.proposal) throw new Error(`Run ${runId} proposed or wrote a change instead of reporting the defect`);
  for (const f of files) {
    const onDisk = await readFile(join(repo, f.path), "utf8").catch(() => undefined);
    if (onDisk !== f.content) throw new Error(`Run ${runId} changed ${f.path} instead of reporting the defect`);
  }
  return { runId };
}

/**
 * The `review` case (S3-4): a repo with the hand-written suite and two known
 * flaws. The review must report both (the scan's fixed wait, the model's
 * check in a page object) and, since the harness never says yes to a fix,
 * leave the files as they were.
 */
async function reviewCase(data: DataAccess, runs: RunStore, repo: string, seeds: Seed[], inputs: Record<string, unknown>, run: (workflow: string, inputs: Record<string, unknown>) => Promise<string>) {
  const person = seeds.find((s) => s.kind === "name")?.value;
  if (!person) throw new Error("a review case needs a seeded name: its test opens that person's request");
  const files = handWrittenSuite(person, true);
  await data.scaffoldRepo("harness", ".", "playwright", () => standInRepo("http://127.0.0.1:9", files), [["npx", "playwright", "test"]], true);
  const runId = await run("review", { paths: ["tests/**/*.ts"], ...inputs });
  const r = (await runs.readArtifact(runId, FINDINGS_ARTIFACT))?.data;
  if (!r) throw new Error(`Run ${runId} recorded no findings`);
  if (r.files.length !== 2) throw new Error(`Run ${runId} reviewed ${r.files.length} file(s), not the suite's 2`);
  const at = (path: string, text: string) => files.find((f) => f.path === path)!.content.split("\n").findIndex((l) => l.includes(text)) + 1;
  const wait = at(HAND_WRITTEN_SPEC, "waitForTimeout");
  const check = at(HAND_WRITTEN_PAGE, "await expect(");
  if (!r.findings.some((f) => f.source === "rule" && f.kind === "fixed-wait" && f.path === HAND_WRITTEN_SPEC && f.line === wait)) throw new Error(`Run ${runId} didn't report the fixed wait at ${HAND_WRITTEN_SPEC}:${wait}`);
  if (!r.findings.some((f) => f.source === "model" && f.path === HAND_WRITTEN_PAGE && Math.abs(f.line - check) <= 1)) throw new Error(`Run ${runId}: the model didn't report the check inside the page object at ${HAND_WRITTEN_PAGE}:${check}`);
  if (r.changes.length || r.status === "fixed") throw new Error(`Run ${runId} wrote a fix without the person's yes`);
  // The fixture proposes a fix: the unattended run must have asked and recorded no, not proposed nothing.
  if (r.status !== "declined" || !r.proposal) throw new Error(`Run ${runId} ended ${r.status}: the fixture's fix should have been proposed and declined`);
  for (const f of files) {
    const onDisk = await readFile(join(repo, f.path), "utf8").catch(() => undefined);
    if (onDisk !== f.content) throw new Error(`Run ${runId} changed ${f.path}`);
  }
  return { runId };
}

/**
 * The review a person might give: the first draft case edited to name a
 * seeded value, everything else kept. Marked unattended, like `--yes`.
 */
async function editedReview(runs: RunStore, runId: string, seeds: Seed[]): Promise<unknown> {
  const draft = await runs.readArtifact(runId, TEST_CASES_DRAFT_ARTIFACT);
  const first = draft?.data.cases[0];
  const seed = seeds[0];
  if (!first || !seed) return { approved: true, changes: [], unattended: true };
  const title = `${first.title.slice(0, 120)} (edited for ${seed.value})`;
  // Every seed of the case, so values the masker doesn't know from the ticket's people (emails, phones...) are tested too.
  const steps = [{ ...first.steps[0]!, data: seeds.map((s) => s.value).join("; ") }, ...first.steps.slice(1)];
  return { approved: true, changes: [{ id: first.id, decision: "edited", case: { ...first, title, steps } }], unattended: true };
}

/** Every file of the run folder, which an IDE's model may be told to read. */
async function scanRunFolder(dir: string, observe: (text: string) => void): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // no run folder: the run never started
  }
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isDirectory()) await scanRunFolder(path, observe);
    else if (e.isFile()) observe(await readFile(path, "utf8"));
  }
}

/** No real connections; masking and Jira field rules from the project when it has them. */
function harnessConfig(project: Config | undefined): Config {
  return configSchema.parse({
    version: 1,
    xray: { clientId: "harness", clientSecret: "${env:AGENT_QA_HARNESS_UNUSED}", projectKey: "QAH" },
    atlassian: {
      site: SITE,
      email: "${env:AGENT_QA_HARNESS_UNUSED}",
      token: "${env:AGENT_QA_HARNESS_UNUSED}",
      ...(project?.atlassian?.jira ? { jira: project.atlassian.jira } : {}),
    },
    ...(project?.masking ? { masking: project.masking } : {}),
  });
}

/** The case's tickets as the Jira connector would return them for `input`. */
export function collect(tickets: SyntheticTicket[], input: JiraInput): JiraCollection {
  const byKey = new Map(tickets.map((t) => [t.key, t]));
  const childrenOf = (key: string) => tickets.filter((t) => t.parent === key).map((t) => t.key);
  const out = new Map<string, JiraIssue>();
  const add = (key: string, role: JiraIssue["role"], depth: number, viaLink = false) => {
    if (out.has(key)) return;
    out.set(key, issueOf(byKey.get(key)!, tickets, role, depth, viaLink));
    for (const child of childrenOf(key)) add(child, "child", depth + 1, role === "linked" || viaLink);
  };
  if ("key" in input) {
    if (!byKey.has(input.key)) throw new Error(`Issue ${input.key} is not a ticket of this case`);
    add(input.key, "root", 0);
  } else {
    for (const t of tickets) if (!t.parent || !byKey.has(t.parent)) add(t.key, "root", 0);
  }
  // Links one level out from what was read, with their own children.
  for (const issue of [...out.values()]) for (const l of issue.links) add(l.key, "linked", 0);
  const names = [...new Set(tickets.flatMap((t) => Object.keys(t.fields)))];
  return {
    input,
    issues: [...out.values()],
    truncated: false,
    unreachable: [],
    ...(tickets.some((t) => t.acceptanceCriteria !== undefined) ? { acceptanceCriteriaField: AC_FIELD } : {}),
    extraFields: names.map((name, i) => ({ id: `customfield_${20001 + i}`, name, custom: true })),
  };
}

const adf = (text: string) => ({ text, mentions: [], links: [] });

function issueOf(t: SyntheticTicket, all: SyntheticTicket[], role: JiraIssue["role"], depth: number, viaLink: boolean): JiraIssue {
  const outward = t.links.map((l) => ({ type: l.type, direction: "outward" as const, description: "relates to", key: l.key }));
  const inward = all.flatMap((o) => o.links.filter((l) => l.key === t.key).map((l) => ({ type: l.type, direction: "inward" as const, description: "relates to", key: o.key })));
  return {
    key: t.key,
    id: t.key.replace(/\D/g, ""),
    type: t.type,
    subtask: /sub-?task/i.test(t.type),
    summary: t.summary,
    description: { text: t.description, mentions: t.mentions, links: [] },
    ...(t.status ? { status: t.status } : {}),
    ...(t.priority ? { priority: t.priority } : {}),
    ...(t.acceptanceCriteria !== undefined ? { acceptanceCriteria: adf(t.acceptanceCriteria) } : {}),
    extraFields: Object.fromEntries(Object.entries(t.fields).map(([k, v]) => [k, adf(v)])),
    labels: t.labels,
    components: t.components,
    fixVersions: t.fixVersions,
    ...(t.parent ? { parent: t.parent } : {}),
    children: all.filter((o) => o.parent === t.key).map((o) => o.key),
    links: [...outward, ...inward],
    remoteLinks: t.pages.map((p, j) => ({ url: pageUrl(t, j), title: p.title, application: "com.atlassian.confluence" })),
    people: t.people.map((p) => ({ role: p.role, displayName: p.displayName, ...(p.email ? { email: p.email } : {}) })),
    updated: "2026-11-01T10:00:00.000+0000",
    role,
    depth,
    ...(viaLink ? { viaLink: true } : {}),
  };
}

const pageId = (t: SyntheticTicket, j: number) => `${t.key.replace(/\D/g, "")}${String(j + 1).padStart(3, "0")}`;
const pageUrl = (t: SyntheticTicket, j: number) => `${SITE}/wiki/spaces/QAH/pages/${pageId(t, j)}`;

/** The Confluence pages the case's tickets link to, as the Confluence connector would return them. */
function pagesFor(tickets: SyntheticTicket[], urls: string[]) {
  const all = tickets.flatMap((t) =>
    t.pages.map((p, j) => ({ id: pageId(t, j), title: p.title, version: 1, url: pageUrl(t, j), body: { text: p.body, accountIds: [], links: [], pageTitles: [] } })),
  );
  const wanted = new Set(urls);
  return { pages: all.filter((p) => wanted.has(p.url)), skipped: [] };
}
