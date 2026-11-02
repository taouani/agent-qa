import { join } from "node:path";
import { Command } from "commander";
import { RunStore, VERSION, WorkflowEngine } from "../core/index.js";
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
    ["doctor", "check config, credentials and environment"],
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
    .command("mcp")
    .description("start the MCP server for an IDE host (stdio)")
    .action(async () => {
      await serveStdio(createEngine());
    });

  return program;
}
