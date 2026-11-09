import { randomBytes } from "node:crypto";
import { lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { DASHBOARD_GENERATOR, HARNESS_LAST_REPORT } from "../harness/index.js";

/**
 * The CLI's report writes, which skip the policy layer the way `agent-qa init`'s
 * setup files do: the person ran the command, and nothing leaves the machine.
 * Only two kinds of file, never test code or another tool's file:
 *
 * - the harness's last report, at `.agent-qa/harness/last-report.json`;
 * - the dashboard, an `.html` file that is new or one this command wrote before.
 *
 * Neither follows a symlink: a cloned repo could commit one in place of either
 * file (or of `.agent-qa/harness`) to point the write at another file. Each
 * write goes to a new file next to the target, then is renamed over it, which
 * replaces a link swapped in meanwhile rather than writing through it.
 */
export class DashboardFileError extends Error {}

const isLink = async (path: string): Promise<boolean> => {
  try {
    return (await lstat(path)).isSymbolicLink();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

async function replaceFile(file: string, text: string): Promise<void> {
  const temp = join(dirname(file), `.${basename(file)}.${randomBytes(6).toString("hex")}.tmp`);
  await writeFile(temp, text, { flag: "wx" });
  try {
    await rename(temp, file);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

export async function writeHarnessReport(root: string, report: unknown): Promise<void> {
  let dir = root;
  for (const part of [".agent-qa", "harness"]) {
    dir = join(dir, part);
    if (await isLink(dir)) throw new DashboardFileError(`${dir} is a symlink, so the harness report isn't written there`);
    await mkdir(dir, { recursive: true });
  }
  const file = join(dir, HARNESS_LAST_REPORT);
  if (await isLink(file)) throw new DashboardFileError(`${file} is a symlink, so it's left as it is`);
  await replaceFile(file, JSON.stringify(report, null, 2) + "\n");
}

/** `checkedFolder`: a folder of the project the file goes in (the default `.agent-qa`), refused when it's a symlink. */
export async function writeDashboard(file: string, html: string, checkedFolder?: string): Promise<void> {
  if (extname(file).toLowerCase() !== ".html") throw new DashboardFileError(`${file}: the dashboard is written to an .html file only`);
  if (checkedFolder !== undefined && (await isLink(checkedFolder))) throw new DashboardFileError(`${checkedFolder} is a symlink, so the dashboard isn't written there`);
  if (await isLink(file)) throw new DashboardFileError(`${file} is a symlink, so it's left as it is`);
  let before: string | undefined;
  try {
    before = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (before !== undefined && !before.includes(`<meta name="generator" content="${DASHBOARD_GENERATOR}">`)) {
    throw new DashboardFileError(`${file} exists and isn't a dashboard agent-qa wrote, so it's left as it is`);
  }
  await mkdir(dirname(file), { recursive: true });
  await replaceFile(file, html);
}
