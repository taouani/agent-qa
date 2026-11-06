import { basename, dirname, isAbsolute, join, relative as relativePath, resolve as resolvePath } from "node:path";
import { ConfigError, configSchema, FileAuditSink, loadConfig, Policy, PolicyDenied, resolveSecret, type AuditSink, type Config, type Mode, type RunStore, type SecretSources, type WriteGrant } from "../core/index.js";
import { ConnectorError, findTypeScript, JiraClient, createRepoFile, removeCreatedRepoFile, readPlainFile, replaceCreatedRepoFile, replaceRepoFile, withScratchFile, withScratchFolder, loadTypeScript, type CreatedRepoFile, local, runHostCommand, TypeCheckError, typeCheckFiles, type TypeDiagnostic, SalesforceAuth, writeRepoFile, XRAY_BULK_LIMIT, XrayClient, GitHubClient, BRANCH, GITHUB_API, type SalesforceSession, type ConfluenceClient, type FetchLike, type JiraInput } from "../connectors/index.js";
import { defaultKeyProvider, FileVaultStorage, keychainLookup, Vault, type RunVault } from "../masking/index.js";
import { MaskedDataService, type LoadedSources, type LoadOptions } from "./requirements.js";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath as realpathAsync, stat } from "node:fs/promises";
import {
  commandList,
  findProjectFolder,
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
import { Explorer, vaultMasker, type ExplorerTarget, type ExploreSetup, type MaskedAction, type MaskedPage, type MaskedResult, type OpenBrowser } from "./explorer.js";
import { caseLabel, caseTokens, restorer, results, toXrayTest, type ExistingTest, type PushCase, type XrayPlan, type XrayPushResult } from "./xray.js";
import { listFolderFiles, type FolderListing } from "./profile-scan.js";
import { parsePlaywrightReport, plain, type TestOutcome } from "./test-report.js";
import { maskAriaSnapshot } from "./snapshot.js";
import { hasToken, isPlainRelativePath, isProtectedPath } from "./generated-files.js";
import { isIgnored, loadIgnoreRules } from "./gitignore.js";

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

/** A file of a new repo (workflows/scaffold): `existing` says what happens when the folder has it already. */
export interface ScaffoldInput {
  path: string;
  content: string;
  existing?: "keep" | "add-lines" | undefined;
}

const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");

export interface ProfileData {
  /**
   * Scans the repo's Playwright project once per run (nothing in it runs) and
   * keeps it as framework-profile@1. Every repo text comes back masked with
   * the vault of `tokensRun` (default: the run itself), so a prompt that also
   * holds that run's cases has one meaning per token.
   */
  frameworkProfile(runId: string, folder?: string, tokensRun?: string): Promise<FrameworkProfile>;
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
  /**
   * Starts a new Playwright repo (S2-12) in a folder with no Playwright
   * project and no package.json: creates every file, never replacing one
   * (all or none), then saves agent-qa.profile.json for it, marked reviewed,
   * since the person's yes covered the commands it lists. Through
   * `Policy.guard` (target testCode), never in CI. Call it only with the
   * person's yes.
   */
  scaffoldRepo(runId: string, folder: string | undefined, kind: SavedProfile["kind"], files: (folder: string) => ReadonlyArray<ScaffoldInput>, commands: string[][], approved: boolean): Promise<{ status: "done"; written: string[]; profile: SavedProfile } | { status: "declined" }>;
  /** Why a new repo can't be started in `folder`, or undefined when it can. Paths only. */
  scaffoldBlocker(folder: string | undefined, files: ReadonlyArray<ScaffoldInput>): Promise<string | undefined>;
}

/** What script generation (S2-6) reads from the repo beyond the profile. */
export interface ScriptsData {
  /**
   * Every file in the reviewed profile's folder (relative to it), so generated
   * code never replaces one, and the symbolic links in it, which generated
   * code must not write through. Paths only, never contents, and never shown
   * to a model.
   */
  frameworkFiles(): Promise<FolderListing>;
  /**
   * Type-checks generated files (paths from the profile's folder) with the
   * repo's own TypeScript and tsconfig, laid over the repo in memory: nothing
   * is written. It loads the repo's typescript, so it runs through
   * `Policy.guard` (target commands) and needs the person's yes (`approved`).
   * Messages come back masked with `tokensRun`'s vault. "unavailable" says
   * why it couldn't run (no typescript or tsconfig in the repo).
   */
  typeCheck(runId: string, tokensRun: string, files: ReadonlyArray<{ path: string; content: string }>, approved: boolean): Promise<TypeCheckOutcome>;
  /**
   * Writes the reviewed generated files into the profile's folder through
   * `Policy.guard` (target testCode), all or none: each is created, never
   * replaced, and a failure removes the ones already created. Call it only
   * with the person's yes. In CI they go into the job's own checkout and
   * the outcome says `pullRequest`: they leave it only through
   * `openPullRequest`.
   */
  writeGeneratedFiles(runId: string, tokensRun: string, folder: string, files: ReadonlyArray<{ path: string; content: string }>, approved: boolean): Promise<WriteFilesOutcome>;
  /** Whether a type check could run at all (the policy, the repo's typescript, a tsconfig), checked without loading anything: no question is asked when it couldn't. */
  typeCheckReadiness(tokensRun: string): Promise<{ ready: true } | { ready: false; reason: string }>;
  /** Whether the generated tests could run at all (the policy, the profile's test command): no question is asked when they couldn't. */
  testRunReadiness(tokensRun: string): Promise<{ ready: true } | { ready: false; reason: string }>;
  /**
   * Runs generated tests (S2-8) with the reviewed profile's commands: its
   * generate command first (playwright-bdd's bddgen), then its test command on
   * these files only, with the JSON reporter, no retries and one worker.
   * Through `Policy.guard` (target commands), with the person's yes for this
   * run (`approved`). Everything that comes back (titles, errors, code
   * around them, page snapshots) is masked with `tokensRun`'s vault, and paths
   * are relative to the folder.
   */
  runGeneratedTests(runId: string, tokensRun: string, folder: string, request: { files: string[]; repeatEach?: number }, approved: boolean): Promise<TestRunOutcome>;
  /**
   * Replaces files this run wrote (a fix to generated code), through
   * `Policy.guard` (target testCode): each only while it still holds the bytes
   * Agent-QA wrote (`sha256`), so the person's own edits are never
   * overwritten. All or none: a failure puts back the ones already replaced.
   */
  replaceGeneratedFiles(runId: string, tokensRun: string, folder: string, files: ReadonlyArray<{ path: string; content: string; sha256: string }>, approved: boolean): Promise<WriteFilesOutcome>;
  /** Whether a pull request could be opened (CI, a git section for GitHub): no question is asked when it couldn't. */
  pullRequestReadiness(): Promise<{ ready: true; repo: string } | { ready: false; reason: string }>;
  /**
   * Opens a pull request (S2-9) with files this run wrote in CI's checkout,
   * each read back and checked against what Agent-QA wrote (`sha256`): one
   * commit on a new branch `agent-qa/<run>`, through
   * `Policy.guard` (target testCode, which in CI only ever leaves as a pull
   * request). A file with a `gitBlob` (from `readTestFiles`) changes an
   * existing file, and the base must still hold that blob; any other file
   * must be new. The title and body are masked again before they leave.
   */
  openPullRequest(runId: string, tokensRun: string, folder: string, pr: { files: ReadonlyArray<{ path: string; sha256: string; gitBlob?: string | undefined }>; title: string; body: string; draft: boolean }): Promise<PullRequestOutcome>;
}

/**
 * Reading and changing test files Agent-QA didn't write (S3-1): `debug`,
 * `review` fixes and `refactor` work on the person's own tests. Only test
 * code in the reviewed profile's folder: never a config, `package.json`,
 * `.env`, the profile or a tooling folder.
 */
export interface TestFilesData {
  /**
   * Existing files of the profile's folder (paths relative to it), masked
   * with `tokensRun`'s vault, each with the sha256 of its real bytes (what
   * `editTestFiles` checks) and its git blob id (what a pull request checks
   * on the base). A file is refused when its masked text wouldn't give back
   * exactly its bytes, so an edit can never change a value it didn't see.
   */
  readTestFiles(runId: string, tokensRun: string, folder: string, paths: readonly string[]): Promise<TestFileRead[]>;
  /**
   * Replaces existing test files with the person's reviewed edits, through
   * `Policy.guard` (target testCode): the masked content gets its real values
   * back from `tokensRun`'s vault, and each file is replaced only while it
   * still holds the bytes that were read (`sha256`). All or none: a failure
   * puts back the ones already replaced. Call it only with the person's yes,
   * after they saw the whole diff. In CI the files change in the job's own
   * checkout and leave only through `openPullRequest`.
   */
  editTestFiles(runId: string, tokensRun: string, folder: string, edits: ReadonlyArray<{ path: string; content: string; sha256: string }>, approved: boolean): Promise<EditFilesOutcome>;
}

/** A test file as a model may see it. */
export interface TestFileRead {
  path: string;
  /** Masked. */
  content: string;
  /** Of the real bytes. */
  sha256: string;
  /** git's blob id of the real bytes. */
  gitBlob: string;
}

/** done: each file and the sha256 of what it holds now, for `openPullRequest`. */
export type EditFilesOutcome = { status: "done"; written: Array<{ path: string; sha256: string }>; pullRequest?: true } | { status: "declined" };

/** The test files `editTestFiles` changes: code and Gherkin, and JSON only as test data (below). */
const TEST_FILE = /\.(?:[cm]?[jt]sx?|feature|json)$/i;
/** JSON is changed only in a test data folder: elsewhere it is mostly some tool's config. */
const TEST_DATA_DIR = /(^|\/)(test-?data|data|fixtures?|mocks?)\//i;
/** Tool configs at any depth (a monorepo's packages have their own): they run code or steer a tool. */
const TOOL_CONFIG = /(^|\/)([^/]*\.config\.[^/]+|\.[^/]*rc(\.[^/]+)?|[^/]*rc\.(json|ya?ml|[cm]?[jt]s))$/i;
/** Session state (Playwright's storageState) and other auth files: live credentials, never shown to a model. */
const AUTH_PATH = /(^|\/)(\.auth|auth|\.?sessions?|storage-?state[^/]*)(\/|$)|storage-?state[^/]*\.json$/i;
/** The largest test file read for an edit. */
const MAX_TEST_FILE_BYTES = 200_000;

export type PullRequestOutcome = { status: "done"; number: number; url: string; base: string; branch: string; draft: boolean; created: boolean } | { status: "declined" };

/** A generated test as the run saw it, masked. */
export interface MaskedTestResult {
  title: string;
  tags: string[];
  file: string;
  line: number;
  outcome: TestOutcome;
  runs: number;
  failedRuns: number;
  failure?: { message: string; snippet?: string | undefined; at?: { file: string; line: number } | undefined; snapshot?: string | undefined } | undefined;
}

export type TestRunOutcome =
  | { status: "done"; exitCode: number | null; timedOut: boolean; durationMs: number; tests: MaskedTestResult[]; errors: string[] }
  | { status: "declined" }
  | { status: "unavailable"; reason: string };

/**
 * done: the files are in the working copy. In CI that is the job's own
 * checkout, and they leave only as a pull request (`pullRequest`, S2-9).
 */
export type WriteFilesOutcome = { status: "done"; written: string[]; pullRequest?: true } | { status: "declined" };

export type TypeCheckOutcome = { status: "done"; diagnostics: TypeDiagnostic[] } | { status: "declined" } | { status: "unavailable"; reason: string };

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
  /** The type check, for tests: by default the repo's own TypeScript (connectors/typecheck.ts). */
  typeCheck?: (grant: WriteGrant, files: ReadonlyArray<{ path: string; content: string }>) => TypeDiagnostic[] | Promise<TypeDiagnostic[]>;
  /** Replace the explorer's browser, for tests. */
  browser?: OpenBrowser;
  /** Replace the GitHub client, for tests. */
  github?: (repo: string) => Pick<GitHubClient, "openPullRequest">;
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

export class DataAccess implements RequirementsData, XrayData, HostData, ProfileData, ScriptsData, TestFilesData, SalesforceData, ExplorerData {
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
    const r = await this.runProfileCommand(runId, runId, request, approved, false);
    return r.status === "done" ? { status: "done" as const, result: r.result } : r;
  }

  /** A profile command, masked with `tokensRun`'s vault; with `report`, Playwright's JSON report too (raw: parsed and masked by the caller). */
  private async runProfileCommand(runId: string, tokensRun: string, request: HostCommandRequest, approved: boolean, report: boolean): Promise<{ status: "done"; result: HostCommandOutcome; report: string | undefined } | { status: "declined" }> {
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
    const { service } = await this.run(tokensRun);
    // The profile's command, never the added arguments (a test name can be someone's text); masked all the same.
    const summary = service.maskText(`Run ${request.command.join(" ")} in ${request.cwd ?? "."} (${request.purpose})`, "host.summary");
    const run = this.options.host ?? runHostCommand;
    const env = hostEnv(this.options.env ?? process.env, config);
    const outcome = await policy.guard({ target: "commands", summary, runId }, async (grant) => {
      if (!report) return { value: await run(grant, { argv, cwd, env, timeoutMs, maxOutputBytes: MAX_OUTPUT_BYTES }), text: undefined };
      // The report goes to a file of its own: stdout can be cut, and holds the tests' own logs.
      return withScratchFile(grant, (file) => run(grant, { argv, cwd, env: { ...env, PLAYWRIGHT_JSON_OUTPUT_NAME: file, PLAYWRIGHT_JSON_OUTPUT_FILE: file }, timeoutMs, maxOutputBytes: MAX_OUTPUT_BYTES }));
    });
    if (outcome.status !== "done") return { status: "declined" as const };
    const r = outcome.value.value;
    const result: HostCommandOutcome = {
      exitCode: r.exitCode,
      timedOut: r.timedOut,
      // Colour codes and local paths go first: either can hide a value from the detectors.
      stdout: service.maskText(local(plain(r.stdout), cwd), "host.stdout"),
      stderr: service.maskText(local(plain(r.stderr), cwd), "host.stderr"),
      truncated: r.truncated,
      durationMs: r.durationMs,
    };
    await service.saveVault();
    return { status: "done" as const, result, report: outcome.value.text };
  }

  async testRunReadiness(tokensRun: string): Promise<{ ready: true } | { ready: false; reason: string }> {
    const saved = await this.savedProfile();
    if (!saved) return { ready: false, reason: "no reviewed framework profile" };
    if (!saved.commands?.test) return { ready: false, reason: await this.maskReason(tokensRun, "the reviewed profile has no test command") };
    const decision = this.policy(await this.configOrDefault()).decide("commands");
    if (decision.kind === "deny") return { ready: false, reason: `the policy doesn't allow it (${decision.reason})` };
    return { ready: true };
  }

  async runGeneratedTests(runId: string, tokensRun: string, folder: string, request: { files: string[]; repeatEach?: number }, approved: boolean): Promise<TestRunOutcome> {
    if (!approved) return { status: "declined" };
    const saved = await this.savedProfile();
    if (!saved) throw new ProfileError(`no reviewed framework profile: run the profile workflow and accept it to create ${PROFILE_FILE}`);
    if (saved.folder !== folder) throw new ProfileError(`the reviewed profile changed since the draft (${folder} then, ${saved.folder} now): run scripts again`);
    if (!saved.commands?.test) return { status: "unavailable", reason: "the reviewed profile has no test command" };
    if (request.files.length === 0) throw new ProfileError("there are no tests to run");
    for (const f of request.files) if (!isPlainRelativePath(f) || isProtectedPath(f)) throw new ProfileError(`${f} isn't a generated test file`);
    const repeat = Math.min(Math.max(Math.trunc(request.repeatEach ?? 1), 1), 10);
    const dir = hostCwd(this.options.root, saved.folder);
    const { service, vault } = await this.run(tokensRun);
    // What the app showed (an error's received text, a page snapshot): the vault's known values first, then the detectors, then cut.
    const echo = vaultMasker(vault, service, "test.error");
    const mask = (text: string, field: string, max: number) => echo.detect(local(plain(text), dir), field).slice(0, max);
    const tail = (r: HostCommandOutcome) => (r.stderr.trim() || r.stdout.trim()).slice(-3000);
    let durationMs = 0;
    if (saved.commands.generate) {
      const g = await this.runProfileCommand(runId, tokensRun, { command: saved.commands.generate, purpose: "turn the feature files into tests" }, true, false);
      if (g.status !== "done") return { status: "declined" };
      durationMs += g.result.durationMs;
      // A feature bddgen can't match to steps stops here: there is nothing to run yet.
      if (g.result.exitCode !== 0 || g.result.timedOut) {
        return { status: "done", exitCode: g.result.exitCode, timedOut: g.result.timedOut, durationMs, tests: [], errors: [`${saved.commands.generate.join(" ")} failed: ${tail(g.result)}`] };
      }
    }
    // playwright-bdd runs the specs it generated from the features: they are found by the feature's name.
    // Playwright reads file arguments as patterns: the dots are escaped, so ABC-1.feature doesn't also match ABC-1xfeature.
    const filters = saved.kind === "playwright-bdd" ? request.files.map((f) => (f.endsWith(".feature") ? posixBase(f).replace(/[.+]/g, "\\$&") : f)) : request.files;
    const args = ["--reporter=json", "--retries=0", "--workers=1", ...(repeat > 1 ? [`--repeat-each=${repeat}`] : []), ...filters];
    const t = await this.runProfileCommand(runId, tokensRun, { command: saved.commands.test, args, purpose: repeat > 1 ? `run the generated tests ${repeat} times each, to see they are stable` : "run the generated tests" }, true, true);
    if (t.status !== "done") return { status: "declined" };
    durationMs += t.result.durationMs;
    const base = { status: "done" as const, exitCode: t.result.exitCode, timedOut: t.result.timedOut, durationMs };
    let parsed;
    try {
      parsed = parsePlaywrightReport(JSON.parse(t.report ?? "null"), dir);
    } catch {
      await service.saveVault();
      return { ...base, tests: [], errors: [`no test report came back${t.result.timedOut ? " (the run timed out)" : ""}: ${tail(t.result) || "no output"}`] };
    }
    const tests: MaskedTestResult[] = [];
    for (const x of parsed.tests) {
      const raw = x.failure?.snapshot ?? (x.failure?.snapshotPath ? await readInside(dir, x.failure.snapshotPath) : undefined);
      // A page snapshot is an ARIA snapshot: field values, record names and table cells become tokens, as the explorer's do.
      // Playwright's error-context.md wraps it in a heading and a yaml fence: only the snapshot itself is masked.
      const aria = raw?.replace(/^\s*#[^\n]*\n+/, "").replace(/^\s*```[a-z]*\n/, "").replace(/\n```\s*$/, "");
      const snapshot = aria !== undefined ? maskAriaSnapshot(aria, echo, { recordPage: true }).text.slice(0, 6000) : undefined;
      tests.push({
        title: mask(x.title, "test.title", 2000),
        tags: x.tags.map((g) => mask(g, "test.tag", 200)),
        file: x.file,
        line: x.line,
        outcome: x.outcome,
        runs: x.runs,
        failedRuns: x.failedRuns,
        ...(x.failure
          ? {
              failure: {
                message: mask(x.failure.message, "test.error", 4000),
                snippet: x.failure.snippet !== undefined ? mask(x.failure.snippet, "test.snippet", 2000) : undefined,
                at: x.failure.at,
                snapshot,
              },
            }
          : {}),
      });
    }
    const errors = parsed.errors.map((e) => mask(e, "test.error", 4000));
    await service.saveVault();
    return { ...base, tests, errors };
  }

  async replaceGeneratedFiles(runId: string, tokensRun: string, folder: string, files: ReadonlyArray<{ path: string; content: string; sha256: string }>, approved: boolean): Promise<WriteFilesOutcome> {
    if (!approved) return { status: "declined" };
    const saved = await this.savedProfile();
    if (!saved) throw new ProfileError(`no reviewed framework profile: run the profile workflow and accept it to create ${PROFILE_FILE}`);
    if (saved.folder !== folder) throw new ProfileError(`the reviewed profile changed since the draft (${folder} then, ${saved.folder} now): run scripts again`);
    if (files.length === 0) throw new ProfileError("there are no files to change");
    for (const f of files) {
      if (!isPlainRelativePath(f.path)) throw new ProfileError(`${f.path} isn't a plain relative path`);
      if (isProtectedPath(f.path)) throw new ProfileError(`${f.path} is a project file Agent-QA never writes`);
      if (hasToken(f.path) || hasToken(f.content)) throw new ProfileError(`${f.path} holds a masking token: generated code never carries one`);
      if (!/^[0-9a-f]{64}$/.test(f.sha256)) throw new ProfileError(`${f.path}: no record of what Agent-QA wrote`);
    }
    if (new Set(files.map((f) => f.path.normalize("NFC").toLowerCase())).size !== files.length) throw new ProfileError("a file is listed twice");
    const { service } = await this.run(tokensRun);
    const summary = service.maskText(`Fix ${files.length} generated file(s) in ${folder}: ${files.map((f) => f.path).join(", ")}`, "write.summary").slice(0, 500);
    await service.saveVault();
    const root = hostCwd(this.options.root);
    const sha = (t: string) => createHash("sha256").update(t).digest("hex");
    let outcome;
    try {
      outcome = await this.policy(await this.configOrDefault()).guard({ target: "testCode", summary, runId }, async (grant) => {
        // In CI the grant is for the job's own checkout: the files leave it only as a pull request.
        const done: Array<{ path: string; before: string; after: string }> = [];
        try {
          for (const f of files) {
            // A file that already holds the fix (a retry after a stop halfway) is left as it is.
            const r = await replaceCreatedRepoFile(grant, this.options.root, f.path, f.content, f.sha256, folder);
            if (r.status === "replaced") done.push({ path: f.path, before: r.before, after: f.content });
          }
        } catch (error) {
          // All or none: what this call replaced gets its earlier bytes back.
          const left: string[] = [];
          for (const d of done.reverse()) await replaceCreatedRepoFile(grant, this.options.root, d.path, d.before, sha(d.after), folder).catch(() => left.push(d.path));
          throw new WriteFailed(error, left);
        }
        return { paths: files.map((f) => f.path), via: grant.via };
      });
    } catch (error) {
      if (!(error instanceof WriteFailed)) throw error;
      await service.saveVault();
      const cause = error.cause as NodeJS.ErrnoException | undefined;
      const said = cause instanceof Error ? cause.message : String(cause);
      const label = cause?.code ?? (cause instanceof Error ? cause.name : "Error");
      const why = cause instanceof PolicyDenied || said.startsWith(`${label}:`) ? said : `${label}: ${said}`;
      const left = error.left.length ? ` Agent-QA could not put back: ${error.left.join(", ")}.` : " Nothing was changed.";
      throw new ProfileError(service.maskText(local(`the fix could not be written (${why}).${left}`, root), "write.error").slice(0, 800));
    }
    if (outcome.status !== "done") return { status: "declined" };
    return { status: "done", written: outcome.value.paths, ...(outcome.value.via === "pull-request" ? { pullRequest: true as const } : {}) };
  }

  async readTestFiles(runId: string, tokensRun: string, folder: string, paths: readonly string[]): Promise<TestFileRead[]> {
    const saved = await this.savedProfile();
    if (!saved) throw new ProfileError(`no reviewed framework profile: run the profile workflow and accept it to create ${PROFILE_FILE}`);
    if (saved.folder !== folder) throw new ProfileError(`the reviewed profile changed (${folder} then, ${saved.folder} now): run the workflow again`);
    if (paths.length === 0) throw new ProfileError("there are no files to read");
    if (paths.length > 50) throw new ProfileError("at most 50 files are read at once");
    await this.checkTestPaths(folder, paths);
    const boundary = await realpathAsync(hostCwd(this.options.root, folder));
    const { vault, service } = await this.run(tokensRun);
    const restore = restorer((t) => vault.valueOf(t));
    const out: TestFileRead[] = [];
    for (const path of paths) {
      const bytes = await this.readTestFile(boundary, folder, path);
      const text = bytes.toString("utf8");
      if (!Buffer.from(text, "utf8").equals(bytes) || text.includes("\u0000")) throw new ProfileError(`${path} isn't UTF-8 text`);
      // Playwright's storageState under another name: live session cookies.
      if (/"cookies"\s*:/.test(text) && /"origins"\s*:/.test(text)) throw new ProfileError(`${path} looks like a saved browser session: Agent-QA never reads it`);
      const content = service.maskText(text, "repo.file");
      // What an edit sends back gets its values from the vault: that must give these very bytes again.
      if (restore(content) !== text) throw new ProfileError(`${path} can't be masked and put back exactly (it holds text that looks like a masking token): Agent-QA doesn't change it`);
      out.push({ path, content, sha256: createHash("sha256").update(bytes).digest("hex"), gitBlob: gitBlobId(bytes) });
    }
    await service.saveVault();
    return out;
  }

  async editTestFiles(runId: string, tokensRun: string, folder: string, edits: ReadonlyArray<{ path: string; content: string; sha256: string }>, approved: boolean): Promise<EditFilesOutcome> {
    if (!approved) return { status: "declined" };
    const saved = await this.savedProfile();
    if (!saved) throw new ProfileError(`no reviewed framework profile: run the profile workflow and accept it to create ${PROFILE_FILE}`);
    if (saved.folder !== folder) throw new ProfileError(`the reviewed profile changed (${folder} then, ${saved.folder} now): run the workflow again`);
    if (edits.length === 0) throw new ProfileError("there are no files to change");
    await this.checkTestPaths(folder, edits.map((e) => e.path));
    for (const e of edits) if (!/^[0-9a-f]{64}$/.test(e.sha256)) throw new ProfileError(`${e.path}: no record of what Agent-QA read`);
    const { vault, service } = await this.run(tokensRun);
    const restore = restorer((t) => vault.valueOf(t));
    const boundary = await realpathAsync(hostCwd(this.options.root, folder));
    const files: Array<{ path: string; content: string; sha256: string }> = [];
    for (const e of edits) {
      // The file as it is now, masked again: an edit may only keep the tokens that file holds, never bring
      // in a value of the run's other sources (a requirement's email) the person saw only as a token.
      const bytes = await this.readTestFile(boundary, folder, e.path);
      const now = bytes.toString("utf8");
      const shown = new Set(service.maskText(now, "repo.file").match(TOKEN_IN_TEXT) ?? []);
      const foreign = [...new Set(e.content.match(TOKEN_IN_TEXT) ?? [])].filter((t) => !shown.has(t) || vault.valueOf(t) === undefined);
      if (foreign.length) throw new ProfileError(`${e.path} holds ${foreign.length} masking token(s) the file didn't hold (${foreign.slice(0, 3).join(", ")}): an edit only keeps the tokens it was shown in that file`);
      const content = restore(e.content);
      // Changed since the read, unless it already holds this very edit (a retry after a stop halfway).
      if (createHash("sha256").update(bytes).digest("hex") !== e.sha256 && now !== content) throw new ProfileError(`${e.path} changed since Agent-QA read it: it is never overwritten. Nothing was changed.`);
      files.push({ path: e.path, content, sha256: e.sha256 });
    }
    const summary = service.maskText(`Change ${files.length} existing test file(s) in ${folder}: ${files.map((f) => f.path).join(", ")}`, "write.summary").slice(0, 500);
    await service.saveVault();
    const root = hostCwd(this.options.root);
    const sha = (t: string) => createHash("sha256").update(t).digest("hex");
    let outcome;
    try {
      outcome = await this.policy(await this.configOrDefault()).guard({ target: "testCode", summary, runId }, async (grant) => {
        // In CI the grant is for the job's own checkout: the files leave it only as a pull request.
        const done: Array<{ path: string; before: string; after: string }> = [];
        try {
          for (const f of files) {
            // A file that already holds the edit (a retry after a stop halfway) is left as it is.
            const r = await replaceRepoFile(grant, this.options.root, f.path, f.content, f.sha256, folder);
            if (r.status === "replaced") done.push({ path: f.path, before: r.before, after: f.content });
          }
        } catch (error) {
          // All or none: what this call replaced gets its earlier bytes back.
          const left: string[] = [];
          for (const d of done.reverse()) await replaceRepoFile(grant, this.options.root, d.path, d.before, sha(d.after), folder).catch(() => left.push(d.path));
          throw new WriteFailed(error, left);
        }
        return { via: grant.via };
      });
    } catch (error) {
      if (!(error instanceof WriteFailed)) throw error;
      await service.saveVault();
      const cause = error.cause as NodeJS.ErrnoException | undefined;
      const said = cause instanceof Error ? cause.message : String(cause);
      const label = cause?.code ?? (cause instanceof Error ? cause.name : "Error");
      const why = cause instanceof PolicyDenied || said.startsWith(`${label}:`) ? said : `${label}: ${said}`;
      const left = error.left.length ? ` Agent-QA could not put back: ${error.left.join(", ")}.` : " Nothing was changed.";
      throw new ProfileError(service.maskText(local(`the change could not be written (${why}).${left}`, root), "write.error").slice(0, 800));
    }
    if (outcome.status !== "done") return { status: "declined" };
    return { status: "done", written: files.map((f) => ({ path: f.path, sha256: sha(f.content) })), ...(outcome.value.via === "pull-request" ? { pullRequest: true as const } : {}) };
  }

  /**
   * Paths of test files Agent-QA may read for an edit and change: plain, test
   * code by their extension (JSON only in a test data folder), never a
   * project file, a tool's config at any depth, an auth or session file, or a
   * file git ignores (local state, secrets), each once.
   */
  private async checkTestPaths(folder: string, paths: readonly string[]): Promise<void> {
    const repoRoot = (await gitRoot(this.options.root)) ?? (await realpathAsync(this.options.root));
    const inRepo = (p: string) => relativePath(repoRoot, resolvePath(this.options.root, folder, p)).split(/[\\/]/).join("/");
    for (const p of paths) {
      if (!isPlainRelativePath(p)) throw new ProfileError(`${p} isn't a plain relative path`);
      const r = inRepo(p);
      if (isProtectedPath(p) || isProtectedPath(r) || TOOL_CONFIG.test(r) || posixBase(p).toLowerCase() === PROFILE_FILE) throw new ProfileError(`${p} is a project file Agent-QA never changes`);
      if (AUTH_PATH.test(r)) throw new ProfileError(`${p} looks like an auth or session file: Agent-QA never reads it`);
      if (!TEST_FILE.test(p) || (/\.json$/i.test(p) && !TEST_DATA_DIR.test(r))) throw new ProfileError(`${p} isn't a test file Agent-QA changes (code, .feature, or .json in a test data folder)`);
      if (hasToken(p)) throw new ProfileError(`${p} holds a masking token`);
    }
    if (new Set(paths.map((p) => p.normalize("NFC").toLowerCase())).size !== paths.length) throw new ProfileError("a file is listed twice");
    const targets = paths.map(inRepo);
    const rules = await loadIgnoreRules(repoRoot, targets);
    const ignored = targets.filter((t) => isIgnored(rules, t));
    if (ignored.length) throw new ProfileError(`${ignored.slice(0, 5).join(", ")}: git ignores it, so it is local state Agent-QA never reads`);
  }

  /**
   * A test file's real bytes, read through no link: the file itself must be
   * plain (O_NOFOLLOW where the system has it) and resolve inside the folder.
   */
  private async readTestFile(boundary: string, folder: string, path: string): Promise<Buffer> {
    const full = resolvePath(boundary, path);
    const info = await lstat(full).catch(() => undefined);
    if (!info?.isFile()) throw new ProfileError(`${path} isn't a plain file in ${folder}`);
    const real = join(await realpathAsync(dirname(full)), basename(full));
    const rel = relativePath(boundary, real);
    if (!rel || isAbsolute(rel) || rel.split(/[\\/]/).includes("..")) throw new ProfileError(`${path} is outside ${folder}`);
    if (info.size > MAX_TEST_FILE_BYTES) throw new ProfileError(`${path} is over ${MAX_TEST_FILE_BYTES / 1000} KB: too large to change`);
    // A link put in its place since the check: refused by the open itself.
    const bytes = await readPlainFile(real, MAX_TEST_FILE_BYTES);
    if (!bytes) throw new ProfileError(`${path} isn't a plain file in ${folder}`);
    return bytes;
  }

  async pullRequestReadiness(): Promise<{ ready: true; repo: string } | { ready: false; reason: string }> {
    if ((this.options.mode ?? "ide") !== "ci") return { ready: false, reason: "pull requests are opened from CI only (agent-qa run --ci)" };
    const git = (await this.configOrDefault()).git;
    if (!git) return { ready: false, reason: "agent-qa.yaml has no git section (platform: github, repo: owner/name, token)" };
    if (git.platform !== "github") return { ready: false, reason: `pull requests on ${git.platform} aren't supported yet: GitHub only` };
    if (this.policy(await this.configOrDefault()).decide("testCode").kind !== "pull-request") return { ready: false, reason: "the policy doesn't allow test code to leave (policy.writes.testCode)" };
    return { ready: true, repo: git.repo };
  }

  async openPullRequest(runId: string, tokensRun: string, folder: string, pr: { files: ReadonlyArray<{ path: string; sha256: string; gitBlob?: string | undefined }>; title: string; body: string; draft: boolean }): Promise<PullRequestOutcome> {
    const ready = await this.pullRequestReadiness();
    if (!ready.ready) throw new ProfileError(ready.reason);
    const config = await this.configOrDefault();
    const git = config.git!;
    const saved = await this.savedProfile();
    if (!saved) throw new ProfileError(`no reviewed framework profile: run the profile workflow and accept it to create ${PROFILE_FILE}`);
    if (saved.folder !== folder) throw new ProfileError(`the reviewed profile changed since the files were written (${folder} then, ${saved.folder} now): run scripts again`);
    if (pr.files.length === 0) throw new ProfileError("there are no files for a pull request");
    // A changed file (S3-1) leaves only as editTestFiles could have written it.
    const changed = pr.files.filter((f) => f.gitBlob !== undefined).map((f) => f.path);
    if (changed.length) await this.checkTestPaths(folder, changed);
    const repoRoot = await gitRoot(this.options.root);
    if (!repoRoot) throw new ProfileError("the project folder isn't in a git checkout");
    // What leaves is what Agent-QA wrote: each file read back and checked, as a plain file where the person approved it.
    const boundary = await realpathAsync(resolvePath(this.options.root, folder));
    const files: Array<{ path: string; content: string; base?: string }> = [];
    for (const f of pr.files) {
      if (!isPlainRelativePath(f.path)) throw new ProfileError(`${f.path} isn't a plain relative path`);
      if (isProtectedPath(f.path)) throw new ProfileError(`${f.path} is a project file Agent-QA never writes`);
      const full = resolvePath(this.options.root, folder, f.path);
      // A link in its place (the tests ran repo code since) would send another file, under another path.
      const info = await lstat(full).catch(() => undefined);
      if (!info?.isFile()) throw new ProfileError(`${f.path} isn't a plain file in the checkout any more`);
      const real = join(await realpathAsync(dirname(full)), basename(full));
      const inFolder = relativePath(boundary, real);
      if (!inFolder || isAbsolute(inFolder) || inFolder.split(/[\\/]/).includes("..")) throw new ProfileError(`${f.path} is outside the approved folder`);
      const content = await readInside(boundary, real);
      if (content === undefined) throw new ProfileError(`${f.path} can't be read back from the checkout`);
      if (createHash("sha256").update(content).digest("hex") !== f.sha256) throw new ProfileError(`${f.path} changed since Agent-QA wrote it: only what Agent-QA wrote leaves`);
      if (hasToken(content)) throw new ProfileError(`${f.path} holds a masking token: generated code never carries one`);
      const inRepo = relativePath(repoRoot, real).split(/[\\/]/).join("/");
      if (!inRepo || inRepo.startsWith("../") || isAbsolute(inRepo)) throw new ProfileError(`${f.path} is outside the git checkout`);
      if (isProtectedPath(inRepo) || hasToken(inRepo)) throw new ProfileError(`${inRepo} is a project file Agent-QA never writes`);
      if (f.gitBlob !== undefined && !/^[0-9a-f]{40}$/.test(f.gitBlob)) throw new ProfileError(`${f.path}: not a git blob id`);
      // A changed file (S3-1) names the blob it was read as: the base must still hold it.
      files.push({ path: inRepo, content, ...(f.gitBlob ? { base: f.gitBlob } : {}) });
    }
    const { service } = await this.run(tokensRun);
    const title = service.maskText(pr.title, "pr.title").replace(/\s+/g, " ").slice(0, 200);
    // Text from the model and the run: no mentions, links, images or tags (a token like <PERSON_1> would vanish as one).
    const body = mdSafe(service.maskText(pr.body, "pr.body")).slice(0, 60_000);
    const summary = service.maskText(`Open a pull request on ${git.repo} with ${files.length} file(s): ${files.map((f) => f.path).join(", ")}`, "write.summary").slice(0, 500);
    await service.saveVault();
    const env = this.options.env ?? process.env;
    // The branch the job checked out: a pull request's base, else the pushed branch; else the repo's default.
    const base = prBase(env);
    // The token goes only to the API this job runs against.
    const api = git.baseUrl ?? GITHUB_API;
    if (env.GITHUB_API_URL && new URL(env.GITHUB_API_URL).origin !== new URL(api).origin) throw new ProfileError(`git.baseUrl (${new URL(api).origin}) isn't the API this job runs against (${new URL(env.GITHUB_API_URL).origin})`);
    const branch = `agent-qa/${runId.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "")}`.slice(0, 200);
    if (!BRANCH.test(branch)) throw new ProfileError("the run's id doesn't make a branch name");
    const client = this.options.github
      ? this.options.github(git.repo)
      : new GitHubClient({ repo: git.repo, token: await resolveSecret(git.token, this.secrets()), ...(git.baseUrl ? { baseUrl: git.baseUrl } : {}), ...(this.options.fetch ? { fetch: this.options.fetch } : {}) });
    let outcome;
    try {
      outcome = await this.policy(config).guard({ target: "testCode", summary, runId }, async (grant) => {
        if (grant.via !== "pull-request") throw new PolicyDenied("testCode", "pull requests are opened from CI only");
        return client.openPullRequest(grant, { base, branch, files, message: title, title, body, draft: pr.draft });
      });
    } catch (error) {
      if (error instanceof ConnectorError && (error.code === "FORBIDDEN" || error.code === "AUTH")) {
        throw new ProfileError(`GitHub refused the token (${error.status ?? error.code}): give the job permissions contents: write and pull-requests: write, and allow GitHub Actions to create pull requests (Settings, Actions, General)`);
      }
      if (error instanceof ConnectorError || error instanceof PolicyDenied) throw error;
      throw new ProfileError(service.maskText(local(`the pull request could not be opened (${error instanceof Error ? error.message : String(error)})`, hostCwd(this.options.root)), "write.error").slice(0, 800));
    }
    if (outcome.status !== "done") return { status: "declined" };
    return { status: "done", ...outcome.value };
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

  async frameworkProfile(runId: string, folder?: string, tokensRun = runId): Promise<FrameworkProfile> {
    // Scanned once per run: the question, the review and the save all use what the person saw.
    let pending = this.profiles.get(runId);
    if (!pending) {
      pending = (async () => {
        const cached = await this.options.store.readArtifact(runId, FRAMEWORK_PROFILE_SPEC);
        if (cached) return cached.data;
        const masked = await this.maskProfile(tokensRun, scanFramework(this.options.root, folder));
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
      steps: steps.map(({ keyword, kind: k, line, flags, ...s }) => ({ keyword, kind: k, line, ...(flags ? { flags } : {}), ...mask(s, "profile.step") })),
    } as FrameworkProfile;
    await service.saveVault();
    return masked;
  }

  async typeCheckReadiness(tokensRun: string): Promise<{ ready: true } | { ready: false; reason: string }> {
    const saved = await this.savedProfile();
    if (!saved) return { ready: false, reason: "no reviewed framework profile" };
    const decision = this.policy(await this.configOrDefault()).decide("commands");
    if (decision.kind === "deny") return { ready: false, reason: `the policy doesn't allow it (${decision.reason})` };
    if (this.options.typeCheck) return { ready: true };
    const found = findTypeScript(hostCwd(this.options.root, saved.folder), hostCwd(this.options.root));
    if ("reason" in found) return { ready: false, reason: await this.maskReason(tokensRun, found.reason) };
    return { ready: true };
  }

  private async maskReason(tokensRun: string, reason: string): Promise<string> {
    const { service } = await this.run(tokensRun);
    const masked = service.maskText(reason, "typecheck.reason");
    await service.saveVault();
    return masked;
  }

  async typeCheck(runId: string, tokensRun: string, files: ReadonlyArray<{ path: string; content: string }>, approved: boolean): Promise<TypeCheckOutcome> {
    if (!approved) return { status: "declined" };
    const saved = await this.savedProfile();
    if (!saved) throw new ProfileError(`no reviewed framework profile: run the profile workflow and accept it to create ${PROFILE_FILE}`);
    const folder = hostCwd(this.options.root, saved.folder);
    const config = await this.configOrDefault();
    const check = this.options.typeCheck ?? ((grant: WriteGrant, f: typeof files) => typeCheckFiles(loadTypeScript(grant, folder, hostCwd(this.options.root)).ts, folder, f));
    const { service } = await this.run(tokensRun);
    const summary = service.maskText(`Type-check ${files.length} generated file(s) with the repo's TypeScript in ${saved.folder}`, "host.summary");
    let outcome;
    try {
      outcome = await this.policy(config).guard({ target: "commands", summary, runId }, async (grant) => check(grant, files));
    } catch (error) {
      // Whatever stops the check (the policy, the repo's typescript, the compiler itself), the code is kept unchecked and says why:
      // an error here would leave the step unable to finish.
      const reason =
        error instanceof TypeCheckError
          ? error.message
          : error instanceof PolicyDenied
            ? "the policy doesn't allow running the repo's TypeScript (policy.writes.commands)"
            : `the repo's TypeScript failed (${error instanceof Error && /^[A-Za-z]{1,40}$/.test(error.name) ? error.name : "Error"})`;
      return { status: "unavailable", reason: await this.maskReason(tokensRun, local(reason, folder)) };
    }
    if (outcome.status !== "done") return { status: "declined" };
    const diagnostics = outcome.value.map((d) => ({ ...d, message: service.maskText(local(d.message, folder), "typecheck.message") }));
    await service.saveVault();
    return { status: "done", diagnostics };
  }

  async writeGeneratedFiles(runId: string, tokensRun: string, folder: string, files: ReadonlyArray<{ path: string; content: string }>, approved: boolean): Promise<WriteFilesOutcome> {
    if (!approved) return { status: "declined" };
    const saved = await this.savedProfile();
    if (!saved) throw new ProfileError(`no reviewed framework profile: run the profile workflow and accept it to create ${PROFILE_FILE}`);
    // The files go where the person was told, or nowhere: a profile saved since the draft points elsewhere.
    if (saved.folder !== folder) throw new ProfileError(`the reviewed profile changed since the draft (${folder} then, ${saved.folder} now): run scripts again`);
    if (files.length === 0) throw new ProfileError("there are no files to write");
    // Checked again here, whatever the workflow checked: the data layer is the last word on what reaches the repo.
    for (const f of files) {
      if (!isPlainRelativePath(f.path)) throw new ProfileError(`${f.path} isn't a plain relative path`);
      if (isProtectedPath(f.path)) throw new ProfileError(`${f.path} is a project file Agent-QA never writes`);
      if (hasToken(f.path) || hasToken(f.content)) throw new ProfileError(`${f.path} holds a masking token: generated code never carries one`);
    }
    const keys = new Set(files.map((f) => f.path.normalize("NFC").toLowerCase()));
    if (keys.size !== files.length) throw new ProfileError("a file is listed twice");
    const { service } = await this.run(tokensRun);
    const summary = service.maskText(`Write ${files.length} new file(s) to ${folder}: ${files.map((f) => f.path).join(", ")}`, "write.summary").slice(0, 500);
    await service.saveVault();
    const root = hostCwd(this.options.root);
    let outcome;
    try {
      outcome = await this.policy(await this.configOrDefault()).guard({ target: "testCode", summary, runId }, async (grant) => {
        // In CI the grant is for the job's own checkout: the files leave it only as a pull request.
        const created: CreatedRepoFile[] = [];
        try {
          // A file that already holds the same bytes counts as written: a write that stopped halfway can run again.
          for (const f of files) {
            const r = await createRepoFile(grant, this.options.root, f.path, f.content, folder);
            if (r.status === "created") created.push(r.file);
          }
        } catch (error) {
          // All or none: what this write created goes again, and anything that can't go is named.
          const left: string[] = [];
          for (const c of created.reverse()) await removeCreatedRepoFile(grant, this.options.root, c).catch(() => left.push(c.path));
          throw new WriteFailed(error, left);
        }
        return { paths: files.map((f) => f.path), via: grant.via };
      });
    } catch (error) {
      if (!(error instanceof WriteFailed)) throw error;
      const cause = error.cause as NodeJS.ErrnoException | undefined;
      const said = cause instanceof Error ? cause.message : String(cause);
      const label = cause?.code ?? (cause instanceof Error ? cause.name : "Error");
      const why = cause instanceof PolicyDenied || said.startsWith(`${label}:`) ? said : `${label}: ${said}`;
      await service.saveVault();
      const left = error.left.length ? ` Agent-QA could not remove what it had written: ${error.left.join(", ")}.` : " Nothing new was written.";
      throw new ProfileError(service.maskText(local(`the files could not be written (${why}).${left}`, root), "write.error").slice(0, 800));
    }
    if (outcome.status !== "done") return { status: "declined" };
    return { status: "done", written: outcome.value.paths, ...(outcome.value.via === "pull-request" ? { pullRequest: true as const } : {}) };
  }

  async frameworkFiles(): Promise<FolderListing> {
    const saved = await this.savedProfile();
    if (!saved) throw new ProfileError(`no reviewed framework profile: run the profile workflow and accept it to create ${PROFILE_FILE}`);
    return listFolderFiles(hostCwd(this.options.root, saved.folder));
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

  async scaffoldBlocker(folder: string | undefined, files: ReadonlyArray<ScaffoldInput>): Promise<string | undefined> {
    return (await this.scaffoldTarget(folder, files)).blocked;
  }

  /** The folder a new repo would go in, or why none can. */
  private scaffoldFolder(folder: string | undefined): { folder: string; blocked?: string } {
    if ((this.options.mode ?? "ide") === "ci") return { folder: ".", blocked: "a new repo is started from the IDE or the terminal, never in CI" };
    if (folder !== undefined && folder !== "." && !isPlainRelativePath(folder)) return { folder: ".", blocked: "the folder isn't a plain relative path" };
    try {
      return { folder: findProjectFolder(this.options.root, folder) };
    } catch {
      return { folder: ".", blocked: folder !== undefined ? "the folder doesn't exist inside the project" : "the project already holds more than one Playwright project" };
    }
  }

  /**
   * Where a new repo would go, and why it can't, if it can't. Reads no run:
   * a workflow's first step asks this before its run exists. The reasons name
   * no folder, since they reach the host model unmasked. Only files the repo
   * would create count: one it keeps or adds lines to may exist.
   */
  private async scaffoldTarget(folder: string | undefined, files: ReadonlyArray<ScaffoldInput>): Promise<{ folder: string; blocked?: string }> {
    const target = this.scaffoldFolder(folder);
    if (target.blocked) return target;
    const rel = target.folder;
    // Whether it exists, not whether it parses: a broken one is repaired by the review, not by a new repo.
    if (await lstat(join(hostCwd(this.options.root), PROFILE_FILE)).then(() => true, () => false)) return { folder: rel, blocked: `${PROFILE_FILE} exists already: this project has a reviewed Playwright profile` };
    const scanned = scanFramework(this.options.root, rel);
    if (scanned.kind !== "empty") return { folder: rel, blocked: `the folder already holds a ${scanned.kind} project` };
    const dir = hostCwd(this.options.root, rel);
    const taken: string[] = [];
    for (const f of [{ path: "package.json" }, ...files.filter((f) => !f.existing)]) {
      if (await lstat(join(dir, f.path)).then(() => true, () => false)) taken.push(f.path);
    }
    for (const f of files.filter((f) => f.existing)) {
      const info = await lstat(join(dir, f.path)).catch(() => undefined);
      if (info && !info.isFile()) taken.push(f.path);
    }
    if (taken.length) return { folder: rel, blocked: `the folder already has ${[...new Set(taken)].slice(0, 10).join(", ")}: a new repo only goes into a folder without them` };
    return { folder: rel };
  }

  /**
   * Creates a new repo's files and saves its profile, after the person's yes
   * (S2-12). New files only, except a `.gitignore` that gains its missing
   * lines. A yes given again after a crash finishes the job: files that hold
   * the template's bytes, and a profile equal to the one it would save, are
   * left as they are. On a failure, what this call wrote is undone.
   * `commands` are the ones the person was shown: anything else is refused.
   */
  async scaffoldRepo(runId: string, wanted: string | undefined, kind: SavedProfile["kind"], filesFor: (folder: string) => ReadonlyArray<ScaffoldInput>, commands: string[][], approved: boolean) {
    if (!approved) return { status: "declined" as const };
    const target = this.scaffoldFolder(wanted);
    if (target.blocked) throw new ProfileError(target.blocked);
    const folder = target.folder;
    const files = filesFor(folder);
    if (files.length === 0) throw new ProfileError("there are no files to write");
    const keys = new Set<string>();
    for (const f of files) {
      if (!isPlainRelativePath(f.path)) throw new ProfileError(`${f.path} isn't a plain relative path`);
      if (/^(?:\.git|\.agent-qa|node_modules)(?:\/|$)/i.test(f.path) || f.path.toLowerCase() === PROFILE_FILE) throw new ProfileError(`${f.path} is never part of a new repo`);
      if (hasToken(f.path) || hasToken(f.content)) throw new ProfileError(`${f.path} holds a masking token`);
      const key = f.path.normalize("NFC").toLowerCase();
      if (keys.has(key)) throw new ProfileError("a file is listed twice");
      keys.add(key);
    }
    const dir = hostCwd(this.options.root, folder);
    const read = (path: string) => readFile(path, "utf8").then((t) => t, () => undefined);
    // Files of an earlier, interrupted yes hold the template's bytes; anything else stops it.
    const differ: string[] = [];
    for (const f of [...files.filter((f) => !f.existing)]) {
      const now = await read(join(dir, f.path));
      if (now !== undefined && now !== f.content) differ.push(f.path);
      else if (now === undefined && (await lstat(join(dir, f.path)).then(() => true, () => false))) differ.push(f.path);
    }
    if (differ.length) throw new ProfileError(`the folder already has ${differ.slice(0, 10).join(", ")}: a new repo only goes into a folder without them`);
    const pkg = files.find((f) => f.path === "package.json");
    if (!pkg) throw new ProfileError("a new repo needs a package.json");
    const ours = (await read(join(dir, "package.json"))) === pkg.content;
    if (!ours && scanFramework(this.options.root, folder).kind !== "empty") throw new ProfileError("the folder already holds a Playwright project");
    const profilePath = join(hostCwd(this.options.root), PROFILE_FILE);
    const savedText = await read(profilePath);
    const same = (p: SavedProfile | undefined) => p !== undefined && p.folder === folder && p.kind === kind && JSON.stringify(commandList(p.commands)) === JSON.stringify(commands);
    let saved: SavedProfile | undefined;
    if (savedText !== undefined || (await lstat(profilePath).then(() => true, () => false))) {
      saved = await this.savedProfile().catch(() => undefined);
      // Only the profile this very repo would get, left by an interrupted yes.
      if (!ours || !same(saved)) throw new ProfileError(`${PROFILE_FILE} exists already: this project has a reviewed Playwright profile`);
    }
    const config = await this.configOrDefault();
    const outcome = await this.policy(config).guard({ target: "testCode", summary: `Start a new ${kind} repo in ${folder}: ${files.length} file(s) and ${PROFILE_FILE}`, runId }, async (grant) => {
      // A new repo is the person's own act in their IDE: never from CI's checkout.
      if (grant.via !== "direct") throw new PolicyDenied("testCode", "a new repo is never started from CI");
      const created: CreatedRepoFile[] = [];
      const changed: Array<{ path: string; before: string; after: string }> = [];
      const written: string[] = [];
      try {
        for (const f of files) {
          // Paths are relative to the folder, which bounds every write.
          const now = f.existing ? await read(join(dir, f.path)) : undefined;
          if (now !== undefined && f.existing === "keep") continue;
          if (now !== undefined && f.existing === "add-lines") {
            const have = new Set(now.split(/\r?\n/).map((l) => l.trim()));
            const missing = f.content.split("\n").filter((l) => l.trim() && !have.has(l.trim()));
            if (!missing.length) continue;
            const after = `${now}${now.endsWith("\n") || now === "" ? "" : "\n"}${missing.join("\n")}\n`;
            const r = await replaceCreatedRepoFile(grant, this.options.root, f.path, after, sha256(now), folder);
            if (r.status === "replaced") changed.push({ path: f.path, before: r.before, after });
            written.push(f.path);
            continue;
          }
          const r = await createRepoFile(grant, this.options.root, f.path, f.content, folder);
          if (r.status === "created") created.push(r.file);
          written.push(f.path);
        }
        const scanned = scanFramework(this.options.root, folder);
        if (scanned.kind !== kind || !scanned.commands) throw new ProfileError(`the new repo reads as ${scanned.kind}, not ${kind}`);
        if (JSON.stringify(commandList(scanned.commands)) !== JSON.stringify(commands)) throw new ProfileError("the new repo's commands are not the ones you were shown");
        let profile: SavedProfile = { version: 1, folder: scanned.folder, kind, commands: scanned.commands, reviewedAt: new Date().toISOString() };
        if (saved) profile = saved;
        else {
          // Created, never replaced: a profile saved meanwhile (another window's review) stops this.
          const r = await createRepoFile(grant, this.options.root, PROFILE_FILE, `${JSON.stringify(profile, null, 2)}\n`, ".");
          if (r.status === "created") created.push(r.file);
        }
        return { written, profile };
      } catch (error) {
        const left: string[] = [];
        for (const c of created.reverse()) await removeCreatedRepoFile(grant, this.options.root, c).catch(() => left.push(c.path));
        for (const c of changed.reverse()) await replaceCreatedRepoFile(grant, this.options.root, c.path, c.before, sha256(c.after), folder).catch(() => left.push(c.path));
        const why = error instanceof Error ? error.message : String(error);
        const text = local(`the new repo could not be written (${why}).${left.length ? ` Agent-QA could not undo: ${left.join(", ")}.` : " What this attempt wrote was undone."}`, hostCwd(this.options.root));
        const masked = await this.run(runId).then(
          async ({ service }) => {
            const m = service.maskText(text, "scaffold.error");
            await service.saveVault();
            return m;
          },
          () => text,
        );
        throw new ProfileError(masked.slice(0, 800));
      }
    });
    return outcome.status === "done" ? { status: "done" as const, ...outcome.value } : { status: "declined" as const };
  }

  /**
   * Runs `run` with a new, empty folder that is removed afterwards (S2-10):
   * the harness's stand-in repo, where a DataAccess rooted there scaffolds,
   * writes and runs generated tests exactly as in a person's repo; with
   * `nodeModules`, using that node_modules folder. A `testCode` write,
   * through the policy layer.
   */
  async withScratchRepo<T>(runId: string, run: (dir: string) => Promise<T>, nodeModules?: string): Promise<T> {
    const config = await this.configOrDefault();
    const outcome = await this.policy(config).guard({ target: "testCode", summary: "A scratch repo in the system's temp folder, removed afterwards", runId }, (grant) => withScratchFolder(grant, run, nodeModules));
    if (outcome.status !== "done") throw new PolicyDenied("testCode", "the policy said no to a scratch repo");
    return outcome.value;
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

/** A write of generated files that stopped, with what its rollback couldn't remove. */
class WriteFailed extends Error {
  constructor(
    cause: unknown,
    readonly left: string[],
  ) {
    super("the write failed", { cause });
  }
}

const posixBase = (p: string) => p.slice(p.lastIndexOf("/") + 1);

/** A masking token in text, as the masker writes it. */
const TOKEN_IN_TEXT = /<[A-Z][A-Z0-9_]*_\d+>/g;

/** git's id for a blob of these bytes (SHA-1 object format). */
export function gitBlobId(bytes: Buffer): string {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

/**
 * The branch a CI pull request goes into: the branch the job's code came
 * from. On a pull_request event that is the PR's own branch (the tests ran
 * on its code); else the pushed branch. A tag, a merge queue's temporary
 * branch, or nothing: the repo's default branch (undefined).
 */
export function prBase(env: NodeJS.ProcessEnv): string | undefined {
  const branch = env.GITHUB_HEAD_REF || (env.GITHUB_REF?.startsWith("refs/heads/") ? env.GITHUB_REF.slice("refs/heads/".length) : "");
  if (!branch || branch.startsWith("gh-readonly-queue/")) return undefined;
  return branch;
}

/** Markdown that GitHub shows as written: no @mentions, links, images or HTML tags. */
export function mdSafe(text: string): string {
  return text.replace(/[<>[\]]/g, (c) => `\\${c}`).replace(/@(?=[A-Za-z0-9])/g, "@\u200b");
}

/** The git checkout holding `dir`: the nearest folder up with a .git (a folder, or a file in a worktree). */
async function gitRoot(dir: string): Promise<string | undefined> {
  let at = await realpathAsync(dir).catch(() => undefined);
  while (at) {
    if (await stat(join(at, ".git")).then(() => true, () => false)) return at;
    const up = resolvePath(at, "..");
    if (up === at) return undefined;
    at = up;
  }
  return undefined;
}

/** A file the test run left inside the folder (a page snapshot), at most 200 KB; nothing outside it. */
async function readInside(folder: string, path: string): Promise<string | undefined> {
  try {
    const real = await realpathAsync(path);
    const rel = relativePath(await realpathAsync(folder), real);
    if (rel === "" || isAbsolute(rel) || rel.split(/[\\/]/).includes("..")) return undefined;
    if ((await stat(real)).size > 200_000) return undefined;
    return await readFile(real, "utf8");
  } catch {
    return undefined;
  }
}
