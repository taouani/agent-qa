import type { Span } from "./detectors.js";
import { fold, foldWithMap } from "./fold.js";

/**
 * Known names: people from Jira fields (assignee, reporter, mentions) and any
 * configured list. Every occurrence in free text is masked, in any case, with
 * or without accents, and also each part alone ("Marguerite", "Quillfeather"),
 * because text often names a person by one part. Each part maps to the same
 * token as the whole name.
 */

/** Below this length a lone Latin-script name part would match too much. CJK parts may be shorter. */
export const MIN_NAME_PART = 3;

/**
 * Everyday words that are also names. Alone they are left as they are; the full name is still masked.
 * Kept in step with the harness scanner's list: a word alone here must be one the leak gate ignores too.
 */
export const COMMON_WORDS = new Set(
  (
    "account case contact lead field status record owner user name task event page test order quote price product " +
    "report view list home edit save cancel note file type stage amount close date phone email mobile title " +
    "company street city state country grace hope faith will mark bill rose may june april august summer winter " +
    "king young white black brown green gray grey hill wood ford lane park the and " +
    "van von der den del de da di le la les los las el al bin ben"
  ).split(" "),
);

/** Two-letter words that are not names alone, in the supported languages. Other two-letter parts (Li, Na, Wu) are masked. */
const SHORT_WORDS = new Set(
  (
    "a an as at be by do go he if in is it me my no of on or so to up us we " +
    "au ce du en et il je ne ou sa se si ta te tu un " +
    "da de di el en es ha la le lo me mi ni no se si su te tu un ya yo " +
    "am an da er es im in ja ob um wo zu " +
    "ao as da do em eu na no os ou se um " +
    "al ad af al bij en er ik in je om op te uw we " +
    "ci il in io la le lo ma mi ne se si su ti tu"
  ).split(" "),
);

/** Scripts written without spaces between words: a name inside them has no word boundary. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u;
const ARABIC = /\p{Script=Arabic}/u;
/** One-letter Arabic prefixes written joined to the next word: و (and), ب (with), ل (for), ف (so), ك (as). */
const ARABIC_PREFIX = /[وبلفك]/u;

interface Entry {
  /** Folded text to find. */
  needle: string;
  /** The value the token is for: the full name, or the part itself when two names share it. */
  canonical: string;
}

const isLetter = (ch: string | undefined) => !!ch && /\p{L}/u.test(ch);

export class NameIndex {
  private entries: Entry[] = [];
  private byNeedle = new Map<string, Entry>();
  private seen = new Set<string>();

  add(names: Iterable<string>): void {
    for (const raw of names) {
      const name = raw.replace(/^@/, "").replace(/\s+/g, " ").trim();
      if (!name) continue;
      const folded = fold(name);
      if (this.seen.has(folded)) continue;
      this.seen.add(folded);
      if (this.longEnough(folded)) this.push(folded, name, true);
      const parts = folded.split(/[^\p{L}\p{N}'-]+/u).filter(Boolean);
      if (parts.length > 1) {
        for (const part of parts) {
          for (const piece of new Set([part, ...part.split(/[-']/)])) {
            if (this.longEnough(piece) && !COMMON_WORDS.has(piece) && !SHORT_WORDS.has(piece)) this.push(piece, name, false);
          }
        }
      }
    }
    // Longest first, so "Marguerite Quillfeather" wins over "Marguerite".
    this.entries.sort((a, b) => b.needle.length - a.needle.length);
  }

  private longEnough(text: string): boolean {
    if (UNSPACED.test(text)) return [...text].length >= 2;
    return [...text].length >= 2 && (text.length >= MIN_NAME_PART || !SHORT_WORDS.has(text));
  }

  private push(needle: string, canonical: string, whole: boolean) {
    const existing = this.byNeedle.get(needle);
    if (!existing) {
      const entry = { needle, canonical };
      this.entries.push(entry);
      this.byNeedle.set(needle, entry);
    } else if (!whole && existing.canonical !== canonical && fold(existing.canonical) !== needle) {
      // A part two people share ("Marie"): its token stands for the part, so unmasking can't name the wrong person.
      existing.canonical = canonical.split(/\s+/).find((p) => fold(p) === needle) ?? needle;
    }
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
      const unspaced = UNSPACED.test(needle);
      const arabic = ARABIC.test(needle);
      for (let at = f.text.indexOf(needle); at !== -1; at = f.text.indexOf(needle, at + 1)) {
        const end = at + needle.length;
        if (!unspaced) {
          const before = f.text[at - 1];
          const prefixed = arabic && before !== undefined && ARABIC_PREFIX.test(before) && !isLetter(f.text[at - 2]);
          // Letters only: a digit or an underscore next to a name ("Marguerite2") doesn't make it another word.
          if ((isLetter(before) && !prefixed) || isLetter(f.text[end])) continue;
        }
        if (taken.subarray(at, end).some((v) => v === 1)) continue;
        taken.fill(1, at, end);
        let endOriginal = f.ends[end - 1]!;
        // Take combining marks that follow, so none is left hanging after the token.
        while (endOriginal < text.length && /\p{M}/u.test(text[endOriginal]!)) endOriginal++;
        spans.push({ start: f.starts[at]!, end: endOriginal, detector: "name", kind: "PERSON", value: canonical });
      }
    }
    return spans.sort((a, b) => a.start - b.start);
  }
}
