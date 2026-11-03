import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { configSchema, MODEL_CATALOG } from "../core/index.js";
import { isIgnored, loadIgnoreRules } from "../data/index.js";
import { parse as parseYaml } from "yaml";

/**
 * `agent-qa init` (S1-11): writes `agent-qa.yaml`, the VS Code MCP settings
 * and the `.gitignore` lines. It never overwrites a file it didn't write
 * (`--force` replaces `agent-qa.yaml`), and secrets stay `${env:…}`
 * references: init asks for none.
 */

export interface InitOptions {
  root: string;
  /** Jira site, e.g. https://acme.atlassian.net. */
  site?: string;
  /** `provider:model` for models.default. */
  model?: string;
  /** Xray project key; adds the xray section. */
  xrayProject?: string;
  force?: boolean;
  log?: (line: string) => void;
}

/** What VS Code runs; `next` until 2.0 ships, since `latest` is the npm placeholder. */
export const MCP_SERVER = {
  type: "stdio",
  command: "npx",
  args: ["-y", "sf-agent-qa@next", "mcp"],
  // No `cwd`: VS Code only partly supports it. The server finds the project from the runs folder.
  env: { AGENT_QA_RUNS_DIR: "${workspaceFolder}/.agent-qa/runs" },
};

const IGNORE_LINES = ["# agent-qa: token vault, run folders and audit log", ".agent-qa/"];

export function configTemplate(opts: Pick<InitOptions, "site" | "model" | "xrayProject">): string {
  const model = opts.model ?? MODEL_CATALOG.anthropic[0]!.id;
  const lines = [
    "# yaml-language-server: $schema=https://unpkg.com/sf-agent-qa@next/schema/agent-qa.schema.json",
    "# Agent-QA settings. Secrets are never written here: only ${env:NAME} or ${keychain:NAME} references.",
    "version: 1",
    "",
    "atlassian:",
    `  site: ${opts.site ?? "https://YOUR-SITE.atlassian.net"}`,
    "  email: ${env:ATLASSIAN_EMAIL}",
    "  token: ${env:ATLASSIAN_TOKEN}",
    "",
    "models:",
    `  default: ${model}`,
    "  # Keys default to each provider's own variable (ANTHROPIC_API_KEY, OPENAI_API_KEY...).",
    "",
  ];
  const xray = [
    "xray:",
    "  clientId: ${env:XRAY_CLIENT_ID}",
    "  clientSecret: ${env:XRAY_CLIENT_SECRET}",
    `  projectKey: ${opts.xrayProject ?? "QA"}`,
    "  # priorities: { P1: Highest, P2: High, P3: Medium, P4: Low }",
  ];
  lines.push(...(opts.xrayProject ? xray : xray.map((l) => `# ${l.replace(/^# /, "")}`)), "");
  lines.push(
    "policy:",
    "  writes:",
    "    xray: ask # allow, ask or deny; in CI, ask is denied",
    "    confluence: ask",
    "    testCode: ask",
    "    jira: deny",
    "",
  );
  return lines.join("\n");
}

async function readOptional(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Resolves to the exit code: 0 done, 2 a file couldn't be set up. */
export async function initCommand(opts: InitOptions): Promise<number> {
  const log = opts.log ?? ((line: string) => void process.stderr.write(`${line}\n`));
  let code = 0;

  // agent-qa.yaml
  const configFile = join(opts.root, "agent-qa.yaml");
  const text = configTemplate(opts);
  const parsed = configSchema.safeParse(parseYaml(text));
  if (!parsed.success) {
    log(`agent-qa init: the settings given don't make a valid agent-qa.yaml (${parsed.error.issues.map((i) => i.path.join(".")).join(", ")})`);
    return 2;
  }
  if ((await readOptional(configFile)) !== undefined && !opts.force) log("agent-qa.yaml: kept (exists; --force replaces it)");
  else {
    await writeFile(configFile, text);
    log("agent-qa.yaml: written");
  }

  // .vscode/mcp.json
  const mcpFile = join(opts.root, ".vscode", "mcp.json");
  const existing = await readOptional(mcpFile);
  let mcp: { servers?: Record<string, unknown> } & Record<string, unknown> = {};
  let usable = true;
  if (existing !== undefined) {
    try {
      const value = JSON.parse(existing) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
      mcp = value as typeof mcp;
    } catch {
      // VS Code allows comments in mcp.json; rewriting it would lose them.
      usable = false;
      log(`.vscode/mcp.json: not changed (it isn't plain JSON). Add this server under "servers":\n${JSON.stringify({ "agent-qa": MCP_SERVER }, null, 2)}`);
      code = 2;
    }
  }
  if (usable) {
    if (mcp.servers && typeof mcp.servers === "object" && "agent-qa" in mcp.servers) log(".vscode/mcp.json: kept (it already has an agent-qa server)");
    else {
      mcp.servers = { ...(mcp.servers ?? {}), "agent-qa": MCP_SERVER };
      await mkdir(join(opts.root, ".vscode"), { recursive: true });
      await writeFile(mcpFile, JSON.stringify(mcp, null, 2) + "\n");
      log(`.vscode/mcp.json: ${existing === undefined ? "written" : "agent-qa server added"}`);
    }
  }

  // .gitignore
  const targets = [".agent-qa/vault/x.vault", ".agent-qa/runs/x/run.json", ".agent-qa/audit.jsonl"];
  const rules = await loadIgnoreRules(opts.root, targets);
  if (targets.every((t) => isIgnored(rules, t))) log(".gitignore: kept (.agent-qa/ is ignored)");
  else {
    const gitignore = join(opts.root, ".gitignore");
    const before = (await readOptional(gitignore)) ?? "";
    await writeFile(gitignore, `${before}${before && !before.endsWith("\n") ? "\n" : ""}${IGNORE_LINES.join("\n")}\n`);
    // A negation further down (e.g. !.agent-qa/runs/) could still un-ignore part of it.
    const after = await loadIgnoreRules(opts.root, targets);
    if (targets.every((t) => isIgnored(after, t))) log(".gitignore: .agent-qa/ added");
    else {
      log(".gitignore: .agent-qa/ added, but another rule still un-ignores part of it; check .gitignore");
      code = 2;
    }
  }

  log("Next: set ATLASSIAN_EMAIL, ATLASSIAN_TOKEN and your model's API key, then run agent-qa doctor.");
  return code;
}
