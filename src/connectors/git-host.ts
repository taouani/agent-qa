import type { WriteGrant } from "../core/index.js";
import type { OpenedPullRequest, PullRequestFiles } from "./github.js";

/**
 * One interface for the git hosts (S4-1): GitHub, Azure DevOps (S4-2) and
 * GitLab (S4-8). A host opens a pull request from CI (one commit of files on a new
 * branch, never a push to the base) and reads pull requests that name an
 * issue key, with their diffs, for `commits`. Whatever a host calls a pull
 * request (a merge request on GitLab), it is one here.
 */

export type GitPlatform = "github" | "gitlab" | "azure-devops";

/** A pull request found for an issue key. */
export interface PullRequestRef {
  /** The host's number for it (GitHub's and ADO's pull request id, GitLab's iid). */
  id: number;
  url: string;
  title: string;
  /** The branch it comes from; empty when the host didn't say (a fork that is gone). */
  sourceBranch: string;
  targetBranch: string;
  state: "open" | "merged" | "closed";
  /** Where the key was found. */
  matchedIn: Array<"title" | "description" | "branch" | "commit">;
}

export interface PullRequestFileChange {
  /** From the repo root, with forward slashes; for a removed file, the path it had. */
  path: string;
  status: "added" | "modified" | "removed" | "renamed";
  previousPath?: string;
  /** The unified diff of the file; absent when the host sent none (binary, too large) or the cap was reached. */
  patch?: string;
}

export interface PullRequestDiff {
  files: PullRequestFileChange[];
  /** Some patches (or files) were left out: over `maxBytes`, over the host's own limits, or not sent. */
  truncated: boolean;
}

export interface FindPullRequestsOptions {
  /** At most this many, newest first; default 10. */
  max?: number;
}

export interface DiffOptions {
  /** Bytes of patch text kept in all; the files past it keep only their path and status. Default 200 000. */
  maxBytes?: number;
}

export interface GitHost {
  readonly platform: GitPlatform;
  /** The host's name in messages: "GitHub". */
  readonly service: string;
  openPullRequest(grant: WriteGrant, pr: PullRequestFiles): Promise<OpenedPullRequest>;
  /**
   * Pull requests whose title, description, source branch or commit messages
   * name the issue key as a whole word (ABC-1 is not ABC-12), newest first.
   */
  findPullRequests(key: string, options?: FindPullRequestsOptions): Promise<PullRequestRef[]>;
  pullRequestDiff(id: number, options?: DiffOptions): Promise<PullRequestDiff>;
}

export const DEFAULT_DIFF_BYTES = 200_000;
export const DEFAULT_PULL_REQUESTS = 10;

const ISSUE_KEY = /^[A-Z][A-Z0-9_]*-\d+$/;

/** A Jira key as the hosts' searches take it, or an error for anything else (it becomes part of a query). */
export function checkIssueKey(key: string): string {
  if (!ISSUE_KEY.test(key)) throw new Error(`${JSON.stringify(key.slice(0, 40))} isn't a Jira issue key`);
  return key;
}

/**
 * Whether a text names the key as a whole word: not ABC-12 for ABC-1, nor
 * XABC-1. An underscore before it is a separator (`feature_ABC-1`).
 */
export function namesKey(text: string | undefined, key: string): boolean {
  if (!text) return false;
  return new RegExp(`(^|[^A-Za-z0-9])${checkIssueKey(key)}(?![0-9])`, "i").test(text);
}

/**
 * Keeps patches, in the order given, while they fit in `maxBytes` of patch
 * text; a patch that doesn't fit is left out (its file keeps its path and
 * status) and smaller ones after it are still kept.
 */
export function capPatches(files: PullRequestFileChange[], maxBytes: number): PullRequestDiff {
  let left = maxBytes;
  let truncated = false;
  const out = files.map((f) => {
    if (f.patch === undefined) return f;
    const size = Buffer.byteLength(f.patch, "utf8");
    if (size > left) {
      truncated = true;
      const rest: PullRequestFileChange = { path: f.path, status: f.status };
      if (f.previousPath !== undefined) rest.previousPath = f.previousPath;
      return rest;
    }
    left -= size;
    return f;
  });
  return { files: out, truncated };
}
