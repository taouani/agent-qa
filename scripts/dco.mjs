// @ts-check
// The Developer Certificate of Origin check (CONTRIBUTING.md): each commit of a pull
// request carries `Signed-off-by: Name <email>` with its author's email, in its trailer
// block. Pure logic, so the tests run it without git; scripts/check-dco.mjs feeds it.

/**
 * Authors that are AI agents working for a maintainer. An agent can't certify the DCO,
 * so its commits pass only on a pull request a maintainer opened, who answers for them.
 */
export const AGENT_EMAILS = ["noreply@anthropic.com"];

const SIGN_OFF = /^Signed-off-by:[ \t]*(\S[^<>\n]*?)[ \t]*<([^<>\s]+)>[ \t]*$/gim;

/**
 * The emails of the Signed-off-by lines in the message's last paragraph, where git
 * puts trailers, ignoring comment lines, in lower case.
 * @param {string} body the full commit message
 * @returns {string[]}
 */
export function signOffs(body) {
  // Comment lines (git's "# Conflicts:" after a merge) are not part of the message.
  const text = body.replace(/\r\n/g, "\n").split("\n").filter((line) => !line.startsWith("#")).join("\n");
  const paragraphs = text.trim().split(/\n[ \t]*\n/);
  const trailers = paragraphs[paragraphs.length - 1] ?? "";
  return [...trailers.matchAll(SIGN_OFF)].map((m) => (m[2] ?? "").toLowerCase());
}

/**
 * @typedef {{ sha: string, authorName: string, authorEmail: string, parents: number, body: string, cleanMerge?: boolean }} Commit
 * `cleanMerge`: a merge commit whose tree is exactly what git merges from its parents,
 * so it adds nothing of its own.
 * @param {Commit[]} commits
 * @param {{ maintainerPullRequest: boolean }} options
 * @returns {string[]} one line per commit that fails, empty when all pass
 */
export function dcoProblems(commits, options) {
  const problems = [];
  for (const c of commits) {
    const email = c.authorEmail.toLowerCase();
    if (c.parents > 1 && c.cleanMerge) continue;
    if (AGENT_EMAILS.includes(email)) {
      if (options.maintainerPullRequest) continue;
      problems.push(`${c.sha.slice(0, 7)} is by an AI agent (${c.authorEmail}) on a pull request a maintainer didn't open: a person must author and sign off the commit`);
      continue;
    }
    const found = signOffs(c.body);
    if (found.includes(email)) continue;
    const what = c.parents > 1 ? "merge commit with changes of its own" : "commit";
    problems.push(
      found.length === 0
        ? `${c.sha.slice(0, 7)} (${what}) has no Signed-off-by line (author ${c.authorName} <${c.authorEmail}>)`
        : `${c.sha.slice(0, 7)} (${what}) is signed off as ${found.join(", ")}, not as its author ${c.authorEmail}`,
    );
  }
  return problems;
}
