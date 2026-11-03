import { z } from "zod";
import { CATALOG_CHECKED, catalogModel } from "../config/catalog.js";
import type { ArtifactSpec, RunStore, UsageEntry } from "./store.js";

/**
 * `cost@1` (S1-12): a run's model use by step and by model. For API runs,
 * tokens times the catalog price; for host-model runs (Copilot), whose cost
 * Agent-QA can't know, the prompt and answer sizes only. Cached input tokens
 * are priced as input tokens: an upper bound, since providers bill them lower.
 */

const priced = { usd: z.number().min(0).optional() };
const counts = {
  calls: z.number().int().min(0),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  cachedInputTokens: z.number().int().min(0),
  promptChars: z.number().int().min(0),
  answerChars: z.number().int().min(0),
};

export const costSchema = z
  .object({
    steps: z.array(z.object({ stepId: z.string(), driver: z.enum(["api", "host-model"]), model: z.string().optional(), ...counts, ...priced }).strict()),
    models: z.array(z.object({ model: z.string(), ...counts, ...priced }).strict()),
    total: z
      .object({
        ...counts,
        ...priced,
        /** Models with no catalog price, or calls with no token counts: not priced. */
        unpriced: z.array(z.string()),
        /** Answers by the host's model, whose cost is unknown. */
        hostModelCalls: z.number().int().min(0),
      })
      .strict(),
    catalogChecked: z.string(),
  })
  .strict();
export type Cost = z.infer<typeof costSchema>;

type Counts = { calls: number; inputTokens: number; outputTokens: number; cachedInputTokens: number; promptChars: number; answerChars: number; usd?: number };
const zero = (): Counts => ({ calls: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, promptChars: 0, answerChars: 0 });

function usdOf(e: UsageEntry): number | undefined {
  if (e.driver !== "api" || !e.model || e.inputTokens === undefined) return undefined;
  const m = catalogModel(e.model);
  if (m?.inputPerMTok === undefined || m.outputPerMTok === undefined) return undefined;
  return ((e.inputTokens ?? 0) * m.inputPerMTok + (e.outputTokens ?? 0) * m.outputPerMTok) / 1_000_000;
}

function add(c: Counts, e: UsageEntry, usd: number | undefined): void {
  c.calls += 1;
  c.inputTokens += e.inputTokens ?? 0;
  c.outputTokens += e.outputTokens ?? 0;
  c.cachedInputTokens += e.cachedInputTokens ?? 0;
  c.promptChars += e.promptChars;
  c.answerChars += e.answerChars;
  if (usd !== undefined) c.usd = (c.usd ?? 0) + usd;
}

const round = <T extends { usd?: number }>(c: T): T => (c.usd === undefined ? c : { ...c, usd: Math.round(c.usd * 1e6) / 1e6 });

export function buildCost(entries: UsageEntry[]): Cost {
  const steps = new Map<string, Counts & { stepId: string; driver: UsageEntry["driver"]; model?: string }>();
  const models = new Map<string, Counts & { model: string }>();
  const total = zero();
  const unpriced = new Set<string>();
  let hostModelCalls = 0;
  for (const e of entries) {
    const usd = usdOf(e);
    if (e.driver === "host-model") hostModelCalls += 1;
    else if (usd === undefined) unpriced.add(e.inputTokens === undefined ? `${e.model ?? "unknown model"} (no token counts)` : (e.model ?? "unknown model"));
    const key = `${e.stepId}\u0000${e.driver}\u0000${e.model ?? ""}`;
    if (!steps.has(key)) steps.set(key, { stepId: e.stepId, driver: e.driver, ...(e.model ? { model: e.model } : {}), ...zero() });
    add(steps.get(key)!, e, usd);
    const model = e.model ?? (e.driver === "host-model" ? "host model" : "unknown model");
    if (!models.has(model)) models.set(model, { model, ...zero() });
    add(models.get(model)!, e, usd);
    add(total, e, usd);
  }
  return {
    steps: [...steps.values()].map(round),
    models: [...models.values()].map(round),
    total: { ...round(total), unpriced: [...unpriced].sort(), hostModelCalls },
    catalogChecked: CATALOG_CHECKED,
  };
}

const money = (usd: number | undefined) => (usd === undefined ? "" : `$${usd.toFixed(4)}`);

export function renderCost(cost: Cost): string {
  const t = cost.total;
  const lines = [
    "# Cost",
    "",
    t.usd !== undefined
      ? `About ${money(t.usd)} for ${t.calls} model call(s): ${t.inputTokens} input and ${t.outputTokens} output tokens, at catalog prices checked ${cost.catalogChecked}. Cached input is priced as input, so this is an upper bound.`
      : `${t.calls} model call(s): ${t.inputTokens} input and ${t.outputTokens} output tokens.`,
  ];
  if (t.unpriced.length) lines.push("", `Not priced (no catalog price or no token counts): ${t.unpriced.join(", ")}.`);
  if (t.hostModelCalls) {
    lines.push("", `${t.hostModelCalls} answer(s) came from the IDE's own model, whose cost Agent-QA can't see: sizes only (${t.promptChars} prompt and ${t.answerChars} answer characters in all).`);
  }
  lines.push("", "| Step | Model | Calls | Input tokens | Output tokens | Prompt chars | Answer chars | Cost |", "|---|---|---|---|---|---|---|---|");
  for (const s of cost.steps) {
    const host = s.driver === "host-model";
    lines.push(
      `| ${s.stepId} | ${s.model ?? (host ? "host model" : "")} | ${s.calls} | ${host ? "" : s.inputTokens} | ${host ? "" : s.outputTokens} | ${s.promptChars} | ${s.answerChars} | ${money(s.usd)} |`,
    );
  }
  return lines.join("\n") + "\n";
}

export const COST_ARTIFACT: ArtifactSpec<Cost> = { name: "cost", schema: "cost@1", data: costSchema, render: renderCost };

/** Records model use and rewrites the run's `cost@1` from everything recorded so far. */
export async function recordUsage(store: RunStore, runId: string, entries: UsageEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await store.appendUsage(runId, entries);
  await store.writeArtifact(runId, COST_ARTIFACT, buildCost(await store.readUsage(runId)), { inputs: [], templateVersion: "cost-1" });
}
