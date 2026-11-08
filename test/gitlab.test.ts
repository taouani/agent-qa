import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GitLabClient } from "../src/connectors/index.js";
import { MemoryAuditSink, Policy, PolicyDenied, type WriteGrant } from "../src/core/index.js";
import { jobApiOrigin, prBase } from "../src/data/index.js";

const ciGrant = async <T>(fn: (g: WriteGrant) => Promise<T>) => {
  const r = await new Policy({ mode: "ci", rules: { xray: "ask", confluence: "ask", testCode: "ask", jira: "ask", commands: "ask" }, audit: new MemoryAuditSink() }).guard({ target: "testCode", summary: "pr" }, fn);
  if (r.status !== "done") throw new Error("declined");
  return r.value;
};
const blobId = (t: string) => createHash("sha1").update(`blob ${Buffer.byteLength(t)}\0`).update(t).digest("hex");
const sha = (c: string) => c.repeat(40);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ROOT = "/api/v4/projects/grp%2Fsub%2Fapp";

interface Commit { parents: string[]; files: Record<string, string> }

/** A GitLab API in memory for grp/sub/app, with every call recorded. */
function fakeGitLab(start: { tree?: Record<string, Array<{ name: string; type: string; mode?: string }>>; files?: Record<string, string>; status?: number; mrs?: Array<Record<string, unknown>>; commitsList?: Array<Record<string, unknown>>; diffs?: Array<Record<string, unknown>> } = {}) {
  const branches: Record<string, string> = { main: sha("a") };
  const commits: Record<string, Commit> = { [sha("a")]: { parents: [], files: { ...(start.files ?? {}) } } };
  const mrs: Array<Record<string, unknown>> = [...(start.mrs ?? [])];
  const posts: Array<{ path: string; body: Record<string, unknown> }> = [];
  const calls: string[] = [];
  const tokens = new Set<string>();
  let n = 0;
  const fetch = async (input: string, init: RequestInit) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    tokens.add((init.headers as Record<string, string>)["private-token"]!);
    // The project id is one encoded path segment.
    const raw = input.slice(url.origin.length).split("?")[0]!;
    if (!raw.startsWith(ROOT)) return json(404, {});
    const path = decodeURIComponent(raw.slice(ROOT.length));
    calls.push(`${method} ${path}`);
    if (start.status) return json(start.status, {});
    if (method === "GET" && path === "") return json(200, { default_branch: "main" });
    const branch = /^\/repository\/branches\/(.+)$/.exec(path);
    if (method === "GET" && branch) return branches[branch[1]!] ? json(200, { commit: { id: branches[branch[1]!] } }) : json(404, {});
    const file = /^\/repository\/files\/(.+)$/.exec(path);
    if (method === "GET" && file) {
      const content = commits[url.searchParams.get("ref")!]?.files[file[1]!];
      return content === undefined ? json(404, {}) : json(200, { blob_id: blobId(content) });
    }
    if (method === "GET" && path === "/repository/tree") return json(200, (start.tree ?? {})[url.searchParams.get("path") ?? ""] ?? []);
    const commit = /^\/repository\/commits\/([0-9a-f]{40})(\/diff|\/merge_requests)?$/.exec(path);
    if (method === "GET" && commit) {
      const c = commits[commit[1]!];
      if (commit[2] === "/merge_requests") return json(200, mrs.filter((m) => m.sha === commit[1]));
      if (!c) return json(404, {});
      return commit[2] ? json(200, Object.keys(c.files).filter((f) => c.files[f] !== commits[c.parents[0]!]?.files[f]).map((f) => ({ new_path: f }))) : json(200, { id: commit[1], parent_ids: c.parents });
    }
    if (method === "GET" && path === "/repository/compare") return json(200, { commits: url.searchParams.get("to") === sha("a") ? [] : [{ id: "x" }] });
    if (method === "GET" && path === "/repository/commits") return json(200, start.commitsList ?? []);
    if (method === "GET" && path === "/merge_requests") {
      const source = url.searchParams.get("source_branch");
      const search = url.searchParams.get("search");
      return json(200, mrs.filter((m) => (!source || (m.source_branch === source && m.state === "opened")) && (!search || String(m.title).includes(search) || String(m.description ?? "").includes(search))));
    }
    const diffs = /^\/merge_requests\/(\d+)\/diffs$/.exec(path);
    if (method === "GET" && diffs) {
      const page = Number(url.searchParams.get("page"));
      const all = start.diffs ?? [];
      return json(200, all.slice((page - 1) * 100, page * 100));
    }
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    posts.push({ path, body });
    if (path === "/repository/commits") {
      const parent = String(body.start_sha);
      const c = sha(String(++n));
      const filesNow = { ...commits[parent]!.files };
      for (const a of body.actions as Array<{ file_path: string; content: string }>) filesNow[a.file_path] = Buffer.from(a.content, "base64").toString("utf8");
      commits[c] = { parents: [parent], files: filesNow };
      branches[String(body.branch)] = c;
      return json(201, { id: c });
    }
    if (path === "/merge_requests") {
      const m = { iid: 40 + mrs.length, state: "opened", draft: String(body.title).startsWith("Draft: "), ...body };
      mrs.push(m);
      return json(201, m);
    }
    return json(404, {});
  };
  return { fetch, calls, posts, branches, mrs, tokens };
}

const files = [{ path: "e2e/tests/a.spec.ts", content: "test('a')\n" }];
const pr = (over: Record<string, unknown> = {}) => ({ branch: "agent-qa/run-1", files, message: "Agent-QA: tests", title: "Agent-QA: tests", body: "b", draft: true, ...over });
const client = (fake: ReturnType<typeof fakeGitLab>) => new GitLabClient({ repo: "grp/sub/app", token: "glpat-x", fetch: fake.fetch, retries: 0 });

describe("GitLabClient (S4-8)", () => {
  it("commits the files on a new branch and opens a draft merge request, then takes both on a rerun", async () => {
    const fake = fakeGitLab({ tree: { "": [{ name: "e2e", type: "tree" }], e2e: [{ name: "pages", type: "tree" }] } });
    const gl = client(fake);
    const first = await ciGrant((g) => gl.openPullRequest(g, pr()));
    expect(first).toEqual({ number: 40, url: "https://gitlab.com/grp/sub/app/-/merge_requests/40", base: "main", branch: "agent-qa/run-1", draft: true, created: true });
    expect(fake.posts[0]).toMatchObject({ path: "/repository/commits", body: { branch: "agent-qa/run-1", start_sha: sha("a"), actions: [{ action: "create", file_path: "e2e/tests/a.spec.ts", encoding: "base64" }] } });
    expect(fake.posts[1]).toMatchObject({ path: "/merge_requests", body: { source_branch: "agent-qa/run-1", target_branch: "main", title: "Draft: Agent-QA: tests" } });
    expect([...fake.tokens]).toEqual(["glpat-x"]);

    const again = await ciGrant((g) => gl.openPullRequest(g, pr()));
    expect(again).toMatchObject({ number: 40, created: false });
    expect(fake.posts).toHaveLength(2);
    // Other content on the branch: refused.
    await expect(ciGrant((g) => gl.openPullRequest(g, pr({ files: [{ path: "e2e/tests/a.spec.ts", content: "other" }] })))).rejects.toThrow("exists with other commits or files");
    await expect(gl.openPullRequest(undefined as unknown as WriteGrant, pr())).rejects.toBeInstanceOf(PolicyDenied);
  });

  it("checks the base: a new file must be new in any case, a changed file unchanged", async () => {
    const tree = { "": [{ name: "E2E", type: "tree" }, { name: "README", type: "blob" }], E2E: [] };
    await expect(ciGrant((g) => client(fakeGitLab({ tree })).openPullRequest(g, pr()))).rejects.toThrow("differs only in case");
    await expect(ciGrant((g) => client(fakeGitLab({ tree })).openPullRequest(g, pr({ files: [{ path: "readme", content: "x" }] })))).rejects.toThrow("exists on main");
    await expect(ciGrant((g) => client(fakeGitLab({ tree })).openPullRequest(g, pr({ files: [{ path: "README/x.ts", content: "x" }] })))).rejects.toThrow("runs through a file");
    const changed = { path: "e2e/a.ts", content: "new", base: blobId("old") };
    const t2 = { "": [{ name: "e2e", type: "tree" }], e2e: [{ name: "a.ts", type: "blob", mode: "100644" }] };
    const ok = fakeGitLab({ tree: t2, files: { "e2e/a.ts": "old" } });
    await ciGrant((g) => client(ok).openPullRequest(g, pr({ files: [changed] })));
    expect(ok.posts[0]!.body.actions).toEqual([expect.objectContaining({ action: "update", file_path: "e2e/a.ts" })]);
    await expect(ciGrant((g) => client(fakeGitLab({ tree: t2, files: { "e2e/a.ts": "edited" } })).openPullRequest(g, pr({ files: [changed] })))).rejects.toThrow("changed on main since Agent-QA read it");
  });

  it("finds merge requests that name the key as a whole word, by title, branch or commit", async () => {
    const fake = fakeGitLab({
      mrs: [
        { iid: 3, title: "ABC-1 old", state: "merged", source_branch: "x", target_branch: "main" },
        { iid: 4, title: "ABC-12 other", state: "opened", source_branch: "y", target_branch: "main" },
        { iid: 5, title: "Refactor", state: "closed", source_branch: "feature/ABC-1-b", target_branch: "main" },
        { iid: 6, title: "Fix", state: "merged", source_branch: "z", target_branch: "main", sha: sha("c") },
      ],
      commitsList: [{ id: sha("c"), message: "ABC-1: fix the boundary" }, { id: sha("d"), message: "ABC-10" }],
    });
    const found = await client(fake).findPullRequests("ABC-1");
    expect(found.map((p) => [p.id, p.state, p.matchedIn])).toEqual([
      [6, "merged", ["commit"]],
      [5, "closed", ["branch"]],
      [3, "merged", ["title"]],
    ]);
    expect(found[0]!.url).toBe("https://gitlab.com/grp/sub/app/-/merge_requests/6");
    await expect(client(fake).findPullRequests("abc 1")).rejects.toThrow("isn't a Jira issue key");
  });

  it("reads a merge request's diffs, page by page, leaving out large ones and past the cap", async () => {
    const diffs = [
      { new_path: "src/a.ts", old_path: "src/a.ts", diff: "@@ -1 +1 @@\n-a\n+b\n" },
      { new_path: "src/b.ts", old_path: "src/old.ts", renamed_file: true, diff: "" },
      { new_path: "big.bin", old_path: "big.bin", new_file: true, diff: "", too_large: true },
      { new_path: "gone.ts", old_path: "gone.ts", deleted_file: true, diff: "-x\n" },
      ...Array.from({ length: 120 }, (_, i) => ({ new_path: `f${i}.ts`, old_path: `f${i}.ts`, new_file: true, diff: "+y\n".repeat(10) })),
    ];
    const d = await client(fakeGitLab({ diffs })).pullRequestDiff(9, { maxBytes: 100 });
    expect(d.files).toHaveLength(124);
    expect(d.files.slice(0, 4)).toEqual([
      { path: "src/a.ts", status: "modified", patch: "@@ -1 +1 @@\n-a\n+b\n" },
      { path: "src/b.ts", status: "renamed", previousPath: "src/old.ts" },
      { path: "big.bin", status: "added" },
      { path: "gone.ts", status: "removed" },
    ]);
    expect(d.files.filter((f) => f.patch !== undefined)).toHaveLength(3);
    expect(d.truncated).toBe(true);
    await expect(client(fakeGitLab()).pullRequestDiff(0)).rejects.toThrow("isn't a merge request id");
  });

  it("checks the repo path, and reads GitLab CI's branch and API", () => {
    expect(() => new GitLabClient({ repo: "app", token: "t" })).toThrow("full path");
    expect(() => new GitLabClient({ repo: "grp/app.git", token: "t" })).toThrow("full path");
    expect(new GitLabClient({ repo: "grp/app", token: "t", baseUrl: "https://git.example.com/api/v4" }).service).toBe("GitLab");
    expect(prBase({ CI_MERGE_REQUEST_SOURCE_BRANCH_NAME: "feature/x", CI_COMMIT_BRANCH: "main" })).toBe("feature/x");
    expect(prBase({ CI_COMMIT_BRANCH: "develop" })).toBe("develop");
    expect(jobApiOrigin("gitlab", { CI_API_V4_URL: "https://git.example.com/api/v4" })).toBe("https://git.example.com");
  });
});
