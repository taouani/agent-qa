import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, open, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import type { KeyProvider } from "./keys.js";

/**
 * The token vault: maps tokens such as `<PERSON_1>` back to real values for one
 * run. Only tokens ever leave the machine; the vault never does. Each run's
 * entries are encrypted with AES-256-GCM, bound to the run id, and expire.
 */

/** Where encrypted run vaults live. The file store is local; a self-hosted server can implement this later. */
export interface VaultStorage {
  read(runId: string): Promise<string | undefined>;
  write(runId: string, blob: string): Promise<void>;
  delete(runId: string): Promise<void>;
  list(): Promise<string[]>;
}

export interface KeyLockOptions {
  /** Folder of the lock file; default the OS temp folder. */
  dir?: string;
  /** How long to wait for another process; default 10 s. */
  waitMs?: number;
  /** A lock older than this was left by a crash and is taken over; default 30 s. */
  staleMs?: number;
}

/**
 * Runs `fn` while holding a lock file shared by every Agent-QA process of
 * this OS user, so two processes that find no vault key in the keychain
 * don't each create one (the loser's vaults could never be read again).
 */
export async function withKeyCreationLock<T>(fn: () => Promise<T> | T, options: KeyLockOptions = {}): Promise<T> {
  let user = "user";
  try {
    user = userInfo().username;
  } catch {
    // No user entry (some containers): one lock for everyone on the machine.
  }
  const file = join(options.dir ?? tmpdir(), `sf-agent-qa-key-${createHash("sha256").update(user).digest("hex").slice(0, 16)}.lock`);
  const waitMs = options.waitMs ?? 10_000;
  const staleMs = options.staleMs ?? 30_000;
  const started = Date.now();
  for (;;) {
    try {
      const handle = await open(file, "wx", 0o600);
      await handle.writeFile(String(process.pid));
      await handle.close();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const age = await stat(file).then(
        (s) => Date.now() - s.mtimeMs,
        () => 0,
      );
      if (age > staleMs) {
        await rm(file, { force: true });
        continue;
      }
      if (Date.now() - started > waitMs) throw new Error(`Another Agent-QA process is creating the vault key. If none is running, delete ${file} and try again.`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  try {
    return await fn();
  } finally {
    await rm(file, { force: true });
  }
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
function checkId(runId: string): string {
  if (!SAFE_ID.test(runId) || runId.includes("..")) throw new Error(`Unsafe run id: ${runId}`);
  return runId;
}

/**
 * One encrypted file per run under `dir` (default `.agent-qa/vault/`, which must be gitignored).
 * On POSIX the folder is 0700 and files are 0600. On Windows modes have no effect: files
 * inherit the folder's ACLs, which by default allow only the user and administrators.
 */
export class FileVaultStorage implements VaultStorage {
  constructor(private readonly dir: string) {}

  private file(runId: string) {
    return join(this.dir, `${checkId(runId)}.vault`);
  }

  async read(runId: string): Promise<string | undefined> {
    try {
      return await readFile(this.file(runId), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async write(runId: string, blob: string): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    // mkdir's mode doesn't apply to a folder that already exists.
    if (process.platform !== "win32") await chmod(this.dir, 0o700);
    const target = this.file(runId);
    const tmp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      const handle = await open(tmp, "w", 0o600);
      try {
        await handle.writeFile(blob, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(tmp, target);
    } catch (error) {
      await rm(tmp, { force: true });
      throw error;
    }
  }

  async delete(runId: string): Promise<void> {
    await rm(this.file(runId), { force: true });
  }

  async list(): Promise<string[]> {
    try {
      return (await readdir(this.dir)).filter((f) => f.endsWith(".vault")).map((f) => f.slice(0, -".vault".length));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
}

export class MemoryVaultStorage implements VaultStorage {
  readonly blobs = new Map<string, string>();
  async read(runId: string) {
    return this.blobs.get(checkId(runId));
  }
  async write(runId: string, blob: string) {
    this.blobs.set(checkId(runId), blob);
  }
  async delete(runId: string) {
    this.blobs.delete(runId);
  }
  async list() {
    return [...this.blobs.keys()];
  }
}

/** A token's category, e.g. PERSON, EMAIL, PHONE, IBAN. Upper snake case. */
export type TokenKind = string;
const KIND = /^[A-Z][A-Z0-9_]*$/;
const TOKEN = /^<([A-Z][A-Z0-9_]*)_(\d+)>$/;

interface Envelope {
  v: 1;
  alg: "A256GCM";
  runId: string;
  expiresAt: string;
  iv: string;
  tag: string;
  data: string;
}

interface Plain {
  entries: Record<string, string>; // token -> value
  counters: Record<string, number>; // kind -> last number used
}

export interface VaultOptions {
  storage: VaultStorage;
  keys: KeyProvider;
  /** How long a run's vault is kept, counted from its first save. Default 30 days. */
  ttlMs?: number;
  now?: () => Date;
}

const DAY = 24 * 60 * 60 * 1000;
const TAG_BYTES = 16;
const IV_BYTES = 12;

function expiryOf(blob: string): number {
  try {
    const at = Date.parse((JSON.parse(blob) as Partial<Envelope>).expiresAt ?? "");
    return Number.isNaN(at) ? 0 : at;
  } catch {
    return 0; // not JSON: treat as expired
  }
}

export class Vault {
  private readonly ttlMs: number;
  private readonly now: () => Date;

  constructor(private readonly options: VaultOptions) {
    this.ttlMs = options.ttlMs ?? 30 * DAY;
    this.now = options.now ?? (() => new Date());
  }

  /** Open (or create) the vault for one run. Expired vaults are deleted and start empty. */
  async open(runId: string): Promise<RunVault> {
    checkId(runId);
    const blob = await this.options.storage.read(runId);
    let plain: Plain = { entries: {}, counters: {} };
    let expiresAt: string | undefined;
    if (blob) {
      let envelope: Envelope;
      try {
        envelope = JSON.parse(blob) as Envelope;
      } catch {
        throw new Error(`Vault for ${runId} can't be read: the file is not valid JSON`);
      }
      if (envelope.runId !== runId) throw new Error(`Vault file for ${runId} belongs to ${String(envelope.runId)}`);
      if (expiryOf(blob) <= this.now().getTime()) {
        await this.options.storage.delete(runId);
      } else {
        plain = this.decrypt(envelope, await this.options.keys.getKey());
        expiresAt = envelope.expiresAt;
      }
    }
    // The expiry is fixed at the first save, so a run that keeps saving still expires on time.
    expiresAt ??= new Date(this.now().getTime() + this.ttlMs).toISOString();
    const fixed = expiresAt;
    return new RunVault(runId, plain, async (p) => this.persist(runId, p, fixed));
  }

  /**
   * Delete every expired run vault. A file that isn't valid JSON or has no valid
   * expiry counts as expired. A file that can't be read is skipped and reported
   * in `failed`, so one bad file doesn't stop the purge.
   */
  async purgeExpired(): Promise<{ removed: string[]; failed: string[] }> {
    const removed: string[] = [];
    const failed: string[] = [];
    for (const runId of await this.options.storage.list()) {
      try {
        const blob = await this.options.storage.read(runId);
        if (blob === undefined) continue;
        if (expiryOf(blob) <= this.now().getTime()) {
          await this.options.storage.delete(runId);
          removed.push(runId);
        }
      } catch {
        failed.push(runId);
      }
    }
    return { removed, failed };
  }

  private async persist(runId: string, plain: Plain, expiresAt: string): Promise<void> {
    const key = await this.options.keys.getKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(Buffer.from(`${runId}|${expiresAt}`, "utf8"));
    const data = Buffer.concat([cipher.update(JSON.stringify(plain), "utf8"), cipher.final()]);
    const envelope: Envelope = {
      v: 1,
      alg: "A256GCM",
      runId,
      expiresAt,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    };
    await this.options.storage.write(runId, JSON.stringify(envelope));
  }

  private decrypt(envelope: Envelope, key: Buffer): Plain {
    if (envelope.v !== 1 || envelope.alg !== "A256GCM") throw new Error(`Unsupported vault format for ${envelope.runId}`);
    const bad = () => new Error(`Vault for ${envelope.runId} can't be decrypted: wrong key or tampered file`);
    const iv = Buffer.from(String(envelope.iv), "base64");
    const tag = Buffer.from(String(envelope.tag), "base64");
    // Without these checks, GCM accepts a truncated tag and forgery gets much easier.
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw bad();
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(`${envelope.runId}|${envelope.expiresAt}`, "utf8"));
    decipher.setAuthTag(tag);
    try {
      const text = Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64")), decipher.final()]).toString("utf8");
      return JSON.parse(text) as Plain;
    } catch {
      throw bad();
    }
  }
}

/** The vault of one run. Call `save()` to persist new tokens. */
export class RunVault {
  private readonly byValue = new Map<string, string>();
  private dirty = false;

  constructor(
    readonly runId: string,
    private readonly plain: Plain,
    private readonly persist: (plain: Plain) => Promise<void>,
  ) {
    for (const [token, value] of Object.entries(plain.entries)) this.byValue.set(this.valueKey(token, value), token);
  }

  private valueKey(tokenOrKind: string, value: string): string {
    const kind = TOKEN.exec(tokenOrKind)?.[1] ?? tokenOrKind;
    return `${kind}\u0000${value}`;
  }

  /** Token for a value. The same value of the same kind always gets the same token within a run. */
  tokenFor(kind: TokenKind, value: string): string {
    if (!KIND.test(kind)) throw new Error(`Invalid token kind: ${kind}`);
    const existing = this.byValue.get(this.valueKey(kind, value));
    if (existing) return existing;
    const n = (this.plain.counters[kind] ?? 0) + 1;
    this.plain.counters[kind] = n;
    const token = `<${kind}_${n}>`;
    this.plain.entries[token] = value;
    this.byValue.set(this.valueKey(kind, value), token);
    this.dirty = true;
    return token;
  }

  /** Real value for a token, or undefined. Only write-back with restoreOnWrite enabled should call this. */
  valueOf(token: string): string | undefined {
    return Object.hasOwn(this.plain.entries, token) ? this.plain.entries[token] : undefined;
  }

  /**
   * Every token and its value, for masking text that may echo any of them
   * (a page showing a value the explorer typed). Only masking should call this.
   */
  entries(): Array<[token: string, value: string]> {
    return Object.entries(this.plain.entries);
  }

  /** Real values of every token of one kind, e.g. the run's known people. Only masking should call this. */
  valuesOf(kind: TokenKind): string[] {
    return Object.entries(this.plain.entries)
      .filter(([token]) => TOKEN.exec(token)?.[1] === kind)
      .map(([, value]) => value);
  }

  get size(): number {
    return Object.keys(this.plain.entries).length;
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    await this.persist(this.plain);
    this.dirty = false;
  }
}
