import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createXai } from "@ai-sdk/xai";
import { generateText, jsonSchema, NoObjectGeneratedError, NoOutputGeneratedError, Output, type LanguageModel } from "ai";
import { modelAllowed, PROVIDER_KEY_ENV, PROVIDERS, resolveSecret, type Config, type Provider, type SecretSources } from "../core/index.js";
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
 * - The engine's schemas are not "strict" (optional keys, no
 *   additionalProperties: false), so strict mode is turned off where the
 *   provider allows it (OpenAI, OpenRouter, LiteLLM). xAI always sends
 *   strict: true, so it gets JSON mode and relies on the schema in the prompt
 *   (`drive` always puts it there).
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
  languageModel?: (provider: Provider, modelId: string) => LanguageModelV4 | Promise<LanguageModelV4>;
  fetch?: typeof fetch;
}

/** A model object, never a bare id string (which the AI SDK would send to its gateway). */
type LanguageModelV4 = Exclude<LanguageModel, string>;

const OPENROUTER_URL = "https://openrouter.ai/api/v1";
/** The same rule as `modelId` in the config schema: no spaces, colons or `..`. */
const MODEL_NAME = /^[A-Za-z0-9._/@-]+$/;

/** Providers whose schema is sent with strict mode off. */
const NOT_STRICT = { openai: "openai", openrouter: "openrouter", litellm: "litellm" } as const;

export function parseModelId(id: string): { provider: Provider; model: string } {
  const at = id.indexOf(":");
  const provider = id.slice(0, at) as Provider;
  const model = id.slice(at + 1);
  if (at < 1 || !MODEL_NAME.test(model) || model.split("/").includes("..") || !(PROVIDERS as readonly string[]).includes(provider)) {
    throw new ModelConfigError(`Not a provider:model id: ${JSON.stringify(id)}. Providers: ${PROVIDERS.join(", ")}.`);
  }
  return { provider, model };
}

export class ApiDriver implements ModelDriver {
  readonly name = "api";
  private readonly cache = new Map<string, Promise<LanguageModelV4>>();

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

  /**
   * Checks, without a call, that `id` can be used: allowed, and with a key
   * (its `models.keys` reference resolves, or the provider's own variable is set).
   */
  async ready(id: string): Promise<void> {
    const { provider } = parseModelId(this.modelFor({ model: id, messages: [] }));
    const ref = this.options.models.keys?.[provider];
    if (ref) {
      try {
        await resolveSecret(ref, this.options.secrets ?? {});
      } catch (error) {
        throw new ModelConfigError(`The key for ${provider} (models.keys.${provider}) can't be read: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    // The OpenRouter client reads no variable of its own: its key must be in models.keys.
    if (provider === "openrouter") throw new ModelConfigError("No key for openrouter: set models.keys.openrouter in agent-qa.yaml.");
    const name = PROVIDER_KEY_ENV[provider];
    const env = this.options.secrets?.env ?? process.env;
    if (name && !env[name]) throw new ModelConfigError(`No key for ${provider}: set ${name}, or models.keys.${provider} in agent-qa.yaml.`);
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const id = this.modelFor(request);
    const { provider } = parseModelId(id);
    const model = await this.model(id);
    const system = request.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const messages = request.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    const common = {
      model,
      ...(system ? { instructions: system } : {}),
      messages,
      maxOutputTokens: this.options.maxOutputTokens ?? 16000,
      maxRetries: this.options.maxRetries ?? 2,
    };

    if (request.schema === undefined) {
      const result = await generateText(common);
      return { text: result.text, model: id, ...usageOf(result.totalUsage) };
    }
    try {
      const name = request.schemaName ? { name: request.schemaName } : {};
      const strictOff = provider in NOT_STRICT ? { providerOptions: { [NOT_STRICT[provider as keyof typeof NOT_STRICT]]: { strictJsonSchema: false } } } : {};
      const result = await generateText({
        ...common,
        ...strictOff,
        output:
          provider === "xai"
            ? Output.json(name)
            : Output.object({ schema: jsonSchema(request.schema as Parameters<typeof jsonSchema>[0]), ...name }),
      });
      return { text: JSON.stringify(result.output), model: id, ...usageOf(result.totalUsage) };
    } catch (error) {
      // The model answered but not in the shape asked for: hand the text back so the engine reports what's wrong.
      if (NoObjectGeneratedError.isInstance(error)) {
        return { text: error.text ?? "", model: id, ...(error.usage ? usageOf(error.usage) : {}) };
      }
      if (NoOutputGeneratedError.isInstance(error)) return { text: "", model: id };
      throw error;
    }
  }

  private model(id: string): Promise<LanguageModelV4> {
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

  private async create(provider: Provider, modelId: string): Promise<LanguageModelV4> {
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
        return createOpenAICompatible({ ...common, name: "openrouter", baseURL: endpoint ?? OPENROUTER_URL, supportsStructuredOutputs: true })(modelId);
      case "litellm":
        if (!endpoint) throw new ModelConfigError("litellm needs models.endpoints.litellm, the URL of your LiteLLM proxy.");
        return createOpenAICompatible({ ...common, name: "litellm", baseURL: endpoint, supportsStructuredOutputs: true })(modelId);
    }
  }
}

/**
 * `inputTokens` includes the cached tokens; `cachedInputTokens` is the part of it read from the cache.
 * Undefined when the provider reported no counts, so the cost report doesn't price the call as free.
 */
type SdkUsage = { inputTokens: number | undefined; outputTokens: number | undefined; inputTokenDetails?: { cacheReadTokens: number | undefined } };
const usageOf = (u: SdkUsage): { usage?: TokenUsage } => {
  const value = usage(u);
  return value ? { usage: value } : {};
};

function usage(u: SdkUsage): TokenUsage | undefined {
  if (u.inputTokens === undefined || u.outputTokens === undefined) return undefined;
  const cached = u.inputTokenDetails?.cacheReadTokens;
  return { inputTokens: u.inputTokens, outputTokens: u.outputTokens, ...(cached ? { cachedInputTokens: cached } : {}) };
}
