import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ConfigError, loadConfig, resolveSecret, SECRET_REF, type Config } from "../core/index.js";
import { defaultKeyringFactory, keychainLookup, vaultKeyStatus, type KeyringFactory } from "../masking/index.js";

/**
 * `agent-qa doctor` checks (slice 0, T5). Each check reports pass, warn, fail
 * or skip, with a fix when it isn't a pass. No check prints a secret value:
 * secrets are named by their reference, never resolved into the output.
 */

export type CheckStatus = "pass" | "warn" | "fail" | "skip";

export interface CheckResult {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
}

export interface DoctorOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /** Check that Atlassian, Xray, git and Salesforce answer. Default true. */
  online?: boolean;
  fetch?: typeof fetch;
  keyring?: KeyringFactory;
  nodeVersion?: string;
  timeoutMs?: number;
}

const MIN_NODE_MAJOR = 20;
const XRAY_CLOUD = "https://xray.cloud.getxray.app";
const GIT_API: Record<string, string> = {
  github: "https://api.github.com",
  gitlab: "https://gitlab.com",
  "azure-devops": "https://dev.azure.com",
};

function nodeCheck(version: string): CheckResult {
  const major = Number(/^v?(\d+)/.exec(version)?.[1] ?? 0);
  return major >= MIN_NODE_MAJOR
    ? { id: "node", title: "Node.js", status: "pass", detail: version }
    : {
        id: "node",
        title: "Node.js",
        status: "fail",
        detail: `${version} is too old`,
        fix: `Install Node ${MIN_NODE_MAJOR} or later.`,
      };
}

/** Every `${env:…}` / `${keychain:…}` reference in the config, with its dotted path. */
function secretRefs(value: unknown, path: string[] = []): Array<{ path: string; ref: string }> {
  if (typeof value === "string") return SECRET_REF.test(value) ? [{ path: path.join("."), ref: value }] : [];
  if (Array.isArray(value)) return value.flatMap((v, i) => secretRefs(v, [...path, String(i)]));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => secretRefs(v, [...path, k]));
  return [];
}

async function secretsCheck(config: Config, env: NodeJS.ProcessEnv, keyring: KeyringFactory): Promise<CheckResult> {
  const refs = secretRefs(config);
  if (refs.length === 0) return { id: "secrets", title: "Secrets", status: "pass", detail: "no secret references in the config" };
  const keychain = keychainLookup(keyring);
  const missing: string[] = [];
  for (const { path, ref } of refs) {
    try {
      await resolveSecret(ref, { env, keychain });
    } catch (error) {
      missing.push(`${path} (${ref}): ${(error as Error).message}`);
    }
  }
  return missing.length === 0
    ? { id: "secrets", title: "Secrets", status: "pass", detail: `${refs.length} reference(s) resolve` }
    : {
        id: "secrets",
        title: "Secrets",
        status: "fail",
        detail: missing.join("\n"),
        fix: "Set each environment variable, or add the keychain entry under the service sf-agent-qa.",
      };
}

async function vaultCheck(env: NodeJS.ProcessEnv, keyring: KeyringFactory): Promise<CheckResult> {
  const status = await vaultKeyStatus(env, keyring);
  if (status.ok && !status.exists) {
    // Some keychains (headless Linux) read as empty but refuse writes, so this can't be a pass yet.
    return {
      id: "vault-key",
      title: "Vault key",
      status: "warn",
      detail: `${status.source}: ${status.message}`,
      fix: "If the first run fails to store the key (common on headless Linux), set AGENT_QA_VAULT_KEY (openssl rand -base64 32).",
    };
  }
  return status.ok
    ? { id: "vault-key", title: "Vault key", status: "pass", detail: `${status.source}: ${status.message}` }
    : { id: "vault-key", title: "Vault key", status: "fail", detail: `${status.source}: ${status.message}`, fix: "Set AGENT_QA_VAULT_KEY (openssl rand -base64 32)." };
}

/** True when a .gitignore line covers `target` (a path relative to the project root, like `.agent-qa/vault/`). */
function ignores(lines: string[], target: string): boolean {
  const parts = target.replace(/\/$/, "").split("/");
  const prefixes = parts.map((_, i) => parts.slice(0, i + 1).join("/"));
  let ignored = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const negate = line.startsWith("!");
    const pattern = (negate ? line.slice(1) : line).replace(/^\//, "").replace(/\/\*{0,2}$/, "");
    if (prefixes.includes(pattern)) ignored = !negate;
  }
  return ignored;
}

async function gitignoreCheck(cwd: string): Promise<CheckResult> {
  let text = "";
  try {
    text = await readFile(join(cwd, ".gitignore"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const lines = text.split(/\r?\n/);
  const vault = ignores(lines, ".agent-qa/vault/");
  const runs = ignores(lines, ".agent-qa/runs/");
  if (!vault) {
    return {
      id: "gitignore",
      title: ".gitignore",
      status: "fail",
      detail: ".agent-qa/vault/ is not ignored",
      fix: "Add .agent-qa/vault/ to .gitignore so the token vault never reaches git.",
    };
  }
  if (!runs) {
    return {
      id: "gitignore",
      title: ".gitignore",
      status: "warn",
      detail: ".agent-qa/runs/ is not ignored, so run folders can be committed",
      fix: "Add .agent-qa/runs/ to .gitignore unless you mean to commit runs.",
    };
  }
  return { id: "gitignore", title: ".gitignore", status: "pass", detail: "vault and run folders are ignored" };
}

function patternMatches(pattern: string, model: string): boolean {
  return pattern.endsWith(":*") ? model.startsWith(pattern.slice(0, -1)) : pattern === model;
}

function modelsCheck(config: Config): CheckResult {
  const models = config.models;
  if (!models) {
    return { id: "models", title: "Models", status: "warn", detail: "no models section; only the IDE's own model can run workflows", fix: "Add models.default to run from the CLI." };
  }
  const used = [models.default, ...Object.values(models.workflows ?? {})];
  const blocked = models.allowed ? used.filter((m) => !models.allowed!.some((p) => patternMatches(p, m))) : [];
  if (blocked.length > 0) {
    return { id: "models", title: "Models", status: "fail", detail: `not in models.allowed: ${[...new Set(blocked)].join(", ")}`, fix: "Add them to models.allowed or pick allowed models." };
  }
  const providers = [...new Set(used.map((m) => m.split(":")[0]!))];
  const noKey = providers.filter((p) => !(models.keys as Record<string, string> | undefined)?.[p]);
  if (noKey.length > 0) {
    return {
      id: "models",
      title: "Models",
      status: "warn",
      detail: `no API key configured for ${noKey.join(", ")}; those models run only through an IDE host`,
      fix: "Add models.keys.<provider>: ${env:NAME} to run from the CLI or CI.",
    };
  }
  // The shipped model catalog (and its warning for custom models) comes with the llm module.
  return { id: "models", title: "Models", status: "pass", detail: `${used.length} model setting(s), keys for ${providers.join(", ")}` };
}

async function reachable(url: string, fetcher: typeof fetch, timeoutMs: number): Promise<string | undefined> {
  try {
    // Any HTTP answer, even 401, means the host is reachable; credentials are checked by the connectors.
    await fetcher(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    return undefined;
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause?.code;
    return cause ?? (error as Error).name ?? "error";
  }
}

async function reachabilityCheck(config: Config, fetcher: typeof fetch, timeoutMs: number): Promise<CheckResult> {
  const targets: Array<[string, string]> = [];
  if (config.atlassian) targets.push(["Atlassian", config.atlassian.site]);
  if (config.xray) targets.push(["Xray", XRAY_CLOUD]);
  if (config.git) targets.push([`git (${config.git.platform})`, config.git.baseUrl ?? GIT_API[config.git.platform]!]);
  if (config.salesforce) targets.push(["Salesforce", config.salesforce.baseUrl]);
  if (targets.length === 0) return { id: "network", title: "Services", status: "skip", detail: "no services configured" };
  const results = await Promise.all(targets.map(async ([name, url]) => [name, url, await reachable(url, fetcher, timeoutMs)] as const));
  const down = results.filter(([, , error]) => error);
  return down.length === 0
    ? { id: "network", title: "Services", status: "pass", detail: results.map(([name]) => name).join(", ") + " reachable" }
    : {
        id: "network",
        title: "Services",
        status: "fail",
        detail: down.map(([name, url, error]) => `${name} at ${new URL(url).host}: ${error}`).join("\n"),
        fix: "Check the URL, your network and any proxy (HTTPS_PROXY).",
      };
}

export async function runDoctor(options: DoctorOptions): Promise<CheckResult[]> {
  const env = options.env ?? process.env;
  const keyring = options.keyring ?? defaultKeyringFactory;
  const results: CheckResult[] = [nodeCheck(options.nodeVersion ?? process.version)];

  let config: Config | undefined;
  try {
    const loaded = await loadConfig(options.cwd);
    config = loaded.config;
    results.push({ id: "config", title: "agent-qa.yaml", status: "pass", detail: loaded.file });
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    results.push({
      id: "config",
      title: "agent-qa.yaml",
      status: "fail",
      detail: error.problems.map((p) => `${p.line ? `line ${p.line}: ` : ""}${p.path}: ${p.message}`).join("\n"),
      fix: "Fix the problems above, or run `agent-qa init`.",
    });
  }

  if (config) results.push(await secretsCheck(config, env, keyring));
  else results.push({ id: "secrets", title: "Secrets", status: "skip", detail: "needs a valid config" });
  results.push(await vaultCheck(env, keyring));
  results.push(await gitignoreCheck(options.cwd));
  results.push(config ? modelsCheck(config) : { id: "models", title: "Models", status: "skip", detail: "needs a valid config" });
  if (!config) results.push({ id: "network", title: "Services", status: "skip", detail: "needs a valid config" });
  else if (options.online === false) results.push({ id: "network", title: "Services", status: "skip", detail: "skipped (--offline)" });
  else results.push(await reachabilityCheck(config, options.fetch ?? fetch, options.timeoutMs ?? 5000));
  return results;
}

/** Plain-text report, one line per check plus its detail and fix. */
export function formatDoctor(results: CheckResult[]): string {
  const mark: Record<CheckStatus, string> = { pass: "ok  ", warn: "warn", fail: "FAIL", skip: "skip" };
  const lines: string[] = [];
  for (const r of results) {
    const [first, ...rest] = r.detail.split("\n");
    lines.push(`[${mark[r.status]}] ${r.title}: ${first}`);
    for (const line of rest) lines.push(`       ${line}`);
    if (r.fix && r.status !== "pass") lines.push(`       fix: ${r.fix}`);
  }
  const failed = results.filter((r) => r.status === "fail").length;
  const warned = results.filter((r) => r.status === "warn").length;
  lines.push(failed ? `${failed} problem(s) to fix.` : warned ? `Ready, with ${warned} warning(s).` : "Ready.");
  return lines.join("\n") + "\n";
}
