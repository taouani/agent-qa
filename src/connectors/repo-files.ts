import { randomBytes } from "node:crypto";
import { lstat, mkdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { assertGrant, PolicyDenied, type WriteGrant } from "../core/index.js";

/**
 * Writes one file into the user's repo: the reviewed framework profile now,
 * generated tests later (S2-7). It needs a direct `testCode` grant from
 * `Policy.guard`; in CI test code leaves only as a pull request, which this
 * never does. The file is written whole, through a temporary file and a
 * rename, so a reader never sees half of it.
 */
export async function writeRepoFile(grant: WriteGrant, root: string, path: string, text: string): Promise<void> {
  assertGrant(grant, "testCode");
  if (grant.via !== "direct") throw new PolicyDenied("testCode", "this write may only leave as a pull request");
  const target = resolve(root, path);
  const rel = relative(resolve(root), target);
  if (rel === "" || isAbsolute(rel) || rel.split(sep).includes("..")) throw new PolicyDenied("testCode", `${path} is outside the project folder`);
  const folder = dirname(target);
  // A link in the way could send the write elsewhere: checked on the nearest folder that exists, before
  // anything is created, and again once the folders exist.
  const realRoot = await realpath(root);
  const inside = async (dir: string) => {
    const rel = relative(realRoot, await realpath(dir));
    if (isAbsolute(rel) || rel.split(sep).includes("..")) throw new PolicyDenied("testCode", `${path} links outside the project folder`);
  };
  let existing = folder;
  while (!(await lstat(existing).catch(() => undefined)) && dirname(existing) !== existing) existing = dirname(existing);
  await inside(existing);
  await mkdir(folder, { recursive: true });
  await inside(folder);
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
