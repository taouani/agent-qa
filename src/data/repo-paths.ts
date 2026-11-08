import type { RunVault } from "../masking/index.js";
import { hasToken } from "./generated-files.js";
import { restorer } from "./xray.js";

/**
 * Repo paths as the model sees them (S5-4). A file named after a person
 * (tests/users/marie-curie.spec.ts) is shown with a token in place of the
 * name, and comes back as the real path from the run's vault. Each part of
 * the path is masked alone, with its extension kept, so a workflow still
 * knows a spec from a page object.
 */
export interface RepoPaths {
  /** The path the model is shown. */
  shown(path: string): string;
  /** The real path of a path the model was shown; a real path stays as it is. */
  real(path: string): string;
  /** Text with every real path met so far (that masking changes) in its shown form. */
  inText(text: string): string;
}

/** What stays after a masked part: the test kind and the extension (.spec.ts, .steps.js, .feature, .json). */
const SUFFIX = /(?:\.(?:spec|test|steps?|e2e|setup|teardown))?\.(?:[cm]?[jt]sx?|feature|json|ya?ml|md|txt|csv)$/i;

export function repoPaths(mask: (text: string) => string, vault: Pick<RunVault, "tokenFor" | "valueOf">): RepoPaths {
  const restore = restorer((t) => vault.valueOf(t));
  const met = new Map<string, string>();
  const part = (seg: string): string => {
    const suffix = SUFFIX.exec(seg)?.[0] ?? "";
    const stem = seg.slice(0, seg.length - suffix.length);
    if (!stem) return seg;
    const masked = mask(stem);
    if (masked === stem && !hasToken(stem)) return seg;
    // The detectors' tokens when they give the part back exactly; otherwise (a name in pieces,
    // marie-curie as <PERSON_1>-<PERSON_1>, or text that looks like a token) the whole part is one token.
    return `${!hasToken(stem) && restore(masked) === stem ? masked : vault.tokenFor("PATH", stem)}${suffix}`;
  };
  const shown = (path: string): string => {
    const out = path.split("/").map((seg) => (seg ? part(seg) : seg)).join("/");
    if (out !== path) met.set(path, out);
    return out;
  };
  return {
    shown,
    real: (path) => {
      const real = restore(path);
      shown(real);
      return real;
    },
    inText: (text) => [...met].sort((a, b) => b[0].length - a[0].length).reduce((t, [real, masked]) => (t.includes(real) ? t.split(real).join(masked) : t), text),
  };
}
