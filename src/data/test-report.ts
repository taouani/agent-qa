import { isAbsolute, posix, relative, resolve, sep } from "node:path";
import { z } from "zod";

/**
 * Reads Playwright's JSON report (`--reporter=json`) for the run-and-fix
 * loop (S2-8): one row per test, with what failed and where. Paths become
 * relative to the framework folder. The text is not masked here: the data
 * layer masks it before anything leaves.
 */

const location = z.object({ file: z.string(), line: z.number(), column: z.number().optional() }).passthrough();
const error = z.object({ message: z.string().optional(), stack: z.string().optional(), snippet: z.string().optional(), location: location.optional() }).passthrough();
const attachment = z.object({ name: z.string(), contentType: z.string().optional(), path: z.string().optional(), body: z.string().optional() }).passthrough();
const result = z
  .object({
    status: z.string(),
    startTime: z.string().optional(),
    duration: z.number().optional(),
    error: error.optional(),
    errors: z.array(error).optional(),
    attachments: z.array(attachment).optional(),
  })
  .passthrough();
const test = z.object({ projectName: z.string().optional(), status: z.string(), results: z.array(result) }).passthrough();
const spec = z.object({ title: z.string(), file: z.string(), line: z.number(), tags: z.array(z.string()).optional(), tests: z.array(test) }).passthrough();
interface Suite {
  title: string;
  file?: string | undefined;
  specs?: z.infer<typeof spec>[] | undefined;
  suites?: Suite[] | undefined;
}
const suite: z.ZodType<Suite> = z.lazy(() => z.object({ title: z.string(), file: z.string().optional(), specs: z.array(spec).optional(), suites: z.array(suite).optional() }).passthrough());
const report = z
  .object({
    config: z.object({ rootDir: z.string().optional(), projects: z.array(z.object({ outputDir: z.string().optional() }).passthrough()).optional() }).passthrough().optional(),
    suites: z.array(suite),
    errors: z.array(error).optional(),
    stats: z.object({ expected: z.number(), unexpected: z.number(), flaky: z.number(), skipped: z.number() }).passthrough(),
  })
  .passthrough();

export type TestOutcome = "passed" | "failed" | "flaky" | "skipped";

export interface ReportedTest {
  /** The describe and test titles (for playwright-bdd: feature and scenario), joined with " › ". */
  title: string;
  tags: string[];
  /** The test file, from the framework folder (playwright-bdd: the generated spec in .features-gen). */
  file: string;
  line: number;
  outcome: TestOutcome;
  /** How many times it ran (--repeat-each), and how many of those failed. */
  runs: number;
  failedRuns: number;
  /** When its first run started (ISO) and how long its runs took, start to end: for the Test Execution's per-test dates. */
  startedAt?: string | undefined;
  durationMs?: number | undefined;
  /** The first failure: its message (with the call log), the code around it, and where. */
  failure?:
    | { message: string; snippet?: string | undefined; at?: { file: string; line: number } | undefined; snapshotPath?: string | undefined; snapshot?: string | undefined; screenshotPath?: string | undefined }
    | undefined;
}

export interface ParsedReport {
  tests: ReportedTest[];
  /** Errors outside any test: a config or global setup that failed, a file that didn't load. */
  errors: string[];
}

const ANSI = /\u001b\[[0-9;]*m/g;
export const plain = (s: string) => s.replace(ANSI, "").replace(/\r\n/g, "\n");

/** A path from the report, relative to the framework folder, with forward slashes; outside it, only its name. */
function fromFolder(path: string, folder: string, base: string): string {
  const full = isAbsolute(path) ? path : resolve(base, path);
  const rel = relative(folder, full);
  if (rel === "" || isAbsolute(rel) || rel.split(sep).includes("..")) return posix.basename(full.replace(/\\/g, "/"));
  return rel.split(sep).join("/");
}

export function parsePlaywrightReport(json: unknown, folder: string): ParsedReport {
  const parsed = report.safeParse(json);
  if (!parsed.success) throw new Error("Playwright's JSON report has an unexpected shape");
  const r = parsed.data;
  const base = r.config?.rootDir ?? folder;
  // A page snapshot is only Playwright's own error-context.md in a project's output folder: an attachment
  // the test code made could name any file (.env, a saved session).
  const outputs = (r.config?.projects ?? []).map((p) => p.outputDir).filter((d): d is string => typeof d === "string" && isAbsolute(d));
  const snapshotFile = (path: string | undefined) => {
    if (!path || posix.basename(path.replace(/\\/g, "/")) !== "error-context.md") return undefined;
    return outputs.some((d) => {
      const rel = relative(d, path);
      return rel !== "" && !isAbsolute(rel) && !rel.split(sep).includes("..");
    })
      ? path
      : undefined;
  };
  /** Playwright's own failure screenshot: an image attachment named "screenshot", in a project's output folder. */
  const screenshotFile = (attachments: ReadonlyArray<z.infer<typeof attachment>> | undefined) => {
    const a = attachments?.find((x) => x.name === "screenshot" && /^image\/(png|jpeg)$/.test(x.contentType ?? "") && typeof x.path === "string" && /\.(png|jpe?g)$/i.test(x.path));
    if (!a?.path) return undefined;
    return outputs.some((d) => {
      const rel = relative(d, a.path!);
      return rel !== "" && !isAbsolute(rel) && !rel.split(sep).includes("..");
    })
      ? a.path
      : undefined;
  };
  const tests: ReportedTest[] = [];
  const walk = (s: Suite, titles: string[]) => {
    // The file's own suite is titled with the file name: left out of the title.
    const here = s.file !== undefined && s.title === s.file ? titles : [...titles, s.title];
    for (const sp of s.specs ?? []) {
      for (const t of sp.tests) {
        const failed = t.results.filter((x) => x.status !== "passed" && x.status !== "skipped");
        const outcome: TestOutcome = t.status === "expected" ? "passed" : t.status === "flaky" ? "flaky" : t.status === "skipped" ? "skipped" : "failed";
        const first = failed[0];
        const err = first?.error ?? first?.errors?.[0];
        const context = first?.attachments?.find((a) => a.name === "error-context");
        const span = timeSpan(t.results);
        tests.push({
          title: [...here, sp.title].filter(Boolean).join(" › ") + (t.projectName ? ` [${t.projectName}]` : ""),
          tags: sp.tags ?? [],
          file: fromFolder(sp.file, folder, base),
          line: sp.line,
          outcome,
          runs: t.results.length,
          failedRuns: failed.length,
          ...span,
          ...(first
            ? {
                failure: {
                  // Whole: cut only once masked, so a value at the edge isn't half-hidden from the detectors.
                  message: plain(err?.message ?? `the test ended ${first.status}`),
                  snippet: err?.snippet ? plain(err.snippet) : undefined,
                  at: err?.location ? { file: fromFolder(err.location.file, folder, base), line: err.location.line } : undefined,
                  snapshotPath: snapshotFile(context?.path),
                  screenshotPath: screenshotFile(first.attachments),
                  snapshot: context?.body !== undefined && context.contentType?.startsWith("text/") ? Buffer.from(context.body, "base64").toString("utf8") : undefined,
                },
              }
            : {}),
        });
      }
    }
    for (const c of s.suites ?? []) walk(c, here);
  };
  for (const s of r.suites) walk(s, []);
  return { tests: merged(tests), errors: (r.errors ?? []).map((e) => plain(e.message ?? e.stack ?? "an error outside the tests")) };
}

/** From the first run's start to the last run's end; nothing when the report has no start times. */
function timeSpan(results: ReadonlyArray<{ startTime?: string | undefined; duration?: number | undefined }>): { startedAt?: string; durationMs?: number } {
  const runs = results.flatMap((x) => {
    const at = x.startTime ? Date.parse(x.startTime) : NaN;
    return Number.isFinite(at) ? [{ start: at, end: at + Math.max(0, x.duration ?? 0) }] : [];
  });
  if (runs.length === 0) return {};
  const start = Math.min(...runs.map((x) => x.start));
  return { startedAt: new Date(start).toISOString(), durationMs: Math.max(...runs.map((x) => x.end)) - start };
}

/** --repeat-each runs a test as several: one row each, its runs counted. Passing some and failing others is flaky. */
function merged(tests: ReportedTest[]): ReportedTest[] {
  const byKey = new Map<string, ReportedTest>();
  for (const t of tests) {
    const key = `${t.file}:${t.line}:${t.title}`;
    const seen = byKey.get(key);
    if (!seen) {
      byKey.set(key, { ...t });
      continue;
    }
    seen.runs += t.runs;
    seen.failedRuns += t.failedRuns;
    seen.failure ??= t.failure;
    if (t.startedAt !== undefined) {
      const end = (x: ReportedTest) => Date.parse(x.startedAt!) + (x.durationMs ?? 0);
      const start = seen.startedAt === undefined ? Date.parse(t.startedAt) : Math.min(Date.parse(seen.startedAt), Date.parse(t.startedAt));
      const last = seen.startedAt === undefined ? end(t) : Math.max(end(seen), end(t));
      seen.startedAt = new Date(start).toISOString();
      seen.durationMs = last - start;
    }
    if (seen.outcome !== t.outcome) seen.outcome = seen.outcome === "skipped" ? t.outcome : t.outcome === "skipped" ? seen.outcome : "flaky";
  }
  return [...byKey.values()];
}
