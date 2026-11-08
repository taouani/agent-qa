import { z } from "zod";
import type { ArtifactSpec } from "../core/index.js";

/**
 * `pull-requests@1` (S4-6, `commits` part a): the pull requests that name
 * each issue key on the configured git host, with their diffs, masked like
 * any other text. The requirements analysis may use them as optional
 * context, and says which file each of its code notes comes from.
 *
 * Per issue, at most MAX_PULL_REQUESTS_PER_ISSUE pull requests and
 * PULL_REQUEST_BYTES of patch text in all; past the cap a file keeps only its
 * path and status. PULL_REQUEST_TOTAL_BYTES caps the run the same way, so a
 * JQL filter of many issues stays one context. At most
 * MAX_PULL_REQUEST_ISSUES issues are searched.
 */

export const MAX_PULL_REQUESTS_PER_ISSUE = 5;
export const PULL_REQUEST_BYTES = 200_000;
/** Patch text for the whole run, over every issue: what one analysis context can hold. */
export const PULL_REQUEST_TOTAL_BYTES = 600_000;
export const MAX_PULL_REQUEST_ISSUES = 25;
export const PULL_REQUESTS_VERSION = "pull-requests-1";

const hash = z.string().regex(/^[0-9a-f]{64}$/);

export const maskedPullRequestSchema = z
  .object({
    id: z.number().int().min(0),
    /** The host's link to it: repo and number only. */
    url: z.string(),
    /** Masked. */
    title: z.string(),
    state: z.enum(["open", "merged", "closed"]),
    /** Masked. */
    sourceBranch: z.string(),
    matchedIn: z.array(z.enum(["title", "description", "branch", "commit"])),
    files: z.array(
      z
        .object({
          /** Masked (a path can hold a name). */
          path: z.string(),
          status: z.enum(["added", "modified", "removed", "renamed"]),
          /** The unified diff, masked; absent past the cap, or when the host sent none. */
          patch: z.string().optional(),
        })
        .strict(),
    ),
    /** Some patches were left out: over the issue's or the run's cap, or not sent by the host. */
    truncated: z.boolean(),
    /** sha256 of the pull request as read (title, branch, files and patches): same hash, same input. */
    hash,
  })
  .strict();
export type MaskedPullRequest = z.infer<typeof maskedPullRequestSchema>;

export const pullRequestsSchema = z
  .object({
    platform: z.enum(["github", "gitlab", "azure-devops"]),
    /** Where they were read: platform and repo. A change of git settings reads them again. */
    source: z.string(),
    /** The issues searched, sorted. */
    keys: z.array(z.string()),
    /** Issues not searched: over MAX_PULL_REQUEST_ISSUES. */
    skipped: z.array(z.string()),
    byIssue: z.record(z.string(), z.array(maskedPullRequestSchema)),
    /** What masking replaced in titles, branches, paths and diffs: counts only. */
    masked: z.object({ byDetector: z.record(z.string(), z.number().int().min(0)), byField: z.record(z.string(), z.number().int().min(0)) }).strict(),
  })
  .strict();
export type PullRequestsArtifact = z.infer<typeof pullRequestsSchema>;

export const PULL_REQUESTS_ARTIFACT: ArtifactSpec<PullRequestsArtifact> = {
  name: "pull-requests",
  schema: "pull-requests@1",
  data: pullRequestsSchema,
  render: (d) => {
    const lines = ["# Pull requests", "", `Found on ${d.platform} for ${d.keys.length} issue(s), masked like the issues.`];
    if (d.skipped.length) lines.push("", `Not searched (over ${MAX_PULL_REQUEST_ISSUES} issues): ${d.skipped.join(", ")}`);
    for (const key of d.keys) {
      const prs = d.byIssue[key] ?? [];
      lines.push("", `## ${key}`, "");
      if (prs.length === 0) lines.push("None found.");
      for (const pr of prs) lines.push(`- #${pr.id} ${pr.title.replace(/\s+/g, " ")} (${pr.state}, ${pr.files.length} file(s)${pr.truncated ? ", some diffs left out" : ""}): ${pr.url}`);
    }
    const counts = Object.entries(d.masked.byDetector);
    lines.push("", `Masked: ${counts.length ? counts.map(([k, n]) => `${n} ${k}`).join(", ") : "nothing"}.`);
    return `${lines.join("\n")}\n`;
  },
};
