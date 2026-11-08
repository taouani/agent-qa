import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryAuditSink, RunStore } from "../src/core/index.js";
import { DataAccess } from "../src/data/index.js";
import { HeadlessDriver, modelName, type HeadlessCall, type HeadlessOutcome } from "../src/llm/index.js";

const NODE = process.execPath;

/** A stand-in `claude -p`: answers with what it was given, as Claude Code's JSON result. */
const FAKE_CLAUDE = `
const fs = require("fs");
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  const args = process.argv.slice(2);
  const env = Object.keys(process.env).filter((k) => /TOKEN|KEY/.test(k)).sort();
  process.stdout.write(JSON.stringify({
    type: "result", subtype: "success", is_error: false, result: "ignored",
    structured_output: { args, input, files: fs.readdirSync(process.cwd()), env },
    usage: { input_tokens: 10, cache_read_input_tokens: 90, cache_creation_input_tokens: 5, output_tokens: 7 },
    modelUsage: { "claude-test-1": {} },
  }));
});`;

/** A stand-in `copilot`: prints the prompt it read and writes a usage file where it was told. */
const FAKE_COPILOT = `
const fs = require("fs");
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  const args = process.argv.slice(2);
  fs.writeFileSync(args[args.indexOf("--usage-output-file") + 1], JSON.stringify({ models: [{ model: "x", usage: { inputTokens: 40, outputTokens: 4 } }] }));
  process.stdout.write(JSON.stringify({ args, input }));
});`;

let dir: string;
let audit: MemoryAuditSink;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agent-qa-headless-"));
  audit = new MemoryAuditSink();
  await writeFile(join(dir, "claude.js"), FAKE_CLAUDE);
  await writeFile(join(dir, "copilot.js"), FAKE_COPILOT);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const data = (env: NodeJS.ProcessEnv, yaml = "version: 1\n") => {
  const root = join(dir, "project");
  return writeFile(join(dir, "agent-qa.yaml"), yaml).then(() => new DataAccess({ root: dir, store: new RunStore(join(root, "runs")), env, audit }));
};

const request = {
  messages: [
    { role: "system" as const, content: "Answer with JSON. Keep <PERSON_1> as it is." },
    { role: "user" as const, content: 'Step "analyze": {"key":"ABC-1"} & more' },
  ],
  schema: { type: "object", properties: { ok: { type: "boolean" } } },
};

describe("headless drivers (S4-10)", () => {
  it("asks claude -p with every tool off, in an empty folder, with the prompt on stdin and only its own sign-in", async () => {
    const access = await data({ PATH: process.env.PATH, CLAUDE_CODE_OAUTH_TOKEN: "oauth", ANTHROPIC_API_KEY: "key", ATLASSIAN_TOKEN: "jira", OPENAI_API_KEY: "other" }, "version: 1\natlassian:\n  site: https://acme.atlassian.net\n  email: ${env:ATLASSIAN_EMAIL}\n  token: ${env:ATLASSIAN_TOKEN}\n");
    const driver = new HeadlessDriver({ agent: "claude-code", runner: access.modelCli("claude-code"), command: [NODE, join(dir, "claude.js")] });
    const answer = await driver.complete({ ...request, model: "anthropic:claude-test-1" });
    const seen = JSON.parse(answer.text) as { args: string[]; input: string; files: string[]; env: string[] };
    expect(seen.args.slice(0, 11)).toEqual(["-p", "--output-format", "json", "--tools", "", "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence", "--system-prompt", request.messages[0]!.content, "--json-schema"]);
    expect(seen.args.slice(-2)).toEqual(["--model", "claude-test-1"]);
    expect(seen.input).toBe(request.messages[1]!.content);
    expect(seen.args.join(" ")).not.toContain("ABC-1");
    expect(seen.files).toEqual([]);
    // The CLI's own sign-in only: no Jira token, no other provider's key.
    expect(seen.env).toEqual(["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"]);
    expect(answer.usage).toEqual({ inputTokens: 105, outputTokens: 7, cachedInputTokens: 90 });
    expect(answer.model).toBe("anthropic:claude-test-1");
    expect(audit.entries.map((e) => [e.target, e.outcome])).toEqual([
      ["commands", "approved"],
      ["commands", "done"],
    ]);
  });

  it("asks copilot with tools, instructions and built-in MCP servers off, and reads its usage file", async () => {
    const access = await data({ PATH: process.env.PATH, COPILOT_GITHUB_TOKEN: "gh" });
    const driver = new HeadlessDriver({ agent: "copilot", runner: access.modelCli("copilot"), command: [NODE, join(dir, "copilot.js")] });
    const answer = await driver.complete(request);
    const seen = JSON.parse(answer.text) as { args: string[]; input: string };
    expect(seen.args).toEqual(expect.arrayContaining(["-s", "--no-custom-instructions", "--disable-builtin-mcps", "--available-tools=", "--no-ask-user"]));
    expect(seen.args[0]).toBe("-C");
    expect(seen.input).toBe(`${request.messages[0]!.content}\n\n${request.messages[1]!.content}`);
    expect(answer.usage).toEqual({ inputTokens: 40, outputTokens: 4 });
  });

  it("doesn't start when policy.writes.commands is deny", async () => {
    const access = await data({ PATH: process.env.PATH }, "version: 1\npolicy:\n  writes:\n    commands: deny\n");
    const driver = new HeadlessDriver({ agent: "claude-code", runner: access.modelCli("claude-code"), command: [NODE, join(dir, "claude.js")] });
    await expect(driver.complete(request)).rejects.toThrow(/commands/);
  });

  it("reports a failed call with the end of stderr, and refuses another provider's model", async () => {
    const calls: HeadlessCall[] = [];
    const reply = (r: Partial<HeadlessOutcome>) => async (call: HeadlessCall) => (calls.push(call), { exitCode: 0, timedOut: false, stdout: "", stderr: "", ...r });
    const failed = new HeadlessDriver({ agent: "claude-code", runner: reply({ exitCode: 1, stderr: "Invalid API key · Please run /login" }) });
    await expect(failed.complete(request)).rejects.toThrow("claude-code: exited with 1 (Invalid API key · Please run /login)");
    const slow = new HeadlessDriver({ agent: "copilot", runner: reply({ exitCode: null, timedOut: true }), timeoutMs: 2_000 });
    await expect(slow.complete(request)).rejects.toThrow("copilot: no answer within 2 s");
    const errorResult = new HeadlessDriver({ agent: "claude-code", runner: reply({ stdout: JSON.stringify({ type: "result", subtype: "error_max_turns", is_error: true }) }) });
    await expect(errorResult.complete(request)).rejects.toThrow("claude-code: error_max_turns");
    const plainText = new HeadlessDriver({ agent: "claude-code", runner: reply({ stdout: JSON.stringify({ type: "result", subtype: "success", result: '{"ok":true}' }) }) });
    expect((await plainText.complete({ ...request, schema: undefined })).text).toBe('{"ok":true}');
    expect(modelName("copilot", "copilot:gpt-x")).toBe("gpt-x");
    expect(modelName("claude-code", "claude-x")).toBe("claude-x");
    expect(() => modelName("claude-code", "openai:gpt-x")).toThrow(/anthropic:<id> or claude-code:<id>/);

    // A retry is one prompt: the first request, the last answer and its errors, labelled.
    calls.length = 0;
    await plainText.complete({ messages: [...request.messages, { role: "assistant", content: "{}" }, { role: "user", content: "ok is required" }] });
    expect(calls[0]!.stdin).toBe(`## Request\n\n${request.messages[1]!.content}\n\n## Your last answer\n\n{}\n\n## Request\n\nok is required`);
  });
});
