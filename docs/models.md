# Models

From the CLI and in CI, Agent-QA calls a model with your own API key, or through Claude Code or Copilot CLI (`--headless`, see [ci.md](ci.md)). In an IDE, the host's model answers, and none of this applies.

## The models Agent-QA lists

2.0.0 lists Anthropic's current models. These are the ones tested and priced in the cost report:

| ID | Model | Input / output, $ per million tokens |
|---|---|---|
| `anthropic:claude-opus-5-5` | Claude Opus 5.5 (the default `agent-qa init` writes) | 4 / 20 |
| `anthropic:claude-fable-5-1` | Claude Fable 5.1 | 10 / 50 |
| `anthropic:claude-sonnet-5-5` | Claude Sonnet 5.5 | 2 / 10 |
| `anthropic:claude-haiku-5-5` | Claude Haiku 5.5 | 0.10 / 0.50 (prompts of 100K tokens or fewer) |
| `anthropic:claude-opus-5` | Claude Opus 5 | 5 / 25 |

Prices were last checked on 8 Nov 2026. The cost report uses them for API runs. Haiku 5.5 costs more above 100K tokens of prompt, which the report doesn't price.

## Other providers

OpenAI, Google, Mistral and xAI models still run directly (`openai:<id>`, `google:<id>`, `mistral:<id>`, `xai:<id>`), each with its own key. Agent-QA doesn't list them yet, so:

- `agent-qa doctor` warns that they are untested;
- the cost report shows their tokens but no price.

Until they are listed, the suggested way to use them is through a router:

- **OpenRouter**: `openrouter:<provider>/<model>`, with `models.keys.openrouter`.
- **LiteLLM**: `litellm:<model>`, with `models.endpoints.litellm` set to your proxy's URL. Use it when your company routes every model through one gateway.

```yaml
models:
  default: anthropic:claude-opus-5-5
  workflows:
    scripts: openrouter:openai/<model-id>
  keys:
    anthropic: ${env:ANTHROPIC_API_KEY}
    openrouter: ${env:OPENROUTER_API_KEY}
  # allowed: [anthropic:*]   # optional: refuse any other model
```

`models.allowed` narrows what may run. A model outside it fails `doctor` and is refused at run time.

## What doctor checks

`agent-qa doctor` checks four things:

- **The allowed list:** whether every configured model is in `models.allowed`.
- **Typos:** whether an Anthropic ID is one Agent-QA lists. A typo such as `anthropic:claude-opus-55` gets a warning that names the listed IDs.
- **Keys:** whether each provider has a key, in `models.keys` or in its own variable (`ANTHROPIC_API_KEY`...).
- **LiteLLM:** whether a LiteLLM proxy has its URL.
