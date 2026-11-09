// Checks the DCO sign-off of every commit in base..head (run in CI on pull requests:
// node scripts/check-dco.mjs <base-sha> <head-sha>). MAINTAINER_PR=true when a
// maintainer opened the pull request. Exit 1 when a commit fails.
import { spawnSync } from "node:child_process";
import { dcoProblems } from "./dco.mjs";

const [base, head] = process.argv.slice(2);
if (!base || !head) {
  console.error("usage: node scripts/check-dco.mjs <base-sha> <head-sha>");
  process.exit(2);
}
const r = spawnSync("git", ["log", "--format=%H%x00%an%x00%ae%x00%P%x00%B%x1e", `${base}..${head}`], { encoding: "utf8" });
if (r.status !== 0) {
  console.error(r.stderr || `git log failed (exit ${r.status})`);
  process.exit(2);
}
const commits = r.stdout
  .split("\x1e")
  .map((record) => record.replace(/^\n/, ""))
  .filter((record) => record.trim() !== "")
  .map((record) => {
    const [sha = "", authorName = "", authorEmail = "", parents = "", body = ""] = record.split("\x00");
    return { sha, authorName, authorEmail, parents: parents.split(" ").filter(Boolean).length, body };
  });
const problems = dcoProblems(commits, { maintainerPullRequest: process.env.MAINTAINER_PR === "true" });
if (problems.length === 0) {
  console.log(`DCO: ${commits.length} commit(s) ok`);
} else {
  for (const p of problems) console.error(`DCO: ${p}`);
  console.error("\nSign off each commit with `git commit -s` (see CONTRIBUTING.md). To fix the last one: git commit --amend -s --no-edit && git push --force-with-lease");
  process.exitCode = 1;
}
