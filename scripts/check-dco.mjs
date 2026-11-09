// Checks the DCO sign-off of every commit on <head> that isn't on <base> (run in CI on
// pull requests: node scripts/check-dco.mjs origin/master HEAD). MAINTAINER_PR=true
// when a maintainer opened the pull request from this repository. Exit 1 when a commit fails.
import { spawnSync } from "node:child_process";
import { dcoProblems } from "./dco.mjs";

const [base, head] = process.argv.slice(2);
if (!base || !head) {
  console.error("usage: node scripts/check-dco.mjs <base> <head>");
  process.exit(2);
}

/** @param {string[]} args */
function git(args) {
  const r = spawnSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error(r.stderr || `git ${args[0]} failed (exit ${r.status})`);
    process.exit(2);
  }
  return r.stdout;
}

/** A merge whose tree is what git merges from its parents adds nothing of its own. */
function isCleanMerge(sha, parents) {
  if (parents.length !== 2) return false;
  const r = spawnSync("git", ["merge-tree", "--write-tree", parents[0], parents[1]], { encoding: "utf8" });
  if (r.status !== 0) return false; // conflicts: the merge commit resolved them itself
  return r.stdout.split("\n")[0]?.trim() === git(["rev-parse", `${sha}^{tree}`]).trim();
}

// One git call per field, so no character in a message can split a record.
const commits = git(["rev-list", "--reverse", head, "--not", base])
  .split("\n")
  .filter(Boolean)
  .map((sha) => {
    const field = (format) => git(["show", "-s", `--format=${format}`, sha]).replace(/\n$/, "");
    const parents = field("%P").split(" ").filter(Boolean);
    return { sha, authorName: field("%an"), authorEmail: field("%ae"), parents: parents.length, body: field("%B"), cleanMerge: isCleanMerge(sha, parents) };
  });
const problems = dcoProblems(commits, { maintainerPullRequest: process.env.MAINTAINER_PR === "true" });
if (problems.length === 0) {
  console.log(`DCO: ${commits.length} commit(s) ok`);
} else {
  for (const p of problems) console.error(`DCO: ${p}`);
  console.error("\nSign off each commit with `git commit -s` (see CONTRIBUTING.md). To fix the last one: git commit --amend -s --no-edit && git push --force-with-lease");
  process.exitCode = 1;
}
