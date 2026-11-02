import { join, resolve } from "node:path";
import { Command } from "commander";
import { RunStore, VERSION, WorkflowEngine } from "../core/index.js";
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
    ["harness", "run the quality harness"],
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
    .command("mcp")
    .description("start the MCP server for an IDE host (stdio)")
    .action(async () => {
      await serveStdio(createEngine());
    });

  return program;
}
