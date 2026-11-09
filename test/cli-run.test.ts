import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { CLAUDE_CODE_SERVER, configTemplate, CURSOR_SERVER, initCommand, MCP_SERVER, nextSteps, siteOf } from "../src/cli/init.js";
import { EXIT, runCommand, type RunOptions } from "../src/cli/run.js";
import { buildProgram } from "../src/cli/index.js";
import type { JiraCollection, JiraInput, JiraIssue, XrayTest } from "../src/connectors/index.js";
import { configSchema, MemoryAuditSink, RunStore } from "../src/core/index.js";
import { DataAccess } from "../src/data/index.js";
import { StaticDriver, type ModelRequest } from "../src/llm/index.js";
import { MemoryVaultStorage, Vault } from "../src/masking/index.js";
import { TEST_CASES_ARTIFACT, XRAY_PUSH_ARTIFACT } from "../src/workflows/index.js";

const adf = (text: string) => ({ text, mentions: [], links: [] });
const ISSUE: JiraIssue = {
  key: "ABC-1",
  id: "1",
  type: "Story",
  subtask: false,
  summary: "Escalate old cases for Marguerite Quillfeather",
  description: adf("Escalate old cases.\n\nAcceptance criteria:\n- A case older than 2 days is escalated"),
  extraFields: {},
  labels: [],
  components: [],
  fixVersions: [],
  children: [],
  links: [],
  remoteLinks: [],
  people: [{ role: "reporter", displayName: "Marguerite Quillfeather", accountId: "a1" }],
  updated: "2026-11-01T10:00:00.000+0000",
  role: "root",
  depth: 0,
};

const answers: Record<string, unknown> = {
  analyze: { issues: [{ key: "ABC-1", quality: { score: 70, missing: [] }, openQuestions: [], inferredCriteria: [] }] },
  cases: {
    cases: [
      {
        id: "TC-ABC-1-001",
        requirement: "ABC-1",
        title: "Old case escalated for <PERSON_1>",
        type: "positive",
        priority: "P1",
        preconditions: [],
        steps: [{ action: "Open an old case", data: "", expected: "It is escalated" }],
        covers: ["AC1"],
      },
    ],
  },
};

const YAML = `version: 1
atlassian:
  site: https://acme.atlassian.net
  email: \${env:E}
  token: \${env:T}
models:
  default: anthropic:claude-sonnet-5-5
xray:
  clientId: \${env:XI}
  clientSecret: \${env:XS}
  projectKey: QA
policy:
  writes:
    xray: allow
`;

let dir: string;
let lines: string[];
let sent: XrayTest[][];
let audit: MemoryAuditSink;
let prompts: ModelRequest[];
const key = Buffer.alloc(32, 3);
const vaults = new MemoryVaultStorage();

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agent-qa-run-"));
  await writeFile(join(dir, "agent-qa.yaml"), YAML);
  lines = [];
  sent = [];
  audit = new MemoryAuditSink();
  prompts = [];
});
afterEach(() => rm(dir, { recursive: true, force: true }));

function options(over: Partial<RunOptions> = {}): RunOptions {
  return {
    root: dir,
    env: {},
    log: (l) => lines.push(l),
    driver: new StaticDriver((r) => (prompts.push(r), JSON.stringify(answers[r.schemaName!.replace(/_\d+$/, "")] ?? {}))),
    data: (base) =>
      new DataAccess({
        ...base,
        vault: new Vault({ storage: vaults, keys: { description: "t", getKey: async () => key } }),
        jira: { collect: async (input: JiraInput): Promise<JiraCollection> => ({ input, issues: [structuredClone(ISSUE)], truncated: false, unreachable: [], extraFields: [] }) },
        confluence: { pages: async () => ({ pages: [], skipped: [] }) },
        labels: { findByLabels: async () => new Map() },
        xray: {
          importAndWait: async (tests) => {
            sent.push(tests);
            return { jobId: "j1", status: "successful", issues: tests.map((_, i) => ({ elementNumber: i, key: `QA-${i + 1}` })), errors: [] };
          },
        },
        audit,
      }),
    ...over,
  };
}

const runIdIn = () => /Run (\S+) /.exec(lines[0]!)![1]!;

describe("agent-qa run", () => {
  it("runs test-cases end to end with --yes --accept push: model steps, an unattended review and the push", async () => {
    expect(await runCommand(options({ workflow: "test-cases", key: "ABC-1", yes: true, accept: ["push"] }))).toBe(EXIT.done);
    const runId = runIdIn();
    const runs = new RunStore(join(dir, ".agent-qa", "runs"));
    const cases = (await runs.readArtifact(runId, TEST_CASES_ARTIFACT))!;
    expect(cases.data.review).toMatchObject({ generated: 1, kept: 1, unattended: true });
    expect((await runs.readArtifact(runId, XRAY_PUSH_ARTIFACT))!.data.counts).toEqual({ created: 1, updated: 0, failed: 0 });
    expect(sent[0]![0]!.fields.summary).toBe("[TC-ABC-1-001] Old case escalated for <PERSON_1>");
    expect(lines).toContain("- review: answered unattended (--yes)");
    expect(lines).toContain("- push: accepted");
    expect(lines.at(-1)).toMatch(/^Done\. Run folder: \.agent-qa[/\\]runs[/\\]\S+\n {2}cost\.json\n[^]* {2}masking-report\.json\n[^]* {2}xray-push\.json/);
    expect(prompts.map((p) => p.schemaName)).toEqual(["analyze", "cases"]);
    const cost = JSON.parse(await readFile(join(dir, ".agent-qa", "runs", runId, "cost.json"), "utf8"));
    expect(cost.data.steps.map((st: { stepId: string; driver: string }) => [st.stepId, st.driver])).toEqual([["analyze", "api"], ["cases", "api"]]);
    for (const p of prompts) expect(JSON.stringify(p)).not.toContain("Quillfeather");
    expect(lines.join("\n")).not.toContain("Quillfeather");
    expect(await readFile(join(dir, ".agent-qa", "runs", runId, "test-cases.md"), "utf8")).toContain("accepted without a review (--yes)");
  });

  it("never pushes on --yes alone, even when the policy only asks", async () => {
    await writeFile(join(dir, "agent-qa.yaml"), YAML.replace("xray: allow", "xray: ask"));
    expect(await runCommand(options({ workflow: "test-cases", key: "ABC-1", yes: true }))).toBe(EXIT.done);
    expect(lines).toContain("- push: declined (--yes never accepts this step; use --accept push)");
    expect(sent).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  it("pushes a declined run's reviewed cases later with --push-from, still never on --yes alone", async () => {
    expect(await runCommand(options({ workflow: "test-cases", key: "ABC-1", yes: true }))).toBe(EXIT.done);
    const earlier = runIdIn();
    lines = [];
    prompts.length = 0;
    expect(await runCommand(options({ workflow: "test-cases", pushFrom: earlier, yes: true }))).toBe(EXIT.done);
    expect(lines).toContain("- push: declined (--yes never accepts this step; use --accept push)");
    expect(sent).toHaveLength(0);
    lines = [];
    expect(await runCommand(options({ workflow: "test-cases", pushFrom: earlier, accept: ["push"] }))).toBe(EXIT.done);
    const later = runIdIn();
    expect(later).not.toBe(earlier);
    expect(sent).toHaveLength(1);
    expect(prompts).toHaveLength(0);
    const push = (await new RunStore(join(dir, ".agent-qa", "runs")).readArtifact(later, XRAY_PUSH_ARTIFACT))!;
    expect(push.data.testCases.run).toBe(earlier);
    lines = [];
    expect(await runCommand(options({ workflow: "test-cases", pushFrom: earlier, accept: ["push"] }))).toBe(EXIT.setup);
    expect(lines.join("\n")).toContain("already pushed to Xray");
    expect(await runCommand(options({ workflow: "test-cases", pushFrom: earlier, key: "ABC-1" }))).toBe(EXIT.setup);
  });

  it("rejects --accept or --decline naming no confirm step, and both at once", async () => {
    expect(await runCommand(options({ workflow: "test-cases", key: "ABC-1", yes: true, decline: ["pushh"] }))).toBe(EXIT.setup);
    expect(lines.at(-1)).toBe("agent-qa run: test-cases has no confirm step pushh; its confirm steps are changes, reuse, review, push");
    expect(await runCommand(options({ workflow: "test-cases", key: "ABC-1", accept: ["push"], decline: ["push"] }))).toBe(EXIT.setup);
    expect(sent).toHaveLength(0);
  });

  it("writes a document with --type, and keeps --type and --publish to the document workflow", async () => {
    answers["draft-test-plan"] = {
      summary: "Tests escalation for <PERSON_1>.",
      objectives: ["Old cases are escalated"],
      inScope: ["Escalation"],
      outOfScope: [],
      approach: "Functional tests.",
      requirements: [{ key: "ABC-1", risk: "high", focus: "The boundary" }],
      risks: [],
      environments: ["UAT"],
      testData: [],
      entryCriteria: ["Stories done"],
      exitCriteria: ["No open P1"],
      assumptions: [],
    };
    expect(await runCommand(options({ workflow: "document", type: "test-plan", key: "ABC-1", yes: true }))).toBe(EXIT.done);
    expect(await readFile(join(dir, ".agent-qa", "runs", runIdIn(), "document.md"), "utf8")).toContain("# Test plan: ABC-1");
    expect(await runCommand(options({ workflow: "test-cases", type: "test-plan", key: "ABC-1" }))).toBe(EXIT.setup);
    expect(await runCommand(options({ workflow: "document", type: "test-plan", key: "ABC-1", publish: "confluence", yes: true }))).toBe(EXIT.setup);
    expect(lines.join("\n")).toContain("publish: confluence needs atlassian.confluence.spaceKey");
    expect(await runCommand(options({ resume: runIdIn(), type: "test-plan" }))).toBe(EXIT.setup);
  });

  it("stops at a confirm step with nobody to ask, then resumes with --decline", async () => {
    expect(await runCommand(options({ workflow: "test-cases", key: "ABC-1" }))).toBe(EXIT.waiting);
    const runId = runIdIn();
    expect(lines.at(-1)).toBe(`Answer it in your IDE, or run: agent-qa run --resume ${runId} --accept review (or --decline review)`);
    lines = [];
    expect(await runCommand(options({ resume: runId, key: "ABC-1" }))).toBe(EXIT.setup);
    expect(await runCommand(options({ resume: runId, accept: ["review"], decline: ["push"] }))).toBe(EXIT.done);
    expect(lines).toContain("- push: declined");
    expect(sent).toHaveLength(0);
  });

  it("asks the person in a terminal, and their yes is a real review", async () => {
    const asked: string[] = [];
    expect(await runCommand(options({ workflow: "test-cases", key: "ABC-1", ask: async (q) => (asked.push(q), !q.startsWith("push")) }))).toBe(EXIT.done);
    expect(asked).toEqual(["review: accept?", "push: accept?"]);
    const cases = (await new RunStore(join(dir, ".agent-qa", "runs")).readArtifact(runIdIn(), TEST_CASES_ARTIFACT))!;
    expect(cases.data.review.unattended).toBeUndefined();
    expect(sent).toHaveLength(0);
  });

  it("leaves the step open when the person interrupts the prompt", async () => {
    expect(await runCommand(options({ workflow: "test-cases", key: "ABC-1", ask: async () => undefined }))).toBe(EXIT.waiting);
    expect(lines.at(-1)).toMatch(/--resume \S+ --accept review/);
  });

  it("in CI, skips a push the policy would have to ask for", async () => {
    await writeFile(join(dir, "agent-qa.yaml"), YAML.replace("xray: allow", "xray: ask"));
    expect(await runCommand(options({ workflow: "test-cases", key: "ABC-1", yes: true, accept: ["push"], env: { CI: "true" } }))).toBe(EXIT.done);
    expect(sent).toHaveLength(0);
    expect(lines.some((l) => l.startsWith("- push"))).toBe(false);
  });

  it("gives exit 2 for bad setup or input, and 1 for a failed run", async () => {
    expect(await runCommand(options({ workflow: "test-cases" }))).toBe(EXIT.setup);
    expect(await runCommand(options({ workflow: "nope", key: "ABC-1" }))).toBe(EXIT.setup);
    expect(await runCommand(options({ workflow: "test-cases", key: "not a key" }))).toBe(EXIT.setup);
    expect(await runCommand(options({ workflow: "test-cases", input: "{" }))).toBe(EXIT.setup);
    expect(await runCommand(options({ workflow: "requirements", key: "ABC-1", changedOnly: true }))).toBe(EXIT.setup);
    expect(lines.at(-1)).toContain("--changed-only is for the test-cases workflow");
    expect(await runCommand(options({ resume: "2026-11-03-x-abcd" }))).toBe(EXIT.setup);
    expect(lines.at(-1)).toMatch(/no run 2026-11-03-x-abcd in this project's run folder/);
    expect(await runCommand(options({ resume: "../../etc" }))).toBe(EXIT.setup);
    expect(await runCommand(options({ workflow: "test-cases", fromRun: "2026-11-03-none-abcd" }))).toBe(EXIT.setup);
    const noDriver = options({ workflow: "test-cases", key: "ABC-1", model: "nope" });
    delete noDriver.driver;
    expect(await runCommand(noDriver)).toBe(EXIT.setup);
    expect(lines.at(-1)).toContain("Not a provider:model id");
    expect(await runCommand(options({ workflow: "test-cases", key: "ABC-1", root: join(dir, "missing") }))).toBe(EXIT.setup);
    lines = [];
    const failing = new StaticDriver(() => {
      throw new Error("rate limited");
    });
    expect(await runCommand(options({ workflow: "test-cases", key: "ABC-1", driver: failing }))).toBe(EXIT.failed);
    expect(lines.join("\n")).toContain("rate limited");
    lines = [];
    expect(await runCommand(options({ workflow: "test-cases", key: "ABC-1", driver: new StaticDriver("{}") }))).toBe(EXIT.failed);
    expect(lines.some((l) => l.includes("failed at analyze"))).toBe(true);
  });

  it("answers with a headless agent CLI without a models section, and says when it isn't installed", async () => {
    await writeFile(join(dir, "agent-qa.yaml"), YAML.replace("models:\n  default: anthropic:claude-sonnet-5-5\n", ""));
    const headless = options({ workflow: "test-cases", key: "ABC-1", headless: "claude-code", env: { PATH: join(dir, "no-bin") } });
    delete headless.driver;
    expect(await runCommand(headless)).toBe(EXIT.failed);
    expect(lines.join("\n")).toContain("claude (npm install -g @anthropic-ai/claude-code) isn't on the PATH");
    const runId = /^Run (\S+)/.exec(lines.find((l) => l.startsWith("Run "))!)![1]!;
    expect(JSON.parse(await readFile(join(dir, ".agent-qa", "runs", runId, "run.json"), "utf8"))).toMatchObject({ host: "cli", driver: "headless" });
    // A model for the API, not the CLI, is refused before anything runs.
    lines = [];
    const wrongModel = options({ workflow: "test-cases", key: "ABC-1", headless: "claude-code", model: "openai:gpt-x", env: { PATH: join(dir, "no-bin") } });
    delete wrongModel.driver;
    expect(await runCommand(wrongModel)).toBe(EXIT.setup);
    expect(lines.join("\n")).toContain("claude-code can't answer with openai:gpt-x");
  });

  it("keeps the run and says how to resume when a source or Xray fails", async () => {
    const failingData = (what: "jira" | "xray") => (base: ConstructorParameters<typeof DataAccess>[0]) => {
      const data = options().data!(base);
      const target = data as unknown as { options: Record<string, unknown> };
      if (what === "jira") target.options.jira = { collect: async () => { throw new Error("Jira is down"); } };
      else target.options.xray = { importAndWait: async () => { throw new Error("boom 401"); } };
      return data;
    };
    expect(await runCommand(options({ workflow: "test-cases", key: "ABC-1", data: failingData("jira") }))).toBe(EXIT.failed);
    expect(lines.at(-1)).toMatch(/^The run is kept: fix the cause, then run agent-qa run --resume \S+$/);
    expect(lines.join("\n")).not.toContain("workflow_next");
    lines = [];
    expect(await runCommand(options({ workflow: "test-cases", key: "ABC-1", yes: true, accept: ["push"], data: failingData("xray") }))).toBe(EXIT.failed);
    expect(lines.at(-2)).toBe("agent-qa run: Error: boom 401");
    expect(lines.at(-1)).toMatch(/--resume /);
  });

  it("parses repeatable --accept and --decline after the workflow", async () => {
    const program = buildProgram().exitOverride();
    const run = program.commands.find((c) => c.name() === "run")!;
    run.action(() => {});
    await program.parseAsync(["node", "agent-qa", "run", "test-cases", "--key", "ABC-1", "--yes", "--accept", "push", "--decline", "review"]);
    expect(run.opts()).toMatchObject({ key: "ABC-1", yes: true, accept: ["push"], decline: ["review"] });
    run.configureOutput({ writeErr: () => {} });
    await expect(buildProgram().exitOverride().configureOutput({ writeErr: () => {} }).parseAsync(["node", "agent-qa", "run", "test-cases", "--accept", "--key", "ABC-1"])).rejects.toThrow();
  });
});

describe("agent-qa init", () => {
  it("writes a valid agent-qa.yaml, the MCP server and the .gitignore lines", async () => {
    const root = join(dir, "p");
    await mkdir(root);
    expect(await initCommand({ root, site: "https://acme.atlassian.net", xrayProject: "QA", log: (l) => lines.push(l) })).toBe(0);
    const config = configSchema.parse(parseYaml(await readFile(join(root, "agent-qa.yaml"), "utf8")));
    expect(config.xray?.projectKey).toBe("QA");
    expect(config.models?.default).toMatch(/^anthropic:/);
    expect(JSON.parse(await readFile(join(root, ".vscode", "mcp.json"), "utf8"))).toEqual({ servers: { "agent-qa": MCP_SERVER } });
    expect(MCP_SERVER).not.toHaveProperty("cwd");
    expect(JSON.parse(await readFile(join(root, ".mcp.json"), "utf8"))).toEqual({ mcpServers: { "agent-qa": CLAUDE_CODE_SERVER } });
    // Claude Code expands only ${VAR}: no ${workspaceFolder} there.
    expect(JSON.stringify(CLAUDE_CODE_SERVER)).not.toContain("workspaceFolder");
    expect(CLAUDE_CODE_SERVER.args).toEqual(MCP_SERVER.args);
    expect(JSON.parse(await readFile(join(root, ".cursor", "mcp.json"), "utf8"))).toEqual({ mcpServers: { "agent-qa": CURSOR_SERVER } });
    expect(await readFile(join(root, ".gitignore"), "utf8")).toContain(".agent-qa/\n");

    // Again: nothing is overwritten or added twice.
    lines = [];
    await writeFile(join(root, "agent-qa.yaml"), "version: 1\n");
    expect(await initCommand({ root, log: (l) => lines.push(l) })).toBe(0);
    expect(await readFile(join(root, "agent-qa.yaml"), "utf8")).toBe("version: 1\n");
    expect((await readFile(join(root, ".gitignore"), "utf8")).match(/\.agent-qa\//g)).toHaveLength(1);
    expect(lines.slice(0, 5)).toEqual([
      "agent-qa.yaml: kept (exists; --force replaces it)",
      ".vscode/mcp.json: kept (it already has an agent-qa server)",
      ".mcp.json: kept (it already has an agent-qa server)",
      ".cursor/mcp.json: kept (it already has an agent-qa server)",
      ".gitignore: kept (.agent-qa/ is ignored)",
    ]);
  });

  it("adds to an existing mcp.json, and leaves one with comments alone", async () => {
    const root = join(dir, "q");
    await mkdir(join(root, ".vscode"), { recursive: true });
    await writeFile(join(root, ".vscode", "mcp.json"), JSON.stringify({ servers: { other: { command: "x" } }, inputs: [] }));
    await writeFile(join(root, ".gitignore"), "node_modules");
    expect(await initCommand({ root, log: (l) => lines.push(l) })).toBe(0);
    expect(JSON.parse(await readFile(join(root, ".vscode", "mcp.json"), "utf8"))).toEqual({ servers: { other: { command: "x" }, "agent-qa": MCP_SERVER }, inputs: [] });
    expect(await readFile(join(root, ".gitignore"), "utf8")).toMatch(/^node_modules\n# agent-qa/);

    await writeFile(join(root, ".vscode", "mcp.json"), '// mine\n{ "servers": {} }');
    expect(await initCommand({ root, force: true, log: (l) => lines.push(l) })).toBe(2);
    expect(await readFile(join(root, ".vscode", "mcp.json"), "utf8")).toBe('// mine\n{ "servers": {} }');
  });

  it("sets up only the hosts asked for, adds to an existing .mcp.json, and leaves one of another shape alone", async () => {
    const root = join(dir, "h");
    await mkdir(root);
    await writeFile(join(root, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "x" } } }));
    expect(await initCommand({ root, hosts: ["claude-code"], log: (l) => lines.push(l) })).toBe(0);
    expect(JSON.parse(await readFile(join(root, ".mcp.json"), "utf8"))).toEqual({ mcpServers: { other: { command: "x" }, "agent-qa": CLAUDE_CODE_SERVER } });
    await expect(readFile(join(root, ".vscode", "mcp.json"), "utf8")).rejects.toThrow();
    await expect(readFile(join(root, ".cursor", "mcp.json"), "utf8")).rejects.toThrow();

    await mkdir(join(root, ".cursor"));
    await writeFile(join(root, ".cursor", "mcp.json"), JSON.stringify({ mcpServers: [] }));
    lines = [];
    expect(await initCommand({ root, hosts: ["cursor"], log: (l) => lines.push(l) })).toBe(2);
    expect(await readFile(join(root, ".cursor", "mcp.json"), "utf8")).toBe(JSON.stringify({ mcpServers: [] }));
    expect(lines.join("\n")).toContain('.cursor/mcp.json: not changed (it isn\'t plain JSON with a mcpServers object). Add this server under "mcpServers"');
  });

  it("refuses an IDE host it doesn't know", async () => {
    const program = buildProgram().exitOverride().configureOutput({ writeErr: () => {} });
    program.commands.forEach((c) => c.exitOverride().configureOutput({ writeErr: () => {} }));
    await expect(program.parseAsync(["node", "agent-qa", "init", "--host", "vscode,emacs"])).rejects.toThrow(/expected vscode, claude-code, cursor/);
  });

  it("asks a terminal only for the Jira site and the Xray key, and names the variables to set next", async () => {
    const root = join(dir, "ask");
    await mkdir(root);
    const answers = ["not a site!", "Acme", "qa project", "qa"];
    const asked: string[] = [];
    const ask = async (q: string) => (asked.push(q), answers.shift());
    expect(await initCommand({ root, ask, platform: "win32", log: (l) => lines.push(l) })).toBe(0);
    expect(asked).toHaveLength(4);
    const config = configSchema.parse(parseYaml(await readFile(join(root, "agent-qa.yaml"), "utf8")));
    expect(config.atlassian?.site).toBe("https://acme.atlassian.net");
    expect(config.xray?.projectKey).toBe("QA");
    const out = lines.join("\n");
    expect(out).toContain("not a site! isn't a Jira Cloud site");
    expect(out).toContain("Set ATLASSIAN_EMAIL, ATLASSIAN_TOKEN, XRAY_CLIENT_ID, XRAY_CLIENT_SECRET, in PowerShell:");
    expect(out).toContain("ATLASSIAN_TOKEN is an API token from https://id.atlassian.com/manage-profile/security/api-tokens.");
    expect(out).toContain('$env:XRAY_CLIENT_SECRET = "..."');
    expect(out).toContain("also ANTHROPIC_API_KEY");

    // Enter skips Xray; an interrupt writes nothing.
    const skip = join(dir, "skip");
    await mkdir(skip);
    const more = ["acme.atlassian.net/jira/your-work", ""];
    expect(await initCommand({ root: skip, ask: async () => more.shift(), platform: "linux", log: () => {} })).toBe(0);
    const text = await readFile(join(skip, "agent-qa.yaml"), "utf8");
    expect(configSchema.parse(parseYaml(text)).xray).toBeUndefined();
    expect(nextSteps(text, "linux")).toContain("       export ATLASSIAN_TOKEN=...");
    expect(nextSteps(text, "linux").join("\n")).not.toContain("XRAY");
    const stopped = join(dir, "stopped");
    await mkdir(stopped);
    expect(await initCommand({ root: stopped, ask: async () => undefined, log: () => {} })).toBe(2);
    await expect(readFile(join(stopped, "agent-qa.yaml"), "utf8")).rejects.toThrow();

    // Nobody to ask: the placeholder, and init says so.
    const quiet = join(dir, "quiet");
    await mkdir(quiet);
    lines = [];
    expect(await initCommand({ root: quiet, log: (l) => lines.push(l) })).toBe(0);
    expect(lines[0]).toBe("agent-qa.yaml: written, with the placeholder site https://YOUR-SITE.atlassian.net: set atlassian.site to yours");
  });

  it("reads a Jira Cloud site the way people type it", () => {
    expect(siteOf("acme")).toBe("https://acme.atlassian.net");
    expect(siteOf(" acme.atlassian.net ")).toBe("https://acme.atlassian.net");
    expect(siteOf("https://acme.atlassian.net/browse/ABC-1")).toBe("https://acme.atlassian.net");
    expect(siteOf("http://insecure")).toBe("http://insecure");
    expect(siteOf("")).toBeUndefined();
    expect(siteOf("ftp://acme.atlassian.net")).toBeUndefined();
    expect(siteOf("two words")).toBeUndefined();
  });

  it("refuses settings that don't make a valid config", async () => {
    const root = join(dir, "r");
    await mkdir(root);
    expect(await initCommand({ root, site: "http://insecure", log: (l) => lines.push(l) })).toBe(2);
    expect(await initCommand({ root: join(dir, "missing"), log: (l) => lines.push(l) })).toBe(2);
    expect(configTemplate({})).toContain("# xray:");
  });
});
