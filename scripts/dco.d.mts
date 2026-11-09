export interface Commit {
  sha: string;
  authorName: string;
  authorEmail: string;
  parents: number;
  body: string;
  cleanMerge?: boolean;
}
export const AGENT_EMAILS: string[];
export function signOffs(body: string): string[];
export function dcoProblems(commits: Commit[], options: { maintainerPullRequest: boolean }): string[];
