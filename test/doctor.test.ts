import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatDoctor, runDoctor, type CheckResult } from "../src/data/index.js";
import { isIgnored, loadIgnoreRules, parseGitignore } from "../src/data/gitignore.js";
import { parseGitIndex, trackedPaths } from "../src/data/git-index.js";
import { keychainLookup, type KeyringEntry } from "../src/masking/index.js";
import { VERSION } from "../src/core/index.js";

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
  default: anthropic:claude-opus-5-5
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
  runDoctor({ cwd: dir, env, keyring: keyring({ "sf-agent-qa/xray-secret": "s3" }), fetch: okFetch, nodeVersion: "v22.1.0", caseInsensitive: false, ...extra });

describe("agent-qa doctor", () => {
  it("passes a complete setup", async () => {
    await writeFile(join(dir, "agent-qa.yaml"), CONFIG);
    await writeFile(join(dir, ".gitignore"), "node_modules/\r\n.agent-qa/\r\n");
    const results = await doctor(ENV);
    expect(results.map((r) => [r.id, r.status])).toEqual([
      ["node", "pass"],
      ["config", "pass"],
      ["secrets", "pass"],
      ["vault-key", "pass"],
      ["gitignore", "pass"],
      ["tracked", "skip"],
      ["models", "pass"],
      ["salesforce", "skip"],
      ["network", "pass"],
    ]);
    expect(formatDoctor(results)).toMatch(/Ready\.\n$/);
  });

  it("warns when the editor schema line names another version, and not when it names this one", async () => {
    const line = (v: string) => `# yaml-language-server: $schema=https://unpkg.com/sf-agent-qa@${v}/schema/agent-qa.schema.json\n`;
    await writeFile(join(dir, ".gitignore"), ".agent-qa/\n");
    await writeFile(join(dir, "agent-qa.yaml"), line("2.0.0-alpha.0-old") + CONFIG);
    const stale = byId(await doctor(ENV));
    expect(stale["config-schema"]?.status).toBe("warn");
    expect(stale["config-schema"]?.fix).toContain(`sf-agent-qa@${VERSION}`);
    await writeFile(join(dir, "agent-qa.yaml"), line(VERSION) + CONFIG);
    expect(byId(await doctor(ENV))["config-schema"]).toBeUndefined();
  });

  it("takes the provider's own key variable as a key, as init's comment says", async () => {
    const noKeys = CONFIG.replace("  keys:\n    anthropic: \${env:ANTHROPIC_API_KEY}\n", "");
    expect(noKeys).not.toContain("keys:");
    await writeFile(join(dir, "agent-qa.yaml"), noKeys);
    expect(byId(await doctor(ENV)).models).toMatchObject({ status: "pass" });
    const missing = byId(await doctor({ ...ENV, ANTHROPIC_API_KEY: "" })).models!;
    expect(missing).toMatchObject({ status: "warn", detail: expect.stringContaining("no API key for anthropic") });
    expect(missing.fix).toContain("ANTHROPIC_API_KEY");
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

  it("checks the gitignore covers the vault, and warns about runs and the audit log", async () => {
    const gitignore = byId(await doctor(ENV)).gitignore!;
    expect(gitignore.status).toBe("fail");
    expect(gitignore.detail.split("\n")).toHaveLength(3); // every missing entry, not just the first
    await writeFile(join(dir, ".gitignore"), "/.agent-qa/vault/\n");
    expect(byId(await doctor(ENV)).gitignore!.status).toBe("warn");
    await writeFile(join(dir, ".gitignore"), ".agent-qa/vault\n.agent-qa/runs/*\n.agent-qa/*.jsonl\n");
    expect(byId(await doctor(ENV)).gitignore!.status).toBe("pass");
    // A nested .gitignore and .git/info/exclude count too.
    await writeFile(join(dir, ".gitignore"), "");
    await mkdir(join(dir, ".agent-qa"), { recursive: true });
    await writeFile(join(dir, ".agent-qa", ".gitignore"), "vault/\nruns/\n");
    await mkdir(join(dir, ".git", "info"), { recursive: true });
    await writeFile(join(dir, ".git", "info", "exclude"), "audit.jsonl\n");
    expect(byId(await doctor(ENV)).gitignore!.status).toBe("pass");
  });

  it("reports an unusable proxy URL in the services check", async () => {
    await writeFile(join(dir, "agent-qa.yaml"), CONFIG);
    const env = { ...ENV, HTTPS_PROXY: "socks5://proxy:1080" };
    const results = byId(await runDoctor({ cwd: dir, env, keyring: keyring({ "sf-agent-qa/xray-secret": "s3" }), nodeVersion: "v22.1.0", caseInsensitive: false }));
    expect(results.network).toMatchObject({ status: "fail", detail: expect.stringContaining("SOCKS is not supported") });
  });

  it("tells you to run init when there is no config", async () => {
    const results = byId(await doctor(ENV));
    expect(results.config).toMatchObject({ status: "fail", fix: expect.stringContaining("agent-qa init") });
    await writeFile(join(dir, "agent-qa.yaml"), "version: 2\n");
    expect(byId(await doctor(ENV)).config!.fix).toBe("Fix the problems above.");
  });

  it("reports an unreadable config or .gitignore instead of crashing", async () => {
    await mkdir(join(dir, "agent-qa.yaml"));
    await mkdir(join(dir, ".gitignore"));
    const results = byId(await doctor(ENV));
    expect(results.config!.status).toBe("fail");
    expect(results.gitignore).toMatchObject({ status: "fail", detail: expect.stringMatching(/can't be read/) });
    expect(JSON.stringify(results)).not.toContain(dir);
  });

  it("checks models against allowed and warns when a provider has no key", async () => {
    await writeFile(join(dir, "agent-qa.yaml"), "version: 1\nmodels:\n  default: openai:x\n  allowed: [anthropic:*]\n");
    expect(byId(await doctor(ENV)).models).toMatchObject({ status: "fail", detail: expect.stringMatching(/openai:x/) });
    await writeFile(join(dir, "agent-qa.yaml"), "version: 1\nmodels:\n  default: openai:x\n");
    expect(byId(await doctor(ENV)).models).toMatchObject({ status: "warn", detail: expect.stringMatching(/openai/) });
    await writeFile(join(dir, "agent-qa.yaml"), "version: 1\n");
    expect(byId(await doctor(ENV)).models!.status).toBe("warn");
    await writeFile(join(dir, "agent-qa.yaml"), "version: 1\nmodels:\n  default: anthropic:claude-custom-9\n  keys:\n    anthropic: ${env:ANTHROPIC_API_KEY}\n");
    expect(byId(await doctor(ENV)).models).toMatchObject({ status: "warn", detail: expect.stringMatching(/not in the shipped catalog.*claude-custom-9/) });
  });

  it("reports unreachable services by host, and can skip the network", async () => {
    await writeFile(join(dir, "agent-qa.yaml"), CONFIG);
    const failing = (async (url: string) => {
      if (String(url).includes("atlassian")) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    const results = byId(await doctor(ENV, { fetch: failing }));
    expect(results.network).toMatchObject({ status: "fail", detail: "Atlassian at acme.atlassian.net: ENOTFOUND" });
    let called = 0;
    const counting = (async () => (called++, new Response(null))) as unknown as typeof fetch;
    expect(byId(await doctor(ENV, { online: false, fetch: counting })).network).toMatchObject({ status: "skip" });
    expect(called).toBe(0);
    const hanging = ((_url: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)))) as unknown as typeof fetch;
    expect(byId(await doctor(ENV, { fetch: hanging, timeoutMs: 20 })).network!.detail).toContain("timed out after 20 ms");
    const bare = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(byId(await doctor(ENV, { fetch: bare })).network!.detail).toContain("TypeError");
  });

  it("checks model endpoints and Presidio, and warns about litellm without an endpoint", async () => {
    await writeFile(
      join(dir, "agent-qa.yaml"),
      "version: 1\nmodels:\n  default: litellm:m\n  keys:\n    litellm: ${env:K}\n  endpoints:\n    litellm: https://llm.internal.example\nmasking:\n  presidio:\n    url: http://presidio.internal.example:5001\n",
    );
    const urls: string[] = [];
    const recording = (async (url: string) => (urls.push(String(url)), new Response(null))) as unknown as typeof fetch;
    const results = byId(await doctor(ENV, { fetch: recording }));
    expect(urls.sort()).toEqual(["http://presidio.internal.example:5001", "https://llm.internal.example"]);
    expect(results.models!.status).toBe("pass");
    await writeFile(join(dir, "agent-qa.yaml"), "version: 1\nmodels:\n  default: litellm:m\n  keys:\n    litellm: ${env:K}\n");
    expect(byId(await doctor(ENV)).models).toMatchObject({ status: "warn", detail: expect.stringMatching(/endpoints.litellm/) });
  });

  it("warns about a literal Atlassian email and shows paths relative to the project", async () => {
    await writeFile(join(dir, "agent-qa.yaml"), CONFIG.replace("${env:ATLASSIAN_EMAIL}", "ada@example.com"));
    const results = byId(await doctor(ENV));
    expect(results["config-email"]!.status).toBe("warn");
    expect(results.config!.detail).toBe("agent-qa.yaml");
  });
});

describe(".gitignore evaluation", () => {
  const ignored = (text: string, path: string, ci = false) => isIgnored(parseGitignore(text, "", ci), path);
  const vault = ".agent-qa/vault/x.vault";

  it.each([
    ".agent-qa/",
    "**/.agent-qa/",
    ".agent-qa/**/",
    ".agent-qa/vault/**/*",
    "vault/",
    "*",
    ".agent-qa/vault/\n!.agent-qa/",
    "\uFEFF.agent-qa/vault  ",
  ])("treats %j as ignoring the vault", (text) => {
    expect(ignored(text, vault)).toBe(true);
  });

  it.each(["  .agent-qa/", ".agent-qa/\n!.agent-qa/", "agent-qa/", ".agent-qa/vault.txt", "# .agent-qa/"])("treats %j as not ignoring it", (text) => {
    expect(ignored(text, vault)).toBe(false);
  });

  it("keeps a file ignored when its folder is ignored, and matches case-insensitively when asked", () => {
    expect(ignored(".agent-qa/\n!.agent-qa/vault/", vault)).toBe(true);
    expect(ignored(".AGENT-QA/", vault)).toBe(false);
    expect(ignored(".AGENT-QA/", vault, true)).toBe(true);
  });
});

describe("keychain lookups", () => {
  it("explains a missing keychain module without pointing at the vault key", async () => {
    const lookup = keychainLookup(async () => {
      throw new Error("OS keychain support is not installed; reinstall without --omit=optional");
    });
    await expect(lookup("jira")).rejects.toThrow(/can't be read for jira.*not installed.*\$\{env:NAME\}/);
    await expect(lookup("jira")).rejects.not.toThrow(/AGENT_QA_VAULT_KEY/);
  });
});

describe("doctor with a relative cwd", () => {
  it("keeps messages intact", async () => {
    const base = await mkdtemp(join(tmpdir(), "agent-qa-rel-"));
    const project = join(base, "qa");
    await mkdir(join(project, "agent-qa.yaml"), { recursive: true });
    const before = process.cwd();
    try {
      const results = await runDoctor({ cwd: relative(before, project), env: {}, online: false, keyring: keyring() });
      const config = results.find((r) => r.id === "config")!;
      expect(config.status).toBe("fail");
      expect(config.detail).toMatch(/directory/);
      expect(config.detail).not.toContain(base);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe("doctor in a git work tree (clean-up of slice 0 follow-ups)", () => {
  const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", ...args], { cwd, stdio: "pipe" });

  it("reads the .gitignore files above a project in a subfolder of the repo", async () => {
    git(dir, "init", "-q");
    await writeFile(join(dir, ".gitignore"), "**/.agent-qa/vault/\n");
    await mkdir(join(dir, "packages", "qa"), { recursive: true });
    await writeFile(join(dir, "packages", ".gitignore"), "qa/.agent-qa/runs/\n");
    await writeFile(join(dir, ".git", "info", "exclude"), "audit.jsonl\n");
    const project = join(dir, "packages", "qa");
    const rules = await loadIgnoreRules(project, [".agent-qa/vault/x.vault", ".agent-qa/runs/x/run.json", ".agent-qa/audit.jsonl"], false);
    expect(rules.prefix).toBe("packages/qa");
    expect(isIgnored(rules, ".agent-qa/vault/x.vault")).toBe(true);
    expect(isIgnored(rules, ".agent-qa/runs/x/run.json")).toBe(true);
    expect(isIgnored(rules, ".agent-qa/audit.jsonl")).toBe(true);
    expect(isIgnored(rules, "tests/a.spec.ts")).toBe(false);
    expect(byId(await doctor(ENV, { cwd: project })).gitignore!.status).toBe("pass");
  });

  it("fails when a vault file is tracked by git, even once it is ignored", async () => {
    git(dir, "init", "-q");
    await mkdir(join(dir, ".agent-qa", "vault"), { recursive: true });
    await writeFile(join(dir, ".agent-qa", "vault", "r1.vault"), "x");
    await writeFile(join(dir, "README.md"), "x");
    expect(byId(await doctor(ENV)).tracked!.status).toBe("pass");
    git(dir, "add", "README.md", ".agent-qa/vault/r1.vault");
    await writeFile(join(dir, ".gitignore"), ".agent-qa/\n");
    const tracked = byId(await doctor(ENV)).tracked!;
    expect(tracked.status).toBe("fail");
    expect(tracked.fix).toContain("git rm -r --cached .agent-qa");
    git(dir, "rm", "-q", "-r", "--cached", ".agent-qa");
    expect(byId(await doctor(ENV)).tracked!.status).toBe("pass");
  });

  it("reads index versions 2, 3 and 4 the way git ls-files does", async () => {
    git(dir, "init", "-q");
    const names = ["a.txt", "dir/b.txt", "dir/sub/c with space.txt", "dir/sub/ü.txt", ".agent-qa/vault/r.vault"];
    for (const n of names) {
      await mkdir(join(dir, n, ".."), { recursive: true });
      await writeFile(join(dir, n), n);
    }
    git(dir, "add", "-A");
    // An intent-to-add entry uses the extended flags (version 3).
    await writeFile(join(dir, "later.txt"), "x");
    git(dir, "add", "-N", "later.txt");
    for (const version of ["2", "3", "4"]) {
      if (version !== "3") git(dir, "update-index", "--index-version", version);
      const expected = execFileSync("git", ["ls-files", "-z"], { cwd: dir }).toString("utf8").split("\0").filter(Boolean);
      expect(await trackedPaths(join(dir, ".git")), `version ${version}`).toEqual(expected);
    }
    expect(parseGitIndex(Buffer.from("not an index"))).toBeUndefined();
  });
});

