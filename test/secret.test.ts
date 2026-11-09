import { describe, expect, it } from "vitest";
import { secretCommand, typedValue } from "../src/cli/secret.js";
import { secretStore } from "../src/data/index.js";
import { keychainLookup, type KeyringEntry } from "../src/masking/index.js";

/** An in-memory keychain: service/account → value. */
function fakeKeychain(options: { forgets?: boolean } = {}) {
  const entries = new Map<string, string>();
  const factory = (service: string, account: string): KeyringEntry => ({
    getPassword: () => entries.get(`${service}/${account}`),
    setPassword: (v: string) => void (options.forgets || entries.set(`${service}/${account}`, v)),
    deletePassword: () => entries.delete(`${service}/${account}`),
  });
  return { entries, store: secretStore(factory) };
}

describe("agent-qa secret", () => {
  it("stores a value under the sf-agent-qa service, then replaces and deletes it, and never prints it", async () => {
    const { entries, store } = fakeKeychain();
    const lines: string[] = [];
    const log = (l: string) => lines.push(l);
    expect(await secretCommand({ action: "set", name: "ATLASSIAN_TOKEN", store, readValue: async () => "s3cret-value\n", log })).toBe(0);
    expect(entries.get("sf-agent-qa/ATLASSIAN_TOKEN")).toBe("s3cret-value");
    expect(lines.at(-1)).toBe("ATLASSIAN_TOKEN: stored in the OS keychain (service sf-agent-qa). agent-qa.yaml reads it as ${keychain:ATLASSIAN_TOKEN}.");
    expect(await secretCommand({ action: "set", name: "ATLASSIAN_TOKEN", store, readValue: async () => "other", log })).toBe(0);
    expect(lines.at(-1)).toContain("replaced");
    expect(await secretCommand({ action: "delete", name: "ATLASSIAN_TOKEN", store, readValue: async () => undefined, log })).toBe(0);
    expect(entries.size).toBe(0);
    expect(await secretCommand({ action: "delete", name: "ATLASSIAN_TOKEN", store, readValue: async () => undefined, log })).toBe(0);
    expect(lines.at(-1)).toBe("ATLASSIAN_TOKEN: not in the OS keychain");
    expect(lines.join("\n")).not.toMatch(/s3cret|other/);
  });

  it("keeps a multi-line key whole, piped in", async () => {
    const { entries, store } = fakeKeychain();
    const pem = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n";
    expect(await secretCommand({ action: "set", name: "SF_JWT_KEY", store, readValue: async () => pem, log: () => {} })).toBe(0);
    expect(entries.get("sf-agent-qa/SF_JWT_KEY")).toBe(pem.slice(0, -1));
  });

  it("refuses a bad name, the vault key's entry, an empty value and an interrupt, storing nothing", async () => {
    const { entries, store } = fakeKeychain();
    const lines: string[] = [];
    const log = (l: string) => lines.push(l);
    expect(await secretCommand({ action: "set", name: "1BAD", store, readValue: async () => "x", log })).toBe(2);
    expect(await secretCommand({ action: "set", name: "vault-key", store, readValue: async () => "x", log })).toBe(2);
    expect(lines.at(-1)).toContain("vault key's own entry");
    expect(await secretCommand({ action: "set", name: "VAULT-KEY", store, readValue: async () => "x", log })).toBe(2);
    expect(lines.at(-1)).toContain("vault key's own entry");
    expect(await secretCommand({ action: "delete", name: "Vault-Key", store, readValue: async () => undefined, log })).toBe(2);
    expect(await secretCommand({ action: "set", name: "TOKEN", store, readValue: async () => "  \n", log })).toBe(2);
    expect(await secretCommand({ action: "set", name: "TOKEN", store, readValue: async () => undefined, log })).toBe(2);
    expect(lines.at(-1)).toBe("agent-qa secret: stopped, nothing stored");
    expect(await secretCommand({ action: "set", name: "TOKEN", store, readValue: async () => ({ refused: "the pasted value has more than one line" }), log })).toBe(2);
    expect(lines.at(-1)).toBe("agent-qa secret: the pasted value has more than one line, nothing stored");
    expect(entries.size).toBe(0);
  });

  it("fails when the keychain doesn't keep what it was given", async () => {
    const { store } = fakeKeychain({ forgets: true });
    const lines: string[] = [];
    expect(await secretCommand({ action: "set", name: "TOKEN", store, readValue: async () => "x", log: (l) => lines.push(l) })).toBe(1);
    expect(lines.at(-1)).toContain("didn't keep TOKEN");
  });

  it("refuses a token typed as the name, without printing it", async () => {
    const { entries, store } = fakeKeychain();
    const lines: string[] = [];
    let asked = false;
    const token = `ghp_${"a1B2c3D4e5".repeat(4)}`;
    const code = await secretCommand({ action: "set", name: token, store, readValue: async () => ((asked = true), "x"), log: (l) => lines.push(l) });
    expect(code).toBe(2);
    expect(asked).toBe(false);
    expect(lines.join("\n")).toMatch(/looks like a secret \(GitHub token\).*rotate/);
    expect(lines.join("\n")).not.toContain(token);
    expect(entries.size).toBe(0);
  });

  it("doesn't let a ${keychain:…} reference read the vault key", async () => {
    const lookup = keychainLookup(() => ({ getPassword: () => "the-vault-key", setPassword: () => {} }));
    await expect(lookup("vault-key")).rejects.toThrow(/vault key/);
    await expect(lookup("VAULT-KEY")).rejects.toThrow(/vault key/);
  });
});

describe("typing a hidden value", () => {
  it("ends on Enter, deletes on backspace and drops escape sequences", () => {
    let t = typedValue("", "ab\u001b[Dc\u001bOA");
    expect(t).toEqual({ state: "typing", value: "abc" });
    t = typedValue("abc", "\u007fd\r");
    expect(t).toEqual({ state: "done", value: "abd" });
    expect(typedValue("", "\u001b[200~tok\u001b[201~\r\n")).toEqual({ state: "done", value: "tok" });
  });

  it("cancels on Ctrl+C, and on Ctrl+D when nothing is typed", () => {
    expect(typedValue("ab", "\u0003")).toEqual({ state: "cancelled" });
    expect(typedValue("", "\u0004")).toEqual({ state: "cancelled" });
    expect(typedValue("ab", "\u0004")).toEqual({ state: "typing", value: "ab" });
  });

  it("refuses a paste with text after the line end, instead of keeping only the first line", () => {
    const t = typedValue("", "first-part\nsecond-part\n");
    expect(t.state).toBe("refused");
    expect(JSON.stringify(t)).not.toContain("part");
  });
});
