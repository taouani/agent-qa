import { randomBytes } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { assertGrant, PolicyDenied, type WriteGrant } from "../core/index.js";

/**
 * Writes one file into the user's repo, replacing it: the reviewed framework
 * profile. Generated code uses createRepoFile. Both need a direct `testCode` grant from
 * `Policy.guard`; in CI test code leaves only as a pull request, which this
 * never does. The file is written whole, through a temporary file and a
 * rename, so a reader never sees half of it.
 */
export async function writeRepoFile(grant: WriteGrant, root: string, path: string, text: string): Promise<void> {
  const { target, folder } = await prepare(grant, root, path, ".");
  const current = await lstat(target).catch(() => undefined);
  if (current && !current.isFile()) throw new PolicyDenied("testCode", `${path} is not a plain file`);
  const temp = join(folder, `.${randomBytes(6).toString("hex")}.agent-qa.tmp`);
  try {
    await writeFile(temp, text, { encoding: "utf8", flag: "wx" });
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

/** A file createRepoFile made, so that removeCreatedRepoFile removes that file and nothing else. */
export interface CreatedRepoFile {
  /** Relative to the root. */
  path: string;
  dev: number;
  ino: number;
  /** The first folder this create made (mkdir -p), removed again if it is empty. */
  firstDir?: string | undefined;
}

/**
 * Creates one new file (generated code, S2-7), never replacing one: a file
 * that already holds exactly `text` counts as written ("same"), so a write
 * that stopped halfway can run again. Every folder on the way, links
 * resolved, stays inside `within` (relative to `root`): the folder the person
 * approved.
 */
export async function createRepoFile(grant: WriteGrant, root: string, path: string, text: string, within: string): Promise<{ status: "created"; file: CreatedRepoFile } | { status: "same" }> {
  const { target, firstDir } = await prepare(grant, root, path, within);
  const current = await lstat(target).catch(() => undefined);
  if (current) {
    if (current.isFile() && current.size === Buffer.byteLength(text) && (await readFile(target, "utf8")) === text) return { status: "same" };
    throw new PolicyDenied("testCode", `${path} already exists: generated code only adds new files`);
  }
  // Created, never replaced: "wx" fails if the file appeared since the check above.
  try {
    await writeFile(target, text, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new PolicyDenied("testCode", `${path} already exists: generated code only adds new files`);
    throw error;
  }
  const made = await lstat(target);
  return { status: "created", file: { path: relative(resolve(root), target), dev: made.dev, ino: made.ino, firstDir } };
}

/**
 * Removes a file createRepoFile made a moment ago, when a later file of the
 * same write failed: generated files are written all or none. Only that very
 * file (same device and inode) is removed, then the folders that create made,
 * while they are empty.
 */
export async function removeCreatedRepoFile(grant: WriteGrant, root: string, file: CreatedRepoFile): Promise<void> {
  assertGrant(grant, "testCode");
  const target = resolve(root, file.path);
  const rel = relative(await realpath(root), await realpath(target));
  if (rel === "" || isAbsolute(rel) || rel.split(sep).includes("..")) throw new PolicyDenied("testCode", `${file.path} is outside the project folder`);
  const current = await lstat(target);
  if (!current.isFile() || current.dev !== file.dev || current.ino !== file.ino) throw new PolicyDenied("testCode", `${file.path} is no longer the file Agent-QA created`);
  await rm(target);
  if (!file.firstDir) return;
  for (let dir = dirname(target); ; dir = dirname(dir)) {
    const up = relative(file.firstDir, dir);
    if (isAbsolute(up) || up.split(sep).includes("..")) return;
    // Not empty: something else is in it now, so it stays.
    if (!(await rmdir(dir).then(() => true, () => false))) return;
    if (up === "") return;
  }
}

/** Checks the path, then makes its folders: every one, links resolved, inside `within` (relative to root). */
async function prepare(grant: WriteGrant, root: string, path: string, within: string): Promise<{ target: string; folder: string; firstDir: string | undefined }> {
  assertGrant(grant, "testCode");
  if (grant.via !== "direct") throw new PolicyDenied("testCode", "this write may only leave as a pull request");
  const target = resolve(root, within, path);
  const rel = relative(resolve(root, within), target);
  if (rel === "" || isAbsolute(rel) || rel.split(sep).includes("..")) throw new PolicyDenied("testCode", `${path} is outside the project folder`);
  const folder = dirname(target);
  // A link in the way could send the write elsewhere: checked on the nearest folder that exists, before
  // anything is created, and again once the folders exist.
  const realRoot = await realpath(root);
  const boundary = await realpath(resolve(root, within));
  const outside = (from: string, to: string) => {
    const r = relative(from, to);
    return isAbsolute(r) || r.split(sep).includes("..");
  };
  // The approved folder itself, never a link put in its place since: where it resolves is where it is.
  const fold = (v: string) => (process.platform === "win32" || process.platform === "darwin" ? v.toLowerCase() : v);
  if (outside(realRoot, boundary) || fold(boundary) !== fold(resolve(realRoot, within))) throw new PolicyDenied("testCode", `${within} is a link or links outside the project folder`);
  const inside = async (dir: string) => {
    if (outside(boundary, await realpath(dir))) throw new PolicyDenied("testCode", `${path} links outside ${within === "." ? "the project folder" : within}`);
  };
  let existing = folder;
  while (!(await lstat(existing).catch(() => undefined)) && dirname(existing) !== existing) existing = dirname(existing);
  await inside(existing);
  // The first folder made, from the path itself (mkdir's own answer is \\?\-prefixed on Windows).
  const firstDir = existing === folder ? undefined : join(existing, relative(existing, folder).split(sep)[0]!);
  await mkdir(folder, { recursive: true });
  await inside(folder);
  return { target, folder, firstDir };
}
