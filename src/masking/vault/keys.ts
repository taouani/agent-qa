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
    throw new Error(`OS keychain support is not installed. Set ${VAULT_KEY_ENV} instead, or reinstall without --omit=optional.`);
  }
  return new mod.Entry(service, account);
};

/** Key kept in the OS keychain (macOS Keychain, Windows Credential Manager, Secret Service). */
export class KeychainKeyProvider implements KeyProvider {
  readonly description = `OS keychain (${KEYCHAIN_SERVICE}/${KEYCHAIN_ACCOUNT})`;
  private cached: Buffer | undefined;

  constructor(private readonly factory: KeyringFactory = defaultKeyringFactory) {}

  async getKey(): Promise<Buffer> {
    if (this.cached) return this.cached;
    const entry = await this.factory(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    const existing = entry.getPassword();
    if (existing) {
      this.cached = decodeKey(existing, this.description);
    } else {
      const key = randomBytes(32);
      entry.setPassword(key.toString("base64"));
      this.cached = key;
    }
    return this.cached;
  }
}

/** `AGENT_QA_VAULT_KEY` when set (CI), otherwise the OS keychain. */
export function defaultKeyProvider(env: NodeJS.ProcessEnv = process.env): KeyProvider {
  return env[VAULT_KEY_ENV] ? new EnvKeyProvider(env) : new KeychainKeyProvider();
}

/** Reads config secrets written as `${keychain:NAME}` from the same keychain service. */
export function keychainLookup(factory: KeyringFactory = defaultKeyringFactory) {
  return async (name: string): Promise<string | undefined> => {
    const entry = await factory(KEYCHAIN_SERVICE, name);
    return entry.getPassword() ?? undefined;
  };
}
