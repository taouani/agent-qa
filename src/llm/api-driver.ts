import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createXai } from "@ai-sdk/xai";
import { generateText, jsonSchema, NoObjectGeneratedError, NoOutputGeneratedError, Output, type LanguageModel } from "ai";
import { modelAllowed, PROVIDERS, resolveSecret, type Config, type Provider, type SecretSources } from "../core/index.js";
import type { ModelDriver, ModelRequest, ModelResponse, TokenUsage } from "./driver.js";

/**
 * The API driver (S1-7): calls a model directly through the AI SDK, for the
 * CLI and CI. The host's model (Copilot) is used through MCP instead.
 *
 * - The model is `provider:model` from the request or `models.default`, and
 *   must match `models.allowed` when that is set.
 * - Keys come from `models.keys` (secret references), else the provider's
 *   own environment variable (ANTHROPIC_API_KEY, OPENAI_API_KEY...).
 * - With a schema it asks for structured output. An answer that doesn't parse
 *   or match is returned as text: the engine validates it and the caller
 *   retries with the errors (see `drive`).
 * - A model id is never passed to the AI SDK as a bare string, which would
 *   route it through Vercel's gateway: every call goes straight to the provider.
 */

export class ModelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelConfigError";
  }
}

export interface ApiDriverOptions {
  models: NonNullable<Config["models"]>;
  secrets?: SecretSources;
  /** Most output tokens per answer. Default 16000. */
  maxOutputTokens?: number;
  /** Retries for rate limits and server errors, inside the AI SDK. Default 2. */
  maxRetries?: number;
  /** Replaces model creation, for tests. */
  languageModel?: (provider: Provider, modelId: string) => LanguageModel | Promise<LanguageModel>;
  fetch?: typeof fetch;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1";

export function parseModelId(id: string): { provider: Provider; model: string } {
  const at = id.indexOf(":");
  const provider = id.slice(0, at) as Provider;
  const model = id.slice(at + 1);
  if (at < 1 || !model || !(PROVIDERS as readonly string[]).includes(provider)) {
    throw new ModelConfigError(`Not a provider:model id: ${JSON.stringify(id)}. Providers: ${PROVIDERS.join(", ")}.`);
  }
  return { provider, model };
}

export class ApiDriver implements ModelDriver {
  readonly name = "api";
  private readonly cache = new Map<string, Promise<LanguageModel>>();

  constructor(private readonly options: ApiDriverOptions) {}

  /** The model a request runs on. */
  modelFor(request: ModelRequest): string {
    const id = request.model ?? this.options.models.default;
    parseModelId(id);
    if (!modelAllowed(id, this.options.models.allowed)) {
      throw new ModelConfigError(`Model ${id} is not in models.allowed (${(this.options.models.allowed ?? []).join(", ")}).`);
    }
    return id;
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const id = this.modelFor(request);
    const model = await this.model(id);
    const system = request.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const messages = request.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    const common = {
      model,
      ...(system ? { system } : {}),
      messages,
      maxOutputTokens: this.options.maxOutputTokens ?? 16000,
      maxRetries: this.options.maxRetries ?? 2,
    };

    if (request.schema === undefined) {
      const result = await generateText(common);
      return { text: result.text, model: id, usage: usage(result.totalUsage) };
    }
    try {
      const result = await generateText({
        ...common,
        output: Output.object({
          schema: jsonSchema(request.schema as Parameters<typeof jsonSchema>[0]),
          ...(request.schemaName ? { name: request.schemaName } : {}),
        }),
      });
      return { text: JSON.stringify(result.output), model: id, usage: usage(result.totalUsage) };
    } catch (error) {
      // The model answered but not in the shape asked for: hand the text back so the engine reports what's wrong.
      if (NoObjectGeneratedError.isInstance(error)) {
        return { text: error.text ?? "", model: id, ...(error.usage ? { usage: usage(error.usage) } : {}) };
      }
      if (NoOutputGeneratedError.isInstance(error)) return { text: "", model: id };
      throw error;
    }
  }

  private model(id: string): Promise<LanguageModel> {
    let model = this.cache.get(id);
    if (!model) {
      const { provider, model: modelId } = parseModelId(id);
      model = Promise.resolve(this.options.languageModel ? this.options.languageModel(provider, modelId) : this.create(provider, modelId));
      // A failed creation (a missing key) is not cached, so a fixed key works on the next call.
      model.catch(() => this.cache.delete(id));
      this.cache.set(id, model);
    }
    return model;
  }

  private async create(provider: Provider, modelId: string): Promise<LanguageModel> {
    const ref = this.options.models.keys?.[provider];
    const apiKey = ref ? await resolveSecret(ref, this.options.secrets ?? {}) : undefined;
    const endpoint = this.options.models.endpoints?.[provider];
    const common = { ...(apiKey ? { apiKey } : {}), ...(endpoint ? { baseURL: endpoint } : {}), ...(this.options.fetch ? { fetch: this.options.fetch } : {}) };
    switch (provider) {
      case "anthropic":
        return createAnthropic(common)(modelId);
      case "openai":
        return createOpenAI(common)(modelId);
      case "google":
        return createGoogle(common)(modelId);
      case "mistral":
        return createMistral(common)(modelId);
      case "xai":
        return createXai(common)(modelId);
      case "openrouter":
        return createOpenAICompatible({ ...common, name: "openrouter", baseURL: endpoint ?? OPENROUTER_URL })(modelId);
      case "litellm":
        if (!endpoint) throw new ModelConfigError("litellm needs models.endpoints.litellm, the URL of your LiteLLM proxy.");
        return createOpenAICompatible({ ...common, name: "litellm", baseURL: endpoint })(modelId);
    }
  }
}

function usage(u: { inputTokens: number | undefined; outputTokens: number | undefined; inputTokenDetails?: { cacheReadTokens: number | undefined } }): TokenUsage {
  const cached = u.inputTokenDetails?.cacheReadTokens;
  return { inputTokens: u.inputTokens ?? 0, outputTokens: u.outputTokens ?? 0, ...(cached ? { cachedInputTokens: cached } : {}) };
}
