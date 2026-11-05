import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { configSchema, MemoryAuditSink, RunStore, WorkflowEngine, type Config, type Step } from "../core/index.js";
import { DataAccess, openRepoBrowser, type JiraCollection, type JiraInput, type JiraIssue, type OpenBrowser } from "../data/index.js";
import { drive } from "../llm/index.js";
import { MemoryVaultStorage, Vault } from "../masking/index.js";
import { EXPLORATION_ARTIFACT, exploreWorkflow, requirementsWorkflow, TEST_CASES_DRAFT_ARTIFACT, testCasesWorkflow } from "../workflows/index.js";
import type { Seed, SyntheticTicket } from "./cases.js";
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
export const BROWSER_WORKFLOWS: ReadonlySet<string> = new Set(["explore"]);
/** Actions per explored case: the fixture model's tour is five actions, then finish. */
const EXPLORE_MAX_ACTIONS = 10;

const AC_FIELD = { id: "customfield_10001", name: "Acceptance criteria", custom: true };
const SITE = "https://harness.invalid";

export function maskedPipeline(options: MaskedPipelineOptions): Pipeline {
  const runs = new RunStore(options.runsDir);
  const config = harnessConfig(options.config);
  return async (context) => {
    if (!BROWSER_WORKFLOWS.has(context.case.workflow)) return runCase(options, runs, config, context);
    if (!options.playwrightFolder) throw new Error("an explore case needs a browser: run the harness with --browser");
    const app = await startStandInApp(context.seeds);
    try {
      return await runCase(options, runs, config, context, app);
    } finally {
      await app.close();
    }
  };
}

async function runCase(options: MaskedPipelineOptions, runs: RunStore, config: Config, { case: c, tickets, driver, seeds, observe }: PipelineContext, app?: StandInApp) {
  const key = randomBytes(32);
  const folder = options.playwrightFolder;
  const data = new DataAccess({
    root: options.runsDir,
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
    .register(exploreWorkflow({ data, runs }));

  const run = async (workflow: string, inputs: Record<string, unknown>) => {
    let step: Step = await engine.start(workflow, inputs);
    try {
      for (let guard = 0; guard < 400; guard++) {
        if (step.kind === "generate") step = (await drive(engine, step, driver)).step;
        else if (step.kind === "confirm") {
          // An IDE's model is shown this text: it must be as masked as any prompt.
          observe(`${step.instructions}\n${step.context}`);
          // The person's yes to explore: the stand-in app is the harness's own.
          const answer =
            workflow === "explore" && step.stepId === "approve"
              ? { approve: true }
              : step.stepId === "review"
                ? await editedReview(runs, step.runId, seeds)
                : await engine.fixedAnswer(step.runId, "unattended");
          if (answer === undefined) throw new Error(`Step ${step.stepId} has no unattended answer`);
          step = (await engine.submit(step.runId, step.stepId, answer, { byPerson: workflow === "explore" && step.stepId === "approve" })).next;
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
    if (!app) return { runId: await run(c.workflow, c.inputs) };
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
