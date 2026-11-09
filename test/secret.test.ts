import { describe, expect, it } from "vitest";
import { secretCommand } from "../src/cli/secret.js";
import { secretStore } from "../src/data/index.js";
import type { KeyringEntry } from "../src/masking/index.js";

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
    expect(await secretCommand({ action: "set", name: "TOKEN", store, readValue: async () => "  \n", log })).toBe(2);
    expect(await secretCommand({ action: "set", name: "TOKEN", store, readValue: async () => undefined, log })).toBe(2);
    expect(lines.at(-1)).toBe("agent-qa secret: stopped, nothing stored");
    expect(entries.size).toBe(0);
  });

  it("fails when the keychain doesn't keep what it was given", async () => {
    const { store } = fakeKeychain({ forgets: true });
    const lines: string[] = [];
    expect(await secretCommand({ action: "set", name: "TOKEN", store, readValue: async () => "x", log: (l) => lines.push(l) })).toBe(1);
    expect(lines.at(-1)).toContain("didn't keep TOKEN");
  });
});
