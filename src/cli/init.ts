import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { configSchema, MODEL_CATALOG, VERSION } from "../core/index.js";
import { isIgnored, loadIgnoreRules } from "../data/index.js";
import { parse as parseYaml } from "yaml";
import { writeSetupFile } from "./setup-files.js";

/**
 * `agent-qa init` (S1-11): writes `agent-qa.yaml`, the MCP settings of each
 * IDE host (VS Code, Claude Code, Cursor) and the `.gitignore` lines. It never overwrites a file it didn't write
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
  /** The IDE hosts to set up; all three by default. */
  hosts?: readonly McpHost[];
  log?: (line: string) => void;
}

/**
 * What VS Code runs: this exact version, so an IDE start never fetches a
 * newer package (the server holds the Jira, Xray and model credentials).
 */
export const MCP_SERVER = {
  type: "stdio",
  command: "npx",
  args: ["-y", `sf-agent-qa@${VERSION}`, "mcp"],
  // No `cwd`: VS Code only partly supports it. The server finds the project from the runs folder.
  env: { AGENT_QA_RUNS_DIR: "${workspaceFolder}/.agent-qa/runs" },
};

/**
 * Claude Code (S4-9) reads the project's `.mcp.json` and starts the server in
 * the project folder, so it needs no runs folder: the server finds the project
 * from its working folder. Claude Code expands only `${VAR}` there.
 */
export const CLAUDE_CODE_SERVER = { type: "stdio", command: MCP_SERVER.command, args: MCP_SERVER.args };

/** Cursor (S4-9) reads `.cursor/mcp.json` and fills in `${workspaceFolder}`, as VS Code does. */
export const CURSOR_SERVER = MCP_SERVER;

export const MCP_HOSTS = ["vscode", "claude-code", "cursor"] as const;
export type McpHost = (typeof MCP_HOSTS)[number];

interface HostConfig {
  file: ".vscode/mcp.json" | ".mcp.json" | ".cursor/mcp.json";
  /** The object that holds the servers: VS Code's `servers`, Claude Code's and Cursor's `mcpServers`. */
  key: "servers" | "mcpServers";
  server: Record<string, unknown>;
}

const HOST_CONFIG: Record<McpHost, HostConfig> = {
  vscode: { file: ".vscode/mcp.json", key: "servers", server: MCP_SERVER },
  "claude-code": { file: ".mcp.json", key: "mcpServers", server: CLAUDE_CODE_SERVER },
  cursor: { file: ".cursor/mcp.json", key: "mcpServers", server: CURSOR_SERVER },
};

/** Adds the agent-qa server to one host's file; false when the file couldn't be changed. */
async function addServer(root: string, host: HostConfig, log: (line: string) => void): Promise<boolean> {
  const existing = await readOptional(join(root, ...host.file.split("/")));
  let mcp: Record<string, unknown> = {};
  if (existing !== undefined) {
    try {
      const value = JSON.parse(existing) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
      mcp = value as Record<string, unknown>;
      const servers = mcp[host.key];
      if (servers !== undefined && (!servers || typeof servers !== "object" || Array.isArray(servers))) throw new Error(`${host.key} is not an object`);
    } catch {
      // Rewriting a file with comments (VS Code allows them) or of another shape would lose what is there.
      log(`${host.file}: not changed (it isn't plain JSON with a ${host.key} object). Add this server under "${host.key}":\n${JSON.stringify({ "agent-qa": host.server }, null, 2)}`);
      return false;
    }
  }
  const servers = (mcp[host.key] ?? {}) as Record<string, unknown>;
  if ("agent-qa" in servers) {
    log(`${host.file}: kept (it already has an agent-qa server)`);
    return true;
  }
  mcp[host.key] = { ...servers, "agent-qa": host.server };
  await writeSetupFile(root, host.file, JSON.stringify(mcp, null, 2) + "\n", existing === undefined ? "create" : "replace");
  log(`${host.file}: ${existing === undefined ? "written" : "agent-qa server added"}`);
  return true;
}

const IGNORE_LINES = ["# agent-qa: token vault, run folders and audit log", ".agent-qa/"];

export function configTemplate(opts: Pick<InitOptions, "site" | "model" | "xrayProject">): string {
  const model = opts.model ?? MODEL_CATALOG.anthropic[0]!.id;
  const lines = [
    `# yaml-language-server: $schema=https://unpkg.com/sf-agent-qa@${VERSION}/schema/agent-qa.schema.json`,
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
    "# Salesforce sign-in for Playwright: the JWT bearer flow of an External Client App, one user per role.",
    "# salesforce:",
    "#   baseUrl: https://YOUR-ORG.my.salesforce.com",
    "#   loginUrl: https://test.salesforce.com # sandboxes; production uses https://login.salesforce.com",
    "#   clientId: ${env:SF_CLIENT_ID}",
    "#   privateKey: ${env:SF_JWT_KEY} # or privateKeyFile: ../certs/server.key (outside the repo)",
    "#   users:",
    "#     StoreManager-FRA: ${env:SF_USER_STOREMANAGER_FRA}",
    "",
    "policy:",
    "  writes:",
    "    xray: ask # allow, ask or deny; in CI, ask is denied (test code always goes as a pull request)",
    "    confluence: ask",
    "    testCode: ask",
    "    jira: deny",
    "    commands: ask # running your repo's test commands; asked once per run, and allowed in CI unless deny",
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
  if (!(await stat(opts.root).then((s) => s.isDirectory(), () => false))) {
    log(`agent-qa init: ${opts.root} is not a folder`);
    return 2;
  }

  // agent-qa.yaml
  const configFile = join(opts.root, "agent-qa.yaml");
  const exists = (await readOptional(configFile)) !== undefined;
  if (exists && !opts.force) log("agent-qa.yaml: kept (exists; --force replaces it)");
  else {
    const text = configTemplate(opts);
    const parsed = configSchema.safeParse(parseYaml(text));
    if (!parsed.success) {
      log(`agent-qa init: the settings given don't make a valid agent-qa.yaml (${parsed.error.issues.map((i) => i.path.join(".")).join(", ")})`);
      return 2;
    }
    await writeSetupFile(opts.root, "agent-qa.yaml", text, exists ? "replace" : "create");
    log("agent-qa.yaml: written");
  }

  for (const host of opts.hosts ?? MCP_HOSTS) if (!(await addServer(opts.root, HOST_CONFIG[host], log))) code = 2;

  // .gitignore
  const targets = [".agent-qa/vault/x.vault", ".agent-qa/runs/x/run.json", ".agent-qa/audit.jsonl"];
  const rules = await loadIgnoreRules(opts.root, targets);
  if (targets.every((t) => isIgnored(rules, t))) log(".gitignore: kept (.agent-qa/ is ignored)");
  else {
    const before = await readOptional(join(opts.root, ".gitignore"));
    const text = `${before ?? ""}${before && !before.endsWith("\n") ? "\n" : ""}${IGNORE_LINES.join("\n")}\n`;
    await writeSetupFile(opts.root, ".gitignore", text, before === undefined ? "create" : "replace");
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
