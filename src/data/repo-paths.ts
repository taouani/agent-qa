import { createHmac } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { hasToken } from "./generated-files.js";
import { ProfileError } from "./profile.js";

/**
 * Repo paths as the model sees them (S5-4). A file named after a person
 * (tests/users/marie-curie.spec.ts) is shown as tests/users/<PATH_XXXXXXXXXX_1>.spec.ts.
 * Each part of a path is masked alone, with its suffix kept, so a workflow
 * still knows a spec from a page object.
 *
 * A masked part's token is a keyed hash of the part, not a vault entry: the
 * same file has the same token in every run on this machine, so a path one
 * run showed (an audit's finding, a run-tests selection) still names that file
 * in the next run, and never another one. A path comes back to the real file
 * by finding the one entry of its folder whose name masks to it.
 */
export interface RepoPaths {
  /** The path the model is shown. */
  shown(path: string): string;
  /** The real path of a path the model was shown, from the folder's entries; a real path stays as it is. */
  real(path: string): string;
  /** Shows `real` as `given` (a path the model chose, such as a generated file's) in what follows. */
  asGiven(given: string, real: string): void;
  /** Text with every real path met so far (that masking changes) in its shown form. */
  inText(text: string): string;
  /** The pairs met so far, real path first, longest first. */
  pairs(): Array<[string, string]>;
}

/** What stays after a masked part: the test kind or role and the extension (.spec.ts, .page.ts, .steps.js, .feature, .json). */
const SUFFIX = /(?:\.(?:spec|test|steps?|e2e|setup|teardown|page|po|fixtures?|helpers?))?\.(?:[cm]?[jt]sx?|feature|json|ya?ml|md|txt|csv)$/i;
const TOKEN_PART = /<PATH_[B-Z]+_1>/;
/** Consonants only: a hash in letters reads as no word or name to the detectors, and digits would read as a phone number. */
const LETTERS = "BCDFGHJKLMNPQRSTVWXZ";

export function repoPaths(options: { mask: (text: string) => string; key: Buffer; folder: string }): RepoPaths {
  const met = new Map<string, string>();
  const given = new Map<string, string>();
  const split = (seg: string) => {
    const suffix = SUFFIX.exec(seg)?.[0] ?? "";
    return { stem: seg.slice(0, seg.length - suffix.length), suffix };
  };
  /** The part's token, whether or not this run's detectors flag it. */
  const tokenOf = (seg: string): string => {
    const { stem, suffix } = split(seg);
    const hash = createHmac("sha256", options.key).update(stem.normalize("NFC")).digest();
    return `<PATH_${[...hash.subarray(0, 10)].map((b) => LETTERS[b % LETTERS.length]).join("")}_1>${suffix}`;
  };
  const part = (seg: string): string => {
    const { stem } = split(seg);
    if (!stem || (options.mask(stem) === stem && !hasToken(stem))) return seg;
    return tokenOf(seg);
  };
  const shown = (path: string): string => {
    const kept = given.get(path);
    if (kept !== undefined) return kept;
    const out = path.split("/").map((seg) => (seg ? part(seg) : seg)).join("/");
    if (out !== path) met.set(path, out);
    return out;
  };
  const real = (path: string): string => {
    if (!TOKEN_PART.test(path)) {
      shown(path);
      return path;
    }
    const parts: string[] = [];
    for (const seg of path.split("/")) {
      if (!TOKEN_PART.test(seg)) {
        parts.push(seg);
        continue;
      }
      let entries: string[];
      try {
        entries = readdirSync(join(options.folder, ...parts));
      } catch {
        entries = [];
      }
      // Matched by the token alone: another run's detectors (another vault's names) may have flagged a part this run's don't.
      const found = entries.filter((e) => split(e).stem !== "" && tokenOf(e) === seg);
      if (found.length !== 1) throw new ProfileError(`${path}: ${found.length ? "more than one file" : "no file"} of the folder has this masked name`);
      parts.push(found[0]!);
    }
    const out = parts.join("/");
    // Shown as it came in, even where this run's detectors wouldn't flag the name.
    given.set(out, path);
    met.set(out, path);
    return out;
  };
  const pairs = () => [...met].sort((a, b) => b[0].length - a[0].length);
  // A whole path only: marie.spec.ts is not replaced inside anne-marie.spec.ts.
  const escape = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    shown,
    real,
    asGiven: (g, r) => {
      given.set(r, g);
      if (g === r) met.delete(r);
      else met.set(r, g);
    },
    inText: (text) => pairs().reduce((t, [r, s]) => (t.includes(r) ? t.replace(new RegExp(`(?<![\\w.@-])${escape(r)}(?![\\w@-])`, "g"), () => s) : t), text),
    pairs,
  };
}
