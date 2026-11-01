import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, configJsonSchema, loadConfig, parseConfig, resolveSecret } from "../src/core/index.js";

/** The example from contract 1 of the slice 0 plan, with a concrete model id. */
const FULL = `version: 1

project:
  name: techcare-sf

atlassian:
  site: https://acme.atlassian.net
  email: \${env:ATLASSIAN_EMAIL}
  token: \${env:ATLASSIAN_API_TOKEN}
  confluence:
    spaceKey: QA
    parentPageId: "123456"

xray:
  clientId: \${env:XRAY_CLIENT_ID}
  clientSecret: \${env:XRAY_CLIENT_SECRET}
  projectKey: PROJ

git:
  platform: github
  repo: acme/sf-tests
  token: \${env:GITHUB_TOKEN}

salesforce:
  baseUrl: https://acme--qa.sandbox.my.salesforce.com
  auth: storage-state

models:
  default: anthropic:claude-model-x
  allowed: [anthropic:*, openai:*, mistral:*, xai:*, google:*]
  workflows:
    scripts: openai:gpt-model-y
  keys:
    anthropic: \${env:ANTHROPIC_API_KEY}

masking:
  restoreOnWrite: false
  detectors: [email, phone, iban, card, national-id, name]
  fields:
    jira: [reporter, assignee, customfield_10042]
  presidio:
    url: null

policy:
  writes:
    xray: ask
    confluence: ask
    testCode: ask
    jira: deny

harness:
  sources:
    - fixtures: ./harness/fixtures
    - jira:
        jql: "project = QAH AND labels = agent-qa-harness"
  seededPersonalData: ./harness/seeds.yaml

playwright:
  baseUrl: http://localhost:3000
  testDir: tests
  profile: .agent-qa/framework-profile.json
`;

function problems(text: string) {
  try {
    parseConfig(text);
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  throw new Error("expected a ConfigError");
}

describe("agent-qa.yaml", () => {
  it("accepts the full contract example", () => {
    const config = parseConfig(FULL);
    expect(config.git?.platform).toBe("github");
    expect(config.models?.default).toBe("anthropic:claude-model-x");
    expect(config.harness?.sources).toHaveLength(2);
  });

  it("needs only a version, and applies safe defaults", () => {
    const config = parseConfig("version: 1\n");
    expect(config.masking.restoreOnWrite).toBe(false);
    expect(config.policy.writes).toEqual({ xray: "ask", confluence: "ask", testCode: "ask", jira: "deny" });
  });

  it("rejects a secret field that isn't a reference, with its line", () => {
    const text = FULL.replace("token: ${env:GITHUB_TOKEN}", "token: hunter2");
    const [p] = problems(text);
    expect(p).toMatchObject({ path: "git.token", line: text.split("\n").findIndex((l) => l.includes("hunter2")) + 1 });
    expect(p!.message).toMatch(/secret reference/);
  });

  it("rejects a pasted token anywhere in the file", () => {
    const text = "version: 1\nproject:\n  name: ghp_" + "a".repeat(36) + "\n";
    expect(problems(text)).toEqual([expect.objectContaining({ path: "project.name", line: 3, message: expect.stringMatching(/GitHub token/) })]);
    const atlassian = FULL.replace("${env:ATLASSIAN_EMAIL}", "ATATT3xFfGF0" + "b".repeat(30));
    expect(problems(atlassian).map((p) => p.path)).toContain("atlassian.email");
  });

  it("reports every problem at once", () => {
    const text = "version: 2\nunknown: true\nmodels:\n  default: gpt-4\n";
    const paths = problems(text).map((p) => p.path).sort();
    expect(paths).toEqual(["$", "models.default", "version"]);
  });

  it("checks model ids and patterns", () => {
    expect(() => parseConfig("version: 1\nmodels:\n  default: acme:model\n")).toThrow(/provider:model/);
    expect(() => parseConfig("version: 1\nmodels:\n  default: openai:gpt-x\n  allowed: [openai]\n")).toThrow(/provider:\*/);
    expect(parseConfig("version: 1\nmodels:\n  default: litellm:my-proxy/model@1\n").models?.default).toBe("litellm:my-proxy/model@1");
  });

  it("requires https for Atlassian and Salesforce", () => {
    const text = FULL.replace("https://acme.atlassian.net", "http://acme.atlassian.net");
    expect(problems(text)).toEqual([expect.objectContaining({ path: "atlassian.site" })]);
  });

  it("reports YAML syntax errors and duplicate keys with a line", () => {
    expect(problems("version: 1\nproject: [\n")[0]).toMatchObject({ path: "$" });
    expect(problems("version: 1\nversion: 1\n")[0]?.line).toBe(2);
  });

  it("loads agent-qa.yaml or agent-qa.yml from a folder", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-qa-config-"));
    try {
      await expect(loadConfig(dir)).rejects.toThrow(/agent-qa init/);
      await writeFile(join(dir, "agent-qa.yml"), "version: 1\n");
      expect((await loadConfig(dir)).file).toBe(join(dir, "agent-qa.yml"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("agent-qa.yaml hardening", () => {
  it("gives every parse its own defaults", () => {
    const first = parseConfig("version: 1\n");
    first.policy.writes.jira = "allow";
    first.masking.restoreOnWrite = true;
    const second = parseConfig("version: 1\n");
    expect(second.policy.writes.jira).toBe("deny");
    expect(second.masking.restoreOnWrite).toBe(false);
  });

  it("fills missing policy defaults", () => {
    expect(parseConfig("version: 1\npolicy:\n  writes:\n    xray: allow\n").policy.writes).toEqual({
      xray: "allow",
      confluence: "ask",
      testCode: "ask",
      jira: "deny",
    });
    expect(parseConfig("version: 1\npolicy: {}\n").policy.writes.jira).toBe("deny");
  });

  it("rejects credentials in URLs and URLs without //", () => {
    const withUser = "version: 1\ngit:\n  platform: gitlab\n  repo: a/b\n  token: ${env:T}\n  baseUrl: https://oauth2:hunter2secretvalue@gitlab.example.com\n";
    expect(problems(withUser)).toEqual([expect.objectContaining({ path: "git.baseUrl", message: expect.stringMatching(/username or password/) })]);
    expect(problems(FULL.replace("https://acme--qa.sandbox.my.salesforce.com", "https:acme.my.salesforce.com")).map((p) => p.path)).toEqual(["salesforce.baseUrl"]);
  });

  it("scans keys and never echoes a secret in a message", () => {
    const secret = "sk-ant-" + "x".repeat(40);
    const text = `version: 1\nmodels:\n  default: openai:gpt-x\n  workflows:\n    ${secret}: openai:gpt-x\n`;
    const found = problems(text);
    expect(found).toEqual([expect.objectContaining({ path: "models.workflows.<key>", line: 5 })]);
    expect(JSON.stringify(found)).not.toContain(secret);
  });

  it("catches JWTs and Slack tokens but not ordinary sk- names", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(problems(`version: 1\nproject:\n  name: ${jwt}\n`)[0]?.message).toMatch(/JWT/);
    expect(problems("version: 1\nproject:\n  name: xoxb-123456789012-abcdefghij\n")[0]?.message).toMatch(/Slack/);
    expect(parseConfig("version: 1\nproject:\n  name: sk-regression-suite-salesforce\n").project?.name).toBe("sk-regression-suite-salesforce");
    const jql = 'version: 1\nharness:\n  sources:\n    - jira:\n        jql: "labels in (sk-regression-nightly-run)"\n';
    expect(parseConfig(jql).harness?.sources).toHaveLength(1);
  });

  it("turns an alias bomb into a ConfigError", () => {
    const lines = ["version: 1", "a: &a [x, x, x, x, x, x, x, x, x, x]"];
    for (let i = 0; i < 8; i++) lines.push(`${String.fromCharCode(98 + i)}: &${String.fromCharCode(98 + i)} [*${String.fromCharCode(97 + i)}, *${String.fromCharCode(97 + i)}, *${String.fromCharCode(97 + i)}, *${String.fromCharCode(97 + i)}, *${String.fromCharCode(97 + i)}, *${String.fromCharCode(97 + i)}, *${String.fromCharCode(97 + i)}, *${String.fromCharCode(97 + i)}, *${String.fromCharCode(97 + i)}, *${String.fromCharCode(97 + i)}]`);
    expect(() => parseConfig(lines.join("\n") + "\n")).toThrow(/can.t be read/);
  });
});

describe("secret references", () => {
  it("resolves env and keychain references at use time", async () => {
    expect(await resolveSecret("${env:TOKEN}", { env: { TOKEN: "t0k" } })).toBe("t0k");
    expect(await resolveSecret("${keychain:jira}", { keychain: async (n) => (n === "jira" ? "k3y" : undefined) })).toBe("k3y");
  });

  it("fails clearly when a secret is missing", async () => {
    await expect(resolveSecret("${env:NOPE}", { env: {} })).rejects.toThrow(/NOPE is not set/);
    await expect(resolveSecret("${keychain:x}", {})).rejects.toThrow(/No keychain/);
    await expect(resolveSecret("ghp_realsecretvalue", {})).rejects.toThrow(/Not a secret reference/);
    await expect(resolveSecret("ghp_realsecretvalue", {})).rejects.not.toThrow(/ghp_/);
  });
});

describe("JSON Schema", () => {
  it("matches the committed schema/agent-qa.schema.json (run `npm run schema` after changing the config)", async () => {
    const committed = JSON.parse(await readFile(new URL("../schema/agent-qa.schema.json", import.meta.url), "utf8"));
    expect(committed).toEqual(configJsonSchema());
  });
});
