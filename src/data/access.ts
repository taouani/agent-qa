import { join } from "node:path";
import { ConfigError, configSchema, FileAuditSink, loadConfig, Policy, resolveSecret, type AuditSink, type Config, type Mode, type RunStore, type SecretSources } from "../core/index.js";
import { ConnectorError, JiraClient, runHostCommand, XRAY_BULK_LIMIT, XrayClient, type ConfluenceClient, type FetchLike, type JiraInput } from "../connectors/index.js";
import { defaultKeyProvider, FileVaultStorage, keychainLookup, Vault, type RunVault } from "../masking/index.js";
import { MaskedDataService, type LoadedSources, type LoadOptions } from "./requirements.js";
import { checkHostCommand, DEFAULT_TIMEOUT_MS, hostCwd, hostEnv, MAX_OUTPUT_BYTES, MAX_TIMEOUT_MS, type HostCommandOutcome, type HostCommandRequest } from "./host.js";
import { caseLabel, caseTokens, restorer, results, toXrayTest, type ExistingTest, type PushCase, type XrayPlan, type XrayPushResult } from "./xray.js";

/**
 * What workflows use to read masked data (S1-8). One instance serves every run
 * of a front door: it opens each run's vault and data service on first use.
 * Config is read on first use too, so workflows that need no Jira (the spike)
 * run without an `agent-qa.yaml`.
 */

/** The part of data access the requirements workflows need. */
export interface RequirementsData {
  /**
   * The input as it may be stored in the run folder: a key stays as it is, a
   * JQL filter becomes a vault token (it can name a person).
   */
  sealInput(runId: string, input: JiraInput): Promise<JiraInput>;
  /** Free text added in a run (a review edit), masked with the run's vault: known people keep their tokens. */
  maskTexts(runId: string, texts: string[], field: string): Promise<string[]>;
  /** Whether the run's vault still holds tokens (vaults expire after 30 days). */
  hasVault(runId: string): Promise<boolean>;
  /** Masked requirements for a key, a JQL filter or a sealed JQL token. */
  requirements(runId: string, input: JiraInput, options?: LoadOptions): Promise<LoadedSources>;
}

/** The part of data access the Xray push needs (S1-10). */
export interface XrayData {
  /**
   * Whether a push can happen: `agent-qa.yaml` has an `xray` section and the
   * write policy doesn't deny Xray in this mode. False without a config.
   */
  xrayEnabled(): Promise<boolean>;
  /**
   * Tests earlier pushes created for these issues, for a rerun to reuse their
   * ids: per issue, each test's TC id, Xray key, masked title and covered
   * criteria. Empty when Xray isn't set up. Titles are masked with the run's
   * vault, since a push with restoreOnWrite wrote real values.
   */
  existingTests(runId: string, issueKeys: string[]): Promise<Record<string, ExistingTest[]>>;
  /** Which cases exist in Xray already (found by their `agent-qa:TC-ID` label). */
  xrayPlan(cases: PushCase[]): Promise<XrayPlan>;
  /**
   * Pushes the cases through `Policy.guard` (target xray). `approved` is the
   * user's answer, which is what an `ask` rule asks for. `tokensRun` is the
   * run whose vault holds the tokens, for `masking.restoreOnWrite`.
   */
  pushToXray(runId: string, tokensRun: string, cases: PushCase[], approved: boolean): Promise<{ status: "done"; result: XrayPushResult } | { status: "declined" }>;
}

/** Running the host repo's own commands (S2-1): the test run in run-and-fix. */
export interface HostData {
  /**
   * Runs one of `allowed` (the reviewed profile's commands) in the project,
   * through `Policy.guard` (target commands). `approved` is the user's answer
   * for this run, which an `ask` rule needs: the workflow asks once per run.
   * Output comes back masked with the run's vault.
   */
  runCommand(runId: string, request: HostCommandRequest, allowed: string[][], approved: boolean): Promise<{ status: "done"; result: HostCommandOutcome } | { status: "declined" }>;
}

export interface DataAccessOptions {
  /** Project folder: `agent-qa.yaml` and `.agent-qa/vault/` live here. */
  root: string;
  store: RunStore;
  env?: NodeJS.ProcessEnv;
  /** The config, else `agent-qa.yaml` in `root`, read on first use. */
  config?: Config;
  /** The token vault, else encrypted files in `.agent-qa/vault/` with the default key. */
  vault?: Pick<Vault, "open">;
  secrets?: SecretSources;
  fetch?: FetchLike;
  /** Replace the clients, for tests. */
  jira?: Pick<JiraClient, "collect">;
  confluence?: Pick<ConfluenceClient, "pages">;
  xray?: Pick<XrayClient, "importAndWait">;
  labels?: Pick<JiraClient, "findByLabels"> & Partial<Pick<JiraClient, "findAgentTests">>;
  /** `ide` (default) or `ci`: decides what an `ask` write rule does. */
  mode?: Mode;
  /** Where write decisions are recorded; default `.agent-qa/audit.jsonl`. */
  audit?: AuditSink;
  /** Replace the command runner, for tests. */
  host?: typeof runHostCommand;
}

/** Where secrets are read: the environment, then the OS keychain (service sf-agent-qa). */
export function secretSources(env: NodeJS.ProcessEnv = process.env): SecretSources {
  return { env, keychain: keychainLookup() };
}

/** The default write rules, for a command run in a project with no agent-qa.yaml. */
const DEFAULT_RULES_CONFIG: Config = configSchema.parse({ version: 1 });

/** A sealed JQL input: the vault token that stands for it. */
const SEALED = /^<INPUT_\d+>$/;
/** Open runs kept in memory; an MCP server can serve many runs in a day. */
const MAX_OPEN = 16;

export class DataAccess implements RequirementsData, XrayData, HostData {
  private config: Promise<Config> | undefined;
  private vault: Pick<Vault, "open"> | undefined;
  private readonly open = new Map<string, Promise<{ vault: RunVault; service: MaskedDataService }>>();

  constructor(private readonly options: DataAccessOptions) {}

  async sealInput(runId: string, input: JiraInput): Promise<JiraInput> {
    if ("key" in input) return { key: input.key.trim().toUpperCase() };
    if (SEALED.test(input.jql)) return input;
    const { vault } = await this.run(runId);
    // The same value and kind as MaskedDataService uses, so both give the same token.
    const token = vault.tokenFor("INPUT", JSON.stringify({ jql: input.jql }));
    await vault.save();
    return { jql: token };
  }

  async requirements(runId: string, input: JiraInput, options: LoadOptions = {}): Promise<LoadedSources> {
    const { vault, service } = await this.run(runId);
    return service.requirements(this.unseal(vault, input), options);
  }

  async hasVault(runId: string): Promise<boolean> {
    return (await this.run(runId)).vault.size > 0;
  }

  async maskTexts(runId: string, texts: string[], field: string): Promise<string[]> {
    const { service } = await this.run(runId);
    const masked = texts.map((t) => service.maskText(t, field));
    await service.saveVault();
    return masked;
  }

  async xrayEnabled(): Promise<boolean> {
    let config: Config;
    try {
      config = await this.loadConfig();
    } catch {
      return false;
    }
    // Earlier pushes are found through Jira, so the push needs the atlassian section too.
    return config.xray !== undefined && (this.options.labels !== undefined || config.atlassian !== undefined) && this.policy(config).decide("xray").kind !== "deny";
  }

  async existingTests(runId: string, issueKeys: string[]): Promise<Record<string, ExistingTest[]>> {
    if (issueKeys.length === 0 || !(await this.xrayEnabled())) return {};
    const config = await this.loadConfig();
    const xray = this.xrayConfig(config);
    const labels = await this.labels(config);
    if (!labels.findAgentTests) return {};
    const { service } = await this.run(runId);
    const out: Record<string, ExistingTest[]> = {};
    for (const key of issueKeys) {
      const tests = await labels.findAgentTests(xray.projectKey, key);
      if (tests.length) out[key] = tests.map((t) => ({ id: t.tcId, xrayKey: t.key, title: service.maskText(t.title, "xray.existing"), covers: t.covers }));
    }
    await service.saveVault();
    return out;
  }

  async xrayPlan(cases: PushCase[]): Promise<XrayPlan> {
    const config = await this.loadConfig();
    const xray = this.xrayConfig(config);
    const found = await (await this.labels(config)).findByLabels(xray.projectKey, cases.map((c) => caseLabel(c.id)));
    const existing: Record<string, string> = {};
    for (const c of cases) {
      const key = found.get(caseLabel(c.id));
      if (key) existing[c.id] = key;
    }
    const update = Object.keys(existing).length;
    return { project: xray.projectKey, existing, create: cases.length - update, update };
  }

  async pushToXray(runId: string, tokensRun: string, cases: PushCase[], approved: boolean) {
    // "No" never reaches the policy: under an `allow` rule it would not ask again.
    if (!approved || cases.length === 0) return { status: "declined" as const };
    const config = await this.loadConfig();
    const xray = this.xrayConfig(config);
    const plan = await this.xrayPlan(cases);
    const restoreOnWrite = config.masking.restoreOnWrite;
    const { vault } = restoreOnWrite ? await this.run(tokensRun) : { vault: undefined };
    if (vault) {
      // An expired vault would send tokens while the user expects real values.
      const missing = [...caseTokens(cases)].filter((t) => vault.valueOf(t) === undefined);
      if (missing.length) throw new Error(`the token vault of run ${tokensRun} has no value for ${missing.length} token(s): it expired or was deleted, so the real values can't be restored. Start a new run.`);
    }
    const restore = vault ? restorer((t) => vault.valueOf(t)) : (text: string) => text;
    const policy = this.policy(config);
    const summary = `Push ${cases.length} test case(s) to Xray project ${xray.projectKey} (${plan.create} new, ${plan.update} updated)`;
    const client = await this.xrayClient(config);
    const outcome = await policy.guard({ target: "xray", summary, runId }, async (grant) => {
      const result: XrayPushResult = { project: xray.projectKey, jobs: [], results: [] };
      for (let i = 0; i < cases.length; i += XRAY_BULK_LIMIT) {
        const batch = cases.slice(i, i + XRAY_BULK_LIMIT);
        try {
          const job = await client.importAndWait(batch.map((c) => toXrayTest(c, xray, plan.existing[c.id], restore)), grant);
          result.jobs.push(job.jobId);
          const rows = results(batch, plan.existing, job);
          // With real values sent, even field names are more than needed: keep none of Xray's text.
          if (restoreOnWrite) for (const r of rows) if (r.error) r.error = "rejected by Xray (message not kept: restoreOnWrite is on)";
          result.results.push(...rows);
        } catch (error) {
          // Nothing started yet: fail the write, so the step stays open and can be retried.
          if (!(error instanceof ConnectorError) || (result.jobs.length === 0 && !error.jobId)) throw error;
          // Something may be in Xray: keep the record, since a rerun without it could create tests again.
          if (error.jobId) result.jobs.push(error.jobId);
          // A started job may still create the tests: its outcome is unknown, not a failure to import.
          const why = error.jobId ? `unknown: ${error.message}${error.code === "TIMEOUT" ? "" : `; job ${error.jobId} may still complete, so check Xray before pushing again`}` : `not imported (${error.message}); check Xray before pushing again`;
          for (const c of cases.slice(i)) result.results.push({ tcId: c.id, action: "failed", linkedTo: c.requirement, error: why });
          break;
        }
      }
      return result;
    });
    return outcome.status === "done" ? { status: "done" as const, result: outcome.value } : { status: "declined" as const };
  }

  async runCommand(runId: string, request: HostCommandRequest, allowed: string[][], approved: boolean) {
    // "No" never reaches the policy: under an `allow` rule it would not ask again.
    if (!approved) return { status: "declined" as const };
    // Checked before anything is asked or logged: a refused command never reaches the audit log as approved.
    const argv = checkHostCommand(request, allowed);
    const cwd = hostCwd(this.options.root, request.cwd);
    const timeoutMs = Math.min(Math.max(request.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1_000), MAX_TIMEOUT_MS);
    let config: Config | undefined;
    try {
      config = await this.loadConfig();
    } catch (error) {
      // No config file: the default rules apply and no secrets are named. A broken one stops here,
      // since its deny rule and secret names would be lost.
      if (!(error instanceof ConfigError && error.code === "NOT_FOUND")) throw error;
    }
    const policy = this.policy(config ?? DEFAULT_RULES_CONFIG);
    const { service } = await this.run(runId);
    // The profile's command, never the added arguments (a test name can be someone's text); masked all the same.
    const summary = service.maskText(`Run ${request.command.join(" ")} in ${request.cwd ?? "."} (${request.purpose})`, "host.summary");
    const run = this.options.host ?? runHostCommand;
    const outcome = await policy.guard({ target: "commands", summary, runId }, (grant) =>
      run(grant, { argv, cwd, env: hostEnv(this.options.env ?? process.env, config), timeoutMs, maxOutputBytes: MAX_OUTPUT_BYTES }),
    );
    if (outcome.status !== "done") return { status: "declined" as const };
    const r = outcome.value;
    const result: HostCommandOutcome = {
      exitCode: r.exitCode,
      timedOut: r.timedOut,
      stdout: service.maskText(r.stdout, "host.stdout"),
      stderr: service.maskText(r.stderr, "host.stderr"),
      truncated: r.truncated,
      durationMs: r.durationMs,
    };
    await service.saveVault();
    return { status: "done" as const, result };
  }

  private async loadConfig(): Promise<Config> {
    this.config ??= this.options.config ? Promise.resolve(this.options.config) : loadConfig(this.options.root).then((l) => l.config);
    this.config.catch(() => (this.config = undefined));
    return this.config;
  }

  /** The write policy. `confirm` says yes: the workflow's confirm step already asked the user. */
  private policy(config: Config): Policy {
    return new Policy({
      rules: config.policy.writes,
      mode: this.options.mode ?? "ide",
      audit: this.options.audit ?? FileAuditSink.forRoot(this.options.root),
      confirm: async () => true,
    });
  }

  private xrayConfig(config: Config): NonNullable<Config["xray"]> {
    if (!config.xray) throw new Error("agent-qa.yaml has no xray section: add clientId, clientSecret and projectKey to push to Xray.");
    return config.xray;
  }

  private secrets(): SecretSources {
    return this.options.secrets ?? secretSources(this.options.env ?? process.env);
  }

  private async reveal(value: string): Promise<string> {
    return value.startsWith("${") ? resolveSecret(value, this.secrets()) : value;
  }

  private async labels(config: Config): Promise<Pick<JiraClient, "findByLabels"> & Partial<Pick<JiraClient, "findAgentTests">>> {
    if (this.options.labels) return this.options.labels;
    const atlassian = config.atlassian;
    if (!atlassian) throw new Error("agent-qa.yaml has no atlassian section: it is needed to find tests pushed before.");
    return new JiraClient({
      site: atlassian.site,
      email: await this.reveal(atlassian.email),
      token: await resolveSecret(atlassian.token, this.secrets()),
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
    });
  }

  private async xrayClient(config: Config): Promise<Pick<XrayClient, "importAndWait">> {
    if (this.options.xray) return this.options.xray;
    const xray = this.xrayConfig(config);
    return new XrayClient({
      clientId: await this.reveal(xray.clientId),
      clientSecret: await resolveSecret(xray.clientSecret, this.secrets()),
      ...(xray.baseUrl ? { baseUrl: xray.baseUrl } : {}),
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
    });
  }

  private unseal(vault: RunVault, input: JiraInput): JiraInput {
    if ("key" in input || !SEALED.test(input.jql)) return input;
    const value = vault.valueOf(input.jql);
    if (value === undefined) throw new Error(`The run's vault has no value for ${input.jql}: it expired or was deleted. Start a new run.`);
    return JSON.parse(value) as JiraInput;
  }

  private run(runId: string): Promise<{ vault: RunVault; service: MaskedDataService }> {
    let entry = this.open.get(runId);
    if (entry) {
      // Most recently used last, so the eviction below drops the least recently used run.
      this.open.delete(runId);
      this.open.set(runId, entry);
      return entry;
    }
    const created = this.create(runId);
    entry = created;
    created.catch(() => {
      if (this.open.get(runId) === created) this.open.delete(runId);
    });
    this.open.set(runId, entry);
    if (this.open.size > MAX_OPEN) this.open.delete(this.open.keys().next().value!);
    return entry;
  }

  private async create(runId: string): Promise<{ vault: RunVault; service: MaskedDataService }> {
    const { root, env, store } = this.options;
    const config = await this.loadConfig();
    this.vault ??= this.options.vault ?? new Vault({ storage: new FileVaultStorage(join(root, ".agent-qa", "vault")), keys: defaultKeyProvider(env) });
    const vault = await this.vault.open(runId);
    const secrets = this.secrets();
    const service = new MaskedDataService({
      config,
      store,
      runId,
      vault,
      secrets,
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
      ...(this.options.jira ? { jira: this.options.jira } : {}),
      ...(this.options.confluence ? { confluence: this.options.confluence } : {}),
    });
    return { vault, service };
  }
}
