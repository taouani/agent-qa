// @ts-check
// The Developer Certificate of Origin check (CONTRIBUTING.md): each commit of a pull
// request carries `Signed-off-by: Name <email>` with its author's email. Pure logic,
// so the tests run it without git; scripts/check-dco.mjs feeds it the commits.

/** Commits that need no sign-off: bots, such as the "Version packages" pull request. */
const BOT_EMAIL = /\[bot\]@users\.noreply\.github\.com$/i;

/**
 * Authors that are AI agents working for a maintainer. An agent can't certify the DCO,
 * so its commits pass only on a pull request a maintainer opened, who answers for them.
 */
export const AGENT_EMAILS = ["noreply@anthropic.com"];

const SIGN_OFF = /^Signed-off-by:\s*(.+?)\s*<([^<>\s]+)>\s*$/gim;

/**
 * @param {string} body the full commit message
 * @returns {string[]} the email of each Signed-off-by line, lower case
 */
export function signOffs(body) {
  return [...body.matchAll(SIGN_OFF)].map((m) => (m[2] ?? "").toLowerCase());
}

/**
 * @typedef {{ sha: string, authorName: string, authorEmail: string, parents: number, body: string }} Commit
 * @param {Commit[]} commits
 * @param {{ maintainerPullRequest: boolean }} options
 * @returns {string[]} one line per commit that fails, empty when all pass
 */
export function dcoProblems(commits, options) {
  const problems = [];
  for (const c of commits) {
    const email = c.authorEmail.toLowerCase();
    // A merge commit brings in commits that were checked on their own branch.
    if (c.parents > 1 || BOT_EMAIL.test(email)) continue;
    if (AGENT_EMAILS.includes(email)) {
      if (options.maintainerPullRequest) continue;
      problems.push(`${c.sha.slice(0, 7)} is by an AI agent (${c.authorEmail}) on a pull request a maintainer didn't open: a person must author and sign off the commit`);
      continue;
    }
    const found = signOffs(c.body);
    if (found.includes(email)) continue;
    problems.push(
      found.length === 0
        ? `${c.sha.slice(0, 7)} has no Signed-off-by line (author ${c.authorName} <${c.authorEmail}>)`
        : `${c.sha.slice(0, 7)} is signed off as ${found.join(", ")}, not as its author ${c.authorEmail}`,
    );
  }
  return problems;
}
