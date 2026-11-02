import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
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
 *
 * One process per directory: the engine's per-run lock is in memory, so two
 * MCP servers sharing a directory could overwrite each other's updates.
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
    await writeFileAtomic(this.file(state.runId), JSON.stringify(state, null, 2) + "\n");
  }
}

/**
 * Write a file atomically: temp file in the same folder, fsync, rename over the
 * target. Creates the folder. Readers see the old file or the new one, never half.
 */
export async function writeFileAtomic(target: string, text: string, mode?: number): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  const tmp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    const handle = await open(tmp, "w", mode);
    try {
      await handle.writeFile(text, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameWithRetry(tmp, target);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}

/** On Windows, rename over a file another process holds open (antivirus, indexer) can fail briefly. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 4 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * 2 ** attempt));
    }
  }
}
