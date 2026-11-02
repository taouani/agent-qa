import type { Seed, SeedKind } from "./cases.js";

/**
 * Finds seeded values in text that may have been reformatted on the way to a
 * model: other case, accents stripped or decomposed, full-width digits,
 * separators removed, line breaks instead of commas, names reordered or cut
 * to one part, URL/HTML/JSON escapes, and base64.
 */

export const DIGIT_KINDS: ReadonlySet<SeedKind> = new Set(["phone", "iban", "card", "national-id"]);
/** Below this many letters and digits, a digit seed would match too much. */
export const MIN_DIGIT_SEED = 8;
const MIN_NAME_PART = 4;
const MIN_EMAIL_LOCAL = 6;

/**
 * Words that are everyday CRM vocabulary. A name part that is one of these is
 * only matched together with the rest of the name, never alone.
 */
const COMMON_WORDS = new Set(
  (
    "account case contact lead field status record owner user name task event page test order quote price product " +
    "report view list home edit save cancel note file type stage amount close date phone email mobile title " +
    "company street city state country grace hope faith will mark bill rose may june april august summer winter " +
    "king young white black brown green gray grey hill wood ford lane park"
  ).split(" "),
);

/** NFKD, no combining marks, lowercase: `Zoë`, `Zoë` and `ZOE` all become `zoe`; `４` becomes `4`. */
export function fold(text: string): string {
  // \p{Cf}: zero-width joiners, spaces and other invisible format characters that would split a word.
  return text.normalize("NFKD").replace(/[\p{M}\p{Cf}]/gu, "").toLowerCase();
}

function words(text: string): string[] {
  return fold(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function alnum(text: string): string {
  return fold(text).replace(/[^\p{L}\p{N}]/gu, "");
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when `needle` appears in `haystack` as consecutive items. */
function hasSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0) return false;
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** The text plus decoded forms of URL, HTML and JSON escapes, and of base64 runs. */
export function variants(text: string): string[] {
  const out = [text];
  const unescaped = text
    .replace(/%([0-9a-f]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|apos|commat|period);/g, (_, n: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", commat: "@", period: "." })[n] ?? "")
    .replace(/\\u([0-9a-f]{4})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
  if (unescaped !== text) out.push(unescaped);
  for (const run of text.match(/[A-Za-z0-9+/_-]{16,}={0,2}/g) ?? []) {
    const decoded = Buffer.from(run.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    // Keep it only if it decodes to mostly readable text.
    const readable = decoded.replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, "");
    if (decoded.length >= 8 && readable.length / decoded.length > 0.9) out.push(decoded);
  }
  return out;
}

export interface SeedHit {
  seedId: string;
  kind: SeedKind;
  /** How it matched. */
  match: "exact" | "digits" | "national" | "words" | "name-part" | "email-local";
}

type Check = (scan: { folded: string; compact: string; words: string[] }) => SeedHit["match"] | undefined;

function checksFor(seed: Seed): Check {
  const exact = fold(seed.value).replace(/\s+/g, " ").trim();
  const seedWords = words(seed.value);
  const packed = alnum(seed.value);

  if (seed.kind === "ip") {
    const re = new RegExp(`(?<![\\d.])${escapeRegex(exact)}(?!\\d|\\.\\d)`);
    return ({ folded }) => (re.test(folded) ? "exact" : undefined);
  }
  if (DIGIT_KINDS.has(seed.kind)) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(packed)}(?![\\p{L}\\p{N}])`, "u");
    const digitsOnly = packed.replace(/\D/g, "");
    // A phone number written in national format: optional country code, trunk 0, then the last 9 digits.
    const national =
      seed.kind === "phone" && digitsOnly.length >= 9
        ? new RegExp(`(?<!\\d)(?:\\d{1,3})?0?${digitsOnly.slice(-9)}(?!\\d)`)
        : undefined;
    return ({ folded }) => {
      if (folded.includes(exact)) return "exact";
      // Compare on digits/letters with separators removed, but never inside a longer run.
      let tight = folded.replace(/(?<=\d)[\s._\-/()]+(?=\d)/g, "");
      // An IBAN can be written with a space after its country code: "DE 89 3704 …".
      if (seed.kind === "iban") tight = tight.replace(/(?<![\p{L}\p{N}])([a-z]{2})[\s._\-/()]+(?=\d)/gu, "$1");
      if (re.test(tight)) return "digits";
      if (national?.test(tight)) return "national";
      return undefined;
    };
  }
  if (seed.kind === "email") {
    const local = alnum(seed.value.split("@")[0] ?? "");
    return ({ folded, compact }) => {
      if (folded.includes(exact)) return "exact";
      if (compact.includes(packed)) return "digits";
      if (local.length >= MIN_EMAIL_LOCAL && compact.includes(local)) return "email-local";
      return undefined;
    };
  }
  if (seed.kind === "name") {
    const reversed = [...seedWords].reverse();
    const parts = seedWords.filter((p) => p.length >= MIN_NAME_PART && !COMMON_WORDS.has(p));
    return ({ words: ws }) => {
      if (hasSequence(ws, seedWords) || hasSequence(ws, reversed)) return "words";
      if (parts.some((p) => ws.includes(p))) return "name-part";
      return undefined;
    };
  }
  // address and anything else: the same words in order, whatever the punctuation or line breaks.
  return ({ folded, words: ws }) => (folded.includes(exact) ? "exact" : hasSequence(ws, seedWords) ? "words" : undefined);
}

export class SeedScanner {
  private readonly checks: Array<{ seed: Seed; check: Check }>;

  constructor(seeds: Seed[]) {
    this.checks = seeds.map((seed) => ({ seed, check: checksFor(seed) }));
  }

  scan(text: string): SeedHit[] {
    const forms = variants(text).map((t) => ({ folded: fold(t).replace(/\s+/g, " "), compact: alnum(t), words: words(t) }));
    const hits: SeedHit[] = [];
    for (const { seed, check } of this.checks) {
      for (const form of forms) {
        const match = check(form);
        if (match) {
          hits.push({ seedId: seed.id, kind: seed.kind, match });
          break;
        }
      }
    }
    return hits;
  }
}

/** Every string anywhere in a value (request fields, nested content parts, tool definitions). */
export function stringLeaves(value: unknown): string[] {
  const out: string[] = [];
  const visit = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        out.push(k);
        visit(x);
      }
    }
  };
  visit(value);
  return out;
}
