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

/** After a stop request, how long the tree has to clean up (Playwright closes browsers and its web server) before SIGKILL. */
const KILL_GRACE_MS = 3_000;
/** After the program exits, how long to wait for a process it left behind to let go of the output pipes. */
const PIPE_GRACE_MS = 2_000;

/** Ends the process and everything it started (a test runner starts browsers and workers). */
function killTree(child: ReturnType<typeof spawn>): void {
  if (child.pid === undefined) return;
  if (process.platform === "win32") {
    // taskkill /T ends the whole tree. By full path: a taskkill.cmd in the current folder must not run instead.
    const taskkill = `${process.env.SystemRoot ?? "C:\\Windows"}\\System32\\taskkill.exe`;
    const killer = spawn(taskkill, ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    killer.on("error", () => child.kill("SIGKILL"));
    return;
  }
  // The child leads its own process group (detached), so this reaches its children too,
  // even after the child itself has exited. SIGTERM first, so they can clean up.
  const pid = child.pid;
  const signal = (name: NodeJS.Signals | 0) => {
    try {
      process.kill(-pid, name);
      return true;
    } catch {
      return false; // the group is gone
    }
  };
  signal("SIGTERM");
  // Then SIGKILL for whatever ignored SIGTERM, only if the group still exists (its ID is not reused while it does).
  setTimeout(() => {
    if (signal(0)) signal("SIGKILL");
  }, KILL_GRACE_MS).unref();
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
    /** Set when the program itself exits; undefined while it runs. */
    let exited: { code: number | null } | undefined;
    const timers: NodeJS.Timeout[] = [];
    const child = spawn(program, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    const finish = () => {
      if (settled) return;
      settled = true;
      for (const t of timers) clearTimeout(t);
      options.signal?.removeEventListener("abort", onAbort);
      // A process left behind may still hold the pipes: stop reading so nothing waits on it.
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve({
        // Killed while running: no exit code. A program that finished on its own keeps its code.
        exitCode: killedWhileRunning ? null : (exited?.code ?? null),
        timedOut,
        aborted,
        stdout: out.text(),
        stderr: err.text(),
        truncated: out.dropped || err.dropped,
        durationMs: Date.now() - started,
      });
    };
    let killedWhileRunning = false;
    const stop = () => {
      killedWhileRunning = true;
      killTree(child);
      // A hard limit: whatever the tree does, the call returns.
      timers.push(setTimeout(() => finish(), KILL_GRACE_MS + PIPE_GRACE_MS));
    };
    timers.push(
      setTimeout(() => {
        // Already finished on its own: the exit grace below ends the call.
        if (exited) return;
        timedOut = true;
        stop();
      }, options.timeoutMs),
    );
    const onAbort = () => {
      if (exited) return;
      aborted = true;
      stop();
    };
    if (options.signal?.aborted) onAbort();
    else options.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout?.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      for (const t of timers) clearTimeout(t);
      options.signal?.removeEventListener("abort", onAbort);
      const code = (error as NodeJS.ErrnoException).code;
      reject(new Error(code === "ENOENT" ? `${program} was not found: is it installed in the repo?` : `${program} could not start (${code ?? error.name})`));
    });
    child.on("exit", (code) => {
      exited = { code };
      // Wait briefly for the rest of the output, then return even if a leftover process keeps the pipes open.
      timers.push(
        setTimeout(() => {
          // What is left in its process group. Not on Windows: there the ID may already belong
          // to another program, and taskkill /T would end it and its children.
          if (process.platform !== "win32") killTree(child);
          finish();
        }, PIPE_GRACE_MS),
      );
    });
    child.on("close", finish);
  });
}
