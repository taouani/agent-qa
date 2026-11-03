import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { configTemplate, initCommand, MCP_SERVER } from "../src/cli/init.js";
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
  it("runs test-cases end to end with --yes: model steps, an unattended review and the push", async () => {
    expect(await runCommand(options({ workflow: "test-cases", key: "ABC-1", yes: true }))).toBe(EXIT.done);
    const runId = runIdIn();
    const runs = new RunStore(join(dir, ".agent-qa", "runs"));
    const cases = (await runs.readArtifact(runId, TEST_CASES_ARTIFACT))!;
    expect(cases.data.review).toMatchObject({ generated: 1, kept: 1, unattended: true });
    expect((await runs.readArtifact(runId, XRAY_PUSH_ARTIFACT))!.data.counts).toEqual({ created: 1, updated: 0, failed: 0 });
    expect(sent[0]![0]!.fields.summary).toBe("[TC-ABC-1-001] Old case escalated for <PERSON_1>");
    expect(lines).toContain("- review: accepted (--yes)");
    expect(lines.at(-1)).toMatch(/^Done\. Run folder: \.agent-qa[/\\]runs[/\\]\S+\n {2}masking-report\.json\n[^]* {2}xray-push\.json/);
    expect(prompts.map((p) => p.schemaName)).toEqual(["analyze", "cases"]);
    for (const p of prompts) expect(JSON.stringify(p)).not.toContain("Quillfeather");
    expect(lines.join("\n")).not.toContain("Quillfeather");
    expect(await readFile(join(dir, ".agent-qa", "runs", runId, "test-cases.md"), "utf8")).toContain("accepted without a review (--yes)");
  });

  it("stops at a confirm step with nobody to ask, then resumes with --no", async () => {
    expect(await runCommand(options({ workflow: "test-cases", key: "ABC-1" }))).toBe(EXIT.waiting);
    const runId = runIdIn();
    expect(lines.at(-1)).toBe(`Answer it in your IDE, or run: agent-qa run --resume ${runId} with --yes or --no review`);
    lines = [];
    expect(await runCommand(options({ resume: runId, yes: true, no: ["push"] }))).toBe(EXIT.done);
    expect(lines).toContain("- push: declined");
    expect(sent).toHaveLength(0);
  });

  it("asks the person in a terminal, and their yes is a real review", async () => {
    const asked: string[] = [];
    expect(await runCommand(options({ workflow: "test-cases", key: "ABC-1", ask: async (q) => (asked.push(q), !q.startsWith("push")) }))).toBe(EXIT.done);
    expect(asked).toEqual(["review: accepted?".replace("accepted", "accept"), "push: accept?"]);
    const cases = (await new RunStore(join(dir, ".agent-qa", "runs")).readArtifact(runIdIn(), TEST_CASES_ARTIFACT))!;
    expect(cases.data.review.unattended).toBeUndefined();
    expect(sent).toHaveLength(0);
  });

  it("in CI, skips a push the policy would have to ask for", async () => {
    await writeFile(join(dir, "agent-qa.yaml"), YAML.replace("xray: allow", "xray: ask"));
    expect(await runCommand(options({ workflow: "test-cases", key: "ABC-1", yes: true, env: { CI: "true" } }))).toBe(EXIT.done);
    expect(sent).toHaveLength(0);
    expect(lines.some((l) => l.startsWith("- push"))).toBe(false);
  });

  it("gives exit 2 for bad setup or input, and 1 for a failed run", async () => {
    expect(await runCommand(options({ workflow: "test-cases" }))).toBe(EXIT.setup);
    expect(await runCommand(options({ workflow: "nope", key: "ABC-1" }))).toBe(EXIT.setup);
    expect(await runCommand(options({ workflow: "test-cases", key: "not a key" }))).toBe(EXIT.setup);
    expect(await runCommand(options({ workflow: "test-cases", input: "{" }))).toBe(EXIT.setup);
    expect(await runCommand(options({ resume: "2026-11-03-x-abcd" }))).toBe(EXIT.setup);
    expect(await runCommand(options({ workflow: "test-cases", key: "ABC-1", root: join(dir, "missing") }))).toBe(EXIT.setup);
    lines = [];
    const failing = new StaticDriver(() => {
      throw new Error("rate limited");
    });
    expect(await runCommand(options({ workflow: "test-cases", key: "ABC-1", driver: failing }))).toBe(EXIT.failed);
    expect(lines.at(-1)).toContain("rate limited");
    lines = [];
    expect(await runCommand(options({ workflow: "test-cases", key: "ABC-1", driver: new StaticDriver("{}") }))).toBe(EXIT.failed);
    expect(lines.some((l) => l.includes("failed at analyze"))).toBe(true);
  });

  it("parses --no as a list of steps", async () => {
    const program = buildProgram();
    const run = program.commands.find((c) => c.name() === "run")!;
    run.action(() => {});
    await program.parseAsync(["node", "agent-qa", "run", "test-cases", "--key", "ABC-1", "--yes", "--no", "push", "review"]);
    expect(run.opts()).toMatchObject({ key: "ABC-1", yes: true, no: ["push", "review"] });
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
    expect(await readFile(join(root, ".gitignore"), "utf8")).toContain(".agent-qa/\n");

    // Again: nothing is overwritten or added twice.
    lines = [];
    await writeFile(join(root, "agent-qa.yaml"), "version: 1\n");
    expect(await initCommand({ root, log: (l) => lines.push(l) })).toBe(0);
    expect(await readFile(join(root, "agent-qa.yaml"), "utf8")).toBe("version: 1\n");
    expect((await readFile(join(root, ".gitignore"), "utf8")).match(/\.agent-qa\//g)).toHaveLength(1);
    expect(lines.slice(0, 3)).toEqual(["agent-qa.yaml: kept (exists; --force replaces it)", ".vscode/mcp.json: kept (it already has an agent-qa server)", ".gitignore: kept (.agent-qa/ is ignored)"]);
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

  it("refuses settings that don't make a valid config", async () => {
    expect(await initCommand({ root: dir, site: "http://insecure", log: (l) => lines.push(l) })).toBe(2);
    expect(configTemplate({})).toContain("# xray:");
  });
});
