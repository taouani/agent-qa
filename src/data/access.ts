import { isAbsolute, join, resolve as resolvePath } from "node:path";
import { ConfigError, configSchema, FileAuditSink, loadConfig, Policy, resolveSecret, type AuditSink, type Config, type Mode, type RunStore, type SecretSources } from "../core/index.js";
import { ConnectorError, JiraClient, runHostCommand, SalesforceAuth, writeRepoFile, XRAY_BULK_LIMIT, XrayClient, type SalesforceSession, type ConfluenceClient, type FetchLike, type JiraInput } from "../connectors/index.js";
import { defaultKeyProvider, FileVaultStorage, keychainLookup, Vault, type RunVault } from "../masking/index.js";
import { MaskedDataService, type LoadedSources, type LoadOptions } from "./requirements.js";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import {
  commandList,
  FRAMEWORK_PROFILE_SPEC,
  FRAMEWORK_PROFILE_TEMPLATE_VERSION,
  PROFILE_FILE,
  ProfileError,
  readSavedProfile,
  reviewedPart,
  scanFramework,
  type FrameworkProfile,
  type SavedProfile,
} from "./profile.js";
import { checkHostCommand, DEFAULT_TIMEOUT_MS, HostCommandRefused, hostCwd, hostEnv, MAX_OUTPUT_BYTES, MAX_TIMEOUT_MS, type HostCommandOutcome, type HostCommandRequest } from "./host.js";
import { Explorer, type ExplorerTarget, type ExploreSetup, type MaskedAction, type MaskedPage, type MaskedResult, type OpenBrowser } from "./explorer.js";
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
   * Runs one of the reviewed profile's commands (agent-qa.profile.json) in its
   * folder, through `Policy.guard` (target commands). Nothing else can run: the
   * list comes from the file a person accepted, never from the caller.
   * `approved` is the user's answer for this run, which an `ask` rule needs:
   * the workflow asks once per run. Output comes back masked with the run's vault.
   */
  runCommand(runId: string, request: HostCommandRequest, approved: boolean): Promise<{ status: "done"; result: HostCommandOutcome } | { status: "declined" }>;
}

export interface SalesforceData {
  /** The roles agent-qa.yaml names users for. */
  salesforceRoles(): Promise<string[]>;
  /**
   * Signs in the role's user (JWT bearer flow) and returns a single-use
   * frontdoor URL. Secret: it opens a session as that user, so it is never
   * logged, stored, masked into a context or shown to a model. Mint it right
   * before opening it: it works once, for about a minute.
   */
  salesforceSession(role: string): Promise<SalesforceSession>;
}

export interface ProfileData {
  /** Scans the repo's Playwright project once per run (nothing in it runs) and keeps it as framework-profile@1. Every repo text comes back masked with the run's vault. */
  frameworkProfile(runId: string, folder?: string): Promise<FrameworkProfile>;
  /** The reviewed profile, or undefined. Throws ProfileError when the file is broken. */
  savedProfile(): Promise<SavedProfile | undefined>;
  /**
   * Scans again and saves the reviewed part (folder, kind, commands) to
   * agent-qa.profile.json through `Policy.guard` (target testCode). Call it
   * only with the person's yes: it decides what Agent-QA may run. It saves what
   * this run showed the person (framework-profile@1); if the repo's folder, kind
   * or commands changed since, nothing is saved.
   */
  saveProfile(runId: string, folder?: string): Promise<{ status: "done"; profile: SavedProfile } | { status: "declined" }>;
}

/** The explorer's browser (S2-4): masked pages in, masked actions out. */
export interface ExplorerData {
  /** Where exploring goes, for the person's approval. Throws for a production org or an unknown role. */
  explorerTarget(role?: string): Promise<ExplorerTarget>;
  /**
   * Brings the run's browser to the end of `actions` on case `caseId`: opens
   * it on first use (through `Policy.guard`, target commands), starts each
   * case in a fresh signed-in context, applies only actions not applied yet,
   * and replays the case after a restart. Returns each action's result and
   * the page now, masked with `setup.tokensRun`'s vault. `approved` is the
   * person's yes to exploring.
   */
  explorerSync(runId: string, setup: ExploreSetup, caseId: string, actions: MaskedAction[], approved: boolean): Promise<{ results: MaskedResult[]; page: MaskedPage }>;
  /** Closes the run's browser. */
  explorerClose(runId: string): Promise<void>;
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
  /** Replace the explorer's browser, for tests. */
  browser?: OpenBrowser;
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

export class DataAccess implements RequirementsData, XrayData, HostData, ProfileData, SalesforceData, ExplorerData {
  private config: Promise<Config> | undefined;
  private vault: Pick<Vault, "open"> | undefined;
  private readonly open = new Map<string, Promise<{ vault: RunVault; service: MaskedDataService }>>();
  private readonly profiles = new Map<string, Promise<FrameworkProfile>>();
  private sfAuth: Promise<SalesforceAuth> | undefined;
  private explorer: Explorer | undefined;

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

  async runCommand(runId: string, request: HostCommandRequest, approved: boolean) {
    // "No" never reaches the policy: under an `allow` rule it would not ask again.
    if (!approved) return { status: "declined" as const };
    const saved = await this.savedProfile();
    if (!saved) throw new HostCommandRefused(`no reviewed framework profile: run the profile workflow and accept it to create ${PROFILE_FILE}`);
    // Checked before anything is asked or logged: a refused command never reaches the audit log as approved.
    request = { ...request, cwd: request.cwd ?? saved.folder };
    const argv = checkHostCommand(request, commandList(saved.commands));
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

  async salesforceRoles(): Promise<string[]> {
    return Object.keys((await this.salesforceConfig()).users);
  }

  async salesforceSession(role: string): Promise<SalesforceSession> {
    const sf = await this.salesforceConfig();
    if (!Object.hasOwn(sf.users, role)) throw new Error(`agent-qa.yaml has no Salesforce user for the role ${JSON.stringify(role.slice(0, 60))}; the roles are ${Object.keys(sf.users).join(", ")}`);
    const auth = await this.salesforceAuth(sf);
    return auth.session(await this.reveal(sf.users[role]!));
  }

  private async salesforceConfig(): Promise<NonNullable<Config["salesforce"]>> {
    const sf = (await this.loadConfig()).salesforce;
    if (!sf) throw new Error("agent-qa.yaml has no salesforce section: add baseUrl, loginUrl, clientId, privateKey (or privateKeyFile) and users to sign in.");
    return sf;
  }

  /** One client per process: the key is read once. */
  private async salesforceAuth(sf: NonNullable<Config["salesforce"]>): Promise<SalesforceAuth> {
    if (!this.sfAuth) {
      const pending = (async () =>
        new SalesforceAuth({
          loginUrl: sf.loginUrl,
          ...(sf.audience ? { audience: sf.audience } : {}),
          orgUrl: sf.baseUrl,
          clientId: await this.reveal(sf.clientId),
          privateKey: await salesforceKey(sf, this.options.root, this.secrets()),
          ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
        }))();
      this.sfAuth = pending;
      pending.catch(() => {
        if (this.sfAuth === pending) this.sfAuth = undefined;
      });
    }
    return this.sfAuth;
  }

  private explorerOf(): Explorer {
    this.explorer ??= new Explorer({
      root: this.options.root,
      loadConfig: () => this.loadConfig(),
      policy: (config) => this.policy(config),
      run: (runId) => this.run(runId),
      salesforceSession: (role) => this.salesforceSession(role),
      playwrightFolder: async () => (await this.savedProfile())?.folder ?? ".",
      ...(this.options.browser ? { openBrowser: this.options.browser } : {}),
    });
    return this.explorer;
  }

  explorerTarget(role?: string): Promise<ExplorerTarget> {
    return this.explorerOf().target(role);
  }

  explorerSync(runId: string, setup: ExploreSetup, caseId: string, actions: MaskedAction[], approved: boolean) {
    return this.explorerOf().sync(runId, setup, caseId, actions, approved);
  }

  async explorerClose(runId: string): Promise<void> {
    await this.explorer?.close(runId);
  }

  /** Closes every browser this instance opened. */
  async close(): Promise<void> {
    await this.explorer?.closeAll();
  }

  async frameworkProfile(runId: string, folder?: string): Promise<FrameworkProfile> {
    // Scanned once per run: the question, the review and the save all use what the person saw.
    let pending = this.profiles.get(runId);
    if (!pending) {
      pending = (async () => {
        const cached = await this.options.store.readArtifact(runId, FRAMEWORK_PROFILE_SPEC);
        if (cached) return cached.data;
        const masked = await this.maskProfile(runId, scanFramework(this.options.root, folder));
        const hash = createHash("sha256").update(JSON.stringify(masked)).digest("hex");
        await this.options.store.writeArtifact(runId, FRAMEWORK_PROFILE_SPEC, masked, {
          inputs: [{ kind: "repo-folder", ref: masked.folder, hash }],
          templateVersion: FRAMEWORK_PROFILE_TEMPLATE_VERSION,
        });
        return masked;
      })();
      this.profiles.set(runId, pending);
      // The run folder keeps it too: only recent runs stay in memory.
      if (this.profiles.size > 64) this.profiles.delete(this.profiles.keys().next().value!);
      pending.catch(() => this.profiles.delete(runId));
    }
    return pending;
  }

  /**
   * Every text the repo wrote, masked with the run's vault: the scan reaches the
   * host model as the review's context. Only the kind and the commands, which
   * the scan picks from fixed lists, stay as they are.
   */
  private async maskProfile(runId: string, profile: FrameworkProfile): Promise<FrameworkProfile> {
    const { service } = await this.run(runId);
    const mask = <T>(value: T, field: string): T => {
      if (typeof value === "string") return service.maskText(value, field) as T;
      if (Array.isArray(value)) return value.map((v) => mask(v, field)) as T;
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [service.maskText(k, field), mask(v, field)])) as T;
      return value;
    };
    // Names Agent-QA fixed itself (kind, commands, step keywords, locator forms) stay as they are.
    const { kind, commands, locators, locatorRanking, steps, ...rest } = profile;
    const masked = {
      ...mask(rest, "profile"),
      kind,
      ...(commands ? { commands } : {}),
      locators,
      locatorRanking,
      steps: steps.map(({ keyword, kind: k, line, ...s }) => ({ keyword, kind: k, line, ...mask(s, "profile.step") })),
    } as FrameworkProfile;
    await service.saveVault();
    return masked;
  }

  async savedProfile(): Promise<SavedProfile | undefined> {
    return readSavedProfile(this.options.root);
  }

  async saveProfile(runId: string, folder?: string) {
    // What the person saw, from the run folder; then the repo now, masked the same way.
    const shown = await this.frameworkProfile(runId, folder);
    const scanned = scanFramework(this.options.root, folder);
    if (scanned.kind === "empty" || !scanned.commands) throw new ProfileError(`no Playwright project in ${scanned.folder}: nothing to save`);
    if (reviewedPart(shown) !== reviewedPart(await this.maskProfile(runId, scanned))) {
      throw new ProfileError("the project changed since the profile was shown (folder, kind or commands): run the profile workflow again");
    }
    const profile: SavedProfile = { version: 1, folder: scanned.folder, kind: scanned.kind, commands: scanned.commands, reviewedAt: new Date().toISOString() };
    const config = await this.configOrDefault();
    const outcome = await this.policy(config).guard(
      { target: "testCode", summary: `Save ${PROFILE_FILE} (${scanned.kind} in ${scanned.folder}, ${commandList(scanned.commands).length} command(s))`, runId },
      (grant) => writeRepoFile(grant, this.options.root, PROFILE_FILE, `${JSON.stringify(profile, null, 2)}\n`),
    );
    return outcome.status === "done" ? { status: "done" as const, profile } : { status: "declined" as const };
  }

  /** The config, or the default rules when there is no agent-qa.yaml at all. A broken one is an error. */
  private async configOrDefault(): Promise<Config> {
    try {
      return await this.loadConfig();
    } catch (error) {
      if (error instanceof ConfigError && error.code === "NOT_FOUND") return DEFAULT_RULES_CONFIG;
      throw error;
    }
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

/** A PEM key is a few KB: anything larger is not the key file. */
const MAX_KEY_BYTES = 64 * 1024;

/** The key file's absolute path: privateKeyFile, or the path its secret reference holds, against the project root. */
export async function salesforceKeyPath(sf: NonNullable<Config["salesforce"]>, root: string, secrets: SecretSources): Promise<string | undefined> {
  if (!sf.privateKeyFile) return undefined;
  const path = sf.privateKeyFile.startsWith("${") ? (await resolveSecret(sf.privateKeyFile, secrets)).trim() : sf.privateKeyFile;
  return isAbsolute(path) ? path : resolvePath(root, path);
}

/** The Salesforce private key (PEM): from its secret reference, or from privateKeyFile. */
export async function salesforceKey(sf: NonNullable<Config["salesforce"]>, root: string, secrets: SecretSources): Promise<string> {
  if (sf.privateKey) return resolveSecret(sf.privateKey, secrets);
  const path = (await salesforceKeyPath(sf, root, secrets))!;
  try {
    if ((await stat(path)).size > MAX_KEY_BYTES) throw new Error("salesforce.privateKeyFile is too large to be a PEM key");
    return await readFile(path, "utf8");
  } catch (error) {
    if (!(error as NodeJS.ErrnoException).code) throw error;
    throw new Error(`salesforce.privateKeyFile can't be read (${(error as NodeJS.ErrnoException).code})`);
  }
}
