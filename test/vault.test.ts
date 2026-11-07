import { randomBytes } from "node:crypto";
import { chmod, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  EnvKeyProvider,
  FileVaultStorage,
  KeychainKeyProvider,
  keychainLookup,
  MemoryVaultStorage,
  Vault,
  withKeyCreationLock,
  type KeyProvider,
  type KeyringEntry,
} from "../src/masking/index.js";

const key = randomBytes(32);
const keys: KeyProvider = { description: "test", getKey: async () => key };

function fakeKeyring() {
  const store = new Map<string, string>();
  const factory = (service: string, account: string): KeyringEntry => ({
    getPassword: () => store.get(`${service}/${account}`) ?? null,
    setPassword: (p) => void store.set(`${service}/${account}`, p),
  });
  return { store, factory };
}

describe("Vault", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("gives stable tokens per kind and value, and round-trips through disk", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-vault-"));
    const vault = new Vault({ storage: new FileVaultStorage(dir), keys });
    const run = await vault.open("2026-11-20-PROJ-1-ab12");
    expect(run.tokenFor("PERSON", "Ada Lovelace")).toBe("<PERSON_1>");
    expect(run.tokenFor("PERSON", "Alan Turing")).toBe("<PERSON_2>");
    expect(run.tokenFor("PERSON", "Ada Lovelace")).toBe("<PERSON_1>");
    expect(run.tokenFor("EMAIL", "ada@example.com")).toBe("<EMAIL_1>");
    await run.save();

    const reopened = await new Vault({ storage: new FileVaultStorage(dir), keys }).open("2026-11-20-PROJ-1-ab12");
    expect(reopened.valueOf("<PERSON_2>")).toBe("Alan Turing");
    expect(reopened.tokenFor("PERSON", "Ada Lovelace")).toBe("<PERSON_1>");
    expect(reopened.tokenFor("PERSON", "Grace Hopper")).toBe("<PERSON_3>");
    expect(reopened.valueOf("<PERSON_9>")).toBeUndefined();
    expect(reopened.valueOf("toString")).toBeUndefined();
  });

  it("never writes a real value to disk", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-vault-"));
    const run = await new Vault({ storage: new FileVaultStorage(dir), keys }).open("r1");
    run.tokenFor("PERSON", "Very Secret Name");
    run.tokenFor("IBAN", "DE89370400440532013000");
    await run.save();
    const files = await readdir(dir);
    expect(files).toEqual(["r1.vault"]);
    const raw = await readFile(join(dir, "r1.vault"), "utf8");
    expect(raw).not.toContain("Very Secret Name");
    expect(raw).not.toContain("DE89370400440532013000");
    expect(raw).not.toContain("<PERSON_1>");
    if (process.platform !== "win32") expect((await stat(join(dir, "r1.vault"))).mode & 0o077).toBe(0);
  });

  it("refuses a wrong key, a tampered file and a file moved to another run", async () => {
    const storage = new MemoryVaultStorage();
    const run = await new Vault({ storage, keys }).open("r1");
    run.tokenFor("PERSON", "x");
    await run.save();

    const other: KeyProvider = { description: "other", getKey: async () => randomBytes(32) };
    await expect(new Vault({ storage, keys: other }).open("r1")).rejects.toThrow(/wrong key or tampered/);

    const envelope = JSON.parse(storage.blobs.get("r1")!);
    storage.blobs.set("r1", JSON.stringify({ ...envelope, expiresAt: "2999-01-01T00:00:00.000Z" }));
    await expect(new Vault({ storage, keys }).open("r1")).rejects.toThrow(/wrong key or tampered/);

    storage.blobs.set("r2", JSON.stringify(envelope));
    await expect(new Vault({ storage, keys }).open("r2")).rejects.toThrow(/belongs to r1/);
  });

  it("expires a run's vault, counted from its first save", async () => {
    let now = new Date("2026-11-01T00:00:00Z");
    const storage = new MemoryVaultStorage();
    const vault = new Vault({ storage, keys, ttlMs: 1000, now: () => now });
    const run = await vault.open("r1");
    run.tokenFor("PERSON", "x");
    await run.save();

    now = new Date(now.getTime() + 600);
    run.tokenFor("PERSON", "x2");
    await run.save(); // saving again doesn't push the expiry out
    const keep = await vault.open("r2");
    keep.tokenFor("PERSON", "y");
    await keep.save();

    now = new Date(now.getTime() + 600);
    expect(await vault.purgeExpired()).toEqual({ removed: ["r1"], failed: [] });
    expect((await vault.open("r1")).size).toBe(0);
    expect((await vault.open("r2")).valueOf("<PERSON_1>")).toBe("y");
  });

  it("purges files with no valid expiry and keeps going past an unreadable one", async () => {
    const storage = new MemoryVaultStorage();
    storage.blobs.set("garbage", "not json");
    storage.blobs.set("noexpiry", JSON.stringify({ v: 1, runId: "noexpiry" }));
    storage.blobs.set("badexpiry", JSON.stringify({ v: 1, runId: "badexpiry", expiresAt: "soon" }));
    storage.blobs.set("locked", "{}");
    const read = storage.read.bind(storage);
    storage.read = async (id) => {
      if (id === "locked") throw Object.assign(new Error("EACCES"), { code: "EACCES" });
      return read(id);
    };
    const result = await new Vault({ storage, keys }).purgeExpired();
    expect(result.removed.sort()).toEqual(["badexpiry", "garbage", "noexpiry"]);
    expect(result.failed).toEqual(["locked"]);
  });

  it("rejects a truncated auth tag or a wrong-size IV", async () => {
    const storage = new MemoryVaultStorage();
    const run = await new Vault({ storage, keys }).open("r1");
    run.tokenFor("PERSON", "x");
    await run.save();
    const envelope = JSON.parse(storage.blobs.get("r1")!);
    const tag = Buffer.from(envelope.tag, "base64");
    for (const n of [4, 8, 12]) {
      storage.blobs.set("r1", JSON.stringify({ ...envelope, tag: tag.subarray(0, n).toString("base64") }));
      await expect(new Vault({ storage, keys }).open("r1")).rejects.toThrow(/wrong key or tampered/);
    }
    storage.blobs.set("r1", JSON.stringify({ ...envelope, iv: randomBytes(16).toString("base64") }));
    await expect(new Vault({ storage, keys }).open("r1")).rejects.toThrow(/wrong key or tampered/);
  });

  it("rejects unsafe run ids and bad token kinds", async () => {
    const vault = new Vault({ storage: new MemoryVaultStorage(), keys });
    await expect(vault.open("../x")).rejects.toThrow(/Unsafe run id/);
    await expect(new FileVaultStorage("/tmp").read("a/../../b")).rejects.toThrow(/Unsafe run id/);
    const run = await vault.open("r1");
    expect(() => run.tokenFor("person", "x")).toThrow(/Invalid token kind/);
  });

  it("skips writing when nothing changed", async () => {
    const storage = new MemoryVaultStorage();
    await (await new Vault({ storage, keys }).open("r1")).save();
    expect(await storage.list()).toEqual([]);
  });
});

describe("key providers", () => {
  it("reads a base64 key from AGENT_QA_VAULT_KEY", async () => {
    const env = { AGENT_QA_VAULT_KEY: key.toString("base64") };
    expect((await new EnvKeyProvider(env).getKey()).equals(key)).toBe(true);
    await expect(new EnvKeyProvider({}).getKey()).rejects.toThrow(/not set/);
    await expect(new EnvKeyProvider({ AGENT_QA_VAULT_KEY: "c2hvcnQ=" }).getKey()).rejects.toThrow(/32 bytes/);
  });

  it("creates a key in the keychain once, then reuses it", async () => {
    const { store, factory } = fakeKeyring();
    const first = await new KeychainKeyProvider(factory).getKey();
    const second = await new KeychainKeyProvider(factory).getKey();
    expect(first.length).toBe(32);
    expect(second.equals(first)).toBe(true);
    expect([...store.keys()]).toEqual(["sf-agent-qa/vault-key"]);
  });

  it("uses the key that ended up stored when two processes create one at once", async () => {
    const { store, factory } = fakeKeyring();
    // Another process writes its key right after ours.
    const racing = (service: string, account: string): KeyringEntry => {
      const inner = factory(service, account);
      return {
        getPassword: inner.getPassword,
        setPassword: (p) => {
          inner.setPassword(p);
          inner.setPassword(randomBytes(32).toString("base64"));
        },
      };
    };
    const ours = await new KeychainKeyProvider(racing).getKey();
    expect(ours.toString("base64")).toBe(store.get("sf-agent-qa/vault-key"));
  });

  it("creates one key when two processes find none at once (clean-up of a slice 0 follow-up)", async () => {
    const { store, factory } = fakeKeyring();
    const dir = await mkdtemp(join(tmpdir(), "agent-qa-lock-"));
    try {
      const lock = <T>(fn: () => Promise<T> | T) => withKeyCreationLock(fn, { dir });
      // The first two reads say "no key": both processes looked before either wrote one.
      let early = 2;
      const both = (service: string, account: string): KeyringEntry => {
        const inner = factory(service, account);
        return { getPassword: () => (early-- > 0 ? null : inner.getPassword()), setPassword: inner.setPassword };
      };
      const [a, b] = await Promise.all([new KeychainKeyProvider(both, lock).getKey(), new KeychainKeyProvider(both, lock).getKey()]);
      expect(a.equals(b)).toBe(true);
      expect(a.toString("base64")).toBe(store.get("sf-agent-qa/vault-key"));
      expect(await readdir(dir)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("waits for the key lock, takes over a stale one, and says what to delete when it can't", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-qa-lock-"));
    try {
      const order: string[] = [];
      const slow = withKeyCreationLock(async () => {
        await new Promise((r) => setTimeout(r, 150));
        order.push("first");
      }, { dir });
      await new Promise((r) => setTimeout(r, 20));
      await withKeyCreationLock(() => void order.push("second"), { dir });
      await slow;
      expect(order).toEqual(["first", "second"]);
      // A lock left by a crash (older than staleMs) is taken over.
      const file = join(dir, "x");
      await withKeyCreationLock(async () => {
        const [held] = await readdir(dir);
        await writeFile(file, held!);
      }, { dir });
      const lockName = await readFile(file, "utf8");
      await writeFile(join(dir, lockName), "123");
      expect(await withKeyCreationLock(() => "taken", { dir, staleMs: -1 })).toBe("taken");
      await writeFile(join(dir, lockName), "123");
      await expect(withKeyCreationLock(() => "never", { dir, waitMs: 50 })).rejects.toThrow(/Another Agent-QA process is creating the vault key\. If none is running, delete .*\.lock/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("explains how to fall back to AGENT_QA_VAULT_KEY when the keychain fails", async () => {
    const broken = (): KeyringEntry => ({
      getPassword: () => null,
      setPassword: () => {
        throw new Error("Couldn't access platform storage: AccessDenied");
      },
    });
    await expect(new KeychainKeyProvider(broken).getKey()).rejects.toThrow(/AccessDenied.*AGENT_QA_VAULT_KEY.*openssl rand -base64 32/s);
  });

  it("looks up ${keychain:NAME} config secrets", async () => {
    const { store, factory } = fakeKeyring();
    store.set("sf-agent-qa/jira-token", "s3cret");
    const lookup = keychainLookup(factory);
    expect(await lookup("jira-token")).toBe("s3cret");
    expect(await lookup("missing")).toBeUndefined();
  });
});

describe("FileVaultStorage", () => {
  it("lists only vault files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-qa-vault-"));
    try {
      const storage = new FileVaultStorage(dir);
      expect(await new FileVaultStorage(join(dir, "missing")).list()).toEqual([]);
      if (process.platform !== "win32") await chmod(dir, 0o755);
      await storage.write("r1", "{}");
      if (process.platform !== "win32") expect((await stat(dir)).mode & 0o077).toBe(0);
      await writeFile(join(dir, "notes.txt"), "x");
      expect(await storage.list()).toEqual(["r1"]);
      await storage.delete("r1");
      expect(await storage.list()).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
