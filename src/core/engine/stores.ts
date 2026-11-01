import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunState, StateStore } from "./types.js";

/** In-memory store, for tests and short-lived runs. Copies on read and write. */
export class MemoryStateStore implements StateStore {
  private readonly runs = new Map<string, string>();

  async load(runId: string): Promise<RunState | undefined> {
    const raw = this.runs.get(runId);
    return raw === undefined ? undefined : (JSON.parse(raw) as RunState);
  }

  async save(state: RunState): Promise<void> {
    this.runs.set(state.runId, JSON.stringify(state));
  }
}

const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * One JSON file per run under `dir`, written atomically (temp file + rename),
 * so a run survives an editor restart. T8 points `dir` at the run folders.
 */
export class FileStateStore implements StateStore {
  constructor(private readonly dir: string) {}

  private file(runId: string): string {
    if (!SAFE_RUN_ID.test(runId) || runId.includes("..")) throw new Error(`Unsafe run id: ${runId}`);
    return join(this.dir, `${runId}.state.json`);
  }

  async load(runId: string): Promise<RunState | undefined> {
    try {
      return JSON.parse(await readFile(this.file(runId), "utf8")) as RunState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async save(state: RunState): Promise<void> {
    const target = this.file(state.runId);
    await mkdir(this.dir, { recursive: true });
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
    await rename(tmp, target);
  }
}
