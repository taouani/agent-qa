import { basename, dirname, join, resolve } from "node:path";
import { Command, InvalidArgumentError } from "commander";
import { ConfigError, loadConfig, RunStore, VERSION, WorkflowEngine } from "../core/index.js";
import { emptyPipeline, FixtureDriver, HarnessCaseError, harnessSources, keptRate, maskedPipeline, runHarness, type KeptRate } from "../harness/index.js";
import { ApiDriver, ModelConfigError, StaticDriver, type ModelDriver } from "../llm/index.js";
import { commandList, DataAccess, describeProfile, formatDoctor, HostCommandRefused, PROFILE_FILE, ProfileError, readSavedProfile, runDoctor, scanFramework, secretSources } from "../data/index.js";
import { serveStdio } from "../mcp/index.js";
import { builtinWorkflows } from "../workflows/index.js";
import { initCommand } from "./init.js";
import { runCommand } from "./run.js";

/**
 * The project folder: `AGENT_QA_ROOT`, else the folder holding
 * `.agent-qa/runs` when `AGENT_QA_RUNS_DIR` points at one (IDE hosts start the
 * server without a working folder), else `cwd`.
 */
export function projectRoot(cwd: string, env: NodeJS.ProcessEnv): string {
  if (env.AGENT_QA_ROOT) return resolve(env.AGENT_QA_ROOT);
  const runsDir = env.AGENT_QA_RUNS_DIR ? resolve(env.AGENT_QA_RUNS_DIR) : undefined;
  if (runsDir && basename(runsDir) === "runs" && basename(dirname(runsDir)) === ".agent-qa") return dirname(dirname(runsDir));
  return cwd;
}

/**
 * Engine with every built-in workflow, for the MCP server. Each run gets a
 * folder under `AGENT_QA_RUNS_DIR`, else `{root}/.agent-qa/runs`; config and
 * the vault are read from the project root (see `projectRoot`).
 */
export function createEngine(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): WorkflowEngine {
  return createMcpContext(cwd, env).engine;
}

/** The engine and its run store, for the MCP server (which records the host's answers for cost@1). */
export function createMcpContext(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): { engine: WorkflowEngine; runs: RunStore } {
  const root = projectRoot(cwd, env);
  const runs = new RunStore(env.AGENT_QA_RUNS_DIR || join(root, ".agent-qa", "runs"));
  const engine = new WorkflowEngine({ store: runs.stateStore({ host: "other", driver: "host-model" }), newRunId: runs.newRunId });
  const data = new DataAccess({ root, store: runs, env });
  for (const workflow of builtinWorkflows({ data, runs })) engine.register(workflow);
  return { engine, runs };
}

/** Commander collector for a repeatable option: --accept review --accept run, or --accept review,run. */
function collect(value: string, previous: string[]): string[] {
  const ids = value.split(",").map((v) => v.trim());
  if (ids.some((id) => !id || id.startsWith("-"))) throw new InvalidArgumentError("expected a step id");
  return [...previous, ...ids];
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("agent-qa")
    .description("Masked, validated QA deliverables and Playwright scripts from Jira, Confluence and Xray.")
    .version(VERSION);

  program
    .command("init")
    .description("write agent-qa.yaml, .vscode/mcp.json and the .gitignore lines")
    .option("--site <url>", "Jira site, e.g. https://acme.atlassian.net")
    .option("--model <provider:model>", "the default model")
    .option("--xray-project <key>", "Xray project key (adds the xray section)")
    .option("--force", "replace an existing agent-qa.yaml")
    .option("--cwd <dir>", "project folder (default: the current folder)")
    .action(async (opts: { site?: string; model?: string; xrayProject?: string; force?: boolean; cwd?: string }) => {
      process.exitCode = await initCommand({ ...opts, root: resolve(opts.cwd ?? process.cwd()) });
    });
  program
    .command("run [workflow]")
    .description("run a workflow with the API model (exit 0 done, 1 failed, 2 bad setup or input, 3 waits for a person)")
    .option("--key <issue>", "one Jira issue key")
    .option("--jql <filter>", "a JQL filter")
    .option("--from-run <runId>", "start test-cases from an earlier requirements run")
    .option("--input <json>", "the workflow's inputs as JSON")
    .option("--resume <runId>", "continue a run that stopped")
    .option("--model <provider:model>", "the model for every step")
    .option("--yes", "answer confirm steps without asking: a test-case review is accepted as unattended; the Xray push, exploring, and the scripts type check, write and test run are declined (accept them with --accept push, approve, typecheck, review or run); in CI the scripts pull request is opened")
    .option("--accept <step>", "accept this confirm step, e.g. --accept push (repeatable)", collect, [])
    .option("--decline <step>", "decline this confirm step (repeatable)", collect, [])
    .option("--ci", "CI mode: nobody is asked, and ask write rules are denied (default when CI is set); generated tests go into the job's checkout and leave only as a pull request (git section)")
    .option("--cwd <dir>", "project folder (default: the current folder)")
    .action(async (workflow: string | undefined, opts: Omit<Parameters<typeof runCommand>[0], "root" | "env" | "workflow"> & { cwd?: string }) => {
      const { cwd, ...rest } = opts;
      const env = process.env;
      const root = cwd ? resolve(cwd) : projectRoot(process.cwd(), env);
      process.exitCode = await runCommand({ ...rest, ...(workflow ? { workflow } : {}), root, env });
    });

  program
    .command("profile")
    .description(`show what Agent-QA reads from the repo's Playwright project, and whether ${PROFILE_FILE} matches it (exit 0 matches, 1 not saved or differs, 2 error); save it with: agent-qa run profile --accept review`)
    .option("--folder <dir>", "the Playwright project's folder (default: found automatically)")
    .option("--json", "print the full scan as JSON")
    .option("--cwd <dir>", "project folder (default: the current folder)")
    .action((opts: { folder?: string; json?: boolean; cwd?: string }) => {
      process.exitCode = profileCommand({ root: resolve(opts.cwd ?? process.cwd()), ...(opts.folder ? { folder: opts.folder } : {}), json: opts.json ?? false });
    });
  program
    .command("doctor")
    .description("check config, credentials and environment")
    .option("--offline", "skip the network checks")
    .option("--json", "print the results as JSON")
    .option("--cwd <dir>", "project folder (default: the current folder)")
    .action(async (opts: { offline?: boolean; json?: boolean; cwd?: string }) => {
      const results = await runDoctor({ cwd: resolve(opts.cwd ?? process.cwd()), online: !opts.offline });
      process.stdout.write(opts.json ? JSON.stringify(results, null, 2) + "\n" : formatDoctor(results));
      if (results.some((r) => r.status === "fail")) process.exitCode = 1;
    });
  program
    .command("harness")
    .description("run the quality harness: the real workflows on seeded fixtures, failing if a seeded value reaches a model")
    .option("--model <provider:model>", "answer with this model (from models in agent-qa.yaml); default: the offline fixture model, no API key needed")
    .option("--pipeline <name>", "masked (the real workflows) or empty (no model calls, checks the setup)", "masked")
    .option("--json", "print the full JSON report")
    .option("--cwd <dir>", "project folder (default: the current folder)")
    .action(async (opts: { json?: boolean; cwd?: string; model?: string; pipeline: string }) => {
      const root = resolve(opts.cwd ?? process.cwd());
      // Exit 1 means a case failed; exit 2 means the harness couldn't run (bad setup, or nothing to test).
      const setupError = (message: string) => {
        process.stderr.write(`agent-qa harness: ${message.split(root).join(".")}\n`);
        process.exitCode = 2;
      };
      let config;
      try {
        config = (await loadConfig(root)).config;
      } catch (error) {
        // No config is fine (shipped cases); a broken one is not.
        if (!(error instanceof ConfigError)) throw error;
        if (error.code !== "NOT_FOUND") return setupError(error.message);
      }
      if (opts.pipeline !== "masked" && opts.pipeline !== "empty") return setupError(`unknown pipeline ${opts.pipeline}: use masked or empty`);
      let driver: ModelDriver;
      if (opts.pipeline === "empty" && opts.model) return setupError("--model has no effect with --pipeline empty, which makes no model calls");
      if (opts.pipeline === "empty") driver = new StaticDriver();
      else if (!opts.model) driver = new FixtureDriver();
      else {
        if (!config?.models) return setupError("--model needs a models section in agent-qa.yaml");
        const api = new ApiDriver({ models: config.models, secrets: secretSources() });
        try {
          await api.ready(opts.model);
        } catch (error) {
          if (error instanceof ModelConfigError) return setupError(error.message);
          throw error;
        }
        const model = opts.model;
        driver = { name: `api(${model})`, complete: (request) => api.complete({ ...request, model }) };
      }
      let sources;
      let report;
      try {
        sources = await harnessSources(config, root);
        const pipeline =
          opts.pipeline === "empty" ? emptyPipeline : maskedPipeline({ runsDir: join(root, ".agent-qa", "harness", "runs"), ...(config ? { config } : {}) });
        report = await runHarness({ ...sources, pipeline, pipelineName: opts.pipeline, driver });
      } catch (error) {
        if (error instanceof HarnessCaseError) return setupError(error.message);
        throw error;
      }
      // From the project's own runs, where people reviewed the cases; the harness's runs never count.
      let kept: KeptRate | undefined;
      try {
        kept = await keptRate(new RunStore(process.env.AGENT_QA_RUNS_DIR || join(root, ".agent-qa", "runs")));
      } catch {
        kept = undefined;
      }
      if (report.summary.cases === 0) {
        for (const note of sources.notes) process.stderr.write(`note: ${note}\n`);
        return setupError("no harness cases to run; add a fixtures source");
      }
      if (opts.json) process.stdout.write(JSON.stringify({ ...report, notes: sources.notes, ...(kept ? { keptRate: kept } : {}) }, null, 2) + "\n");
      else {
        for (const note of sources.notes) process.stdout.write(`note: ${note}\n`);
        for (const c of report.cases) {
          const leaks = c.seededLeaks.map((l) => `${l.seedId} (${l.kind})`).join(", ");
          process.stdout.write(`[${c.status}] ${c.id}: ${c.modelCalls} model call(s)${leaks ? `, leaked ${leaks}` : ""}${c.error ? `, ${c.error}` : ""}\n`);
        }
        const s = report.summary;
        process.stdout.write(`${s.passed}/${s.cases} passed, ${s.seededLeaks} seeded leak(s)\n`);
        if (kept) process.stdout.write(keptLine(kept) + "\n");
      }
      if (report.summary.failed + report.summary.errors > 0) process.exitCode = 1;
    });
  program
    .command("mcp")
    .description("start the MCP server for an IDE host (stdio)")
    .action(async () => {
      const { engine, runs } = createMcpContext();
      await serveStdio(engine, { runs });
    });

  return program;
}

/**
 * `agent-qa profile`: scans and prints, writes nothing. The scan is the repo's
 * own code, printed in the user's terminal only; no model sees it here.
 */
export function profileCommand(opts: { root: string; folder?: string; json: boolean }, out: (s: string) => void = (s) => process.stdout.write(s), err: (s: string) => void = (s) => process.stderr.write(s)): number {
  let scanned;
  let saved;
  try {
    scanned = scanFramework(opts.root, opts.folder);
    saved = readSavedProfile(opts.root);
  } catch (error) {
    if (!(error instanceof ProfileError || error instanceof HostCommandRefused)) throw error;
    err(`agent-qa profile: ${error.message}\n`);
    return 2;
  }
  const same =
    saved !== undefined && scanned.commands !== undefined && saved.folder === scanned.folder && saved.kind === scanned.kind && JSON.stringify(commandList(saved.commands)) === JSON.stringify(commandList(scanned.commands));
  const status = !saved ? `${PROFILE_FILE}: not saved yet` : same ? `${PROFILE_FILE}: matches (reviewed ${saved.reviewedAt})` : `${PROFILE_FILE}: differs from the repo now; review it again`;
  if (opts.json) out(JSON.stringify({ profile: scanned, saved: saved ?? null, matches: same }, null, 2) + "\n");
  else {
    out(describeProfile(scanned) + "\n\n" + status + "\n");
    if (!same && scanned.kind !== "empty") out(`Save it with: agent-qa run profile --accept review${opts.folder ? ` --input '{"folder":"${opts.folder}"}'` : ""}\n`);
  }
  return same ? 0 : 1;
}

/** One line on the kept rate of the project's reviewed runs. */
export function keptLine(k: KeptRate): string {
  const left = [k.unattendedRuns ? `${k.unattendedRuns} --yes run(s) left out` : "", k.unreadableRuns ? `${k.unreadableRuns} unreadable` : ""].filter(Boolean).join(", ");
  const tail = left ? ` (${left})` : "";
  if (k.rate === undefined) return `kept rate: no reviewed test cases yet${tail}`;
  return `kept rate: ${Math.round(k.rate * 100)}% of ${k.generated} case(s) kept as written in ${k.runs} reviewed run(s); ${k.edited} edited, ${k.dropped} dropped${tail}`;
}
