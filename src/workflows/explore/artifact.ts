import { z } from "zod";
import type { ArtifactSpec } from "../../core/index.js";
import { PRESS_KEY } from "../../data/index.js";

/**
 * `exploration@1` (S2-4): what the explorer found for each test case, the
 * input of script generation (S2-6). Every text holds tokens such as
 * <VALUE_3>, never real values: element names, typed values and paths are
 * as the masked page showed them.
 */

export const EXPLORATION_TEMPLATE_VERSION = "exploration-1";

export const targetSchema = z
  .object({
    role: z.string().regex(/^[a-z]{2,30}$/, "an ARIA role such as button or link").optional().describe("ARIA role, as the snapshot shows it: button, link, textbox, combobox, option, tab, row…"),
    name: z.string().max(500).optional().describe("Accessible name with role, copied exactly from the snapshot, tokens included"),
    label: z.string().min(1).max(500).optional().describe("A form field's label, instead of role"),
    text: z.string().min(1).max(500).optional().describe("Visible text, instead of role (last resort)"),
    testId: z.string().min(1).max(200).optional().describe("A data-testid, instead of role"),
    placeholder: z.string().min(1).max(500).optional().describe("A field's placeholder, instead of role"),
    exact: z.boolean().optional().describe("Default true: the name must match whole"),
    nth: z.number().int().min(0).max(50).optional().describe("Which match, from 0, when several match"),
    within: z
      .object({ role: z.string().regex(/^[a-z]{2,30}$/), name: z.string().max(500).optional() })
      .strict()
      .optional()
      .describe("Look only inside this element, e.g. a dialog or a row"),
  })
  .strict();
export type Target = z.infer<typeof targetSchema>;

export const exploreActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("click"), target: targetSchema }).strict(),
  z.object({ type: z.literal("fill"), target: targetSchema, value: z.string().max(2000) }).strict(),
  z.object({ type: z.literal("select"), target: targetSchema, value: z.string().min(1).max(500) }).strict(),
  z.object({ type: z.literal("check"), target: targetSchema }).strict(),
  z.object({ type: z.literal("uncheck"), target: targetSchema }).strict(),
  z.object({ type: z.literal("press"), key: z
      .string()
      .regex(PRESS_KEY, "a key name such as Enter, Tab, Escape, ArrowDown or Control+A")
      .describe("A key such as Enter, Tab, Escape, ArrowDown"), target: targetSchema.optional() }).strict(),
  z.object({ type: z.literal("goto"), path: z.string().regex(/^\/(?!\/)/, "a path on the same site, such as /lightning/o/Account/list").max(1000) }).strict(),
  z.object({ type: z.literal("verify"), target: targetSchema, text: z.string().min(1).max(1000).optional().describe("Text the element must hold, exactly as the app shows it") }).strict(),
  z.object({ type: z.literal("unverifiable"), reason: z.string().min(1).max(500).describe("Why the step can't be done or checked on this page") }).strict(),
  z.object({ type: z.literal("finish"), summary: z.string().max(1000).optional() }).strict(),
]);
export type ExploreAction = z.infer<typeof exploreActionSchema>;

export const BROWSER_TYPES = new Set(["click", "fill", "select", "check", "uncheck", "press", "goto", "verify"]);

const outcome = z.enum(["ok", "no-effect", "not-found", "ambiguous", "mismatch", "timeout", "refused", "error", "unknown-token"]);

export const exploredActionSchema = z
  .object({
    action: exploreActionSchema,
    outcome: outcome.optional(),
    matches: z.number().int().min(0).optional(),
    recovery: z.enum(["enter", "dispatch"]).optional(),
    page: z.string().optional(),
    settledMs: z.number().min(0).optional(),
    busy: z.boolean().optional(),
    reason: z.string().optional(),
    dialogs: z.array(z.string()).optional(),
    note: z.string().optional(),
  })
  .strict();

export const explorationSchema = z
  .object({
    testCases: z.object({ run: z.string(), sourceHash: z.string().regex(/^[0-9a-f]{64}$/) }).strict(),
    target: z.object({ kind: z.enum(["salesforce", "web"]), host: z.string(), role: z.string().optional() }).strict(),
    start: z.string(),
    cases: z.array(
      z
        .object({
          id: z.string(),
          title: z.string(),
          /** complete: every step verified or marked unverifiable, then finished. */
          status: z.enum(["complete", "partial"]),
          endedBy: z.enum(["finish", "cap", "unverifiable-streak"]),
          steps: z.array(
            z
              .object({
                index: z.number().int().min(1),
                action: z.string(),
                expected: z.string(),
                status: z.enum(["verified", "unverifiable", "not-reached", "acted"]),
                reason: z.string().optional(),
                actions: z.array(exploredActionSchema),
              })
              .strict(),
          ),
          /** What the app did that the case doesn't describe, in the model's words (masked). */
          deviations: z.array(z.object({ step: z.number().int().min(1), note: z.string() }).strict()),
          /** Paths visited, in order of first visit. */
          pages: z.array(z.string()),
          /** The browser was started again during the case and its actions replayed: records may exist twice. */
          replayed: z.boolean().optional(),
          summary: z.string().optional(),
        })
        .strict(),
    ),
  })
  .strict();
export type Exploration = z.infer<typeof explorationSchema>;

const one = (s: string) => s.replace(/\s+/g, " ").trim();

export function describeTarget(t: Target): string {
  const base = t.role ? `${t.role}${t.name !== undefined ? ` "${t.name}"` : ""}` : t.label !== undefined ? `label "${t.label}"` : t.text !== undefined ? `text "${t.text}"` : t.testId !== undefined ? `test id "${t.testId}"` : `placeholder "${t.placeholder ?? ""}"`;
  return `${base}${t.nth !== undefined ? ` #${t.nth}` : ""}${t.within ? ` in ${t.within.role}${t.within.name !== undefined ? ` "${t.within.name}"` : ""}` : ""}`;
}

export function describeAction(a: ExploreAction): string {
  switch (a.type) {
    case "fill":
    case "select":
      return `${a.type} ${describeTarget(a.target)} with "${one(a.value)}"`;
    case "press":
      return `press ${a.key}${a.target ? ` on ${describeTarget(a.target)}` : ""}`;
    case "goto":
      return `go to ${a.path}`;
    case "verify":
      return `verify ${describeTarget(a.target)}${a.text !== undefined ? ` holds "${one(a.text)}"` : " is visible"}`;
    case "unverifiable":
      return `unverifiable: ${one(a.reason)}`;
    case "finish":
      return "finish";
    default:
      return `${a.type} ${describeTarget(a.target)}`;
  }
}

export function renderExploration(data: Exploration): string {
  const lines = ["# Exploration", "", `${data.cases.length} case(s) explored on ${data.target.host}${data.target.role ? ` as ${data.target.role}` : ""}, from ${data.start}. Values are masked as tokens such as <VALUE_1>.`];
  for (const c of data.cases) {
    lines.push("", `## ${c.id}: ${one(c.title)}`, "", `${c.status} (ended by ${c.endedBy}). Pages: ${c.pages.join(", ") || "none"}${c.replayed ? ". Replayed after a restart: records may exist twice" : ""}`);
    for (const s of c.steps) {
      lines.push("", `### Step ${s.index}: ${s.status}${s.reason ? ` (${one(s.reason)})` : ""}`, "", `${one(s.action)} → ${one(s.expected)}`);
      for (const a of s.actions) {
        lines.push(`- ${describeAction(a.action)}${a.outcome ? `: ${a.outcome}${a.recovery ? ` after ${a.recovery}` : ""}${a.busy ? ", waited for a spinner" : ""}` : ""}`);
      }
    }
    if (c.deviations.length) {
      lines.push("", "Deviations:");
      for (const d of c.deviations) lines.push(`- step ${d.step}: ${one(d.note)}`);
    }
  }
  return lines.join("\n") + "\n";
}

export const EXPLORATION_ARTIFACT: ArtifactSpec<Exploration> = {
  name: "exploration",
  schema: "exploration@1",
  data: explorationSchema,
  render: renderExploration,
};
