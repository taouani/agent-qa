import type { ModelDriver, ModelRequest, ModelResponse, TokenUsage } from "./driver.js";
import { ModelConfigError } from "./api-driver.js";

/**
 * Headless drivers (S4-10): a step's answer from an agent CLI in
 * non-interactive mode, Claude Code (`claude -p`) or GitHub Copilot CLI
 * (`copilot`), with the CLI's own sign-in instead of a model API key. One
 * call per step, like the API driver, so CI approvals (`--accept`), retries
 * and exit codes stay the same.
 *
 * The CLI is a model, not an agent, here: every tool is turned off, no MCP
 * server or project instructions are loaded, and it runs in an empty
 * temporary folder, so the masked prompt is all it sees. The prompt goes on
 * standard input (a long one would pass Windows' command-line limit).
 *
 * The process is started by the data layer (`DataAccess.modelCli`), which
 * holds the policy grant, through `runner`.
 */

export const HEADLESS_AGENTS = ["claude-code", "copilot"] as const;
export type HeadlessAgent = (typeof HEADLESS_AGENTS)[number];

export interface HeadlessCall {
  /** The command line, given the path of a file in the empty folder it runs in (Copilot writes its usage there). */
  argv: (file: string) => string[];
  stdin: string;
  timeoutMs: number;
}

export interface HeadlessOutcome {
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  /** What the CLI wrote to that file, if anything. */
  file?: string;
}

export type HeadlessRunner = (call: HeadlessCall) => Promise<HeadlessOutcome>;

export interface HeadlessDriverOptions {
  agent: HeadlessAgent;
  runner: HeadlessRunner;
  /** Per step. Default 10 minutes. */
  timeoutMs?: number;
  /** The program (and its first arguments), if not `claude` or `copilot` on the PATH. */
  command?: string[];
}

/**
 * Claude Code takes a schema on the command line; past this it stays only in
 * the prompt (which `drive` always fills). Windows starts an npm `.cmd` shim
 * through cmd.exe, whose 8,191-character line the escaping fills fast.
 */
const MAX_SCHEMA_ARG = process.platform === "win32" ? 2_000 : 8_000;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;
/** The providers a `provider:model` id may name for each agent. */
const PROVIDERS: Record<HeadlessAgent, string[]> = { "claude-code": ["anthropic", "claude-code"], copilot: ["copilot"] };

export class HeadlessDriver implements ModelDriver {
  readonly name: string;

  constructor(private readonly options: HeadlessDriverOptions) {
    this.name = options.agent;
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const { agent } = this.options;
    const model = request.model ? modelName(agent, request.model) : undefined;
    const system = request.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const rest = request.messages.filter((m) => m.role !== "system");
    // A retry carries the last answer and its errors: labelled, since the CLI takes one prompt.
    const prompt = rest.length === 1 ? rest[0]!.content : rest.map((m) => `## ${m.role === "assistant" ? "Your last answer" : "Request"}\n\n${m.content}`).join("\n\n");
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const out = agent === "claude-code" ? await this.claude(system, prompt, request.schema, model, timeoutMs) : await this.copilot(system, prompt, model, timeoutMs);
    return out;
  }

  private async claude(system: string, prompt: string, schema: unknown, model: string | undefined, timeoutMs: number): Promise<ModelResponse> {
    const schemaArg = schema === undefined ? undefined : JSON.stringify(schema);
    const argv = [
      ...(this.options.command ?? ["claude"]),
      "-p",
      "--output-format",
      "json",
      // No tools, MCP servers, slash commands or saved session: a model call, nothing more.
      "--tools",
      "",
      "--strict-mcp-config",
      "--disable-slash-commands",
      // Only the empty folder's settings, which are none: no user hooks or ~/.claude/CLAUDE.md see the prompt.
      "--setting-sources",
      "project",
      "--no-session-persistence",
      "--system-prompt",
      system,
      ...(schemaArg !== undefined && schemaArg.length <= MAX_SCHEMA_ARG ? ["--json-schema", schemaArg] : []),
      ...(model ? ["--model", model] : []),
    ];
    const r = await this.run(() => argv, prompt, timeoutMs);
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(r.stdout) as Record<string, unknown>;
      if (!result || typeof result !== "object") throw new Error("not an object");
    } catch {
      throw new Error(`claude-code: its output isn't the JSON result${tail(r.stderr)}`);
    }
    if (result.is_error === true || (typeof result.subtype === "string" && result.subtype !== "success")) {
      throw new Error(`claude-code: ${String(result.subtype ?? "error")}${typeof result.result === "string" ? `: ${result.result.slice(0, 300)}` : ""}`);
    }
    const text = result.structured_output !== undefined ? JSON.stringify(result.structured_output) : typeof result.result === "string" ? result.result : undefined;
    if (text === undefined) throw new Error("claude-code: the result has no answer");
    const used = claudeUsage(result.usage);
    const models = result.modelUsage && typeof result.modelUsage === "object" ? Object.keys(result.modelUsage) : [];
    return { text, ...(models[0] ? { model: `anthropic:${models[0]}` } : model ? { model: `anthropic:${model}` } : {}), ...(used ? { usage: used } : {}) };
  }

  private async copilot(system: string, prompt: string, model: string | undefined, timeoutMs: number): Promise<ModelResponse> {
    const argv = (file: string) => [
      ...(this.options.command ?? ["copilot"]),
      "-C",
      dirOf(file),
      // The answer only, no stats; no instructions files, built-in MCP servers, tools or questions.
      "-s",
      "--no-custom-instructions",
      "--disable-builtin-mcps",
      "--available-tools=",
      // Again, whatever an empty list turns out to mean: no shell, no writes, and not the rest of the temp folder.
      "--deny-tool=shell",
      "--deny-tool=write",
      "--disallow-temp-dir",
      "--log-dir",
      dirOf(file),
      "--no-ask-user",
      "--no-auto-update",
      "--disable-client-telemetry",
      "--usage-output-file",
      file,
      ...(model ? ["--model", model] : []),
    ];
    const r = await this.run(argv, `${system}\n\n${prompt}`, timeoutMs);
    const text = r.stdout.trim();
    if (!text) throw new Error(`copilot: no answer${tail(r.stderr)}`);
    const used = copilotUsage(r.file);
    return { text, ...(model ? { model: `copilot:${model}` } : {}), ...(used ? { usage: used } : {}) };
  }

  private async run(argv: (file: string) => string[], stdin: string, timeoutMs: number): Promise<HeadlessOutcome> {
    const r = await this.options.runner({ argv, stdin, timeoutMs });
    if (r.timedOut) throw new Error(`${this.name}: no answer within ${Math.round(timeoutMs / 1000)} s`);
    if (r.exitCode !== 0) throw new Error(`${this.name}: exited with ${r.exitCode ?? "a signal"}${tail(r.stderr)}`);
    return r;
  }
}

/** `anthropic:claude-x` → `claude-x`; a bare id is kept; another provider is refused. */
export function modelName(agent: HeadlessAgent, id: string): string {
  const colon = id.indexOf(":");
  if (colon < 0) return id;
  const provider = id.slice(0, colon);
  if (!PROVIDERS[agent].includes(provider)) throw new ModelConfigError(`${agent} can't answer with ${id}: give a model ${PROVIDERS[agent].map((p) => `${p}:<id>`).join(" or ")}, or none for its default`);
  return id.slice(colon + 1);
}

const dirOf = (file: string) => file.slice(0, Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\")));

/** The end of stderr, where a CLI says what went wrong (sign-in, model); never the prompt, which went on stdin. */
const tail = (stderr: string) => {
  const t = stderr.trim();
  return t ? ` (${t.length > 300 ? `…${t.slice(-300)}` : t})` : "";
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

function claudeUsage(raw: unknown): TokenUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const u = raw as Record<string, unknown>;
  const input = num(u.input_tokens);
  const output = num(u.output_tokens);
  if (input === undefined || output === undefined) return undefined;
  const read = num(u.cache_read_input_tokens) ?? 0;
  const created = num(u.cache_creation_input_tokens) ?? 0;
  return { inputTokens: input + read + created, outputTokens: output, ...(read ? { cachedInputTokens: read } : {}) };
}

/** Copilot's usage file: its shape isn't documented, so only plain input and output token counts are read. */
function copilotUsage(text: string | undefined): TokenUsage | undefined {
  if (!text) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  let input = 0;
  let output = 0;
  let found = false;
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== "object" || depth > 4) return;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const n = num(x);
      if (n !== undefined && /^(input_?tokens|prompt_?tokens)$/i.test(k)) {
        input += n;
        found = true;
      } else if (n !== undefined && /^(output_?tokens|completion_?tokens)$/i.test(k)) {
        output += n;
        found = true;
      } else walk(x, depth + 1);
    }
  };
  walk(value, 0);
  return found ? { inputTokens: input, outputTokens: output } : undefined;
}
