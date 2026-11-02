import { relative } from "node:path";
import { ConfigError, loadConfig, resolveSecret, SECRET_REF, type Config } from "../core/index.js";
import { loadIgnoreRules, isIgnored } from "./gitignore.js";
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
  /** Match .gitignore case-insensitively. Default: on Windows and macOS. */
  caseInsensitive?: boolean;
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

const IGNORE_TARGETS = [
  { path: ".agent-qa/vault/x.vault", label: ".agent-qa/vault/", status: "fail" as const, why: "so the token vault never reaches git" },
  { path: ".agent-qa/runs/x/run.json", label: ".agent-qa/runs/", status: "warn" as const, why: "unless you mean to commit run folders" },
  { path: ".agent-qa/audit.jsonl", label: ".agent-qa/audit.jsonl", status: "warn" as const, why: "unless you mean to commit the audit log" },
];

async function gitignoreCheck(cwd: string, caseInsensitive?: boolean): Promise<CheckResult> {
  const rules = await loadIgnoreRules(cwd, IGNORE_TARGETS.map((t) => t.path), caseInsensitive);
  const missing = IGNORE_TARGETS.filter((t) => !isIgnored(rules, t.path));
  if (missing.length === 0) return { id: "gitignore", title: ".gitignore", status: "pass", detail: "vault, run folders and audit log are ignored" };
  return {
    id: "gitignore",
    title: ".gitignore",
    status: missing.some((t) => t.status === "fail") ? "fail" : "warn",
    detail: missing.map((t) => `${t.label} is not ignored`).join("\n"),
    fix: missing.map((t) => `Add ${t.label} to .gitignore ${t.why}.`).join(" "),
  };
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
  if (providers.includes("litellm") && !models.endpoints?.litellm) {
    return { id: "models", title: "Models", status: "warn", detail: "litellm models need models.endpoints.litellm (your proxy's URL)", fix: "Add models.endpoints.litellm." };
  }
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
    const e = error as Error & { cause?: { code?: string; name?: string } };
    if (e.name === "TimeoutError") return `timed out after ${timeoutMs} ms`;
    return e.cause?.code ?? e.cause?.name ?? e.name ?? "error";
  }
}

async function reachabilityCheck(config: Config, fetcher: typeof fetch, timeoutMs: number): Promise<CheckResult> {
  const targets: Array<[string, string]> = [];
  if (config.atlassian) targets.push(["Atlassian", config.atlassian.site]);
  if (config.xray) targets.push(["Xray", XRAY_CLOUD]);
  if (config.git) targets.push([`git (${config.git.platform})`, config.git.baseUrl ?? GIT_API[config.git.platform]!]);
  if (config.salesforce) targets.push(["Salesforce", config.salesforce.baseUrl]);
  for (const [provider, url] of Object.entries(config.models?.endpoints ?? {})) if (url) targets.push([`${provider} endpoint`, url]);
  if (config.masking.presidio?.url) targets.push(["Presidio", config.masking.presidio.url]);
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
        fix:
          "Check the URL and your network. Behind a proxy, Node's fetch uses HTTPS_PROXY only when NODE_USE_ENV_PROXY=1 " +
          "(Node 22.21+/24.5+); for a proxy that re-signs TLS, set NODE_EXTRA_CA_CERTS to its CA certificate.",
      };
}

export async function runDoctor(options: DoctorOptions): Promise<CheckResult[]> {
  const env = options.env ?? process.env;
  const keyring = options.keyring ?? defaultKeyringFactory;
  const results: CheckResult[] = [nodeCheck(options.nodeVersion ?? process.version)];

  let config: Config | undefined;
  const shown = (text: string) => text.split(options.cwd).join(".");
  try {
    const loaded = await loadConfig(options.cwd);
    config = loaded.config;
    results.push({ id: "config", title: "agent-qa.yaml", status: "pass", detail: relative(options.cwd, loaded.file) || loaded.file });
    if (!SECRET_REF.test(config.atlassian?.email ?? "${env:x}")) {
      results.push({
        id: "config-email",
        title: "Atlassian email",
        status: "warn",
        detail: "atlassian.email is written in the file, so personal data is in git",
        fix: "Use ${env:ATLASSIAN_EMAIL} instead.",
      });
    }
  } catch (error) {
    const problems =
      error instanceof ConfigError
        ? error.problems.map((p) => `${p.line ? `line ${p.line}: ` : ""}${p.path === "$" ? "" : `${p.path}: `}${shown(p.message)}`)
        : [shown((error as Error).message)];
    results.push({ id: "config", title: "agent-qa.yaml", status: "fail", detail: problems.join("\n"), fix: "Fix the problems above." });
  }

  if (config) results.push(await secretsCheck(config, env, keyring));
  else results.push({ id: "secrets", title: "Secrets", status: "skip", detail: "needs a valid config" });
  results.push(await vaultCheck(env, keyring));
  try {
    results.push(await gitignoreCheck(options.cwd, options.caseInsensitive));
  } catch (error) {
    results.push({ id: "gitignore", title: ".gitignore", status: "fail", detail: `can't be read: ${(error as Error).message.split(options.cwd).join(".")}` });
  }
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
