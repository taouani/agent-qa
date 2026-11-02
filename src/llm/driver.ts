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
}

export interface ModelResponse {
  text: string;
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
