import { realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { PROVIDER_KEY_ENV, type Config } from "../core/index.js";

/**
 * Checks for the host command runner (S2-1): which commands may run, with which
 * arguments, where, and with which environment. The workflows ask; this
 * decides; `runHostCommand` (connectors) only runs what passed.
 */

export interface HostCommandRequest {
  /** One of the allowed commands exactly, e.g. ["npx", "playwright", "test"]. */
  command: string[];
  /** Added after the command: paths inside the project and known flags. */
  args?: string[];
  /** Folder to run in, relative to the project root. Default: the root. */
  cwd?: string;
  /** What it is for, in masked text: goes to the audit log and the approval question. */
  purpose: string;
  /** Default 15 minutes. */
  timeoutMs?: number;
}

export interface HostCommandOutcome {
  exitCode: number | null;
  timedOut: boolean;
  /** Masked with the run's vault: a test log can hold names and emails. */
  stdout: string;
  stderr: string;
  truncated: boolean;
  durationMs: number;
}

export const DEFAULT_TIMEOUT_MS = 15 * 60_000;
export const MAX_TIMEOUT_MS = 60 * 60_000;
export const MAX_OUTPUT_BYTES = 256 * 1024;
/**
 * Playwright's own limit for a test run, under the kill timeout: when it is
 * reached, Playwright stops the tests itself and still writes its report, so
 * the failures so far come back. A killed run leaves no report at all
 * (Tarek's debug run, 7 Nov 2026: five tests each hung until their 3-minute
 * timeout, and the run was killed at 15 minutes with nothing to read).
 */
export const TEST_RUN_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
/** The kill limit of such a run: room after Playwright's limit for teardown (fixtures, globalTeardown, a logout) and the report. */
export const TEST_RUN_KILL_MS = TEST_RUN_TIMEOUT_MS + 5 * 60_000;

/** Flags a workflow may add, by prefix: the ones the run-and-fix loop needs. Values are checked like paths, and reporters by name. */
export const ALLOWED_FLAGS = ["--reporter=", "--retries=", "--workers=", "--grep=", "--grep-invert=", "--project=", "--repeat-each=", "--max-failures=", "--timeout=", "--global-timeout=", "--tags="];
/** Characters an argument may hold. No quotes, %, ^, !, &, |, <, > or spaces: nothing a shell or cmd.exe could read as syntax. */
const SAFE_ARG = /^[\p{L}\p{N}_@+=:,./\\-]{1,300}$/u;
const SAFE_FLAG_VALUE = /^[\p{L}\p{N}_@+=:,./\\ -]{0,300}$/u;
/** Playwright's built-in reporters: a path here would load a module from anywhere. */
export const BUILTIN_REPORTERS = ["list", "line", "dot", "json", "junit", "html", "blob", "github", "null"];

/** Relative, on this drive, with no `..`: nothing that points outside the project. */
const insideProject = (value: string) =>
  !isAbsolute(value) && !/^[A-Za-z]:/.test(value) && !/^[\\/]/.test(value) && !value.split(/[\\/]/).includes("..");

export class HostCommandRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostCommandRefused";
  }
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The folder to run in, inside the root. */
export function hostCwd(root: string, cwd = "."): string {
  const outside = (from: string, to: string) => {
    const rel = relative(from, to);
    return isAbsolute(rel) || rel.split(sep).includes("..");
  };
  const folder = resolve(root, cwd);
  if (outside(resolve(root), folder)) throw new HostCommandRefused(`${cwd} is outside the project folder`);
  let isDir = false;
  try {
    isDir = statSync(folder).isDirectory();
  } catch {
    // Reported below.
  }
  if (!isDir) throw new HostCommandRefused(`${cwd} is not a folder in the project`);
  // A symlink inside the project can point elsewhere, and the config there would run.
  if (outside(realpathSync(root), realpathSync(folder))) throw new HostCommandRefused(`${cwd} links outside the project folder`);
  return folder;
}

/**
 * The argv to run, or why not. `allowed` comes from the reviewed framework
 * profile: a command runs only if it is one of them exactly.
 */
export function checkHostCommand(request: HostCommandRequest, allowed: string[][]): string[] {
  if (!allowed.some((a) => same(a, request.command))) {
    throw new HostCommandRefused(`${request.command.join(" ")} is not a command the framework profile lists`);
  }
  const args = request.args ?? [];
  for (const arg of args) {
    if (arg.startsWith("-")) {
      const flag = ALLOWED_FLAGS.find((f) => arg.startsWith(f));
      const value = flag ? arg.slice(flag.length) : "";
      const ok =
        flag !== undefined &&
        SAFE_FLAG_VALUE.test(value) &&
        !/["%^!&<>]/.test(arg) &&
        insideProject(value) &&
        (flag !== "--reporter=" || value.split(",").every((r) => BUILTIN_REPORTERS.includes(r)));
      if (!ok) throw new HostCommandRefused(`the argument ${JSON.stringify(arg.slice(0, 40))} isn't allowed`);
      continue;
    }
    // A path: relative, inside the folder, with nothing a shell reads as syntax.
    if (!SAFE_ARG.test(arg) || !insideProject(arg)) {
      throw new HostCommandRefused(`the argument ${JSON.stringify(arg.slice(0, 40))} isn't a path inside the project`);
    }
  }
  return [...request.command, ...args];
}

/**
 * The environment for a host command: this process's, without the secrets
 * Agent-QA itself uses (model keys, every `${env:NAME}` the config names, and
 * every AGENT_QA_* variable, such as the vault key), which the tests don't need.
 * `npx` may not install a missing package: with no terminal it would do so unasked.
 * Colour codes are turned off so output reads as text.
 */
export function hostEnv(env: NodeJS.ProcessEnv, config: Config | undefined): NodeJS.ProcessEnv {
  const drop = new Set<string>(Object.values(PROVIDER_KEY_ENV).filter((v): v is string => typeof v === "string"));
  if (config) for (const m of JSON.stringify(config).matchAll(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g)) drop.add(m[1]!);
  const out: NodeJS.ProcessEnv = {};
  const upper = new Set([...drop].map((d) => d.toUpperCase()));
  for (const [name, value] of Object.entries(env)) {
    // Windows names are case-insensitive.
    if (drop.has(name) || /^AGENT_QA_/i.test(name) || /^npm_config_yes$/i.test(name) || (process.platform === "win32" && upper.has(name.toUpperCase()))) continue;
    out[name] = value;
  }
  out.npm_config_yes = "false";
  out.FORCE_COLOR = "0";
  out.NO_COLOR = "1";
  return out;
}

/**
 * The sign-in variables each headless agent CLI (S4-10) reads, kept in its
 * environment: `hostEnv` drops the model keys and every secret agent-qa.yaml
 * names, which a repo's own commands never need.
 */
export const MODEL_CLI_AUTH_ENV = {
  "claude-code": ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"],
  copilot: ["COPILOT_GITHUB_TOKEN", "GH_TOKEN"],
} as const;
export type ModelCli = keyof typeof MODEL_CLI_AUTH_ENV;

export function modelCliEnv(env: NodeJS.ProcessEnv, config: Config | undefined, agent: ModelCli): NodeJS.ProcessEnv {
  const out = hostEnv(env, config);
  // Not one agent-qa.yaml names for something else (git.token: ${env:GH_TOKEN} can write to the repo).
  const named = new Set(config ? [...JSON.stringify(config).matchAll(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]!.toUpperCase()) : []);
  for (const name of MODEL_CLI_AUTH_ENV[agent]) if (env[name] && !named.has(name)) out[name] = env[name];
  return out;
}
