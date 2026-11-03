import { basename, dirname, join, resolve } from "node:path";
import { Command, InvalidArgumentError } from "commander";
import { ConfigError, loadConfig, RunStore, VERSION, WorkflowEngine } from "../core/index.js";
import { emptyPipeline, HarnessCaseError, harnessSources, runHarness } from "../harness/index.js";
import { StaticDriver } from "../llm/index.js";
import { DataAccess, formatDoctor, runDoctor } from "../data/index.js";
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

/** Commander collector for a repeatable option. */
function collect(value: string, previous: string[]): string[] {
  if (value.startsWith("-")) throw new InvalidArgumentError("expected a step id");
  return [...previous, value];
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
    .option("--yes", "answer confirm steps without asking: the review is accepted as unattended, the Xray push is declined")
    .option("--accept <step>", "accept this confirm step, e.g. --accept push (repeatable)", collect, [])
    .option("--decline <step>", "decline this confirm step (repeatable)", collect, [])
    .option("--ci", "CI mode: nobody is asked, and ask write rules are denied (default when CI is set)")
    .option("--cwd <dir>", "project folder (default: the current folder)")
    .action(async (workflow: string | undefined, opts: Omit<Parameters<typeof runCommand>[0], "root" | "env" | "workflow"> & { cwd?: string }) => {
      const { cwd, ...rest } = opts;
      const env = process.env;
      const root = cwd ? resolve(cwd) : projectRoot(process.cwd(), env);
      process.exitCode = await runCommand({ ...rest, ...(workflow ? { workflow } : {}), root, env });
    });

  const planned: Array<[string, string]> = [["profile", "build or refresh the framework profile"]];
  for (const [name, description] of planned) {
    program
      .command(name)
      .description(`${description} (not implemented yet)`)
      .action(() => {
        process.stderr.write(`agent-qa ${name.split(" ")[0]}: not implemented yet\n`);
        process.exitCode = 2;
      });
  }
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
    .description("run the quality harness (slice 0: the empty pipeline, to prove the leak check)")
    .option("--json", "print the full JSON report")
    .option("--cwd <dir>", "project folder (default: the current folder)")
    .action(async (opts: { json?: boolean; cwd?: string }) => {
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
      let sources;
      let report;
      try {
        sources = await harnessSources(config, root);
        report = await runHarness({ ...sources, pipeline: emptyPipeline, pipelineName: "empty", driver: new StaticDriver() });
      } catch (error) {
        if (error instanceof HarnessCaseError) return setupError(error.message);
        throw error;
      }
      if (report.summary.cases === 0) {
        for (const note of sources.notes) process.stderr.write(`note: ${note}\n`);
        return setupError("no harness cases to run; add a fixtures source");
      }
      if (opts.json) process.stdout.write(JSON.stringify({ ...report, notes: sources.notes }, null, 2) + "\n");
      else {
        for (const note of sources.notes) process.stdout.write(`note: ${note}\n`);
        for (const c of report.cases) {
          const leaks = c.seededLeaks.map((l) => `${l.seedId} (${l.kind})`).join(", ");
          process.stdout.write(`[${c.status}] ${c.id}: ${c.modelCalls} model call(s)${leaks ? `, leaked ${leaks}` : ""}${c.error ? `, ${c.error}` : ""}\n`);
        }
        const s = report.summary;
        process.stdout.write(`${s.passed}/${s.cases} passed, ${s.seededLeaks} seeded leak(s)\n`);
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
