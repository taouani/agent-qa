import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { listRepoFiles } from "./profile-scan.js";

/**
 * Feature files of the repo that may describe what a Jira issue with no
 * acceptance criteria is about (Tarek, 7 Nov 2026): the requirements analysis
 * may propose criteria from them, labelled with the file. Found the same way
 * in an IDE and in CI, with no model: a file that names the issue key first,
 * then the files whose feature and scenario titles share the most words with
 * the issue's summary.
 */

export interface RelatedFeature {
  /** Posix path from the repo folder. */
  path: string;
  /** The file's text, raw: the caller masks it. */
  text: string;
  /** sha256 of the raw text: the same file gives the same hash in any run, whatever the masking. */
  hash: string;
}

/** Files offered per issue, and how much of each. */
export const MAX_RELATED_FEATURES = 3;
export const MAX_RELATED_FEATURE_CHARS = 6_000;
const MAX_FEATURE_BYTES = 200_000;

// Words that say nothing about what a feature does.
const STOP = new Set(
  "the and for with from that this when then given into onto over under below above than have has are was were will shall should must can not but its their your our you who what which where a an of to in on at by as is be or it if so no do does create created creating user users request requests feature scenario outline background example examples story".split(" "),
);

/** Lowercase words of 3+ letters, without stop words; masked tokens such as <PERSON_1> are left out. */
export function wordsOf(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.replace(/<[A-Z][A-Z0-9_]*_\d+>/g, " ").toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)) out.add(w);
  }
  return out;
}

/** The feature title and scenario titles: what the file is about, without its steps. */
function titlesOf(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^(Feature|Rule|Scenario|Scenario Outline|Scenario Template|Example)\s*:/i.test(l))
    .join("\n");
}

export interface FeatureFile {
  path: string;
  text: string;
}

/** Files listed while looking for features: far more than a profile scan reads, since only .feature files are opened. */
const MAX_LISTED = 50_000;

/** Every readable .feature file under `folder`, sorted by path. */
export function featureFiles(folder: string): FeatureFile[] {
  const out: FeatureFile[] = [];
  for (const path of listRepoFiles(folder, MAX_LISTED)) {
    if (!path.endsWith(".feature")) continue;
    try {
      const full = join(folder, path);
      if (statSync(full).size > MAX_FEATURE_BYTES) continue;
      out.push({ path, text: readFileSync(full, "utf8") });
    } catch {
      // Unreadable: left out.
    }
  }
  return out;
}

/** At most MAX_RELATED_FEATURE_CHARS, cut at a line end. Called on masked text, so a cut never splits a name before it is masked. */
export function clipFeature(text: string): string {
  if (text.length <= MAX_RELATED_FEATURE_CHARS) return text;
  const end = text.lastIndexOf("\n", MAX_RELATED_FEATURE_CHARS);
  const at = end > 0 ? end : MAX_RELATED_FEATURE_CHARS;
  return `${text.slice(0, at)}\n[cut: ${text.length - at} more characters]`;
}

/**
 * The files most likely about `issue`, best first: the key named in the file
 * or its path, then shared words of the path and titles (at least two). A file
 * tagged with one of the issue's own case ids (`@TC-{KEY}-NNN`) is Agent-QA's
 * output for this issue (the scripts workflow tags every scenario so): it is
 * left out, or a rerun would offer the earlier guesses back as evidence.
 * Text comes back whole: the caller masks it, then clips it.
 */
export function relatedFeatures(issue: { key: string; summary: string }, files: readonly FeatureFile[], max = MAX_RELATED_FEATURES): RelatedFeature[] {
  const k = issue.key.replace(/[-]/g, "\\-");
  const key = new RegExp(`(^|[^A-Z0-9])${k}(?![0-9])`, "i");
  const own = new RegExp(`@TC-${k}-\\d{3,}(?![0-9])`, "i");
  const wanted = wordsOf(issue.summary);
  const scored = files
    .filter((f) => !own.test(f.text))
    .map((f) => {
      const named = key.test(f.path) || key.test(f.text);
      const have = wordsOf(`${f.path.replace(/[_/.-]+/g, " ")}\n${titlesOf(f.text)}`);
      let shared = 0;
      for (const w of wanted) if (have.has(w)) shared++;
      return { f, named, shared };
    })
    .filter((s) => s.named || s.shared >= 2)
    // Plain code-unit order: the same on every machine, whatever its locale.
    .sort((a, b) => Number(b.named) - Number(a.named) || b.shared - a.shared || (a.f.path < b.f.path ? -1 : a.f.path > b.f.path ? 1 : 0));
  return scored.slice(0, max).map(({ f }) => ({ path: f.path, text: f.text, hash: createHash("sha256").update(f.text).digest("hex") }));
}
