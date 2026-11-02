import { join, resolve } from "node:path";
import { Command } from "commander";
import { ConfigError, loadConfig, RunStore, VERSION, WorkflowEngine } from "../core/index.js";
import { emptyPipeline, HarnessCaseError, harnessSources, runHarness } from "../harness/index.js";
import { StaticDriver } from "../llm/index.js";
import { formatDoctor, runDoctor } from "../data/index.js";
import { serveStdio } from "../mcp/index.js";
import { builtinWorkflows } from "../workflows/index.js";

/**
 * Engine with every built-in workflow, for the MCP server. Each run gets a
 * folder under `AGENT_QA_RUNS_DIR`, else `{cwd}/.agent-qa/runs`.
 */
export function createEngine(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): WorkflowEngine {
  const runs = new RunStore(env.AGENT_QA_RUNS_DIR || join(cwd, ".agent-qa", "runs"));
  const engine = new WorkflowEngine({ store: runs.stateStore({ host: "other", driver: "host-model" }), newRunId: runs.newRunId });
  for (const workflow of builtinWorkflows) engine.register(workflow);
  return engine;
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("agent-qa")
    .description("Masked, validated QA deliverables and Playwright scripts from Jira, Confluence and Xray.")
    .version(VERSION);

  const planned: Array<[string, string]> = [
    ["init", "set up agent-qa.yaml and host settings"],
    ["run <workflow>", "run a workflow from the CLI"],
    ["profile", "build or refresh the framework profile"],
  ];
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
      await serveStdio(createEngine());
    });

  return program;
}
