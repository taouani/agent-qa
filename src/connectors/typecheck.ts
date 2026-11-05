import { createRequire } from "node:module";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import type * as TS from "typescript";
import { assertGrant, type WriteGrant } from "../core/index.js";

/**
 * The type check of generated code (S2-6), with the TypeScript compiler from
 * the user's own repo and its tsconfig, before any file is written: the
 * generated files are laid over the repo in memory. Nothing is emitted.
 *
 * It loads code from the repo's node_modules, so it needs a grant for
 * `commands`, as the profile's own `tsc` would. Messages can quote the repo's
 * code: the data layer masks them before a model sees them.
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

/** The repo's own `typescript`, never one from a folder above it. */
export function loadTypeScript(grant: WriteGrant, folder: string, boundary: string = folder): { ts: TypeScriptModule; version: string } {
  assertGrant(grant, "commands");
  const load = createRequire(join(folder, "package.json"));
  let version: string;
  try {
    const manifest = realpathSync(load.resolve("typescript/package.json"));
    const rel = relative(realpathSync(boundary), manifest);
    if (rel.split(/[\\/]/)[0] === ".." || isAbsolute(rel)) throw new Error("outside");
    version = String((JSON.parse(readFileSync(manifest, "utf8")) as { version?: unknown }).version);
  } catch {
    throw new TypeCheckError("TypeScript isn't installed in the repo: run npm install there (the type check uses the repo's own typescript)");
  }
  const [major = 0, minor = 0] = version.split(".").map(Number);
  if (major < OLDEST[0] || (major === OLDEST[0] && minor < OLDEST[1])) throw new TypeCheckError(`typescript ${version} in the repo is too old: the type check needs ${OLDEST.join(".")} or later`);
  return { ts: load("typescript") as TypeScriptModule, version };
}

/**
 * Type-checks `files` (paths relative to `folder`) as if they were in the
 * repo, with its tsconfig.json. Only diagnostics in those files come back.
 */
export function typeCheckFiles(ts: TypeScriptModule, folder: string, files: ReadonlyArray<{ path: string; content: string }>): TypeDiagnostic[] {
  const configPath = join(folder, "tsconfig.json");
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) throw new TypeCheckError(`the repo's tsconfig.json can't be read: ${ts.flattenDiagnosticMessageText(read.error.messageText, " ").slice(0, 200)}`);
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, folder, undefined, configPath);
  const options: TS.CompilerOptions = { ...parsed.options, noEmit: true };
  // ts names files with forward slashes; a case-insensitive disk folds case.
  const key = (p: string) => {
    const k = resolve(p).replace(/\\/g, "/");
    return ts.sys.useCaseSensitiveFileNames ? k : k.toLowerCase();
  };
  const overlay = new Map(files.map((f) => [key(join(folder, f.path)), f]));
  const host = ts.createCompilerHost(options, true);
  const { fileExists, readFile, getSourceFile, directoryExists } = host;
  // Folders the generated files create exist too, or imports into them don't resolve.
  host.fileExists = (p) => overlay.has(key(p)) || fileExists.call(host, p);
  host.directoryExists = (p) => [...overlay.keys()].some((k) => k.startsWith(`${key(p).replace(/\/$/, "")}/`)) || (directoryExists ? directoryExists.call(host, p) : true);
  host.readFile = (p) => overlay.get(key(p))?.content ?? readFile.call(host, p);
  host.getSourceFile = (p, lang, onError, create) => {
    const f = overlay.get(key(p));
    return f ? ts.createSourceFile(p, f.content, lang, true) : getSourceFile.call(host, p, lang, onError, create);
  };
  const code = files.filter((f) => /\.(?:[cm]?ts|tsx)$/.test(f.path) && !f.path.endsWith(".d.ts"));
  // The generated files, plus the repo's declarations (globals, module types); the rest is found through imports.
  const roots = [...parsed.fileNames.filter((f) => /\.d\.[cm]?ts$/.test(f)), ...code.map((f) => join(folder, f.path))];
  const program = ts.createProgram({ rootNames: roots, options, host });
  const out: TypeDiagnostic[] = [];
  for (const f of code) {
    const sf = program.getSourceFile(join(folder, f.path)) ?? program.getSourceFiles().find((s) => key(s.fileName) === key(join(folder, f.path)));
    if (!sf) continue;
    for (const d of [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)]) {
      if (d.category !== ts.DiagnosticCategory.Error) continue;
      const line = d.start !== undefined ? sf.getLineAndCharacterOfPosition(d.start).line + 1 : 0;
      out.push({ file: f.path, line, code: d.code, message: ts.flattenDiagnosticMessageText(d.messageText, " ").slice(0, 500) });
      if (out.length >= MAX_DIAGNOSTICS) return out;
    }
  }
  return out;
}
