import type { Span } from "./detectors.js";
import { fold, foldWithMap } from "./fold.js";

/**
 * Known names: people from Jira fields (assignee, reporter, mentions) and any
 * configured list. Every occurrence in free text is masked, in any case, with
 * or without accents, and also each part alone ("Marguerite", "Quillfeather"),
 * because text often names a person by one part. Each part maps to the same
 * token as the whole name.
 */

/** Below this length a lone name part would match too much. */
export const MIN_NAME_PART = 3;

/** Everyday words that are also names. Alone they are left as they are; the full name is still masked. */
const COMMON_WORDS = new Set(
  (
    "account case contact lead field status record owner user name task event page test order quote price product " +
    "report view list home edit save cancel note file type stage amount close date phone email mobile title admin " +
    "company street city state country grace hope faith will mark bill rose may june april august summer winter " +
    "king young white black brown green gray grey hill wood ford lane park team support service sales the and " +
    "van von der den del della de da di le la les los las el al bin ben"
  ).split(" "),
);

interface Entry {
  /** Folded text to find. */
  needle: string;
  /** The full name the token is for. */
  canonical: string;
}

const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);

export class NameIndex {
  private entries: Entry[] = [];
  private seen = new Set<string>();

  add(names: Iterable<string>): void {
    for (const raw of names) {
      const name = raw.replace(/^@/, "").replace(/\s+/g, " ").trim();
      if (!name) continue;
      const canonical = name;
      const folded = fold(name);
      if (this.seen.has(folded)) continue;
      this.seen.add(folded);
      if (folded.length >= MIN_NAME_PART) this.push(folded, canonical);
      const parts = folded.split(/[^\p{L}\p{N}'-]+/u).filter(Boolean);
      if (parts.length > 1) {
        for (const part of parts) {
          for (const piece of [part, ...part.split(/[-']/)]) {
            if (piece.length >= MIN_NAME_PART && !COMMON_WORDS.has(piece)) this.push(piece, canonical);
          }
        }
      }
    }
    // Longest first, so "Marguerite Quillfeather" wins over "Marguerite".
    this.entries.sort((a, b) => b.needle.length - a.needle.length);
  }

  private push(needle: string, canonical: string) {
    if (!this.entries.some((e) => e.needle === needle)) this.entries.push({ needle, canonical });
  }

  get size(): number {
    return this.seen.size;
  }

  find(text: string): Span[] {
    if (this.entries.length === 0) return [];
    const f = foldWithMap(text);
    const taken = new Uint8Array(f.text.length);
    const spans: Span[] = [];
    for (const { needle, canonical } of this.entries) {
      for (let at = f.text.indexOf(needle); at !== -1; at = f.text.indexOf(needle, at + 1)) {
        const end = at + needle.length;
        if (isWordChar(f.text[at - 1]) || isWordChar(f.text[end])) continue;
        if (taken.subarray(at, end).some((v) => v === 1)) continue;
        taken.fill(1, at, end);
        spans.push({ start: f.starts[at]!, end: f.ends[end - 1]!, detector: "name", kind: "PERSON", value: canonical });
      }
    }
    return spans.sort((a, b) => a.start - b.start);
  }
}
