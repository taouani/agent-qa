import { CucumberExpression, ParameterType, ParameterTypeRegistry } from "@cucumber/cucumber-expressions";
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin";
import { IdGenerator, type GherkinDocument, type Scenario, type Step, type Tag } from "@cucumber/messages";
import type { OutputError } from "../../core/index.js";
import { scanGeneratedCode, scanSource, type FrameworkProfile } from "../../data/index.js";
import { lightningHelpersSource } from "../packs/salesforce.js";
import type { TestCases } from "../test-cases/artifact.js";
import type { ScriptsDraft } from "./artifact.js";

/**
 * The server's checks on generated code (S2-6), before any person sees it.
 * Every rule here is one the plan promised: new files only, no tokens or real
 * values, no fixed waits, role and label locators, and every test step mapped
 * to a line of code. The type check against the repo runs separately.
 *
 * Gherkin is read with @cucumber/gherkin and steps are matched with
 * @cucumber/cucumber-expressions, the packages playwright-bdd itself uses.
 */

export const TOKEN = /<[A-Z][A-Z0-9_]*_\d+>/;

/** Files generated code must never create or replace. */
const PROTECTED = /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig[^/]*\.json|playwright\.config\.[cm]?[jt]s|agent-qa\.ya?ml|agent-qa\.profile\.json|\.env[^/]*|\.gitignore|\.npmrc)$/i;
const PROTECTED_DIR = /(^|\/)(node_modules|\.git|\.agent-qa|\.github|\.vscode)(\/|$)/i;
/** playwright-bdd's tags that run some scenarios and not others. */
const FOCUS_TAGS = /^@(?:only|skip|fixme)$/i;
const CODE_ROLES = new Set(["spec", "steps", "page"]);
/** Code paths that look like sign-in code. Narrower than the profile scan's: "user" pages and steps are ordinary code. */
const SIGN_IN_CODE = /(^|[/._-])(auth|login|logout|sign-?in|sso|jwt|oauth|credentials?|secrets?|storage-?state)([/._-]|$)/i;

const EXTENSIONS: Record<ScriptsDraft["files"][number]["role"], RegExp> = {
  spec: /\.(?:spec|test)\.[cm]?[jt]s$/,
  feature: /\.feature$/,
  steps: /\.[cm]?[jt]s$/,
  page: /\.[cm]?[jt]s$/,
  data: /\.(?:json|[cm]?[jt]s)$/,
  helper: /(^|\/)lightning\.ts$/,
};

/** A path as a case-insensitive file system sees it: two spellings of one file compare equal. */
export const pathKey = (path: string) => path.normalize("NFC").replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();

export interface CheckContext {
  profile: Pick<FrameworkProfile, "kind" | "pages" | "steps" | "features" | "authFiles" | "config">;
  cases: TestCases["cases"];
  /** Every file in the framework folder, from the folder itself (not just the ones the profile names). */
  existingFiles: readonly string[];
  /** Symbolic links in the folder: a path under one would write somewhere else. */
  links?: readonly string[];
}

type Definition = { pattern: string; kind: "expression" | "regex"; flags?: string | undefined; file: string };
type Matcher = { def: Definition; test: (text: string) => boolean };

function matcherOf(def: Definition, registry: ParameterTypeRegistry): Matcher | string {
  try {
    if (def.kind === "regex") {
      const re = new RegExp(def.pattern, (def.flags ?? "").replace(/[gy]/g, ""));
      return { def, test: (t) => re.test(t) };
    }
    // The repo may register its own parameter types (defineParameterType). The
    // scan doesn't read them, so an unknown {name} matches any text rather than none.
    for (const m of def.pattern.matchAll(/(?<!\\)\{([^{}()\\/\s]+)\}/g)) {
      const name = m[1]!;
      if (!registry.lookupByTypeName(name)) registry.defineParameterType(new ParameterType(name, /.*/, null, (x: string | null) => x, false, false));
    }
    const expression = new CucumberExpression(def.pattern, registry);
    return { def, test: (t) => expression.match(t) !== null };
  } catch (e) {
    return `the step definition "${def.pattern}" in ${def.file} doesn't compile: ${(e as Error).message.split("\n")[0]}`;
  }
}

/** Gherkin parsed, or the parser's first error. */
function parseFeature(text: string): GherkinDocument | string {
  try {
    return new Parser(new AstBuilder(IdGenerator.incrementing()), new GherkinClassicTokenMatcher()).parse(text);
  } catch (e) {
    return (e as Error).message.split("\n")[0]!;
  }
}

interface ScenarioInfo {
  scenario: Scenario;
  /** Tags on the feature, its rule and the scenario. */
  tags: string[];
  /** Background steps that run before it. */
  background: readonly Step[];
}

function scenariosOf(doc: GherkinDocument): ScenarioInfo[] {
  const out: ScenarioInfo[] = [];
  const feature = doc.feature;
  if (!feature) return out;
  const names = (tags: readonly Tag[]) => tags.map((t) => t.name);
  let background: readonly Step[] = [];
  for (const child of feature.children) {
    if (child.background) background = child.background.steps;
    if (child.scenario) out.push({ scenario: child.scenario, tags: [...names(feature.tags), ...names(child.scenario.tags)], background });
    if (child.rule) {
      let ruleBackground = background;
      for (const r of child.rule.children) {
        if (r.background) ruleBackground = [...background, ...r.background.steps];
        if (r.scenario) out.push({ scenario: r.scenario, tags: [...names(feature.tags), ...names(child.rule.tags), ...names(r.scenario.tags)], background: ruleBackground });
      }
    }
  }
  return out;
}

/** A scenario's step texts as they run: one set per Examples row for an outline. */
function runTexts(s: Scenario): Array<{ step: Step; text: string; outline?: true }> {
  const rows = s.examples.flatMap((e) => e.tableBody.map((r) => Object.fromEntries((e.tableHeader?.cells ?? []).map((h, i) => [h.value, r.cells[i]?.value ?? ""]))));
  if (!s.examples.length) return s.steps.map((step) => ({ step, text: step.text }));
  // An outline with no rows runs nothing, but its steps must still resolve.
  if (!rows.length) return s.steps.map((step) => ({ step, text: step.text, outline: true }));
  return rows.flatMap((row) => s.steps.map((step) => ({ step, text: step.text.replace(/<([^<>]+)>/g, (m, name: string) => (name in row ? row[name]! : m)), outline: true as const })));
}

export function checkDraft(draft: ScriptsDraft, ctx: CheckContext): OutputError[] {
  const errors: OutputError[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  const existing = new Set([...ctx.existingFiles, ...ctx.profile.pages.map((p) => p.file), ...ctx.profile.steps.map((s) => s.file), ...ctx.profile.features.map((f) => f.file), ...ctx.profile.authFiles, ...(ctx.profile.config.file ? [ctx.profile.config.file] : [])].map(pathKey));
  const auth = new Set(ctx.profile.authFiles.map(pathKey));
  const links = (ctx.links ?? []).map(pathKey);
  const byPath = new Map<string, ScriptsDraft["files"][number]>();
  const keys = new Set<string>();
  const specs = new Map<string, ReturnType<typeof scanGeneratedCode>>();

  draft.files.forEach((f, i) => {
    const at = `$.files[${i}]`;
    const key = pathKey(f.path);
    if (/\\|^\/|^[A-Za-z]:|(^|\/)\.\.?(\/|$)|\/\/|[\u0000-\u001f]/.test(f.path)) err(`${at}.path`, "must be a relative path with forward slashes, inside the framework folder");
    else if (PROTECTED.test(f.path) || PROTECTED_DIR.test(f.path)) err(`${at}.path`, `${f.path} is a project file Agent-QA never writes`);
    else if (auth.has(key) || (CODE_ROLES.has(f.role) && SIGN_IN_CODE.test(f.path))) err(`${at}.path`, `${f.path} looks like sign-in code: generated code uses the repo's own sign-in steps`);
    else if (links.some((l) => key.startsWith(`${l}/`))) err(`${at}.path`, `${f.path} is under a symbolic link: write it where the link points, or elsewhere`);
    else if (existing.has(key)) err(`${at}.path`, `${f.path} already exists: generated code only adds new files. Call its methods or steps instead`);
    if (!EXTENSIONS[f.role].test(f.path)) err(`${at}.path`, `a ${f.role} file must match ${EXTENSIONS[f.role].source}`);
    if (keys.has(key)) err(`${at}.path`, `${f.path} is listed twice`);
    keys.add(key);
    byPath.set(f.path, f);
    const token = TOKEN.exec(f.content.replace(/\s+/g, ""));
    if (token) err(`${at}.content`, `holds a token (${token[0]}): put data in the test-data file as made-up values, never tokens`);
    if (f.role === "helper") {
      if (f.content.replace(/\r\n/g, "\n") !== lightningHelpersSource()) err(`${at}.content`, "the helper file must be the Salesforce pack's lightning.ts, unchanged");
      return;
    }
    if (f.role === "data" && f.path.endsWith(".json")) {
      try {
        JSON.parse(f.content);
      } catch {
        return err(`${at}.content`, "isn't valid JSON");
      }
      // The same literal rules as code: no record ids, org URLs or generated ids in the data.
      for (const finding of scanGeneratedCode(`(${f.content})`, "data.ts").findings) err(`${at}.content`, `line ${finding.line} ${finding.message}`);
      return;
    }
    if (f.role === "feature") return;
    const scan = scanGeneratedCode(f.content, f.path);
    if (f.role === "spec") specs.set(f.path, scan);
    if (!scan.parsed || scan.syntaxErrors > 0) err(`${at}.content`, "doesn't parse as TypeScript");
    for (const finding of scan.findings) err(`${at}.content`, `line ${finding.line} ${finding.message}`);
  });

  // Features: parsed, no focus tags.
  const features = new Map<string, ScenarioInfo[]>();
  draft.files.forEach((f, i) => {
    if (f.role !== "feature") return;
    const doc = parseFeature(f.content);
    if (typeof doc === "string") return err(`$.files[${i}].content`, `isn't valid Gherkin: ${doc}`);
    const scenarios = scenariosOf(doc);
    features.set(f.path, scenarios);
    const tags = [...new Set([...(doc.feature?.tags ?? []).map((t) => t.name), ...scenarios.flatMap((s) => [...s.tags, ...s.scenario.examples.flatMap((e) => e.tags.map((t) => t.name))])])];
    for (const t of tags.filter((x) => FOCUS_TAGS.test(x))) err(`$.files[${i}].content`, `uses the ${t} tag, which would run some scenarios and not others`);
  });

  // Every reviewed case once, every step linked to a line of that case's own test.
  const wanted = new Map(ctx.cases.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const bdd = ctx.profile.kind === "playwright-bdd";
  const linkRole = bdd ? "feature" : "spec";
  draft.cases.forEach((c, i) => {
    const at = `$.cases[${i}]`;
    const tc = wanted.get(c.id);
    if (!tc) return err(`${at}.id`, `${c.id} isn't one of the cases asked for`);
    if (seen.has(c.id)) err(`${at}.id`, `${c.id} is listed twice`);
    seen.add(c.id);
    const covered = new Set<number>();
    if (bdd && ![...features.values()].some((list) => list.some((x) => x.tags.includes(`@${c.id}`)))) return err(`${at}.id`, `the scenario for ${c.id} must be tagged @${c.id}`);
    if (!bdd && ![...specs.values()].some((scan) => scan.tests.some((t) => t.title.includes(c.id)))) return err(`${at}.id`, `no generated spec has a test or test.describe whose title holds ${c.id}`);
    c.steps.forEach((s, j) => {
      const sat = `${at}.steps[${j}]`;
      if (s.step > tc.steps.length) return err(`${sat}.step`, `${c.id} has ${tc.steps.length} step(s)`);
      const file = byPath.get(s.file);
      if (!file || file.role !== linkRole) return err(`${sat}.file`, `must be a generated ${linkRole} file`);
      const lines = file.content.split("\n");
      if (lines[s.line - 1] === undefined) return err(`${sat}.line`, `${s.file} has no line ${s.line}`);
      if (bdd) {
        const mine = (features.get(s.file) ?? []).filter((x) => x.tags.includes(`@${c.id}`));
        if (!mine.length) return err(`${sat}.file`, `${s.file} has no scenario tagged @${c.id}`);
        const ownLines = new Set(mine.flatMap((x) => [...x.background, ...x.scenario.steps].map((st) => st.location.line)));
        if (!ownLines.has(s.line)) return err(`${sat}.line`, `line ${s.line} of ${s.file} isn't a step of the scenario tagged @${c.id} (or its Background)`);
      } else {
        const blocks = specs.get(s.file)?.tests.filter((t) => t.title.includes(c.id)) ?? [];
        if (!blocks.length) return err(`${sat}.file`, `${s.file} has no test or test.describe whose title holds ${c.id}`);
        const isStep = specs.get(s.file)!.stepLines.includes(s.line);
        if (!isStep || !blocks.some((b) => s.line > b.start && s.line <= b.end)) return err(`${sat}.line`, `line ${s.line} of ${s.file} isn't a test.step(...) call inside the test for ${c.id}`);
      }
      covered.add(s.step);
    });
    const missing = tc.steps.map((_, k) => k + 1).filter((k) => !covered.has(k));
    if (missing.length) err(`${at}.steps`, `step(s) ${missing.join(", ")} of ${c.id} map to no line of code`);
  });
  for (const id of wanted.keys()) if (!seen.has(id)) err("$.cases", `${id} has no generated test`);

  // BDD: every step that runs matches exactly one step definition, existing or new.
  if (bdd) {
    const generated: Definition[] = draft.files.filter((f) => f.role === "steps").flatMap((f) => scanSource(f.content, f.path)?.steps ?? []);
    const registry = new ParameterTypeRegistry();
    const matchers: Matcher[] = [];
    for (const def of [...ctx.profile.steps, ...generated]) {
      const m = matcherOf(def, registry);
      if (typeof m === "string") {
        if (generated.includes(def)) err("$.files", m);
      } else matchers.push(m);
    }
    const seenPattern = new Map<string, string>();
    for (const s of ctx.profile.steps) seenPattern.set(`${s.kind}:${s.pattern}`, s.file);
    for (const g of generated) {
      const twin = seenPattern.get(`${g.kind}:${g.pattern}`);
      if (twin) err("$.files", `the step "${g.pattern}" in ${g.file} is defined already in ${twin}: reuse that one`);
      else seenPattern.set(`${g.kind}:${g.pattern}`, g.file);
    }
    draft.files.forEach((f, i) => {
      const scenarios = features.get(f.path);
      if (!scenarios) return;
      const checked = new Set<string>();
      const runs: Array<{ step: Step; text: string; outline?: true }> = [...new Set(scenarios.flatMap((x) => x.background))].map((step) => ({ step, text: step.text }));
      runs.push(...scenarios.flatMap((x) => runTexts(x.scenario)));
      for (const { step, text, outline } of runs) {
        const key = `${step.location.line}:${text}`;
        if (checked.has(key)) continue;
        checked.add(key);
        const where = `$.files[${i}].content`;
        if (outline && /<[^<>]+>/.test(text)) {
          err(where, `line ${step.location.line}: "${text}" has a <placeholder> with no Examples value`);
          continue;
        }
        const matches = matchers.filter((m) => m.test(text));
        if (matches.length === 0) err(where, `line ${step.location.line}: no step definition matches "${text}"`);
        else if (matches.length > 1) err(where, `line ${step.location.line}: "${text}" matches ${matches.length} step definitions (${matches.map((m) => m.def.file).join(", ")}), which playwright-bdd refuses`);
      }
    });
  }
  return errors;
}
