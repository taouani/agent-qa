/**
 * The seam between workflows and a model. The API driver, headless drivers and
 * the harness's recording driver all implement it. Every prompt that reaches a
 * driver must already be masked.
 */
export interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelRequest {
  /** `provider:model`, when the caller picks one. */
  model?: string;
  messages: ModelMessage[];
  /** JSON Schema the answer must match. The driver asks for structured output when set. */
  schema?: unknown;
  /** A name for the schema, e.g. the step id. Some providers pass it to the model. */
  schemaName?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** The part of `inputTokens` read from the prompt cache (already counted in `inputTokens`). */
  cachedInputTokens?: number;
}

export interface ModelResponse {
  /** The answer. With a schema, the JSON text of the object. */
  text: string;
  /** The model that answered, `provider:model`. */
  model?: string;
  usage?: TokenUsage;
}

export interface ModelDriver {
  readonly name: string;
  complete(request: ModelRequest): Promise<ModelResponse>;
}

/** Answers every request with fixed text. For tests and dry runs. */
export class StaticDriver implements ModelDriver {
  readonly name = "static";
  constructor(private readonly reply: string | ((request: ModelRequest) => string) = "{}") {}
  async complete(request: ModelRequest): Promise<ModelResponse> {
    return { text: typeof this.reply === "function" ? this.reply(request) : this.reply };
  }
}
