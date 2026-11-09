import { randomBytes } from "node:crypto";
import { withKeyCreationLock } from "./vault.js";

/** Supplies the 32-byte AES key that encrypts the token vault. */
export interface KeyProvider {
  /** Returns the key, creating and storing one on first use if the provider can. */
  getKey(): Promise<Buffer>;
  readonly description: string;
}

export const VAULT_KEY_ENV = "AGENT_QA_VAULT_KEY";
const KEYCHAIN_SERVICE = "sf-agent-qa";
const KEYCHAIN_ACCOUNT = "vault-key";

function decodeKey(encoded: string, where: string): Buffer {
  const key = Buffer.from(encoded.trim(), "base64");
  if (key.length !== 32) throw new Error(`${where} must be 32 bytes, base64-encoded (got ${key.length} bytes)`);
  return key;
}

/** Key from an environment variable, for CI. Generate one with `openssl rand -base64 32`. */
export class EnvKeyProvider implements KeyProvider {
  readonly description: string;
  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly name = VAULT_KEY_ENV,
  ) {
    this.description = `environment variable ${name}`;
  }

  async getKey(): Promise<Buffer> {
    const value = this.env[this.name];
    if (!value) throw new Error(`${this.name} is not set`);
    return decodeKey(value, this.name);
  }
}

/** Minimal shape of `@napi-rs/keyring`'s Entry, so tests can pass a fake. */
export interface KeyringEntry {
  getPassword(): string | null | undefined;
  setPassword(password: string): void;
  /** True when an entry was removed. */
  deletePassword?(): boolean;
}
/** `@napi-rs/keyring`'s entry options: on Linux, the store an entry must live in. */
export interface KeyringOptions {
  linux?: { store?: "secret-service" | "keyutils" };
}
export type KeyringFactory = (service: string, account: string, options?: KeyringOptions) => KeyringEntry | Promise<KeyringEntry>;

/**
 * Config secrets live only in Secret Service on Linux. Without the pin, the
 * keyring falls back to the kernel keyring, which a headless box empties when
 * the process's session ends: a secret would be "stored" and then gone.
 */
const SECRET_ENTRY: KeyringOptions = { linux: { store: "secret-service" } };

/** Loads `@napi-rs/keyring` lazily: it's an optional native dependency. */
export const defaultKeyringFactory: KeyringFactory = async (service, account, options) => {
  let mod: { Entry: new (s: string, a: string, o?: KeyringOptions) => KeyringEntry };
  try {
    mod = (await import("@napi-rs/keyring")) as unknown as typeof mod;
  } catch {
    throw new Error("OS keychain support is not installed; reinstall without --omit=optional");
  }
  return options ? new mod.Entry(service, account, options) : new mod.Entry(service, account);
};

function unavailable(detail: string): Error {
  return new Error(
    `The OS keychain can't be used for the vault key (${detail}). ` +
      `Set ${VAULT_KEY_ENV} instead; generate one with: openssl rand -base64 32`,
  );
}

/** Key kept in the OS keychain (macOS Keychain, Windows Credential Manager, Secret Service). */
export class KeychainKeyProvider implements KeyProvider {
  readonly description = `OS keychain (${KEYCHAIN_SERVICE}/${KEYCHAIN_ACCOUNT})`;
  private cached: Buffer | undefined;

  constructor(
    private readonly factory: KeyringFactory = defaultKeyringFactory,
    /** Held while a missing key is created; shared by this user's Agent-QA processes. */
    private readonly lock: <T>(fn: () => Promise<T> | T) => Promise<T> = withKeyCreationLock,
  ) {}

  async getKey(): Promise<Buffer> {
    if (this.cached) return this.cached;
    let entry: KeyringEntry;
    try {
      entry = await this.factory(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    } catch (error) {
      throw unavailable(error instanceof Error ? error.message : String(error));
    }
    let stored = this.keychain(() => entry.getPassword());
    if (!stored) {
      // Created under a lock, checking again inside it: another process may have just made one.
      stored = await this.lock(() => {
        const now = this.keychain(() => entry.getPassword());
        if (now) return now;
        this.keychain(() => entry.setPassword(randomBytes(32).toString("base64")));
        // Read back what was stored, in case a process that took over a stale lock wrote too.
        return this.keychain(() => entry.getPassword());
      });
      if (!stored) throw unavailable("the key was stored but can't be read back");
    }
    this.cached = decodeKey(stored, this.description);
    return this.cached;
  }

  private keychain<T>(call: () => T): T {
    try {
      return call();
    } catch (error) {
      throw unavailable(error instanceof Error ? error.message : String(error));
    }
  }
}

/** `AGENT_QA_VAULT_KEY` when set (CI), otherwise the OS keychain. */
export function defaultKeyProvider(env: NodeJS.ProcessEnv = process.env): KeyProvider {
  return env[VAULT_KEY_ENV] ? new EnvKeyProvider(env) : new KeychainKeyProvider();
}

/** Reads config secrets written as `${keychain:NAME}` from the same keychain service. */
export function keychainLookup(factory: KeyringFactory = defaultKeyringFactory) {
  return async (name: string): Promise<string | undefined> => {
    if (isVaultKeyEntry(name)) throw new Error(`${name} is the vault key's own entry, which config can't read`);
    try {
      const entry = await factory(KEYCHAIN_SERVICE, name, SECRET_ENTRY);
      return entry.getPassword() ?? undefined;
    } catch (error) {
      throw new Error(
        `The OS keychain can't be read for ${name} (${error instanceof Error ? error.message : String(error)}). ` +
          `Set the environment variable ${name} instead: it is read when the keychain has no entry.`,
      );
    }
  };
}

/** A secret name `${keychain:NAME}` can refer to; the vault key's own entry is not one. */
export const SECRET_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/** Windows Credential Manager matches names without case, so VAULT-KEY is the vault key too. */
function isVaultKeyEntry(name: string): boolean {
  return name.toLowerCase() === KEYCHAIN_ACCOUNT;
}

/**
 * Writes the entries that `${keychain:NAME}` references read (`agent-qa secret`),
 * under the same service. The vault key's entry can't be named, so a secret
 * never replaces it.
 */
export function keychainStore(factory: KeyringFactory = defaultKeyringFactory) {
  const entry = async (name: string): Promise<KeyringEntry> => {
    // The name isn't repeated: if it doesn't fit, it may be the value typed in the wrong place.
    if (!SECRET_NAME.test(name) || name.length > 100) throw new Error("that isn't a secret name: letters, digits, _ . -, starting with a letter or _ (at most 100)");
    if (isVaultKeyEntry(name)) throw new Error(`${name} is the vault key's own entry; pick another name`);
    try {
      return await factory(KEYCHAIN_SERVICE, name, SECRET_ENTRY);
    } catch (error) {
      throw new Error(`The OS keychain can't be used (${error instanceof Error ? error.message : String(error)}). Use \${env:NAME} in agent-qa.yaml instead.`);
    }
  };
  const call = <T>(name: string, fn: () => T): T => {
    try {
      return fn();
    } catch (error) {
      throw new Error(`The OS keychain refused ${name} (${error instanceof Error ? error.message : String(error)}). Use \${env:NAME} in agent-qa.yaml instead.`);
    }
  };
  return {
    service: KEYCHAIN_SERVICE,
    async set(name: string, value: string): Promise<void> {
      if (!value) throw new Error("the value is empty");
      const e = await entry(name);
      call(name, () => e.setPassword(value));
      // Some keychains (headless Linux) accept a write they don't keep.
      if (call(name, () => e.getPassword()) !== value) throw new Error(`The OS keychain didn't keep ${name}. Use \${env:NAME} in agent-qa.yaml instead.`);
    },
    async has(name: string): Promise<boolean> {
      const e = await entry(name);
      return Boolean(call(name, () => e.getPassword()));
    },
    async delete(name: string): Promise<boolean> {
      const e = await entry(name);
      if (!e.deletePassword) throw new Error("this keychain can't delete entries");
      return call(name, () => e.deletePassword!());
    },
  };
}
export type KeychainStore = ReturnType<typeof keychainStore>;

export interface VaultKeyStatus {
  ok: boolean;
  /** False when the keychain has no key yet; the first run creates one, if the keychain is writable. */
  exists: boolean;
  /** Where the key comes from, or would come from. */
  source: string;
  message: string;
}

/**
 * Checks the vault key without creating one (for `agent-qa doctor`). A missing
 * keychain key is fine: the first run creates it.
 */
export async function vaultKeyStatus(
  env: NodeJS.ProcessEnv = process.env,
  factory: KeyringFactory = defaultKeyringFactory,
): Promise<VaultKeyStatus> {
  if (env[VAULT_KEY_ENV]) {
    const provider = new EnvKeyProvider(env);
    try {
      await provider.getKey();
      return { ok: true, exists: true, source: provider.description, message: "valid 32-byte key" };
    } catch (error) {
      return { ok: false, exists: true, source: provider.description, message: (error as Error).message };
    }
  }
  const source = `OS keychain (${KEYCHAIN_SERVICE}/${KEYCHAIN_ACCOUNT})`;
  try {
    const entry = await factory(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    const stored = entry.getPassword();
    if (!stored) return { ok: true, exists: false, source, message: "no key yet; the first run creates one" };
    decodeKey(stored, source);
    return { ok: true, exists: true, source, message: "valid 32-byte key" };
  } catch (error) {
    return { ok: false, exists: false, source, message: unavailable((error as Error).message).message };
  }
}
