import { isAbsolute, relative, resolve, sep } from "node:path";
import { VERSION, CATALOG_CHECKED, catalogModel, ConfigError, modelAllowed, loadConfig, PROVIDER_KEY_ENV, resolveSecret, SECRET_REF, type Config } from "../core/index.js";
import { ConnectorError, networkCause, SalesforceAuth, SalesforceAuthError, selectFetch } from "../connectors/index.js";
import { salesforceKey, salesforceKeyPath } from "./access.js";
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

/**
 * Salesforce sign-in (S2-3): the private key is read and parsed, and online,
 * each role's user gets an access token, as the reference repo's auth check
 * does. No frontdoor URL is minted and no username is printed: only role names.
 */
async function salesforceCheck(config: Config, root: string, env: NodeJS.ProcessEnv, keyring: KeyringFactory, online: boolean, fetcher: typeof fetch, timeoutMs: number): Promise<CheckResult> {
  const sf = config.salesforce;
  const base = { id: "salesforce", title: "Salesforce sign-in" };
  if (!sf) return { ...base, status: "skip", detail: "no salesforce section" };
  const secrets = { env, keychain: keychainLookup(keyring) };
  let auth: SalesforceAuth;
  let keyPath: string | undefined;
  try {
    keyPath = await salesforceKeyPath(sf, root, secrets);
    const clientId = sf.clientId.startsWith("${") ? await resolveSecret(sf.clientId, secrets) : sf.clientId;
    auth = new SalesforceAuth({ loginUrl: sf.loginUrl, ...(sf.audience ? { audience: sf.audience } : {}), clientId, orgUrl: sf.baseUrl, privateKey: await salesforceKey(sf, root, secrets), fetch: fetcher, timeoutMs, retries: 0 });
  } catch (error) {
    return { ...base, status: "fail", detail: (error as Error).message, fix: "Point salesforce.privateKey or privateKeyFile at the External Client App's RSA private key (PEM)." };
  }
  const notes: string[] = [];
  const keyRel = keyPath && insideFolder(root, keyPath) ? relative(root, keyPath).split(sep).join("/") : undefined;
  if (keyRel && !isIgnored(await loadIgnoreRules(root, [keyRel]), keyRel)) {
    notes.push("privateKeyFile is inside the project and not gitignored: move it out, or ignore it");
  }
  const roles = Object.keys(sf.users);
  if (!online) return { ...base, status: notes.length ? "warn" : "pass", detail: [`key read; ${roles.length} role(s): ${roles.join(", ")} (not signed in: --offline)`, ...notes].join("\n") };
  const failed: string[] = [];
  for (const role of roles) {
    try {
      const user = sf.users[role]!;
      await auth.accessToken(user.startsWith("${") ? await resolveSecret(user, secrets) : user);
    } catch (error) {
      failed.push(`${role}: ${error instanceof SalesforceAuthError || error instanceof ConnectorError ? error.message : error instanceof Error && error.name === "SecretError" ? error.message : (error as Error).name}`);
    }
  }
  if (failed.length) return { ...base, status: "fail", detail: failed.join("\n"), fix: "Fix each role's user or the app setup as the message says, then run doctor again." };
  return { ...base, status: notes.length ? "warn" : "pass", detail: [`${roles.length} role(s) signed in: ${roles.join(", ")}`, ...notes].join("\n") };
}

function insideFolder(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
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

function modelsCheck(config: Config, env: NodeJS.ProcessEnv): CheckResult {
  const models = config.models;
  if (!models) {
    return { id: "models", title: "Models", status: "warn", detail: "no models section; only the IDE's own model can run workflows", fix: "Add models.default to run from the CLI." };
  }
  const used = [models.default, ...Object.values(models.workflows ?? {})];
  const blocked = models.allowed ? used.filter((m) => !modelAllowed(m, models.allowed)) : [];
  if (blocked.length > 0) {
    return { id: "models", title: "Models", status: "fail", detail: `not in models.allowed: ${[...new Set(blocked)].join(", ")}`, fix: "Add them to models.allowed or pick allowed models." };
  }
  // OpenRouter and LiteLLM route to any model, so only the direct providers are checked against the catalog.
  const custom = [...new Set(used)].filter((m) => !["openrouter", "litellm"].includes(m.split(":")[0]!) && !catalogModel(m));
  const customDetail = custom.length > 0 ? `not in the shipped catalog (checked ${CATALOG_CHECKED}): ${custom.join(", ")}; they run, but are untested` : "";
  const also = customDetail ? `\n${customDetail}` : "";
  const providers = [...new Set(used.map((m) => m.split(":")[0]!))];
  if (providers.includes("litellm") && !models.endpoints?.litellm) {
    return { id: "models", title: "Models", status: "warn", detail: `litellm models need models.endpoints.litellm (your proxy's URL)${also}`, fix: "Add models.endpoints.litellm." };
  }
  // A key in models.keys, or the provider's own variable (ANTHROPIC_API_KEY...), which its SDK reads.
  const ownVar = (p: string) => PROVIDER_KEY_ENV[p as keyof typeof PROVIDER_KEY_ENV];
  const noKey = providers.filter((p) => !(models.keys as Record<string, string> | undefined)?.[p] && !(ownVar(p) && env[ownVar(p)!]));
  if (noKey.length > 0) {
    return {
      id: "models",
      title: "Models",
      status: "warn",
      detail: `no API key for ${noKey.join(", ")}; those models run only through an IDE host${also}`,
      fix: `Set ${noKey.map((p) => ownVar(p) ?? `models.keys.${p}`).join(", ")}, or add models.keys.<provider>: \${env:NAME}, to run from the CLI or CI.`,
    };
  }
  if (customDetail) {
    return {
      id: "models",
      title: "Models",
      status: "warn",
      detail: customDetail,
      fix: "Check the model id with the provider, or pick a catalog model.",
    };
  }
  return { id: "models", title: "Models", status: "pass", detail: `${used.length} model setting(s), keys for ${providers.join(", ")}` };
}

/** The same fetch the connectors use for each host, so a proxy in HTTPS_PROXY is used here too. */
function proxyAwareFetch(env: NodeJS.ProcessEnv): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const f = await selectFetch(env, new URL(url).origin);
    return f(url, init ?? {});
  }) as typeof fetch;
}

async function reachable(url: string, fetcher: typeof fetch, timeoutMs: number): Promise<string | undefined> {
  try {
    // Any HTTP answer, even 401, means the host is reachable; credentials are checked by the connectors.
    await fetcher(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    return undefined;
  } catch (error) {
    const e = error as Error & { cause?: { code?: string; name?: string } };
    if (e.name === "TimeoutError") return `timed out after ${timeoutMs} ms`;
    if (error instanceof ConnectorError) return error.message; // a proxy URL that can't be used
    return networkCause(error) ?? e.cause?.name ?? e.name ?? "error";
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
          "Check the URL and your network. Behind a proxy, set HTTPS_PROXY (and NO_PROXY for hosts that skip it); " +
          "for a proxy that re-signs TLS (a CERT or SELF_SIGNED code), set NODE_OPTIONS=--use-system-ca (Node 22.15+; in PowerShell: $env:NODE_OPTIONS = \"--use-system-ca\") or NODE_EXTRA_CA_CERTS to its CA certificate (.pem). " +
          "ENOTFOUND means the host name didn't resolve.",
      };
}

export async function runDoctor(options: DoctorOptions): Promise<CheckResult[]> {
  const env = options.env ?? process.env;
  const keyring = options.keyring ?? defaultKeyringFactory;
  const results: CheckResult[] = [nodeCheck(options.nodeVersion ?? process.version)];

  let config: Config | undefined;
  const root = resolve(options.cwd);
  // Show paths under the project as ./…, so home folders and user names stay out of CI logs.
  const shown = (text: string) => text.split(root + sep).join("." + sep).split(root).join(".");
  try {
    const loaded = await loadConfig(root);
    config = loaded.config;
    results.push({ id: "config", title: "agent-qa.yaml", status: "pass", detail: relative(root, loaded.file) || loaded.file });
    if (loaded.schemaVersion && loaded.schemaVersion !== VERSION) {
      results.push({
        id: "config-schema",
        title: "Editor schema",
        status: "warn",
        detail: `the schema line points at sf-agent-qa@${loaded.schemaVersion}, but ${VERSION} is running, so your editor may flag settings this version supports`,
        fix: `In the file's first line, change sf-agent-qa@${loaded.schemaVersion} to sf-agent-qa@${VERSION}.`,
      });
    }
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
    results.push({ id: "config", title: "agent-qa.yaml", status: "fail", detail: problems.join("\n"), fix: error instanceof ConfigError && error.code === "NOT_FOUND" ? "Run doctor in your project folder (or point at it with --cwd), after `agent-qa init` there." : "Fix the problems above." });
  }

  if (config) results.push(await secretsCheck(config, env, keyring));
  else results.push({ id: "secrets", title: "Secrets", status: "skip", detail: "needs a valid config" });
  results.push(await vaultCheck(env, keyring));
  try {
    results.push(await gitignoreCheck(root, options.caseInsensitive));
  } catch (error) {
    results.push({ id: "gitignore", title: ".gitignore", status: "fail", detail: `can't be read: ${shown((error as Error).message)}` });
  }
  results.push(config ? modelsCheck(config, env) : { id: "models", title: "Models", status: "skip", detail: "needs a valid config" });
  if (config) results.push(await salesforceCheck(config, root, env, keyring, options.online !== false, options.fetch ?? proxyAwareFetch(env), options.timeoutMs ?? 5000));
  if (!config) results.push({ id: "network", title: "Services", status: "skip", detail: "needs a valid config" });
  else if (options.online === false) results.push({ id: "network", title: "Services", status: "skip", detail: "skipped (--offline)" });
  else results.push(await reachabilityCheck(config, options.fetch ?? proxyAwareFetch(env), options.timeoutMs ?? 5000));
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
