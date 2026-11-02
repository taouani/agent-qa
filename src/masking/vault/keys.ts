import { randomBytes } from "node:crypto";

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
}
export type KeyringFactory = (service: string, account: string) => KeyringEntry | Promise<KeyringEntry>;

/** Loads `@napi-rs/keyring` lazily: it's an optional native dependency. */
export const defaultKeyringFactory: KeyringFactory = async (service, account) => {
  let mod: { Entry: new (s: string, a: string) => KeyringEntry };
  try {
    mod = (await import("@napi-rs/keyring")) as unknown as typeof mod;
  } catch {
    throw new Error("OS keychain support is not installed; reinstall without --omit=optional");
  }
  return new mod.Entry(service, account);
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

  constructor(private readonly factory: KeyringFactory = defaultKeyringFactory) {}

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
      this.keychain(() => entry.setPassword(randomBytes(32).toString("base64")));
      // Read back what was stored: if two processes create a key at once, the last write
      // wins, and both must use that one or one process writes vaults nobody can decrypt.
      stored = this.keychain(() => entry.getPassword());
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
    try {
      const entry = await factory(KEYCHAIN_SERVICE, name);
      return entry.getPassword() ?? undefined;
    } catch (error) {
      throw new Error(
        `The OS keychain can't be read for ${name} (${error instanceof Error ? error.message : String(error)}). ` +
          `Use \${env:NAME} in agent-qa.yaml instead.`,
      );
    }
  };
}

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
