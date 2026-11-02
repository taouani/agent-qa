import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatDoctor, runDoctor, type CheckResult } from "../src/data/index.js";
import type { KeyringEntry } from "../src/masking/index.js";

const vaultKey = Buffer.alloc(32, 7).toString("base64");
const keyring = (store: Record<string, string> = {}) => (service: string, account: string): KeyringEntry => ({
  getPassword: () => store[`${service}/${account}`] ?? null,
  setPassword: () => {
    throw new Error("doctor must not write to the keychain");
  },
});
const okFetch = (async () => new Response(null, { status: 401 })) as unknown as typeof fetch;

const CONFIG = `version: 1
atlassian:
  site: https://acme.atlassian.net
  email: \${env:ATLASSIAN_EMAIL}
  token: \${env:ATLASSIAN_API_TOKEN}
xray:
  clientId: abc
  clientSecret: \${keychain:xray-secret}
  projectKey: PROJ
git:
  platform: github
  repo: acme/tests
  token: \${env:GITHUB_TOKEN}
models:
  default: anthropic:model-a
  allowed: [anthropic:*]
  keys:
    anthropic: \${env:ANTHROPIC_API_KEY}
`;
const ENV = { ATLASSIAN_EMAIL: "qa@example.com", ATLASSIAN_API_TOKEN: "t1", GITHUB_TOKEN: "t2", ANTHROPIC_API_KEY: "t3", AGENT_QA_VAULT_KEY: vaultKey };

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agent-qa-doctor-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const byId = (results: CheckResult[]) => Object.fromEntries(results.map((r) => [r.id, r]));
const doctor = (env: NodeJS.ProcessEnv, extra: Partial<Parameters<typeof runDoctor>[0]> = {}) =>
  runDoctor({ cwd: dir, env, keyring: keyring({ "sf-agent-qa/xray-secret": "s3" }), fetch: okFetch, nodeVersion: "v22.1.0", ...extra });

describe("agent-qa doctor", () => {
  it("passes a complete setup", async () => {
    await writeFile(join(dir, "agent-qa.yaml"), CONFIG);
    await writeFile(join(dir, ".gitignore"), "node_modules/\n.agent-qa/\n");
    const results = await doctor(ENV);
    expect(results.map((r) => [r.id, r.status])).toEqual([
      ["node", "pass"],
      ["config", "pass"],
      ["secrets", "pass"],
      ["vault-key", "pass"],
      ["gitignore", "pass"],
      ["models", "pass"],
      ["network", "pass"],
    ]);
    expect(formatDoctor(results)).toMatch(/Ready\.\n$/);
  });

  it("names missing secrets by reference and never prints a value", async () => {
    await writeFile(join(dir, "agent-qa.yaml"), CONFIG);
    const results = byId(await doctor({ ...ENV, GITHUB_TOKEN: "" }, { keyring: keyring() }));
    expect(results.secrets).toMatchObject({ status: "fail" });
    expect(results.secrets!.detail).toContain("git.token (${env:GITHUB_TOKEN})");
    expect(results.secrets!.detail).toContain("xray.clientSecret (${keychain:xray-secret})");
    const out = JSON.stringify(results);
    for (const value of ["t1", "t3", "qa@example.com", vaultKey]) expect(out).not.toContain(`"${value}"`);
    expect(out).not.toContain(vaultKey);
  });

  it("fails on an old Node, a bad config, and an invalid vault key", async () => {
    await writeFile(join(dir, "agent-qa.yaml"), "version: 1\ngit:\n  platform: github\n  repo: a/b\n  token: hunter2\n");
    const results = byId(await doctor({ AGENT_QA_VAULT_KEY: "c2hvcnQ=" }, { nodeVersion: "v18.19.0" }));
    expect(results.node!.status).toBe("fail");
    expect(results.config).toMatchObject({ status: "fail", detail: expect.stringMatching(/line 5: git.token/) });
    expect(results.secrets!.status).toBe("skip");
    expect(results["vault-key"]).toMatchObject({ status: "fail", detail: expect.stringMatching(/32 bytes/) });
    expect(formatDoctor(Object.values(results))).toMatch(/problem\(s\) to fix/);
  });

  it("reports a missing config with the init hint", async () => {
    const results = byId(await doctor(ENV));
    expect(results.config).toMatchObject({ status: "fail", detail: expect.stringMatching(/agent-qa init/) });
    expect(results.network!.status).toBe("skip");
  });

  it("accepts a keychain without a vault key yet, without creating one", async () => {
    const results = byId(await doctor({}, { keyring: keyring() }));
    expect(results["vault-key"]).toMatchObject({ status: "warn", detail: expect.stringMatching(/first run creates one/) });
    const stored = byId(await doctor({}, { keyring: keyring({ "sf-agent-qa/vault-key": vaultKey }) }));
    expect(stored["vault-key"]!.status).toBe("pass");
  });

  it("explains a broken keychain", async () => {
    const broken = () => ({ getPassword: () => { throw new Error("AccessDenied"); }, setPassword: () => undefined });
    const results = byId(await doctor({}, { keyring: broken }));
    expect(results["vault-key"]).toMatchObject({ status: "fail", detail: expect.stringMatching(/AccessDenied.*AGENT_QA_VAULT_KEY/) });
  });

  it("checks the gitignore covers the vault, and warns about run folders", async () => {
    expect(byId(await doctor(ENV)).gitignore!.status).toBe("fail");
    await writeFile(join(dir, ".gitignore"), "/.agent-qa/vault/\n");
    expect(byId(await doctor(ENV)).gitignore!.status).toBe("warn");
    await writeFile(join(dir, ".gitignore"), ".agent-qa/vault\n.agent-qa/runs/*\n");
    expect(byId(await doctor(ENV)).gitignore!.status).toBe("pass");
    await writeFile(join(dir, ".gitignore"), ".agent-qa/\n!.agent-qa/vault/\n");
    expect(byId(await doctor(ENV)).gitignore!.status).toBe("fail");
  });

  it("checks models against allowed and warns when a provider has no key", async () => {
    await writeFile(join(dir, "agent-qa.yaml"), "version: 1\nmodels:\n  default: openai:x\n  allowed: [anthropic:*]\n");
    expect(byId(await doctor(ENV)).models).toMatchObject({ status: "fail", detail: expect.stringMatching(/openai:x/) });
    await writeFile(join(dir, "agent-qa.yaml"), "version: 1\nmodels:\n  default: openai:x\n");
    expect(byId(await doctor(ENV)).models).toMatchObject({ status: "warn", detail: expect.stringMatching(/openai/) });
    await writeFile(join(dir, "agent-qa.yaml"), "version: 1\n");
    expect(byId(await doctor(ENV)).models!.status).toBe("warn");
  });

  it("reports unreachable services by host, and can skip the network", async () => {
    await writeFile(join(dir, "agent-qa.yaml"), CONFIG);
    const failing = (async (url: string) => {
      if (String(url).includes("atlassian")) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    const results = byId(await doctor(ENV, { fetch: failing }));
    expect(results.network).toMatchObject({ status: "fail", detail: "Atlassian at acme.atlassian.net: ENOTFOUND" });
    expect(byId(await doctor(ENV, { online: false })).network).toMatchObject({ status: "skip" });
  });
});
