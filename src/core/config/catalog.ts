import type { Provider } from "./schema.js";

/**
 * The shipped model catalog. 2.0.0 lists Anthropic's current models only
 * (Tarek's choice 3b, 8 Nov 2026): the other direct providers' IDs could not
 * be checked, so they ship with no list and run with a doctor warning, and
 * their models are best reached through OpenRouter or LiteLLM until they are
 * listed. `models.allowed` narrows the catalog; a model outside the catalog still runs,
 * with a doctor warning. OpenRouter and LiteLLM route to any provider's
 * models, so they have no list of their own.
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
export const CATALOG_CHECKED = "2026-11-08";

/**
 * The environment variable each provider's SDK reads its key from when
 * `models.keys` names none. OpenRouter and LiteLLM read none.
 */
export const PROVIDER_KEY_ENV: Partial<Record<Provider, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  xai: "XAI_API_KEY",
};

export const MODEL_CATALOG: Record<Provider, CatalogModel[]> = {
  anthropic: [
    { id: "anthropic:claude-opus-5-5", label: "Claude Opus 5.5", inputPerMTok: 4, outputPerMTok: 20 },
    { id: "anthropic:claude-fable-5-1", label: "Claude Fable 5.1", inputPerMTok: 10, outputPerMTok: 50 },
    { id: "anthropic:claude-sonnet-5-5", label: "Claude Sonnet 5.5", inputPerMTok: 2, outputPerMTok: 10 },
    { id: "anthropic:claude-haiku-5-5", label: "Claude Haiku 5.5", inputPerMTok: 0.1, outputPerMTok: 0.5 },
    { id: "anthropic:claude-opus-5", label: "Claude Opus 5", inputPerMTok: 5, outputPerMTok: 25 },
  ],
  // Not listed in 2.0.0 (choice 3b): their models run, with a doctor warning.
  openai: [],
  google: [],
  mistral: [],
  xai: [],
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
