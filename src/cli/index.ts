import { Command } from "commander";
import { VERSION } from "../core/index.js";

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("agent-qa")
    .description("Masked, validated QA deliverables and Playwright scripts from Jira, Confluence and Xray.")
    .version(VERSION);

  const planned: Array<[string, string]> = [
    ["init", "set up agent-qa.yaml and host settings"],
    ["run <workflow>", "run a workflow from the CLI"],
    ["mcp", "start the MCP server for an IDE host"],
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
  return program;
}
