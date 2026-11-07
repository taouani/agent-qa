import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * A read-only .gitignore evaluator for `agent-qa doctor`. It follows git's
 * rules closely enough for the paths doctor asks about: anchored and
 * unanchored patterns, `*`, `?`, `**`, directory-only patterns, negation, the
 * last matching rule winning, and a file staying ignored once a parent folder
 * is ignored. It finds the git work tree the project sits in (a project can
 * be a subfolder of a bigger repo) and reads its `info/exclude`, its root
 * `.gitignore`, and the `.gitignore` files in each folder on the way down to
 * the path. It does not read `core.excludesFile` or ask git, so it can be
 * stricter than git, never looser.
 */

interface Rule {
  /** Folder of the .gitignore that holds the rule, relative to the root ("" for the root). */
  base: string;
  negate: boolean;
  dirOnly: boolean;
  anchored: boolean;
  regex: RegExp;
}

function globToRegex(glob: string, caseInsensitive: boolean): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*" && glob[i + 1] === "*") {
      const atStart = i === 0;
      const followedBySlash = glob[i + 2] === "/";
      const atEnd = i + 2 === glob.length;
      if ((atStart || glob[i - 1] === "/") && followedBySlash) {
        re += "(?:.*/)?"; // `**/` matches zero or more folders
        i += 2;
        continue;
      }
      if (glob[i - 1] === "/" && atEnd) {
        re += ".*"; // trailing `/**` matches everything inside
        i += 1;
        continue;
      }
      re += "[^/]*";
      i += 1;
      continue;
    }
    if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (c === "\\" && i + 1 < glob.length) re += glob[++i]!.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    else re += c.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, caseInsensitive ? "i" : "");
}

export function parseGitignore(text: string, base = "", caseInsensitive = false): Rule[] {
  const rules: Rule[] = [];
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    // Trailing spaces are ignored unless escaped; leading spaces are part of the pattern.
    let line = raw.replace(/(?<!\\)\s+$/, "");
    if (!line || line.startsWith("#")) continue;
    const negate = line.startsWith("!");
    if (negate) line = line.slice(1);
    if (line.startsWith("\\#") || line.startsWith("\\!")) line = line.slice(1);
    const dirOnly = line.endsWith("/");
    line = line.replace(/\/+$/, "");
    if (!line) continue;
    const anchored = line.includes("/");
    line = line.replace(/^\//, "");
    rules.push({ base, negate, dirOnly, anchored, regex: globToRegex(line, caseInsensitive) });
  }
  return rules;
}

function matches(rule: Rule, path: string, isDir: boolean): boolean {
  if (rule.dirOnly && !isDir) return false;
  let rel = path;
  if (rule.base) {
    if (!path.startsWith(rule.base + "/")) return false;
    rel = path.slice(rule.base.length + 1);
  }
  return rule.anchored ? rule.regex.test(rel) : rule.regex.test(rel.slice(rel.lastIndexOf("/") + 1));
}

/** Rules for one project; `prefix` is the project folder inside its git work tree ("" at the top). */
export type IgnoreRules = Rule[] & { prefix?: string };

/** True when git would ignore `target` (relative to the project, `/`-separated; a trailing `/` means a folder). */
export function isIgnored(rules: IgnoreRules, target: string): boolean {
  const isDirTarget = target.endsWith("/");
  const parts = (rules.prefix ? `${rules.prefix}/${target}` : target).replace(/\/$/, "").split("/");
  for (let i = 0; i < parts.length; i++) {
    const path = parts.slice(0, i + 1).join("/");
    const isDir = i < parts.length - 1 || isDirTarget;
    let ignored = false;
    for (const rule of rules) if (matches(rule, path, isDir)) ignored = !rule.negate;
    // Once a folder is ignored, nothing inside it can be re-included.
    if (ignored) return true;
  }
  return false;
}

async function readOptional(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return "";
    throw error;
  }
}

/**
 * The git work tree holding `root` (the nearest folder with a `.git` entry,
 * root itself included) and its git folder; root itself when none is found.
 */
export async function gitWorkTree(root: string): Promise<{ top: string; gitDir: string | undefined }> {
  // Git finds its repository from the physical folder: a symlinked project belongs to the repo it points into.
  const start = await realpath(resolve(root)).catch(() => resolve(root));
  let dir = start;
  for (;;) {
    const dotGit = join(dir, ".git");
    const found = await stat(dotGit).catch(() => undefined);
    if (found?.isDirectory()) return { top: dir, gitDir: dotGit };
    if (found?.isFile()) {
      // A worktree or submodule: ".git" is a file naming the git folder.
      const named = /^gitdir:\s*(.+?)\s*$/m.exec(await readOptional(dotGit))?.[1];
      return { top: dir, gitDir: named ? resolve(dir, named) : undefined };
    }
    const up = dirname(dir);
    if (up === dir) return { top: start, gitDir: undefined };
    dir = up;
  }
}

/** Rules that apply to `targets` in the project at `root`, in git's precedence order. */
export async function loadIgnoreRules(
  root: string,
  targets: string[],
  // Only Windows: macOS repos can set core.ignorecase=false, and guessing wrong there would be looser than git.
  caseInsensitive = process.platform === "win32",
): Promise<IgnoreRules> {
  const { top, gitDir } = await gitWorkTree(root);
  const rel = relative(top, await realpath(resolve(root)).catch(() => resolve(root)));
  const prefix = rel && !isAbsolute(rel) && !rel.split(sep).includes("..") ? rel.split(sep).join("/") : "";
  const rules: IgnoreRules = [];
  if (gitDir) {
    // A linked worktree keeps info/exclude in the main git folder, named by its commondir file.
    const common = (await readOptional(join(gitDir, "commondir"))).trim();
    rules.push(...parseGitignore(await readOptional(join(common ? resolve(gitDir, common) : gitDir, "info", "exclude")), "", caseInsensitive));
  }
  rules.push(...parseGitignore(await readOptional(join(top, ".gitignore")), "", caseInsensitive));
  const folders = new Set<string>();
  for (const target of targets) {
    const parts = (prefix ? `${prefix}/${target}` : target).replace(/\/$/, "").split("/").slice(0, -1);
    for (let i = 1; i <= parts.length; i++) folders.add(parts.slice(0, i).join("/"));
  }
  for (const folder of [...folders].sort((a, b) => a.length - b.length)) {
    rules.push(...parseGitignore(await readOptional(join(top, ...folder.split("/"), ".gitignore")), folder, caseInsensitive));
  }
  if (prefix) rules.prefix = prefix;
  return rules;
}
