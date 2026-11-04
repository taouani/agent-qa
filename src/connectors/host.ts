import spawn from "cross-spawn";
import { assertGrant, type WriteGrant } from "../core/index.js";

/**
 * Runs one command in the host repo (S2-1): the test run, the type check, the
 * BDD generator. The only place in the code base that starts a process (see
 * SPAWNERS in eslint.config.js). It needs a `commands` grant from
 * `Policy.guard`; which commands may run at all is decided by the data layer,
 * from the reviewed framework profile.
 *
 * No shell: arguments are passed as they are (cross-spawn handles the Windows
 * `.cmd` shims such as `npx`), so a file name can't turn into a second command.
 */

export interface HostCommandOptions {
  /** Program and arguments, e.g. ["npx", "playwright", "test", "--reporter=json"]. */
  argv: string[];
  /** Absolute folder to run in: the host repo's Playwright project. */
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** Killed (with its child processes) after this long. */
  timeoutMs: number;
  /** Bytes kept of each of stdout and stderr: the end, where errors and summaries are. */
  maxOutputBytes: number;
  signal?: AbortSignal;
}

export interface HostCommandResult {
  /** Null when the process was killed. */
  exitCode: number | null;
  timedOut: boolean;
  /** Stopped by the caller's signal. */
  aborted: boolean;
  stdout: string;
  stderr: string;
  /** Output was longer than `maxOutputBytes` and its start was dropped. */
  truncated: boolean;
  durationMs: number;
}

/** Keeps the last `max` bytes of a stream. */
class Tail {
  private chunks: Buffer[] = [];
  private size = 0;
  dropped = false;
  constructor(private readonly max: number) {}
  push(chunk: Buffer): void {
    this.chunks.push(chunk);
    this.size += chunk.length;
    while (this.size > this.max && this.chunks.length > 0) {
      const extra = this.size - this.max;
      const first = this.chunks[0]!;
      this.dropped = true;
      if (first.length <= extra) {
        this.chunks.shift();
        this.size -= first.length;
      } else {
        this.chunks[0] = first.subarray(extra);
        this.size -= extra;
      }
    }
  }
  text(): string {
    // A cut can fall inside a UTF-8 sequence: the decoder replaces that one character.
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

/** Ends the process and everything it started (a test runner starts browsers and workers). */
function killTree(child: ReturnType<typeof spawn>): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === "win32") {
    // taskkill /T ends the whole tree; it is a system program, not a user command.
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    killer.on("error", () => child.kill("SIGKILL"));
    return;
  }
  try {
    // The child leads its own process group (detached), so this reaches its children too.
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

export async function runHostCommand(grant: WriteGrant, options: HostCommandOptions): Promise<HostCommandResult> {
  assertGrant(grant, "commands");
  const [program, ...args] = options.argv;
  if (!program) throw new Error("no command to run");
  const started = Date.now();
  const out = new Tail(options.maxOutputBytes);
  const err = new Tail(options.maxOutputBytes);

  return new Promise<HostCommandResult>((resolve, reject) => {
    let timedOut = false;
    let aborted = false;
    let settled = false;
    const child = spawn(program, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, options.timeoutMs);
    const onAbort = () => {
      aborted = true;
      killTree(child);
    };
    if (options.signal?.aborted) onAbort();
    else options.signal?.addEventListener("abort", onAbort, { once: true });
    const done = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    };

    child.stdout?.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      done();
      const code = (error as NodeJS.ErrnoException).code;
      reject(new Error(code === "ENOENT" ? `${program} was not found: is it installed in the repo?` : `${program} could not start (${code ?? error.name})`));
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      done();
      resolve({
        exitCode: timedOut || aborted ? null : exitCode,
        timedOut,
        aborted,
        stdout: out.text(),
        stderr: err.text(),
        truncated: out.dropped || err.dropped,
        durationMs: Date.now() - started,
      });
    });
  });
}
