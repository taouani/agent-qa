import type { Provider } from "./schema.js";

/**
 * The shipped model catalog: the latest five models of each direct provider
 * (Tarek's choice, refreshed every release). `models.allowed` narrows it; a
 * model outside it still runs, with a doctor warning. OpenRouter and LiteLLM
 * route to other providers' models, so they have no list of their own.
 *
 * Prices are US dollars per million tokens, used by the cost report. Where a
 * price is unknown it is left out and the cost report shows tokens only.
 */
export interface CatalogModel {
  /** `provider:model`. */
  id: string;
  label: string;
  inputPerMTok?: number;
  outputPerMTok?: number;
}

/** When the catalog was last checked against the providers' own model lists. */
export const CATALOG_CHECKED = "2026-11-03";

export const MODEL_CATALOG: Record<Provider, CatalogModel[]> = {
  anthropic: [
    { id: "anthropic:claude-opus-5-5", label: "Claude Opus 5.5", inputPerMTok: 4, outputPerMTok: 20 },
    { id: "anthropic:claude-fable-5-1", label: "Claude Fable 5.1", inputPerMTok: 10, outputPerMTok: 50 },
    { id: "anthropic:claude-sonnet-5-5", label: "Claude Sonnet 5.5", inputPerMTok: 2, outputPerMTok: 10 },
    { id: "anthropic:claude-haiku-5-5", label: "Claude Haiku 5.5", inputPerMTok: 0.1, outputPerMTok: 0.5 },
    { id: "anthropic:claude-opus-5", label: "Claude Opus 5", inputPerMTok: 5, outputPerMTok: 25 },
  ],
  openai: [
    { id: "openai:gpt-6.1-sol", label: "GPT-6.1 Sol" },
    { id: "openai:gpt-6.1-terra", label: "GPT-6.1 Terra" },
    { id: "openai:gpt-6-astra", label: "GPT-6 Astra" },
    { id: "openai:gpt-6-luna", label: "GPT-6 Luna" },
    { id: "openai:gpt-5.6-sol", label: "GPT-5.6 Sol" },
  ],
  google: [
    { id: "google:gemini-4-argon", label: "Gemini 4 Argon", inputPerMTok: 2, outputPerMTok: 10 },
    { id: "google:gemini-3.8-flash", label: "Gemini 3.8 Flash" },
    { id: "google:gemini-3.5-flash", label: "Gemini 3.5 Flash" },
    { id: "google:gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)" },
    { id: "google:gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite" },
  ],
  mistral: [
    { id: "mistral:mistral-large-4", label: "Mistral Large 4" },
    { id: "mistral:mistral-medium-3-5", label: "Mistral Medium 3.5" },
    { id: "mistral:mistral-small-2603", label: "Mistral Small 4" },
    { id: "mistral:mistral-large-2512", label: "Mistral Large 3" },
    { id: "mistral:devstral-2512", label: "Devstral 2" },
  ],
  xai: [
    { id: "xai:grok-4.7", label: "Grok 4.7", inputPerMTok: 2, outputPerMTok: 6 },
    { id: "xai:grok-4.5", label: "Grok 4.5" },
    { id: "xai:grok-4.3", label: "Grok 4.3" },
    { id: "xai:grok-build-0.1", label: "Grok Build 0.1" },
  ],
  openrouter: [],
  litellm: [],
};

const BY_ID = new Map(Object.values(MODEL_CATALOG).flatMap((list) => list.map((m) => [m.id, m] as const)));

/** The catalog entry for `provider:model`, if the model ships in the catalog. */
export function catalogModel(id: string): CatalogModel | undefined {
  return BY_ID.get(id);
}

/** `provider:*` or an exact `provider:model`. */
export function modelAllowed(id: string, allowed: readonly string[] | undefined): boolean {
  if (!allowed) return true;
  return allowed.some((p) => (p.endsWith(":*") ? id.startsWith(p.slice(0, -1)) : p === id));
}
