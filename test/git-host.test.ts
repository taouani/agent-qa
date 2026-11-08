import { describe, expect, it } from "vitest";
import { capPatches, createGitHost, GitHubClient, namesKey } from "../src/connectors/index.js";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** GitHub's search, pulls and files endpoints for one repo o/r, with every call recorded. */
function fakeSearch(data: {
  issues?: unknown[];
  commits?: unknown[];
  pullsOfCommit?: Record<string, unknown[]>;
  pulls?: Record<number, unknown>;
  files?: Record<number, unknown[]>;
}) {
  const calls: string[] = [];
  const fetch = async (input: string) => {
    const url = new URL(input);
    calls.push(`${url.pathname}${url.search}`);
    if (url.pathname === "/search/issues") return json(200, { items: data.issues ?? [] });
    if (url.pathname === "/search/commits") return json(200, { items: data.commits ?? [] });
    const ofCommit = /^\/repos\/o\/r\/commits\/([0-9a-f]+)\/pulls$/.exec(url.pathname);
    if (ofCommit) return json(200, data.pullsOfCommit?.[ofCommit[1]!] ?? []);
    const files = /^\/repos\/o\/r\/pulls\/(\d+)\/files$/.exec(url.pathname);
    if (files) {
      const all = data.files?.[Number(files[1])] ?? [];
      const page = Number(url.searchParams.get("page") ?? 1);
      return json(200, all.slice((page - 1) * 100, page * 100));
    }
    const pull = /^\/repos\/o\/r\/pulls\/(\d+)$/.exec(url.pathname);
    if (pull) return data.pulls?.[Number(pull[1])] ? json(200, data.pulls[Number(pull[1])]) : json(404, {});
    return json(404, {});
  };
  return { fetch, calls };
}

const sha = (c: string) => c.repeat(40);

describe("git hosts (S4-1)", () => {
  it("matches an issue key as a whole word only", () => {
    expect(namesKey("ABC-1: fix login", "ABC-1")).toBe(true);
    expect(namesKey("feature/abc-1-login", "ABC-1")).toBe(true);
    expect(namesKey("[ABC-1] done", "ABC-1")).toBe(true);
    expect(namesKey("ABC-12 other", "ABC-1")).toBe(false);
    expect(namesKey("XABC-1", "ABC-1")).toBe(false);
    expect(namesKey(undefined, "ABC-1")).toBe(false);
    expect(() => namesKey("x", "abc) OR (1")).toThrow("isn't a Jira issue key");
  });

  it("caps patches in order and keeps every file's path", () => {
    const capped = capPatches(
      [
        { path: "a.ts", status: "modified", patch: "x".repeat(6) },
        { path: "b.ts", status: "renamed", previousPath: "old/b.ts", patch: "y".repeat(6) },
        { path: "c.png", status: "added" },
      ],
      10,
    );
    expect(capped.truncated).toBe(true);
    expect(capped.files).toEqual([
      { path: "a.ts", status: "modified", patch: "xxxxxx" },
      { path: "b.ts", status: "renamed", previousPath: "old/b.ts" },
      { path: "c.png", status: "added" },
    ]);
    expect(capPatches([{ path: "a.ts", status: "modified", patch: "abc" }], 10).truncated).toBe(false);
  });

  it("finds GitHub pull requests by title, description, branch and commit, newest first, without near misses", async () => {
    const { fetch, calls } = fakeSearch({
      issues: [
        { number: 7, html_url: "https://github.com/o/r/pull/7", title: "ABC-1 login", state: "closed", pull_request: { merged_at: "2026-11-01T00:00:00Z" } },
        { number: 8, html_url: "https://github.com/o/r/pull/8", title: "Refactor", body: "Part of ABC-1.", state: "open" },
        // Found by GitHub's search, but it names ABC-12: left out.
        { number: 9, html_url: "https://github.com/o/r/pull/9", title: "ABC-12 other", state: "open" },
      ],
      commits: [
        { sha: sha("a"), commit: { message: "ABC-1: guard the button" } },
        { sha: sha("b"), commit: { message: "ABC-10 unrelated" } },
      ],
      pullsOfCommit: { [sha("a")]: [{ number: 5, html_url: "https://github.com/o/r/pull/5", title: "Button", state: "closed", merged_at: null, head: { ref: "fix/button" }, base: { ref: "main" } }] },
      pulls: {
        7: { number: 7, head: { ref: "feature/ABC-1-login" }, base: { ref: "main" }, merged_at: "2026-11-01T00:00:00Z" },
        8: { number: 8, head: { ref: "refactor" }, base: { ref: "develop" } },
      },
    });
    const gh = new GitHubClient({ repo: "o/r", token: "tok", fetch });
    const found = await gh.findPullRequests("ABC-1");
    expect(found).toEqual([
      { id: 8, url: "https://github.com/o/r/pull/8", title: "Refactor", sourceBranch: "refactor", targetBranch: "develop", state: "open", matchedIn: ["description"] },
      { id: 7, url: "https://github.com/o/r/pull/7", title: "ABC-1 login", sourceBranch: "feature/ABC-1-login", targetBranch: "main", state: "merged", matchedIn: ["title", "branch"] },
      { id: 5, url: "https://github.com/o/r/pull/5", title: "Button", sourceBranch: "fix/button", targetBranch: "main", state: "closed", matchedIn: ["commit"] },
    ]);
    // The commit naming ABC-10 isn't followed.
    expect(calls.filter((c) => c.includes("/commits/"))).toEqual([`/repos/o/r/commits/${sha("a")}/pulls?per_page=5`]);
    expect(new URL(`https://x${calls[0]!}`).searchParams.get("q")).toBe('repo:o/r is:pr "ABC-1"');
    expect(await gh.findPullRequests("ABC-1", { max: 1 })).toHaveLength(1);
    await expect(gh.findPullRequests('ABC-1" OR repo:x/y')).rejects.toThrow("isn't a Jira issue key");
  });

  it("reads a GitHub pull request's files over several pages, capped, and marks what GitHub left out", async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ filename: `src/f${i}.ts`, status: "modified", changes: 2, patch: "@@ -1 +1 @@\n-a\n+b" }));
    const { fetch } = fakeSearch({
      files: {
        3: [
          { filename: "src/new.ts", status: "added", changes: 1, patch: "@@ +1 @@\n+x" },
          { filename: "src/gone.ts", status: "removed", changes: 3 },
          { filename: "src/b.ts", status: "renamed", previous_filename: "src/a.ts", changes: 0 },
        ],
        4: [{ filename: "big.json", status: "modified", changes: 90000 }],
        5: many,
      },
    });
    const gh = new GitHubClient({ repo: "o/r", token: "tok", fetch });
    expect(await gh.pullRequestDiff(3)).toEqual({
      files: [
        { path: "src/new.ts", status: "added", patch: "@@ +1 @@\n+x" },
        { path: "src/gone.ts", status: "removed" },
        { path: "src/b.ts", status: "renamed", previousPath: "src/a.ts" },
      ],
      truncated: false,
    });
    // GitHub sends no patch for a very large file.
    expect((await gh.pullRequestDiff(4)).truncated).toBe(true);
    const paged = await gh.pullRequestDiff(5, { maxBytes: 100 });
    expect(paged.files).toHaveLength(150);
    expect(paged.files.filter((f) => f.patch !== undefined)).toHaveLength(5);
    expect(paged.truncated).toBe(true);
    await expect(gh.pullRequestDiff(0)).rejects.toThrow("isn't a pull request number");
  });

  it("makes the client for the configured platform", () => {
    expect(createGitHost({ platform: "github", repo: "o/r" }, "tok").service).toBe("GitHub");
    expect(() => createGitHost({ platform: "gitlab", repo: "g/p" }, "tok")).toThrow("git.platform gitlab isn't supported yet");
  });
});
