import { createRequire } from "node:module";
import { readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import type * as TS from "typescript";
import { assertGrant, type WriteGrant } from "../core/index.js";

/**
 * The type check of generated code (S2-6), with the TypeScript compiler from
 * the user's own repo and its tsconfig, before any file is written: the
 * generated files are laid over the repo in memory. Nothing is emitted.
 *
 * It runs the repo's typescript package inside Agent-QA's own process (as
 * the explorer runs the repo's Playwright), so it needs a grant for
 * `commands` and the person's yes. Messages can quote the repo's code: paths
 * come back relative, and the data layer masks the rest before a model sees it.
 */

export type TypeScriptModule = typeof TS;

export class TypeCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TypeCheckError";
  }
}

export interface TypeDiagnostic {
  /** The generated file, as given. */
  file: string;
  line: number;
  code: number;
  message: string;
}

/** Most diagnostics returned: a model fixes the first ones first. */
export const MAX_DIAGNOSTICS = 40;
const OLDEST = [4, 7] as const;

/** Where the repo's own typescript is, without loading it: its manifest, or why there is none to use. */
export function findTypeScript(folder: string, boundary: string = folder): { manifest: string; version: string } | { reason: string } {
  const load = createRequire(join(folder, "package.json"));
  let manifest: string;
  try {
    manifest = realpathSync(load.resolve("typescript/package.json"));
  } catch {
    return { reason: "TypeScript isn't installed in the repo: run npm install there (the type check uses the repo's own typescript)" };
  }
  const rel = relative(realpathSync(boundary), manifest);
  if (rel.split(/[\\/]/)[0] === ".." || isAbsolute(rel)) return { reason: "the repo's typescript resolves to a folder outside the project (a hoisted or linked install), so it isn't used" };
  let version: string;
  try {
    version = String((JSON.parse(readFileSync(manifest, "utf8")) as { version?: unknown }).version);
  } catch {
    return { reason: "the repo's typescript has no readable package.json" };
  }
  const [major = 0, minor = 0] = version.split(".").map(Number);
  if (major < OLDEST[0] || (major === OLDEST[0] && minor < OLDEST[1])) return { reason: `typescript ${version} in the repo is too old: the type check needs ${OLDEST.join(".")} or later` };
  if (!existsSync(join(folder, "tsconfig.json"))) return { reason: "the Playwright folder has no tsconfig.json" };
  return { manifest, version };
}

/** The repo's own `typescript`, never one from a folder above it. */
export function loadTypeScript(grant: WriteGrant, folder: string, boundary: string = folder): { ts: TypeScriptModule; version: string } {
  assertGrant(grant, "commands");
  const found = findTypeScript(folder, boundary);
  if ("reason" in found) throw new TypeCheckError(found.reason);
  const ts = createRequire(join(folder, "package.json"))("typescript") as Partial<TypeScriptModule>;
  // A typescript without the JS compiler API (a future native port) can't be used here.
  if (typeof ts.createProgram !== "function" || typeof ts.parseJsonConfigFileContent !== "function") throw new TypeCheckError(`typescript ${found.version} in the repo has no compiler API Agent-QA can call`);
  return { ts: ts as TypeScriptModule, version: found.version };
}

/**
 * Type-checks `files` (paths relative to `folder`) as if they were in the
 * repo, with its tsconfig.json. Only diagnostics in those files come back,
 * with local paths made relative. Throws TypeCheckError when the tsconfig
 * can't be used as is: a check with half its options would report errors the
 * generated code can't fix.
 */
export function typeCheckFiles(ts: TypeScriptModule, folder: string, files: ReadonlyArray<{ path: string; content: string }>): TypeDiagnostic[] {
  const configPath = join(folder, "tsconfig.json");
  const flat = (m: string | TS.DiagnosticMessageChain) => local(ts.flattenDiagnosticMessageText(m, " "), folder).slice(0, 500);
  if (!ts.sys.fileExists(configPath)) throw new TypeCheckError("the Playwright folder has no tsconfig.json");
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) throw new TypeCheckError(`the repo's tsconfig.json can't be read: ${flat(read.error.messageText)}`);
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, folder, undefined, configPath);
  // "No inputs" is fine: the generated files are the inputs.
  const configErrors = parsed.errors.filter((e) => e.code !== 18003);
  if (configErrors.length) throw new TypeCheckError(`the repo's tsconfig.json has errors: ${flat(configErrors[0]!.messageText)}`);
  if (parsed.projectReferences?.length && parsed.fileNames.length === 0) throw new TypeCheckError("the repo's tsconfig.json only lists project references: the type check reads one project's tsconfig");
  const options: TS.CompilerOptions = { ...parsed.options, noEmit: true };
  // ts names files with forward slashes; a case-insensitive disk folds case.
  const key = (p: string) => {
    const k = resolve(p).replace(/\\/g, "/");
    return ts.sys.useCaseSensitiveFileNames ? k : k.toLowerCase();
  };
  const overlay = new Map(files.map((f) => [key(join(folder, f.path)), f]));
  const overlayDirs = [...overlay.keys()];
  const host = ts.createCompilerHost(options, true);
  const { fileExists, readFile, getSourceFile, directoryExists } = host;
  host.fileExists = (p) => overlay.has(key(p)) || fileExists.call(host, p);
  // Folders the generated files create exist too, or imports into them don't resolve.
  host.directoryExists = (p) => overlayDirs.some((k) => k.startsWith(`${key(p).replace(/\/$/, "")}/`)) || (directoryExists ? directoryExists.call(host, p) : true);
  host.readFile = (p) => overlay.get(key(p))?.content ?? readFile.call(host, p);
  host.getSourceFile = (p, lang, onError, create) => {
    const f = overlay.get(key(p));
    return f ? ts.createSourceFile(p, f.content, lang, true) : getSourceFile.call(host, p, lang, onError, create);
  };
  const code = files.filter((f) => /\.(?:[cm]?ts|tsx)$/.test(f.path) && !f.path.endsWith(".d.ts"));
  // The repo's own files too, as its tsc sees them: a `declare global` in a .ts file counts.
  const generated = new Set(code.map((f) => key(join(folder, f.path))));
  const roots = [...parsed.fileNames.filter((f) => !generated.has(key(f))), ...code.map((f) => join(folder, f.path))];
  const program = ts.createProgram({ rootNames: roots, options, host });
  const byKey = new Map(program.getSourceFiles().map((sf) => [key(sf.fileName), sf]));
  const out: TypeDiagnostic[] = [];
  for (const f of code) {
    const sf = byKey.get(key(join(folder, f.path)));
    if (!sf) continue;
    for (const d of [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)]) {
      if (d.category !== ts.DiagnosticCategory.Error) continue;
      const line = d.start !== undefined ? sf.getLineAndCharacterOfPosition(d.start).line + 1 : 0;
      out.push({ file: f.path, line, code: d.code, message: flat(d.messageText) });
      if (out.length >= MAX_DIAGNOSTICS) return out;
    }
  }
  return out;
}

/** A message with the folder's path made relative and the home folder as ~: no local layout or user name leaves. */
export function local(message: string, folder: string): string {
  const roots = new Set<string>();
  for (const f of [folder, safeRealpath(folder)]) if (f) for (const v of [resolve(f), resolve(f).replace(/\\/g, "/")]) roots.add(v);
  let out = message;
  // Longest first: the folder before its parents.
  for (const r of [...roots].sort((a, b) => b.length - a.length)) out = out.split(`${r}/`).join("./").split(`${r}\\`).join(".\\").split(r).join(".");
  const home = homedir();
  if (home) for (const h of [home, home.replace(/\\/g, "/")]) out = out.split(h).join("~");
  return out;
}

function safeRealpath(p: string): string | undefined {
  try {
    return realpathSync(p);
  } catch {
    return undefined;
  }
}
