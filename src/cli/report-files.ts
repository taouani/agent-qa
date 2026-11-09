import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { DASHBOARD_GENERATOR, HARNESS_LAST_REPORT } from "../harness/index.js";

/**
 * The CLI's report writes, which skip the policy layer the way `agent-qa init`'s
 * setup files do: the person ran the command, and nothing leaves the machine.
 * Only two kinds of file, never test code or another tool's file:
 *
 * - the harness's last report, at `.agent-qa/harness/last-report.json`;
 * - the dashboard, an `.html` file that is new or one this command wrote before.
 */
export async function writeHarnessReport(root: string, report: unknown): Promise<void> {
  const dir = join(root, ".agent-qa", "harness");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, HARNESS_LAST_REPORT), JSON.stringify(report, null, 2) + "\n");
}

export class DashboardFileError extends Error {}

export async function writeDashboard(file: string, html: string): Promise<void> {
  if (extname(file).toLowerCase() !== ".html") throw new DashboardFileError(`${file}: the dashboard is written to an .html file only`);
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
  await writeFile(file, html, { flag: before === undefined ? "wx" : "w" });
}
