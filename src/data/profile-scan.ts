import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { parse } from "@babel/parser";
import type { Node } from "@babel/types";

/**
 * Reads a Playwright repo's source (S2-2) without running any of it: the
 * package.json, the Playwright config, step definitions, page objects,
 * fixtures and feature files. TypeScript is parsed for its syntax only
 * (@babel/parser: no type checking, no file system), so nothing in the repo
 * is executed or loaded. Auth and user files are listed by path, never read.
 */

/** Folders never walked: dependencies, build output, reports and Agent-QA's own data. */
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", "coverage", ".agent-qa", ".features-gen", "playwright-report", "test-results", "blob-report", ".cache", ".husky", ".vscode", ".idea"]);
const CODE = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".jsx"]);
export const MAX_FILES = 3_000;
export const MAX_FILE_BYTES = 512 * 1024;
/** Bytes read in all: the scan runs on the server's thread, so it must stay quick. */
export const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
/** Entries kept in each list (steps, pages, fixtures, features, paths). */
export const MAX_ENTRIES = 2_000;
/** Locator calls a page object or step can make, counted to learn the repo's style. */
export const LOCATOR_FORMS = ["getByRole", "getByLabel", "getByText", "getByTestId", "getByPlaceholder", "getByTitle", "getByAltText", "css", "xpath"] as const;
export type LocatorForm = (typeof LOCATOR_FORMS)[number];
const STEP_KEYWORDS = new Set(["Given", "When", "Then", "Step"]);
/** A path that likely holds sign-in code or credentials: listed, never read. */
const AUTH_PATH = /(^|[\\/._-])(auth|login|session|jwt|credentials?|users?|secrets?|storage-?state)([\\/._-]|$)|(^|[\\/])\.env(\.|$)/i;

export interface ScannedStep {
  keyword: "Given" | "When" | "Then" | "Step";
  /** The step text: a Cucumber expression, or a regular expression's source. */
  pattern: string;
  kind: "expression" | "regex";
  file: string;
  line: number;
  /** Fixtures the step takes from its first argument, e.g. ["pages", "testData"]. */
  fixtures: string[];
}

export interface ScannedPage {
  name: string;
  file: string;
  extends?: string;
  methods: string[];
}

export interface ScannedFeature {
  file: string;
  scenarios: number;
  tags: string[];
}

export interface RepoScan {
  files: number;
  /** The walk stopped at MAX_FILES. */
  truncated: boolean;
  steps: ScannedStep[];
  pages: ScannedPage[];
  /** Fixture names declared with `test.extend({...})`, with the file. */
  fixtures: Array<{ name: string; file: string }>;
  features: ScannedFeature[];
  locators: Record<LocatorForm, number>;
  /** Paths only. */
  authFiles: string[];
  /** Files that could not be parsed: listed so the review shows them. */
  unparsed: string[];
}

const posix = (path: string) => path.split(sep).join("/");

/** Every file under `dir`, without following links, skipping SKIP_DIRS. */
function walk(root: string, dir: string, out: string[], limit: number): boolean {
  let entries: string[];
  try {
    entries = readdirSync(dir).sort();
  } catch {
    return false;
  }
  for (const name of entries) {
    if (out.length >= limit) return true;
    const path = join(dir, name);
    let stat;
    try {
      stat = lstatSync(path);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      if (walk(root, path, out, limit)) return true;
    } else if (stat.isFile()) out.push(posix(relative(root, path)));
  }
  return false;
}

function read(root: string, file: string, budget: { left: number }): string | undefined {
  try {
    const path = join(root, file);
    const size = lstatSync(path).size;
    if (size > MAX_FILE_BYTES || size > budget.left) return undefined;
    budget.left -= size;
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

export function parseCode(text: string, file: string): Node | undefined {
  const ts = /\.[mc]?tsx?$/.test(file);
  try {
    return parse(text, {
      sourceType: "unambiguous",
      errorRecovery: true,
      plugins: [...(ts ? (["typescript"] as const) : []), ...(file.endsWith("x") ? (["jsx"] as const) : []), "decorators", "importAttributes"],
    }) as unknown as Node;
  } catch {
    return undefined;
  }
}

/** Calls `visit` on every node below `node`. */
export function walkAst(node: Node, visit: (n: Node) => void): void {
  const stack: Node[] = [node];
  while (stack.length) {
    const n = stack.pop()!;
    visit(n);
    for (const key of Object.keys(n)) {
      if (key === "loc" || key === "leadingComments" || key === "trailingComments" || key === "innerComments" || key === "extra") continue;
      const value = (n as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i--) if (isNode(value[i])) stack.push(value[i] as Node);
      } else if (isNode(value)) stack.push(value);
    }
  }
}

const isNode = (v: unknown): v is Node => typeof v === "object" && v !== null && typeof (v as { type?: unknown }).type === "string";

/** A string the code spells out: 'x', "x" or a template with no `${}`. */
export function literalString(n: Node | null | undefined): string | undefined {
  if (!n) return undefined;
  if (n.type === "StringLiteral") return n.value;
  if (n.type === "TemplateLiteral" && n.expressions.length === 0) return n.quasis.map((q) => q.value.cooked ?? q.value.raw).join("");
  return undefined;
}

const calleeName = (n: Node): string | undefined => {
  if (n.type === "Identifier") return n.name;
  if (n.type === "MemberExpression" && !n.computed && n.property.type === "Identifier") return n.property.name;
  return undefined;
};

/** The names destructured from a step function's first parameter: `async ({ pages, testData }, x) => …`. */
function fixtureNames(fn: Node | undefined): string[] {
  if (!fn || (fn.type !== "ArrowFunctionExpression" && fn.type !== "FunctionExpression")) return [];
  const first = fn.params[0];
  if (!first || first.type !== "ObjectPattern") return [];
  return first.properties.flatMap((p) => (p.type === "ObjectProperty" && p.key.type === "Identifier" ? [p.key.name] : []));
}

function scanCode(ast: Node, file: string, scan: RepoScan): void {
  // `const { Given, When: W } = createBdd(test)`: the local names this file defines steps with.
  const keywordOf = new Map<string, ScannedStep["keyword"]>();
  walkAst(ast, (n) => {
    if (n.type !== "VariableDeclarator" || n.init?.type !== "CallExpression" || calleeName(n.init.callee) !== "createBdd" || n.id.type !== "ObjectPattern") return;
    for (const p of n.id.properties) {
      if (p.type === "ObjectProperty" && p.key.type === "Identifier" && STEP_KEYWORDS.has(p.key.name) && p.value.type === "Identifier") {
        keywordOf.set(p.value.name, p.key.name as ScannedStep["keyword"]);
      }
    }
  });

  walkAst(ast, (n) => {
    if (n.type === "CallExpression") {
      const name = calleeName(n.callee);
      // Steps: Given('text', fn) or Given(/regex/, fn), with names from createBdd.
      if (n.callee.type === "Identifier" && name && keywordOf.has(name)) {
        const [first, fn] = n.arguments;
        const text = literalString(first as Node);
        const regex = first?.type === "RegExpLiteral" ? first.pattern : undefined;
        if (text !== undefined || regex !== undefined) {
          scan.steps.push({
            keyword: keywordOf.get(name)!,
            pattern: text ?? regex!,
            kind: text !== undefined ? "expression" : "regex",
            file,
            line: n.loc?.start.line ?? 0,
            fixtures: fixtureNames(fn as Node | undefined),
          });
        }
      }
      // Locators.
      if (n.callee.type === "MemberExpression" && name) {
        if ((LOCATOR_FORMS as readonly string[]).includes(name)) scan.locators[name as LocatorForm]++;
        else if (name === "locator") {
          const arg = literalString(n.arguments[0] as Node);
          scan.locators[arg !== undefined && /^(xpath=|\/\/|\(\/\/)/.test(arg.trim()) ? "xpath" : "css"]++;
        }
        // Fixtures: test.extend<…>({ name: …, … }) or base.extend(…).
        if (name === "extend" && n.arguments[0]?.type === "ObjectExpression") {
          for (const p of n.arguments[0].properties) {
            if ((p.type === "ObjectProperty" || p.type === "ObjectMethod") && !p.computed && p.key.type === "Identifier") scan.fixtures.push({ name: p.key.name, file });
          }
        }
      }
    }
    // Page objects: classes in a pages folder, or named *Page / *Screen.
    if ((n.type === "ClassDeclaration" || n.type === "ClassExpression") && n.id) {
      const isPage = /(^|\/)(pages?|page-objects|pom)\//i.test(file) || /(Page|Screen|Component)$/.test(n.id.name);
      if (isPage) {
        const methods = n.body.body.flatMap((m) =>
          m.type === "ClassMethod" && m.kind === "method" && !m.static && m.key.type === "Identifier" && m.accessibility !== "private" && m.accessibility !== "protected" && !m.key.name.startsWith("_")
            ? [m.key.name]
            : [],
        );
        scan.pages.push({ name: n.id.name, file, ...(n.superClass?.type === "Identifier" ? { extends: n.superClass.name } : {}), methods });
      }
    }
  });
}

/** Scenario count and tags of a Gherkin file. Scenario titles and examples are not kept: they can hold names. */
export function scanFeature(text: string, file: string): ScannedFeature {
  let scenarios = 0;
  const tags = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^(Scenario|Scenario Outline|Scenario Template|Example):/i.test(line)) scenarios++;
    if (line.startsWith("@")) for (const tag of line.split(/\s+/)) if (/^@[\w.:-]{1,80}$/.test(tag)) tags.add(tag);
  }
  return { file, scenarios, tags: [...tags].sort() };
}

/** Scans the folder `root`, which holds the repo's package.json and Playwright config. */
export function scanRepo(root: string): RepoScan {
  const files: string[] = [];
  const truncated = walk(root, root, files, MAX_FILES);
  const scan: RepoScan = {
    files: files.length,
    truncated,
    steps: [],
    pages: [],
    fixtures: [],
    features: [],
    locators: Object.fromEntries(LOCATOR_FORMS.map((f) => [f, 0])) as Record<LocatorForm, number>,
    authFiles: [],
    unparsed: [],
  };
  const budget = { left: MAX_TOTAL_BYTES };
  for (const file of files) {
    if (budget.left <= 0) {
      scan.truncated = true;
      break;
    }
    // Before anything is read: a file that may hold secrets is only listed.
    if (AUTH_PATH.test(file)) {
      scan.authFiles.push(file);
      if (!CODE.has(extname(file))) continue;
    }
    if (file.endsWith(".feature")) {
      const text = read(root, file, budget);
      if (text !== undefined) scan.features.push(scanFeature(text, file));
      continue;
    }
    if (!CODE.has(extname(file)) || file.endsWith(".d.ts")) continue;
    const text = read(root, file, budget);
    if (text === undefined) continue;
    const ast = parseCode(text, file);
    if (!ast) {
      scan.unparsed.push(file);
      continue;
    }
    scanCode(ast, file, scan);
  }
  for (const key of ["steps", "pages", "fixtures", "features", "authFiles", "unparsed"] as const) {
    if (scan[key].length > MAX_ENTRIES) {
      scan[key].length = MAX_ENTRIES;
      scan.truncated = true;
    }
  }
  return scan;
}
