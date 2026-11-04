import { statSync } from "node:fs";
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

/** Flags a workflow may add, by prefix: the ones the run-and-fix loop needs, nothing that loads other code. */
export const ALLOWED_FLAGS = ["--reporter=", "--retries=", "--workers=", "--grep=", "--grep-invert=", "--project=", "--repeat-each=", "--max-failures=", "--timeout=", "--tags="];
/** Characters an argument may hold. No quotes, %, ^, !, &, |, <, > or spaces: nothing a shell or cmd.exe could read as syntax. */
const SAFE_ARG = /^[\p{L}\p{N}_@+=:,./\\-]{1,300}$/u;
const SAFE_FLAG_VALUE = /^[\p{L}\p{N}_@+=:,./\\ -]{0,300}$/u;

export class HostCommandRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostCommandRefused";
  }
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The folder to run in, inside the root. */
export function hostCwd(root: string, cwd = "."): string {
  const folder = resolve(root, cwd);
  const rel = relative(resolve(root), folder);
  if (rel.startsWith("..") || isAbsolute(rel) || rel.split(sep).includes("..")) throw new HostCommandRefused(`${cwd} is outside the project folder`);
  let isDir = false;
  try {
    isDir = statSync(folder).isDirectory();
  } catch {
    // Reported below.
  }
  if (!isDir) throw new HostCommandRefused(`${cwd} is not a folder in the project`);
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
      if (!flag || !SAFE_FLAG_VALUE.test(arg.slice(flag.length)) || /["%^!&<>]/.test(arg)) throw new HostCommandRefused(`the argument ${JSON.stringify(arg.slice(0, 40))} isn't allowed`);
      continue;
    }
    // A path: relative, inside the folder, with nothing a shell reads as syntax.
    if (!SAFE_ARG.test(arg) || isAbsolute(arg) || /^[A-Za-z]:/.test(arg) || arg.split(/[\\/]/).includes("..")) {
      throw new HostCommandRefused(`the argument ${JSON.stringify(arg.slice(0, 40))} isn't a path inside the project`);
    }
  }
  return [...request.command, ...args];
}

/**
 * The environment for a host command: this process's, without the secrets
 * Agent-QA itself uses (model keys and every `${env:NAME}` the config names),
 * which the tests don't need. Colour codes are turned off so output reads as text.
 */
export function hostEnv(env: NodeJS.ProcessEnv, config: Config | undefined): NodeJS.ProcessEnv {
  const drop = new Set<string>(Object.values(PROVIDER_KEY_ENV).filter((v): v is string => typeof v === "string"));
  if (config) for (const m of JSON.stringify(config).matchAll(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g)) drop.add(m[1]!);
  const out: NodeJS.ProcessEnv = {};
  const upper = new Set([...drop].map((d) => d.toUpperCase()));
  for (const [name, value] of Object.entries(env)) {
    // Windows names are case-insensitive.
    if (drop.has(name) || (process.platform === "win32" && upper.has(name.toUpperCase()))) continue;
    out[name] = value;
  }
  out.FORCE_COLOR = "0";
  out.NO_COLOR = "1";
  return out;
}
