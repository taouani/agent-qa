import { Node, Project, ts, type SourceFile } from "ts-morph";

/**
 * The mechanical edits `refactor` makes (S3-6), with ts-morph over the
 * folder's code in memory: nothing here touches the disk. The files are the
 * masked text a model saw; renames follow every reference across them,
 * imports included, so a method renamed in a page object is renamed in each
 * spec that calls it.
 */

export type RefactorOp =
  /** A declaration in `path` gets a new name, and so does every reference to it. `within` names the class (or interface) for a member. */
  | { op: "rename"; path: string; symbol: string; within?: string | undefined; to: string }
  /** An exact piece of one file, found once, replaced. */
  | { op: "edit"; path: string; old: string; new: string }
  /** A new file. */
  | { op: "create"; path: string; content: string };

export interface RefactorResult {
  /** Every file after the operations, changed or not, created ones included. */
  files: Map<string, string>;
  /** The paths changed or created, sorted. */
  changed: string[];
  created: string[];
  /** One message per operation that couldn't apply, by its index. */
  errors: Array<{ at: number; message: string }>;
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const CODE = /\.[cm]?[jt]sx?$/i;

/** A project over the given files, in memory, with the repo's path aliases. */
function project(files: ReadonlyArray<{ path: string; content: string }>, aliases: Record<string, string[]>): Project {
  const p = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, baseUrl: "/", paths: aliases, noEmit: true },
  });
  for (const f of files) if (CODE.test(f.path)) p.createSourceFile(`/${f.path}`, f.content, { overwrite: true });
  return p;
}

function declarationOf(sf: SourceFile, symbol: string, within: string | undefined): { node: Node & { rename(name: string): unknown } } | { error: string } {
  if (within) {
    const owner = sf.getClass(within) ?? sf.getInterface(within);
    if (!owner) return { error: `${sf.getBaseName()} declares no class or interface ${within}` };
    const members = owner.getMembers().filter((m) => (Node.hasName(m) ? m.getName() : undefined) === symbol);
    if (members.length === 0) return { error: `${within} has no member ${symbol}` };
    // An overloaded method or a get/set pair renames as one: the first declaration carries the references.
    return { node: members[0] as never };
  }
  const found = [sf.getClass(symbol), sf.getFunction(symbol), sf.getVariableDeclaration(symbol), sf.getInterface(symbol), sf.getTypeAlias(symbol), sf.getEnum(symbol)].filter((n) => n !== undefined);
  if (found.length === 0) return { error: `${sf.getBaseName()} declares no top-level ${symbol}: name the class in within for a member` };
  return { node: found[0] as never };
}

/** Applies `ops` in order to `files`; an operation that can't apply is reported and skipped. */
export function applyRefactor(files: ReadonlyArray<{ path: string; content: string }>, ops: readonly RefactorOp[], aliases: Record<string, string[]> = {}): RefactorResult {
  const before = new Map(files.map((f) => [f.path, f.content]));
  const p = project(files, aliases);
  const other = new Map([...before].filter(([path]) => !CODE.test(path)));
  const created = new Set<string>();
  const errors: RefactorResult["errors"] = [];
  ops.forEach((op, at) => {
    const err = (message: string) => errors.push({ at, message });
    if (op.op === "create") {
      if (before.has(op.path) || created.has(op.path)) return err(`${op.path} already exists: create makes new files only`);
      if (!CODE.test(op.path)) return err(`${op.path} isn't code (.ts or .js): refactor creates code files only`);
      p.createSourceFile(`/${op.path}`, op.content);
      created.add(op.path);
      return;
    }
    const sf = p.getSourceFile(`/${op.path}`);
    if (!sf) return err(`${op.path} isn't one of the folder's code files`);
    if (op.op === "edit") {
      const text = sf.getFullText();
      const first = text.indexOf(op.old);
      if (first < 0) return err(`the old text isn't in ${op.path} as it is after the earlier operations: copy it exactly`);
      if (text.indexOf(op.old, first + 1) >= 0) return err(`the old text is in ${op.path} more than once: include more of the lines around it`);
      if (op.old === op.new) return err("the edit changes nothing");
      sf.replaceWithText(text.slice(0, first) + op.new + text.slice(first + op.old.length));
      return;
    }
    if (!IDENTIFIER.test(op.to)) return err(`${op.to} isn't a name`);
    if (op.to === op.symbol) return err("the rename keeps the same name");
    const d = declarationOf(sf, op.symbol, op.within);
    if ("error" in d) return err(d.error);
    try {
      d.node.rename(op.to);
    } catch (error) {
      err(`${op.symbol} can't be renamed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    }
  });
  const after = new Map(other);
  for (const sf of p.getSourceFiles()) after.set(sf.getFilePath().slice(1), sf.getFullText());
  const changed = [...after].filter(([path, text]) => before.get(path) !== text).map(([path]) => path).sort();
  return { files: after, changed, created: [...created].sort(), errors };
}

/**
 * The specs that run a changed file: the spec itself, or one that imports it,
 * directly or through other files. Steps files count as specs (a feature
 * runs them).
 */
export function dependentSpecs(files: ReadonlyArray<{ path: string; content: string }>, changed: readonly string[], isSpec: (path: string) => boolean, aliases: Record<string, string[]> = {}): string[] {
  const p = project(files, aliases);
  const imports = new Map<string, string[]>();
  for (const sf of p.getSourceFiles()) {
    const targets = [...sf.getImportDeclarations(), ...sf.getExportDeclarations()].flatMap((d) => {
      const t = d.getModuleSpecifierSourceFile();
      return t ? [t.getFilePath().slice(1)] : [];
    });
    imports.set(sf.getFilePath().slice(1), targets);
  }
  // Back from the changed files along the imports: every file that imports one, directly or not.
  const importers = new Map<string, string[]>();
  for (const [from, targets] of imports) for (const t of targets) importers.set(t, [...(importers.get(t) ?? []), from]);
  const reached = new Set(changed);
  const queue = [...changed];
  while (queue.length)
    for (const from of importers.get(queue.pop()!) ?? [])
      if (!reached.has(from)) {
        reached.add(from);
        queue.push(from);
      }
  return [...reached].filter((path) => imports.has(path) && isSpec(path)).sort();
}
