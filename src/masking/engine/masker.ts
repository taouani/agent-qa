import type { RunVault, TokenKind } from "../vault/index.js";
import { PATTERN_DETECTORS, type DetectorName, type PatternDetector, type Span } from "./detectors.js";
import { LanguageNameDetector, type NameLanguage } from "./lang-names.js";
import { NameIndex } from "./names.js";

/**
 * The masking engine for one run. Pattern detectors and known names find
 * spans; overlapping spans are resolved longest first; each span becomes a
 * vault token such as `<EMAIL_1>`, stable for the whole run. Fields named in
 * `masking.fields` are replaced whole.
 *
 * The report counts what was masked, by detector and by field. It never holds
 * values.
 */

export interface MaskerOptions {
  vault: RunVault;
  /** Detectors to run; all when unset. `address` is accepted and not implemented yet. */
  detectors?: readonly DetectorName[];
  /** Names known up front, e.g. a configured list. */
  names?: Iterable<string>;
  /** Languages for finding names nobody listed. Default: all nine. Empty: known names only. */
  nameLanguages?: readonly NameLanguage[];
  /** Replaces the built-in pattern detectors, for tests. */
  patternDetectors?: PatternDetector[];
}

export interface MaskOptions {
  /** Where the text came from, e.g. "jira.description" or "confluence.body". Counted in the report. */
  field?: string;
  /** Replace the whole value with one token of this kind (e.g. a field listed in `masking.fields`). */
  whole?: TokenKind;
}

export interface MaskingCounts {
  byDetector: Record<string, number>;
  byField: Record<string, number>;
  /** Fields replaced whole, by field. */
  wholeFields: Record<string, number>;
  /** Distinct tokens issued in this run so far. */
  tokens: number;
}

/** Earlier detectors win a tie: an email address holds a name, an IBAN holds digits that look like a phone number. */
const PRIORITY: DetectorName[] = ["email", "iban", "card", "national-id", "phone", "ip", "name", "address"];

export class Masker {
  private readonly vault: RunVault;
  private readonly patterns: PatternDetector[];
  private readonly names = new NameIndex();
  private readonly useNames: boolean;
  private readonly langNames: LanguageNameDetector | undefined;
  private readonly counts: MaskingCounts = { byDetector: {}, byField: {}, wholeFields: {}, tokens: 0 };

  constructor(options: MaskerOptions) {
    this.vault = options.vault;
    const enabled = new Set<DetectorName>(options.detectors ?? PRIORITY);
    this.useNames = enabled.has("name");
    const languages = options.nameLanguages;
    this.langNames = this.useNames && (languages === undefined || languages.length > 0) ? new LanguageNameDetector(languages) : undefined;
    this.patterns =
      options.patternDetectors ??
      (Object.keys(PATTERN_DETECTORS) as PatternDetector["name"][]).filter((n) => enabled.has(n)).map((n) => PATTERN_DETECTORS[n]());
    if (options.names) this.addNames(options.names);
  }

  /** Names to find in free text from now on, e.g. the people on an issue. */
  addNames(names: Iterable<string>): void {
    if (this.useNames) this.names.add(names);
  }

  /** Spans to mask in `text`, without overlaps, in order. */
  spans(text: string): Span[] {
    // Detectors see ASCII digits; full-width and Arabic-Indic digits map one to one, so offsets hold.
    const digits = asciiDigits(text);
    const known = this.useNames ? this.names.find(text) : [];
    // Found names only fill what known names leave, so a known person keeps one token in any order or format.
    const found = this.langNames ? outside(this.langNames.find(text), known, text) : [];
    const all = [...this.patterns.flatMap((d) => d.find(digits)), ...known, ...found];
    return mergeOverlaps(all, text);
  }

  mask(text: string, options: MaskOptions = {}): string {
    if (options.whole) {
      if (text.trim() === "") return text;
      const token = this.vault.tokenFor(options.whole, text.trim());
      this.count(this.counts.wholeFields, options.field ?? "(unnamed)");
      this.counts.tokens = this.vault.size;
      return token;
    }
    const spans = this.spans(text);
    if (spans.length === 0) return text;
    let out = "";
    let at = 0;
    for (const s of spans) {
      out += text.slice(at, s.start) + this.vault.tokenFor(s.kind, s.value);
      at = s.end;
      this.count(this.counts.byDetector, s.detector);
      if (options.field) this.count(this.counts.byField, options.field);
    }
    this.counts.tokens = this.vault.size;
    return out + text.slice(at);
  }

  /** Counts so far. A copy: callers can't change the totals. */
  report(): MaskingCounts {
    return structuredClone(this.counts);
  }

  private count(into: Record<string, number>, key: string) {
    into[key] = (into[key] ?? 0) + 1;
  }
}

const DIGIT_BLOCKS = [0xff10, 0x0660, 0x06f0, 0x0966, 0x09e6];

/** Full-width, Arabic-Indic, Persian, Devanagari and Bengali digits to ASCII, one UTF-16 unit each. */
export function asciiDigits(text: string): string {
  return text.replace(/[０-９٠-٩۰-۹०-९০-৯]/g, (ch) => {
    const code = ch.charCodeAt(0);
    const base = DIGIT_BLOCKS.find((b) => code >= b && code <= b + 9)!;
    return String(code - base);
  });
}

/**
 * Overlapping spans become one span: nothing in either is left unmasked. The
 * longest span (then the higher-priority detector) gives the kind; when it
 * covers the whole group its value stands, otherwise the group's text does.
 * A sweep by start: linear after the sort.
 */
export function mergeOverlaps(spans: Span[], text: string): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Span[] = [];
  let group: Span[] = [];
  let groupEnd = -1;
  const flush = () => {
    if (group.length === 0) return;
    let best = group[0]!;
    for (const g of group) {
      const longer = g.end - g.start - (best.end - best.start);
      if (longer > 0 || (longer === 0 && PRIORITY.indexOf(g.detector) < PRIORITY.indexOf(best.detector))) best = g;
    }
    let start = Infinity;
    let end = -Infinity;
    for (const g of group) {
      if (g.start < start) start = g.start;
      if (g.end > end) end = g.end;
    }
    out.push(start === best.start && end === best.end ? best : { ...best, start, end, value: text.slice(start, end) });
    group = [];
  };
  for (const s of sorted) {
    if (s.start >= groupEnd) {
      flush();
      groupEnd = s.end;
    } else groupEnd = Math.max(groupEnd, s.end);
    group.push(s);
  }
  flush();
  return out;
}

/**
 * The parts of `spans` that no `cover` span overlaps, trimmed to letters:
 * "Quillfeather, Marguerite" over two known parts leaves nothing, "Marguerite
 * Quillfeather Jones" leaves "Jones".
 */
function outside(spans: Span[], cover: Span[], text: string): Span[] {
  if (cover.length === 0) return spans;
  const sorted = [...cover].sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  // Both lists in order, so the first cover worth looking at only moves forward: linear overall.
  let first = 0;
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    while (first < sorted.length && sorted[first]!.end <= s.start) first++;
    let at = s.start;
    const pieces: [number, number][] = [];
    for (let k = first; k < sorted.length; k++) {
      const c = sorted[k]!;
      if (c.end <= at) continue;
      if (c.start >= s.end) break;
      if (c.start > at) pieces.push([at, c.start]);
      at = Math.max(at, c.end);
    }
    if (at < s.end) pieces.push([at, s.end]);
    for (let [start, end] of pieces) {
      while (start < end && !/[\p{L}\p{M}]/u.test(text[start]!)) start++;
      while (end > start && !/[\p{L}\p{M}]/u.test(text[end - 1]!)) end--;
      if (end - start === s.end - s.start) out.push(s);
      else if (end > start) out.push({ ...s, start, end, value: text.slice(start, end).replace(/\s+/g, " ") });
    }
  }
  return out;
}
