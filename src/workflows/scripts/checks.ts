import type { OutputError } from "../../core/index.js";
import { scanSource, type FrameworkProfile } from "../../data/index.js";
import { lightningHelpersSource } from "../packs/salesforce.js";
import type { TestCases } from "../test-cases/artifact.js";
import type { ScriptsDraft } from "./artifact.js";

/**
 * The server's checks on generated code (S2-6), before any person sees it.
 * Every rule here is one the plan promised: new files only, no tokens or real
 * values, no fixed waits, role and label locators, and every test step mapped
 * to a line of code. The type check against the repo runs separately.
 */

export const TOKEN = /<[A-Z][A-Z0-9_]*_\d+>/;

/** Files generated code must never create or replace. */
const PROTECTED = /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig[^/]*\.json|playwright\.config\.[cm]?[jt]s|agent-qa\.ya?ml|agent-qa\.profile\.json|\.env[^/]*|\.gitignore|\.npmrc)$/i;
const PROTECTED_DIR = /(^|\/)(node_modules|\.git|\.agent-qa|\.github)(\/|$)/;
/** Paths that likely hold sign-in code or credentials (as the profile scan lists them). */
const AUTH_PATH = /(^|[/._-])(auth|login|session|jwt|credentials?|secrets?|storage-?state)([/._-]|$)/i;

interface Rule {
  re: RegExp;
  message: string;
}

/** What generated code must not do. Code files only (not Gherkin or JSON data). */
const CODE_RULES: readonly Rule[] = [
  { re: /\bwaitForTimeout\s*\(/, message: "uses a fixed wait (waitForTimeout): wait for Lightning or for the element instead" },
  { re: /\.pause\s*\(\s*\)/, message: "leaves page.pause() in" },
  { re: /\b(?:test|describe|it|Scenario)\.only\s*\(/, message: "uses .only, which would skip every other test" },
  { re: /xpath=|\.locator\(\s*["'`]\(?\/\//, message: "uses XPath, which can't reach into Lightning's shadow roots: use getByRole or getByLabel" },
  { re: /data-aura-|["'`#]input-\d+|globalId/, message: "selects by a generated Lightning id, which changes on every load" },
  { re: /\/lightning\/r\/\w+\/[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?\//, message: "hard-codes a record id: create the record in the test or take it from the test data" },
  { re: /https?:\/\/[\w.-]+\.(?:salesforce|force)\.com/i, message: "hard-codes an org URL: use the baseURL from the Playwright config" },
];

const EXTENSIONS: Record<ScriptsDraft["files"][number]["role"], RegExp> = {
  spec: /\.(?:spec|test)\.[cm]?[jt]s$/,
  feature: /\.feature$/,
  steps: /\.[cm]?[jt]s$/,
  page: /\.[cm]?[jt]s$/,
  data: /\.(?:json|[cm]?[jt]s)$/,
  helper: /(^|\/)lightning\.ts$/,
};

/** A Cucumber expression as a RegExp (the subset playwright-bdd step texts use). */
export function cucumberRegExp(expression: string): RegExp {
  let out = "";
  const text = expression;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === "\\" && i + 1 < text.length) {
      out += text[++i]!.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
      continue;
    }
    if (c === "{") {
      const end = text.indexOf("}", i);
      const name = end === -1 ? "" : text.slice(i + 1, end);
      i = end === -1 ? i : end;
      out += name === "string" ? `(?:"[^"]*"|'[^']*')` : name === "int" ? "-?\\d+" : name === "float" ? "-?\\d*\\.?\\d+" : name === "word" ? "[^\\s]+" : name === "" ? ".*" : ".+";
      continue;
    }
    if (c === "(") {
      const end = text.indexOf(")", i);
      if (end !== -1) {
        out += `(?:${text.slice(i + 1, end).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})?`;
        i = end;
        continue;
      }
    }
    if (c === "/") {
      // Alternation: the words either side of the slash.
      const before = /([^\s/(){}]+)$/.exec(out);
      const after = /^[^\s/(){}]+/.exec(text.slice(i + 1));
      if (before && after) {
        out = `${out.slice(0, out.length - before[1]!.length)}(?:${before[1]}|${after[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`;
        i += after[0].length;
        continue;
      }
    }
    out += c.replace(/[.*+?^$|[\]]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

const GHERKIN_STEP = /^\s*(Given|When|Then|And|But|\*)\s+(.+?)\s*$/;

export interface CheckContext {
  profile: Pick<FrameworkProfile, "kind" | "pages" | "steps" | "features" | "authFiles" | "config">;
  cases: TestCases["cases"];
}

export function checkDraft(draft: ScriptsDraft, ctx: CheckContext): OutputError[] {
  const errors: OutputError[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  const existing = new Set([...ctx.profile.pages.map((p) => p.file), ...ctx.profile.steps.map((s) => s.file), ...ctx.profile.features.map((f) => f.file), ...ctx.profile.authFiles, ...(ctx.profile.config.file ? [ctx.profile.config.file] : [])]);
  const byPath = new Map<string, ScriptsDraft["files"][number]>();

  draft.files.forEach((f, i) => {
    const at = `$.files[${i}]`;
    if (/\\|^\/|^[A-Za-z]:|(^|\/)\.\.?(\/|$)|\/\//.test(f.path)) err(`${at}.path`, "must be a relative path with forward slashes, inside the framework folder");
    else if (PROTECTED.test(f.path) || PROTECTED_DIR.test(f.path)) err(`${at}.path`, `${f.path} is a project file Agent-QA never writes`);
    else if (AUTH_PATH.test(f.path) || ctx.profile.authFiles.includes(f.path)) err(`${at}.path`, `${f.path} looks like sign-in code: generated code uses the repo's own sign-in steps`);
    else if (existing.has(f.path)) err(`${at}.path`, `${f.path} already exists: generated code only adds new files. Call its methods or steps instead`);
    if (!EXTENSIONS[f.role].test(f.path)) err(`${at}.path`, `a ${f.role} file must match ${EXTENSIONS[f.role].source}`);
    if (byPath.has(f.path)) err(`${at}.path`, `${f.path} is listed twice`);
    byPath.set(f.path, f);
    if (TOKEN.test(f.content)) err(`${at}.content`, `holds a token (${TOKEN.exec(f.content)![0]}): put data in the test-data file as made-up values, never tokens`);
    if (f.role === "helper") {
      if (f.content.replace(/\r\n/g, "\n") !== lightningHelpersSource()) err(`${at}.content`, "the helper file must be the Salesforce pack's lightning.ts, unchanged");
      return;
    }
    if (f.role !== "feature" && !(f.role === "data" && f.path.endsWith(".json"))) {
      const lines = f.content.split("\n");
      for (const rule of CODE_RULES) {
        const line = lines.findIndex((l) => rule.re.test(l));
        if (line !== -1) err(`${at}.content`, `line ${line + 1} ${rule.message}`);
      }
      if ((f.role === "steps" || f.role === "page" || f.role === "spec") && !scanSource(f.content, f.path)) err(`${at}.content`, "doesn't parse as TypeScript");
    }
    if (f.role === "data" && f.path.endsWith(".json")) {
      try {
        JSON.parse(f.content);
      } catch {
        err(`${at}.content`, "isn't valid JSON");
      }
    }
  });

  // Every reviewed case once, every step linked to a line that performs it.
  const wanted = new Map(ctx.cases.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const linkRole = ctx.profile.kind === "playwright-bdd" ? "feature" : "spec";
  draft.cases.forEach((c, i) => {
    const at = `$.cases[${i}]`;
    const tc = wanted.get(c.id);
    if (!tc) return err(`${at}.id`, `${c.id} isn't one of the cases asked for`);
    if (seen.has(c.id)) err(`${at}.id`, `${c.id} is listed twice`);
    seen.add(c.id);
    const covered = new Set<number>();
    c.steps.forEach((s, j) => {
      const sat = `${at}.steps[${j}]`;
      if (s.step > tc.steps.length) return err(`${sat}.step`, `${c.id} has ${tc.steps.length} step(s)`);
      const file = byPath.get(s.file);
      if (!file || file.role !== linkRole) return err(`${sat}.file`, `must be a generated ${linkRole} file`);
      const line = file.content.split("\n")[s.line - 1];
      if (line === undefined) return err(`${sat}.line`, `${s.file} has no line ${s.line}`);
      if (linkRole === "feature" ? !GHERKIN_STEP.test(line) : !/\btest\.step\s*\(/.test(line)) return err(`${sat}.line`, `line ${s.line} of ${s.file} isn't a ${linkRole === "feature" ? "Gherkin step" : "test.step(...) call"}`);
      covered.add(s.step);
    });
    const missing = tc.steps.map((_, k) => k + 1).filter((k) => !covered.has(k));
    if (missing.length) err(`${at}.steps`, `step(s) ${missing.join(", ")} of ${c.id} map to no line of code`);
    const files = new Set(c.steps.map((s) => s.file));
    if (linkRole === "feature" && ![...files].some((p) => byPath.get(p)?.content.split("\n").some((l) => l.trim().split(/\s+/).includes(`@${c.id}`)))) err(`${at}`, `the scenario for ${c.id} must be tagged @${c.id}`);
  });
  for (const id of wanted.keys()) if (!seen.has(id)) err("$.cases", `${id} has no generated test`);

  // BDD: every Gherkin step matches one step definition, existing or new.
  if (ctx.profile.kind === "playwright-bdd") {
    const generatedSteps = draft.files.filter((f) => f.role === "steps").flatMap((f) => scanSource(f.content, f.path)?.steps ?? []);
    const toRegExp = (s: { pattern: string; kind: "expression" | "regex" }) => {
      try {
        return s.kind === "regex" ? new RegExp(s.pattern) : cucumberRegExp(s.pattern);
      } catch {
        return undefined;
      }
    };
    const known = [...ctx.profile.steps, ...generatedSteps].map((s) => ({ s, re: toRegExp(s) }));
    for (const g of generatedSteps) {
      const twin = ctx.profile.steps.find((s) => s.pattern === g.pattern);
      if (twin) err("$.files", `the step "${g.pattern}" is defined again in ${g.file}: reuse the one in ${twin.file}`);
    }
    draft.files.forEach((f, i) => {
      if (f.role !== "feature") return;
      f.content.split("\n").forEach((line, n) => {
        const m = GHERKIN_STEP.exec(line);
        if (!m || /<[^>]+>/.test(m[2]!)) return;
        const matches = known.filter((k) => k.re?.test(m[2]!));
        if (matches.length === 0) err(`$.files[${i}].content`, `line ${n + 1}: no step definition matches "${m[2]}"`);
        else if (matches.length > 1 && new Set(matches.map((k) => k.s.pattern)).size > 1) err(`$.files[${i}].content`, `line ${n + 1}: "${m[2]}" matches ${matches.length} step definitions, which playwright-bdd refuses`);
      });
    });
  }
  return errors;
}
