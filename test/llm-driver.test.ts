import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MemoryStateStore, WorkflowEngine, type WorkflowDefinition } from "../src/core/index.js";
import { ApiDriver, drive, DriveError, MODEL_CATALOG, ModelConfigError, parseModelId, StaticDriver } from "../src/llm/index.js";

const usage = (input: number, output: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: output, text: output, reasoning: undefined },
});

function mock(...answers: string[]) {
  let i = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: answers[Math.min(i++, answers.length - 1)]! }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: usage(100, 20),
      warnings: [],
    }),
  });
  return model;
}

const models = { default: "anthropic:claude-opus-5-5", allowed: ["anthropic:*", "openai:gpt-6.1-sol"] };

describe("ApiDriver", () => {
  it("returns structured output as JSON text with token usage", async () => {
    const model = mock('{"cases":[{"id":"TC-ABC-1-001"}]}');
    const driver = new ApiDriver({ models, languageModel: () => model });
    const response = await driver.complete({
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "make cases" },
      ],
      schema: { type: "object", properties: { cases: { type: "array" } }, required: ["cases"] },
      schemaName: "generate",
    });
    expect(JSON.parse(response.text)).toEqual({ cases: [{ id: "TC-ABC-1-001" }] });
    expect(response).toMatchObject({ model: "anthropic:claude-opus-5-5", usage: { inputTokens: 100, outputTokens: 20 } });
    const call = model.doGenerateCalls[0]!;
    expect(call.prompt[0]).toMatchObject({ role: "system", content: "sys" });
    expect(call.responseFormat).toMatchObject({ type: "json", name: "generate" });
  });

  it("hands back text that doesn't match the schema instead of throwing", async () => {
    const driver = new ApiDriver({ models, languageModel: () => mock("not json at all") });
    const response = await driver.complete({ messages: [{ role: "user", content: "x" }], schema: { type: "object" } });
    expect(response.text).toBe("not json at all");
  });

  it("answers in plain text without a schema", async () => {
    const driver = new ApiDriver({ models, languageModel: () => mock("hello") });
    expect((await driver.complete({ messages: [{ role: "user", content: "hi" }] })).text).toBe("hello");
  });

  it("enforces models.allowed and provider:model ids", async () => {
    const driver = new ApiDriver({ models, languageModel: () => mock("x") });
    await expect(driver.complete({ model: "openai:gpt-6-luna", messages: [] })).rejects.toThrow(ModelConfigError);
    await expect(driver.complete({ model: "openai:gpt-6.1-sol", messages: [{ role: "user", content: "x" }] })).resolves.toMatchObject({ model: "openai:gpt-6.1-sol" });
    expect(() => parseModelId("gpt-4")).toThrow(ModelConfigError);
    expect(() => parseModelId("acme:model")).toThrow(/Providers:/);
  });

  it("resolves keys from secret references and creates real provider models", async () => {
    const seen: string[] = [];
    const fetcher = (async (url: string | URL, init?: RequestInit) => {
      seen.push(String(url), JSON.stringify(init?.headers ?? {}));
      return new Response(JSON.stringify({ error: { type: "authentication_error", message: "no" } }), { status: 401, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const driver = new ApiDriver({
      models: { default: "anthropic:claude-opus-5-5", keys: { anthropic: "${env:TEST_ANTHROPIC_KEY}" } },
      secrets: { env: { TEST_ANTHROPIC_KEY: "sk-test-123" } },
      fetch: fetcher,
      maxRetries: 0,
    });
    await expect(driver.complete({ messages: [{ role: "user", content: "x" }] })).rejects.toThrow();
    expect(seen[0]).toMatch(/^https:\/\/api\.anthropic\.com\//);
    expect(seen[1]).toContain("sk-test-123");
  });

  const schema = { type: "object", properties: { summary: { type: "string" }, note: { type: "string" } }, required: ["summary"] };

  async function requestBody(model: string, endpoint?: string): Promise<Record<string, unknown>> {
    let body = "";
    const fetcher = (async (_url: string | URL, init?: RequestInit) => {
      body = String(init?.body ?? "");
      return new Response(JSON.stringify({ error: { message: "no" } }), { status: 401, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const provider = model.slice(0, model.indexOf(":"));
    const driver = new ApiDriver({
      models: { default: model, keys: { [provider]: "${env:K}" }, ...(endpoint ? { endpoints: { [provider]: endpoint } } : {}) },
      secrets: { env: { K: "sk-test" } },
      fetch: fetcher,
      maxRetries: 0,
    });
    await expect(driver.complete({ messages: [{ role: "user", content: "x" }], schema, schemaName: "analyze" })).rejects.toThrow();
    return JSON.parse(body) as Record<string, unknown>;
  }

  it("sends the schema without strict mode to OpenAI, OpenRouter and LiteLLM", async () => {
    const openai = await requestBody("openai:gpt-6.1-sol");
    expect(openai.text).toMatchObject({ format: { type: "json_schema", strict: false, schema: { required: ["summary"] } } });
    for (const [model, endpoint] of [["openrouter:anthropic/claude-opus-5-5"], ["litellm:my-model", "http://localhost:4000/v1"]] as const) {
      const body = await requestBody(model, endpoint);
      expect(body.response_format, model).toMatchObject({ type: "json_schema", json_schema: { name: "analyze", strict: false, schema: { required: ["summary"] } } });
    }
  });

  it("uses JSON mode for xAI, which always sends strict: true", async () => {
    const body = await requestBody("xai:grok-4.7");
    expect(body.text).toEqual({ format: { type: "json_object" } });
  });

  it("rejects model names with spaces, colons or ..", () => {
    for (const id of ["anthropic:a b", "anthropic:x:y", "google:../../etc"]) expect(() => parseModelId(id), id).toThrow(ModelConfigError);
    expect(parseModelId("openrouter:anthropic/claude-opus-5-5")).toEqual({ provider: "openrouter", model: "anthropic/claude-opus-5-5" });
  });

  it("doesn't keep a failed model creation, so a fixed key works next time", async () => {
    const env: Record<string, string> = {};
    const driver = new ApiDriver({
      models: { default: "anthropic:claude-opus-5-5", keys: { anthropic: "${env:LATE_KEY}" } },
      secrets: { env },
      fetch: (async () => new Response(JSON.stringify({ error: { message: "no" } }), { status: 401, headers: { "content-type": "application/json" } })) as typeof fetch,
      maxRetries: 0,
    });
    await expect(driver.complete({ messages: [{ role: "user", content: "x" }] })).rejects.toThrow(/LATE_KEY/);
    env.LATE_KEY = "sk-late";
    await expect(driver.complete({ messages: [{ role: "user", content: "x" }] })).rejects.not.toThrow(/LATE_KEY/);
  });

  it("needs an endpoint for litellm", async () => {
    const driver = new ApiDriver({ models: { default: "litellm:my-model" } });
    await expect(driver.complete({ messages: [{ role: "user", content: "x" }] })).rejects.toThrow(/models.endpoints.litellm/);
  });

  it("ships at most five models per direct provider", () => {
    for (const [provider, list] of Object.entries(MODEL_CATALOG)) {
      expect(list.length, provider).toBeLessThanOrEqual(5);
      for (const m of list) expect(m.id.startsWith(`${provider}:`)).toBe(true);
    }
  });
});

describe("ApiDriver.ready", () => {
  it("needs the provider's key, from models.keys or its own variable", async () => {
    const models = { default: "anthropic:claude-opus-5-5" };
    await expect(new ApiDriver({ models, secrets: { env: {} } }).ready("anthropic:claude-opus-5-5")).rejects.toThrow(/set ANTHROPIC_API_KEY/);
    await expect(new ApiDriver({ models, secrets: { env: { ANTHROPIC_API_KEY: "k" } } }).ready("anthropic:claude-opus-5-5")).resolves.toBeUndefined();
    const keyed = { ...models, keys: { anthropic: "${env:MY_KEY}" } };
    await expect(new ApiDriver({ models: keyed, secrets: { env: {} } }).ready("anthropic:claude-opus-5-5")).rejects.toThrow(/models.keys.anthropic/);
    await expect(new ApiDriver({ models: keyed, secrets: { env: { MY_KEY: "k" } } }).ready("anthropic:claude-opus-5-5")).resolves.toBeUndefined();
    await expect(new ApiDriver({ models: { ...models, allowed: ["openai:*"] }, secrets: { env: {} } }).ready("anthropic:claude-opus-5-5")).rejects.toThrow(/not in models.allowed/);
  });
});

describe("drive", () => {
  const workflow: WorkflowDefinition<{ key: string }> = {
    id: "demo",
    description: "demo",
    inputSchema: z.object({ key: z.string() }),
    steps: [
      {
        id: "cases",
        kind: "generate",
        outputSchema: z.object({ cases: z.array(z.object({ id: z.string().regex(/^TC-/) })).min(1) }),
        instructions: (ctx) => `Write cases for ${ctx.inputs.key}`,
        context: () => "Masked: <PERSON_1> owns the case.",
        maxAttempts: 3,
      },
      { id: "review", kind: "confirm", outputSchema: z.object({ ok: z.boolean() }), instructions: () => "Review" },
    ],
  };

  it("answers generate steps, retries with the errors, and stops at confirm", async () => {
    const engine = new WorkflowEngine({ store: new MemoryStateStore() }).register(workflow);
    const first = await engine.start("demo", { key: "ABC-1" });
    const prompts: string[] = [];
    const answers = ["oops", '{"cases":[{"id":"bad"}]}', '{"cases":[{"id":"TC-ABC-1-001"}]}'];
    const driver = new StaticDriver((request) => {
      prompts.push(request.messages.map((m) => `${m.role}: ${m.content}`).join("\n"));
      return answers[prompts.length - 1]!;
    });
    const usageSeen: string[] = [];
    const result = await drive(engine, first, {
      name: "counting",
      complete: async (request) => ({ ...(await driver.complete(request)), usage: { inputTokens: 10, outputTokens: 5 } }),
    }, { onUsage: (u) => void usageSeen.push(`${u.stepId}#${u.attempt}`) });

    expect(result.step.kind).toBe("confirm");
    expect(result.usage).toHaveLength(3);
    expect(usageSeen).toEqual(["cases#1", "cases#2", "cases#3"]);
    expect(prompts[0]).toContain("Write cases for ABC-1");
    expect(prompts[0]).toContain("<PERSON_1>");
    expect(prompts[0]).toContain('"cases"');
    expect(prompts[0]).toContain("JSON Schema");
    expect(prompts[1]).toContain("not valid JSON");
    expect(prompts[2]).toMatch(/\$\.cases\.0\.id/);
    // A retry carries the last answer only, not every earlier one.
    expect(prompts[2]).not.toContain("oops");
    expect((await engine.status(first.runId)).outputs.cases).toEqual({ cases: [{ id: "TC-ABC-1-001" }] });
  });

  it("keeps the usage so far when the driver throws", async () => {
    const engine = new WorkflowEngine({ store: new MemoryStateStore() }).register(workflow);
    const first = await engine.start("demo", { key: "ABC-1" });
    let calls = 0;
    const error = await drive(engine, first, {
      name: "flaky",
      complete: async () => {
        if (calls++ > 0) throw new Error("rate limited");
        return { text: "{}", usage: { inputTokens: 7, outputTokens: 1 } };
      },
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DriveError);
    expect((error as DriveError).usage).toEqual([{ stepId: "cases", attempt: 1, inputTokens: 7, outputTokens: 1, promptChars: expect.any(Number), answerChars: 2 }]);
    expect((error as DriveError).message).toContain("rate limited");
    expect((await engine.status(first.runId)).status).not.toBe("failed");
  });

  it("stops at a failed step when the attempts run out", async () => {
    const engine = new WorkflowEngine({ store: new MemoryStateStore() }).register(workflow);
    const first = await engine.start("demo", { key: "ABC-1" });
    const result = await drive(engine, first, new StaticDriver("{}"));
    expect(result.step.kind).toBe("failed");
  });
});
