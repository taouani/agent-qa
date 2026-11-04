import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Node } from "@babel/types";
import { LOCATOR_FORMS, literalString, parseCode, scanRepo, walkAst, type LocatorForm } from "./profile-scan.js";
import { hostCwd } from "./host.js";

/**
 * The framework profile (S2-2): what Agent-QA knows about the repo's
 * Playwright project, from reading it (see profile-scan.ts).
 *
 * - `framework-profile@1` is the full scan, written to the run folder on every
 *   profile run: steps, page objects, fixtures, features, locator ranking.
 * - `agent-qa.profile.json`, next to agent-qa.yaml, is the part a person
 *   reviewed and accepted: the folder, the kind and the commands Agent-QA may
 *   run there (S2-1 runs nothing else). It is committed, so CI uses the same.
 */

export const PROFILE_FILE = "agent-qa.profile.json";
export const FRAMEWORK_PROFILE_ARTIFACT = { name: "framework-profile", version: 1 } as const;
export const FRAMEWORK_PROFILE_TEMPLATE_VERSION = "framework-profile-1";

const CONFIG_NAMES = ["playwright.config.ts", "playwright.config.mts", "playwright.config.cts", "playwright.config.js", "playwright.config.mjs", "playwright.config.cjs"];
/** Folders a Playwright project often lives in, looked at when the root has none. */
const PROJECT_FOLDERS = ["e2e", "tests", "test", "playwright", "ui-tests", "automation", "qa"];

/** One program and its arguments. No shell runs them, and nothing a shell would read as syntax is allowed. */
const commandSchema = z.array(z.string().regex(/^[\p{L}\p{N}_@+=:,./\\ -]{1,300}$/u, "only letters, digits, spaces and _@+=:,./\\-")).min(1).max(8);
export const profileCommandsSchema = z
  .object({
    /** Turns features into tests (playwright-bdd's bddgen). Runs before `test`. */
    generate: commandSchema.optional(),
    test: commandSchema,
    typecheck: commandSchema.optional(),
  })
  .strict();
export type ProfileCommands = z.infer<typeof profileCommandsSchema>;

export const FRAMEWORK_KINDS = ["playwright", "playwright-bdd", "empty"] as const;

/** `agent-qa.profile.json`. */
export const savedProfileSchema = z
  .object({
    version: z.literal(1),
    /** The Playwright project's folder, relative to the project root. */
    folder: z.string().min(1).max(300),
    kind: z.enum(["playwright", "playwright-bdd"]),
    commands: profileCommandsSchema,
    /** When a person accepted it. */
    reviewedAt: z.string().datetime(),
  })
  .strict();
export type SavedProfile = z.infer<typeof savedProfileSchema>;

const stepSchema = z
  .object({
    keyword: z.enum(["Given", "When", "Then", "Step"]),
    pattern: z.string(),
    kind: z.enum(["expression", "regex"]),
    file: z.string(),
    line: z.number().int().min(0),
    fixtures: z.array(z.string()),
  })
  .strict();

export const frameworkProfileSchema = z
  .object({
    folder: z.string(),
    kind: z.enum(FRAMEWORK_KINDS),
    packages: z.record(z.string(), z.string()),
    config: z
      .object({
        file: z.string().optional(),
        /** Only when the config spells it out; a computed value isn't run to find it. */
        testDir: z.string().optional(),
        reporters: z.array(z.string()),
        projects: z.array(z.string()),
        bdd: z.object({ features: z.array(z.string()), steps: z.array(z.string()) }).strict().optional(),
      })
      .strict(),
    /** tsconfig `paths`, e.g. { "@pages/*": ["src/pages/*"] }. */
    aliases: z.record(z.string(), z.array(z.string())),
    commands: profileCommandsSchema.optional(),
    steps: z.array(stepSchema),
    pages: z.array(z.object({ name: z.string(), file: z.string(), extends: z.string().optional(), methods: z.array(z.string()) }).strict()),
    fixtures: z.array(z.object({ name: z.string(), file: z.string() }).strict()),
    features: z.array(z.object({ file: z.string(), scenarios: z.number().int(), tags: z.array(z.string()) }).strict()),
    locators: z.record(z.enum(LOCATOR_FORMS), z.number().int()),
    /** Locator forms the repo uses, most used first. */
    locatorRanking: z.array(z.enum(LOCATOR_FORMS)),
    /** Paths only, never contents. */
    authFiles: z.array(z.string()),
    testData: z.object({ faker: z.boolean() }).strict(),
    files: z.number().int(),
    truncated: z.boolean(),
    unparsed: z.array(z.string()),
  })
  .strict();
export type FrameworkProfile = z.infer<typeof frameworkProfileSchema>;

export class ProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileError";
  }
}

const configIn = (dir: string) => CONFIG_NAMES.find((name) => existsSync(join(dir, name)));

/** The Playwright project's folder: `folder` when given, else the root or one of PROJECT_FOLDERS that has a config. */
export function findProjectFolder(root: string, folder?: string): string {
  if (folder !== undefined) {
    hostCwd(root, folder); // inside the project, an existing folder
    return folder;
  }
  if (configIn(root) || existsSync(join(root, "package.json"))) return ".";
  const found = PROJECT_FOLDERS.filter((f) => {
    try {
      return statSync(join(root, f)).isDirectory() && configIn(join(root, f)) !== undefined;
    } catch {
      return false;
    }
  });
  if (found.length > 1) throw new ProfileError(`more than one Playwright project (${found.join(", ")}): name the folder to use`);
  return found[0] ?? ".";
}

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** tsconfig.json allows comments and trailing commas. */
function readJsonc(path: string): Record<string, unknown> | undefined {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
  const stripped = text.replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m) => (m.startsWith('"') ? m : "")).replace(/,(\s*[}\]])/g, "$1");
  try {
    const value: unknown = JSON.parse(stripped);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

const strings = (n: Node | null | undefined): string[] => {
  if (!n) return [];
  const one = literalString(n);
  if (one !== undefined) return [one];
  if (n.type === "ArrayExpression") return n.elements.flatMap((e) => strings(e as Node));
  return [];
};

const prop = (obj: Node | undefined, key: string): Node | undefined => {
  if (obj?.type !== "ObjectExpression") return undefined;
  for (const p of obj.properties) {
    if (p.type === "ObjectProperty" && !p.computed && ((p.key.type === "Identifier" && p.key.name === key) || (p.key.type === "StringLiteral" && p.key.value === key))) return p.value as Node;
  }
  return undefined;
};

/** What the Playwright config spells out: testDir, reporters, project names and the playwright-bdd paths. */
export function readPlaywrightConfig(text: string, file: string): FrameworkProfile["config"] {
  const config: FrameworkProfile["config"] = { file, reporters: [], projects: [] };
  const ast = parseCode(text, file);
  if (!ast) return config;
  walkAst(ast, (n) => {
    if (n.type !== "CallExpression" || n.callee.type !== "Identifier") return;
    const arg = n.arguments[0] as Node | undefined;
    if (n.callee.name === "defineBddConfig") {
      config.bdd = { features: strings(prop(arg, "features")), steps: strings(prop(arg, "steps")) };
    }
    if (n.callee.name === "defineConfig") {
      const testDir = literalString(prop(arg, "testDir"));
      if (testDir !== undefined) config.testDir = testDir;
      const reporter = prop(arg, "reporter");
      // 'html', or [['html'], ['json', { … }]].
      if (reporter?.type === "ArrayExpression") {
        for (const e of reporter.elements) config.reporters.push(...(e?.type === "ArrayExpression" ? strings(e.elements[0] as Node).slice(0, 1) : strings(e as Node)));
      } else config.reporters.push(...strings(reporter));
      const projects = prop(arg, "projects");
      if (projects?.type === "ArrayExpression") for (const p of projects.elements) config.projects.push(...strings(prop(p as Node, "name")));
    }
  });
  return config;
}

const PACKAGES = { "@playwright/test": "playwright", "playwright-bdd": "playwrightBdd", "@faker-js/faker": "faker", typescript: "typescript" } as const;

/** Scans the project folder. Nothing in it is run. */
export function scanFramework(root: string, folder?: string): FrameworkProfile {
  const rel = findProjectFolder(root, folder);
  const dir = hostCwd(root, rel);
  const pkg = readJson(join(dir, "package.json"));
  const deps = { ...(pkg?.dependencies as Record<string, string> | undefined), ...(pkg?.devDependencies as Record<string, string> | undefined) };
  const packages: Record<string, string> = {};
  for (const [name, key] of Object.entries(PACKAGES)) if (typeof deps[name] === "string") packages[key] = deps[name];

  const configFile = configIn(dir);
  const config = configFile ? readPlaywrightConfig(readFileSync(join(dir, configFile), "utf8"), configFile) : { reporters: [], projects: [] };
  const scan = scanRepo(dir);
  const tsconfig = readJsonc(join(dir, "tsconfig.json"));
  const paths = (tsconfig?.compilerOptions as { paths?: unknown } | undefined)?.paths;
  const aliases: Record<string, string[]> = {};
  if (paths && typeof paths === "object") {
    for (const [k, v] of Object.entries(paths)) if (Array.isArray(v)) aliases[k] = v.filter((x): x is string => typeof x === "string");
  }

  const hasPlaywright = configFile !== undefined || packages.playwright !== undefined;
  const bdd = packages.playwrightBdd !== undefined || config.bdd !== undefined;
  const kind: FrameworkProfile["kind"] = !hasPlaywright ? "empty" : bdd ? "playwright-bdd" : "playwright";
  const commands: ProfileCommands | undefined =
    kind === "empty"
      ? undefined
      : {
          ...(kind === "playwright-bdd" ? { generate: ["npx", "bddgen"] } : {}),
          test: ["npx", "playwright", "test"],
          ...(tsconfig ? { typecheck: ["npx", "tsc", "--noEmit"] } : {}),
        };
  const locatorRanking = LOCATOR_FORMS.filter((f) => scan.locators[f] > 0).sort((a: LocatorForm, b: LocatorForm) => scan.locators[b] - scan.locators[a]);

  return {
    folder: rel,
    kind,
    packages,
    config,
    aliases,
    ...(commands ? { commands } : {}),
    steps: scan.steps,
    pages: scan.pages,
    fixtures: scan.fixtures,
    features: scan.features,
    locators: scan.locators,
    locatorRanking,
    authFiles: scan.authFiles,
    testData: { faker: packages.faker !== undefined },
    files: scan.files,
    truncated: scan.truncated,
    unparsed: scan.unparsed,
  };
}

/** The reviewed profile, or undefined when there is none. Throws ProfileError when the file is broken. */
export function readSavedProfile(root: string): SavedProfile | undefined {
  let text: string;
  try {
    text = readFileSync(join(root, PROFILE_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new ProfileError(`${PROFILE_FILE} can't be read (${(error as NodeJS.ErrnoException).code ?? "error"})`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ProfileError(`${PROFILE_FILE} is not valid JSON`);
  }
  const parsed = savedProfileSchema.safeParse(json);
  if (!parsed.success) throw new ProfileError(`${PROFILE_FILE} is invalid: ${parsed.error.issues.map((i) => `${i.path.join(".") || "$"} ${i.message}`).join("; ")}`);
  return parsed.data;
}

/** The commands of a profile, in the order they run. */
export const commandList = (commands: ProfileCommands): string[][] => [commands.generate, commands.test, commands.typecheck].filter((c): c is string[] => c !== undefined);

/** The text a person reviews before the profile is saved. Paths and counts only. */
export function describeProfile(p: FrameworkProfile): string {
  if (p.kind === "empty") return `No Playwright project in ${p.folder} (no Playwright config or @playwright/test dependency). Nothing to save yet.`;
  const steps = new Map<string, number>();
  for (const s of p.steps) steps.set(s.keyword, (steps.get(s.keyword) ?? 0) + 1);
  const lines = [
    `Folder: ${p.folder} · ${p.kind}${p.packages.playwright ? ` · @playwright/test ${p.packages.playwright}` : ""}${p.packages.playwrightBdd ? ` · playwright-bdd ${p.packages.playwrightBdd}` : ""}`,
    `Config: ${p.config.file ?? "none"}${p.config.bdd ? ` · features ${p.config.bdd.features.join(", ")} · steps ${p.config.bdd.steps.join(", ")}` : ""}${p.config.testDir ? ` · testDir ${p.config.testDir}` : ""}${p.config.reporters.length ? ` · reporters ${p.config.reporters.join(", ")}` : ""}${p.config.projects.length ? ` · projects ${p.config.projects.join(", ")}` : ""}`,
    `Steps: ${p.steps.length}${steps.size ? ` (${[...steps].map(([k, n]) => `${n} ${k}`).join(", ")})` : ""} · page objects: ${p.pages.length} · fixtures: ${p.fixtures.map((f) => f.name).join(", ") || "none"} · features: ${p.features.length} (${p.features.reduce((n, f) => n + f.scenarios, 0)} scenarios)`,
    `Locators, most used first: ${p.locatorRanking.map((f) => `${f} ${p.locators[f]}`).join(", ") || "none found"}`,
    `Test data: ${p.testData.faker ? "faker" : "no faker"} · sign-in and user files (paths only, not read): ${p.authFiles.join(", ") || "none"}`,
    ...(p.truncated ? [`The scan stopped after ${p.files} files.`] : []),
    ...(p.unparsed.length ? [`Could not be parsed: ${p.unparsed.join(", ")}`] : []),
    "",
    `Commands Agent-QA may run in ${p.folder} once you accept (no shell, nothing else):`,
    ...commandList(p.commands!).map((c) => `  ${c.join(" ")}`),
  ];
  return lines.join("\n");
}
