import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { COST_ARTIFACT, type RunStore } from "../core/index.js";
import { MASKING_REPORT_ARTIFACT } from "../data/index.js";
import { keptRate, type KeptRate } from "./kept-rate.js";
import { runnableRate, type RunnableRate } from "./runnable-rate.js";
import type { HarnessReport } from "./runner.js";
import { weeklyRates, type WeekRates } from "./weekly.js";

/**
 * The local dashboard (S5-3, Tarek's choice 1a): one HTML file from the run
 * folder and the last harness run. No server, no script, no network call: the
 * file holds only what the run folder already holds masked (counts, run ids,
 * workflow names, models, tokens and cost) and the harness's own report, which
 * names seeds by id and kind, never by value.
 */
export interface DashboardData {
  generatedAt: string;
  targets: { kept: number; runnable: number };
  kept: KeptRate;
  runnable: RunnableRate;
  weeks: WeekRates[];
  harness?: HarnessReport | undefined;
  masking: { runs: number; tokens: number; issues: number; pages: number; byDetector: Record<string, number> };
  runs: Array<{ id: string; workflow: string; status: string; startedAt: string; driver: string; model?: string | undefined; calls: number; inputTokens: number; outputTokens: number; usd?: number | undefined; unpriced: boolean }>;
  /** Runs left out of the cost table, past the newest `maxRuns`. */
  olderRuns: number;
}

/** Marks a file as a dashboard `agent-qa report --html` wrote, so a later run may replace it. */
export const DASHBOARD_GENERATOR = "agent-qa report";

/** Where `agent-qa harness` keeps its last report, next to its runs. */
export const HARNESS_LAST_REPORT = "last-report.json";

const harnessReportSchema = z
  .object({
    version: z.literal(1),
    pipeline: z.string(),
    driver: z.string(),
    startedAt: z.string(),
    finishedAt: z.string(),
    cases: z.array(
      z.object({
        id: z.string(),
        workflow: z.string(),
        status: z.enum(["pass", "fail", "error"]),
        modelCalls: z.number(),
        seededLeaks: z.array(z.object({ seedId: z.string(), kind: z.string() }).passthrough()),
        error: z.string().optional(),
        durationMs: z.number(),
      }),
    ),
    summary: z.object({ cases: z.number(), passed: z.number(), failed: z.number(), errors: z.number(), seededLeaks: z.number() }),
  })
  .passthrough();

/** The last harness report in `harnessDir`, or undefined when there is none (or it can't be read). */
export async function lastHarnessReport(harnessDir: string): Promise<HarnessReport | undefined> {
  try {
    const parsed = harnessReportSchema.safeParse(JSON.parse(await readFile(join(harnessDir, HARNESS_LAST_REPORT), "utf8")));
    return parsed.success ? (parsed.data as unknown as HarnessReport) : undefined;
  } catch {
    return undefined;
  }
}

export async function dashboardData(
  runs: Pick<RunStore, "list" | "readArtifact" | "manifest">,
  options: { harnessDir: string; targets: { kept: number; runnable: number }; weeks?: number; maxRuns?: number; now?: () => Date },
): Promise<DashboardData> {
  const [kept, runnable, weeks, harness] = await Promise.all([keptRate(runs), runnableRate(runs), weeklyRates(runs, options.weeks ?? 26), lastHarnessReport(options.harnessDir)]);
  const masking: DashboardData["masking"] = { runs: 0, tokens: 0, issues: 0, pages: 0, byDetector: {} };
  const rows: DashboardData["runs"] = [];
  for (const id of await runs.list()) {
    const manifest = await runs.manifest(id).catch(() => undefined);
    if (!manifest) continue;
    const report = await runs.readArtifact(id, MASKING_REPORT_ARTIFACT).catch(() => undefined);
    if (report) {
      masking.runs += 1;
      masking.tokens += report.data.tokens;
      masking.issues += report.data.issues;
      masking.pages += report.data.pages;
      for (const [k, v] of Object.entries(report.data.byDetector)) masking.byDetector[k] = (masking.byDetector[k] ?? 0) + v;
    }
    const cost = (await runs.readArtifact(id, COST_ARTIFACT).catch(() => undefined))?.data.total;
    rows.push({
      id,
      workflow: manifest.workflow,
      status: manifest.status,
      startedAt: manifest.startedAt,
      driver: manifest.driver,
      ...(manifest.model ? { model: manifest.model } : {}),
      calls: cost?.calls ?? 0,
      inputTokens: cost?.inputTokens ?? 0,
      outputTokens: cost?.outputTokens ?? 0,
      ...(cost?.usd !== undefined ? { usd: cost.usd } : {}),
      unpriced: cost ? cost.unpriced.length > 0 || cost.hostModelCalls > 0 : false,
    });
  }
  rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const max = options.maxRuns ?? 100;
  return {
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    targets: options.targets,
    kept,
    runnable,
    weeks,
    ...(harness ? { harness } : {}),
    masking,
    runs: rows.slice(0, max),
    olderRuns: Math.max(0, rows.length - max),
  };
}

const esc = (v: unknown) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const pct = (r: number | undefined) => (r === undefined ? "–" : `${(r * 100).toFixed(1)}%`);
const num = (n: number) => n.toLocaleString("en-US");

/** The two rates per week as an inline SVG line chart, with the targets as dashed lines. */
function chart(weeks: readonly WeekRates[], targets: DashboardData["targets"]): string {
  if (weeks.length === 0) return `<p class="muted">No week has a reviewed or finished run yet.</p>`;
  const w = 640;
  const h = 220;
  const pad = { l: 44, r: 32, t: 12, b: 36 };
  const x = (i: number) => pad.l + (weeks.length === 1 ? (w - pad.l - pad.r) / 2 : (i * (w - pad.l - pad.r)) / (weeks.length - 1));
  const y = (r: number) => pad.t + (1 - r) * (h - pad.t - pad.b);
  const line = (pick: (wk: WeekRates) => number | undefined, cls: string, label: string) => {
    const pts = weeks.map((wk, i) => [i, pick(wk)] as const).filter((p): p is readonly [number, number] => p[1] !== undefined);
    if (pts.length === 0) return "";
    const d = pts.map(([i, r], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(r).toFixed(1)}`).join(" ");
    const dots = pts.map(([i, r]) => `<circle class="${cls}" cx="${x(i).toFixed(1)}" cy="${y(r).toFixed(1)}" r="3.5"><title>${esc(`${label} ${weeks[i]!.week}: ${pct(r)}`)}</title></circle>`).join("");
    return `<path class="${cls}" d="${d}" fill="none" stroke-width="2"/>${dots}`;
  };
  const grid = [0, 0.25, 0.5, 0.75, 1].map((r) => `<line class="grid" x1="${pad.l}" x2="${w - pad.r}" y1="${y(r)}" y2="${y(r)}"/><text class="axis" x="${pad.l - 6}" y="${y(r) + 4}" text-anchor="end">${r * 100}%</text>`).join("");
  const target = (r: number, cls: string) => `<line class="${cls} target" x1="${pad.l}" x2="${w - pad.r}" y1="${y(r)}" y2="${y(r)}"/>`;
  const step = Math.max(1, Math.ceil(weeks.length / 8));
  const labels = weeks.map((wk, i) => (i % step === 0 || i === weeks.length - 1 ? `<text class="axis" x="${x(i)}" y="${h - pad.b + 18}" text-anchor="${weeks.length > 1 && i === weeks.length - 1 ? "end" : "middle"}">${esc(wk.week)}</text>` : "")).join("");
  return `<div class="scroll"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Kept and runnable rates by week">${grid}${target(targets.kept, "kept")}${target(targets.runnable, "runnable")}${line((wk) => wk.kept.rate, "kept", "kept")}${line((wk) => wk.runnable.rate, "runnable", "runnable")}${labels}</svg></div>
<p class="legend"><span class="swatch kept"></span>kept (target ${pct(targets.kept)}) <span class="swatch runnable"></span>runnable (target ${pct(targets.runnable)}) <span class="muted">· dashed: targets</span></p>`;
}

const table = (head: string[], rows: string[][], numeric: number[] = []) =>
  `<div class="scroll"><table><thead><tr>${head.map((c, i) => `<th${numeric.includes(i) ? ' class="n"' : ""}>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${numeric.includes(i) ? ' class="n"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;

export function renderDashboard(d: DashboardData): string {
  const tile = (label: string, value: string, note: string) => `<div class="tile"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="muted">${esc(note)}</div></div>`;
  const keptNote = d.kept.rate === undefined ? "no reviewed test cases yet" : `${num(d.kept.kept)} of ${num(d.kept.generated)} cases kept as written, ${d.kept.runs} reviewed run(s)`;
  const judged = d.runnable.cases - d.runnable.defects - d.runnable.environment - d.runnable.unproven;
  const runnableNote = d.runnable.rate === undefined ? "no case judged on its tests yet" : `${num(d.runnable.runnable)} of ${num(judged)} cases pass again and again`;
  const usd = d.runs.reduce((s, r) => s + (r.usd ?? 0), 0);
  const weeksRows = [...d.weeks].reverse().map((w) => [esc(w.week), w.kept.runs ? `${pct(w.kept.rate)} <span class="muted">(${w.kept.kept}/${w.kept.generated})</span>` : "–", w.runnable.runs ? `${pct(w.runnable.rate)} <span class="muted">(${w.runnable.runnable}/${w.runnable.judged})</span>` : "–"]);
  const h = d.harness;
  const harness = h
    ? `<p>${esc(h.summary.passed)}/${esc(h.summary.cases)} passed, <strong class="${h.summary.seededLeaks ? "bad" : "good"}">${esc(h.summary.seededLeaks)} seeded leak(s)</strong>, with ${esc(h.driver)} on the ${esc(h.pipeline)} pipeline, ${esc(h.finishedAt.slice(0, 16).replace("T", " "))} UTC.</p>` +
      table(
        ["case", "workflow", "result", "model calls", "leaks"],
        h.cases.map((c) => [esc(c.id), esc(c.workflow), `<span class="${c.status === "pass" ? "good" : "bad"}">${esc(c.status)}</span>${c.error ? ` <span class="muted">${esc(c.error.slice(0, 200))}</span>` : ""}`, esc(c.modelCalls), c.seededLeaks.length ? `<span class="bad">${c.seededLeaks.map((l) => esc(`${l.seedId} (${l.kind})`)).join(", ")}</span>` : "0"]),
        [3],
      )
    : `<p class="muted">No harness run yet: run <code>agent-qa harness</code>, and this shows its last report.</p>`;
  const detectors = Object.entries(d.masking.byDetector).sort((a, b) => b[1] - a[1]);
  const masking = d.masking.runs
    ? `<p>${num(d.masking.tokens)} token(s) issued over ${d.masking.runs} run(s) that read Jira or Confluence (${num(d.masking.issues)} issue(s), ${num(d.masking.pages)} page(s)).</p>` + (detectors.length ? table(["detector", "values masked"], detectors.map(([k, v]) => [esc(k), num(v)]), [1]) : "")
    : `<p class="muted">No run has read Jira or Confluence yet.</p>`;
  const runs = d.runs.length
    ? table(
        ["run", "workflow", "status", "started (UTC)", "driver / model", "calls", "tokens in / out", "cost"],
        d.runs.map((r) => [esc(r.id), esc(r.workflow), esc(r.status), esc(r.startedAt.slice(0, 16).replace("T", " ")), esc(r.model ? `${r.driver} · ${r.model}` : r.driver), num(r.calls), `${num(r.inputTokens)} / ${num(r.outputTokens)}`, r.usd !== undefined ? `$${r.usd.toFixed(2)}${r.unpriced ? "+" : ""}` : r.calls ? '<span class="muted">not priced</span>' : "–"]),
        [5, 6, 7],
      ) + (d.olderRuns ? `<p class="muted">${d.olderRuns} older run(s) not shown.</p>` : "")
    : `<p class="muted">No runs in this project yet.</p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="generator" content="${DASHBOARD_GENERATOR}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Agent-QA report</title>
<style>
:root { --bg: #ffffff; --fg: #1d2330; --muted: #5d6677; --line: #e3e6ec; --card: #f6f7f9; --kept: #2f6fd6; --runnable: #c2571a; --good: #1f7a45; --bad: #b3261e; }
@media (prefers-color-scheme: dark) { :root { --bg: #14171c; --fg: #e6e9ef; --muted: #9aa3b2; --line: #2a2f38; --card: #1b1f26; --kept: #7aa7ff; --runnable: #f08a4b; --good: #5cc98a; --bad: #ff8a80; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 980px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 17px; margin: 32px 0 8px; }
.muted { color: var(--muted); } .good { color: var(--good); } .bad { color: var(--bad); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 16px; }
.tile { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
.tile .label { color: var(--muted); font-size: 13px; } .tile .value { font-size: 26px; font-weight: 600; font-variant-numeric: tabular-nums; }
svg { width: 100%; min-width: 520px; height: auto; display: block; margin-top: 8px; }
svg .grid { stroke: var(--line); } svg .axis { fill: var(--muted); font-size: 11px; }
svg path.kept, svg line.kept { stroke: var(--kept); } svg circle.kept { fill: var(--kept); }
svg path.runnable, svg line.runnable { stroke: var(--runnable); } svg circle.runnable { fill: var(--runnable); }
svg .target { stroke-dasharray: 5 4; stroke-width: 1.5; opacity: .7; }
.legend { font-size: 13px; } .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin: 0 4px 0 10px; vertical-align: baseline; }
.swatch.kept { background: var(--kept); margin-left: 0; } .swatch.runnable { background: var(--runnable); }
.scroll { overflow-x: auto; } table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; } th { color: var(--muted); font-weight: 600; }
td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
code { font-size: 13px; }
</style>
</head>
<body>
<main>
<h1>Agent-QA report</h1>
<p class="muted">From this project's runs, ${esc(d.generatedAt.slice(0, 16).replace("T", " "))} UTC. Masked data only; this file makes no network call.</p>
<div class="tiles">
${tile("Kept rate", pct(d.kept.rate), keptNote)}
${tile("Runnable rate", pct(d.runnable.rate), runnableNote)}
${tile("Harness", h ? `${h.summary.passed}/${h.summary.cases}` : "–", h ? `${h.summary.seededLeaks} seeded leak(s)` : "not run yet")}
${tile("Cost shown", `$${usd.toFixed(2)}`, `${d.olderRuns ? `the latest ${d.runs.length} run(s), not the ${d.olderRuns} older` : `${d.runs.length} run(s)`}; host-model answers aren't priced`)}
</div>
<h2>Rates by week</h2>
${chart(d.weeks, d.targets)}
${weeksRows.length ? table(["week", "kept", "runnable"], weeksRows) : ""}
<p class="muted">Reviews with --yes and harness runs never count. Each week judges a case by its latest run of that week. See docs/rates.md.</p>
<h2>Last harness run</h2>
${harness}
<h2>Masking</h2>
${masking}
<h2>Runs and cost</h2>
${runs}
</main>
</body>
</html>
`;
}
