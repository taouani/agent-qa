import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { configSchema, MODEL_CATALOG, PROVIDER_KEY_ENV, VERSION } from "../core/index.js";
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
  /**
   * Asks the person one question in a terminal; undefined when they
   * interrupted. Without it (no terminal, CI), init asks nothing.
   */
  ask?: (question: string) => Promise<string | undefined>;
  /** Picks the shell syntax of the next steps; the running platform by default. */
  platform?: NodeJS.Platform;
}

export const PLACEHOLDER_SITE = "https://YOUR-SITE.atlassian.net";

/**
 * A Jira Cloud site from what a person types: `acme`, `acme.atlassian.net`
 * or a full URL (a page of the site too). Undefined when it isn't one; an
 * http:// URL is kept as given, so the config check names it.
 */
export function siteOf(input: string): string | undefined {
  const text = input.trim();
  if (!text) return undefined;
  if (/^[a-z0-9][a-z0-9-]*$/i.test(text)) return `https://${text.toLowerCase()}.atlassian.net`;
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
    if (url.protocol === "http:") return text;
    return url.protocol === "https:" && url.hostname.includes(".") ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

const PROJECT_KEY = /^[A-Z][A-Z0-9_]{1,9}$/;

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

export function configTemplate(opts: { site?: string | undefined; model?: string | undefined; xrayProject?: string | undefined }): string {
  const model = opts.model ?? MODEL_CATALOG.anthropic[0]!.id;
  const lines = [
    `# yaml-language-server: $schema=https://unpkg.com/sf-agent-qa@${VERSION}/schema/agent-qa.schema.json`,
    "# Agent-QA settings. Secrets are never written here: only ${env:NAME} or ${keychain:NAME} references.",
    "version: 1",
    "",
    "atlassian:",
    `  site: ${opts.site ?? PLACEHOLDER_SITE}`,
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
    // Only what agent-qa.yaml can't do without, asked before anything is written.
    const settings = { site: opts.site === undefined ? undefined : (siteOf(opts.site) ?? opts.site), model: opts.model, xrayProject: opts.xrayProject };
    if (opts.ask && settings.site === undefined) {
      for (let tries = 0; settings.site === undefined && tries < 3; tries++) {
        const answer = await opts.ask("Jira Cloud site (acme, or https://acme.atlassian.net): ");
        if (answer === undefined) {
          log("agent-qa init: stopped, nothing written");
          return 2;
        }
        settings.site = siteOf(answer);
        if (settings.site === undefined) log(`  ${answer.trim() || "(empty)"} isn't a Jira Cloud site`);
      }
    }
    if (opts.ask && settings.xrayProject === undefined) {
      for (let tries = 0; settings.xrayProject === undefined && tries < 3; tries++) {
        const answer = await opts.ask("Xray project key, to push test cases (Enter to skip): ");
        if (answer === undefined) {
          log("agent-qa init: stopped, nothing written");
          return 2;
        }
        const key = answer.trim().toUpperCase();
        if (!key) break;
        if (PROJECT_KEY.test(key)) settings.xrayProject = key;
        else log(`  ${answer.trim()} isn't a Jira project key (2 to 10 letters or digits, starting with a letter)`);
      }
    }
    const text = configTemplate(settings);
    const parsed = configSchema.safeParse(parseYaml(text));
    if (!parsed.success) {
      log(`agent-qa init: the settings given don't make a valid agent-qa.yaml (${parsed.error.issues.map((i) => i.path.join(".")).join(", ")})`);
      return 2;
    }
    await writeSetupFile(opts.root, "agent-qa.yaml", text, exists ? "replace" : "create");
    log(settings.site === undefined ? `agent-qa.yaml: written, with the placeholder site ${PLACEHOLDER_SITE}: set atlassian.site to yours` : "agent-qa.yaml: written");
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

  for (const line of nextSteps((await readOptional(configFile)) ?? "", opts.platform ?? process.platform)) log(line);
  return code;
}

/** What to do after init: the variables the config names, in the shell of this platform, then doctor and the IDE. */
export function nextSteps(config: string, platform: NodeJS.Platform): string[] {
  const live = config.split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join("\n");
  const names = [...new Set([...live.matchAll(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]!))];
  const provider = /^\s*default:\s*([a-z]+):/m.exec(live)?.[1];
  const modelKey = provider ? PROVIDER_KEY_ENV[provider as keyof typeof PROVIDER_KEY_ENV] : undefined;
  const set = (name: string) => (platform === "win32" ? `$env:${name} = "..."` : `export ${name}=...`);
  const lines = ["Next:"];
  if (names.length) {
    lines.push(`  1. Set ${names.join(", ")}${platform === "win32" ? ", in PowerShell:" : ":"}`);
    for (const name of names) lines.push(`       ${set(name)}`);
    if (names.includes("ATLASSIAN_TOKEN")) lines.push("     ATLASSIAN_TOKEN is an API token from https://id.atlassian.com/manage-profile/security/api-tokens.");
  }
  if (modelKey) lines.push(`     To run workflows from a terminal or CI, also ${modelKey} (an IDE answers with its own model).`);
  lines.push("  2. Run agent-qa doctor: it names the fix for each problem.");
  lines.push("  3. Start your IDE from this terminal, so its agent-qa server sees the same variables. See https://github.com/taouani/agent-qa/blob/master/docs/getting-started.md");
  return lines;
}
