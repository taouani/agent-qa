import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GitHubClient } from "../src/connectors/index.js";
import { configSchema, MemoryAuditSink, Policy, PolicyDenied, RunStore, type WriteGrant } from "../src/core/index.js";
import { DataAccess, gitBlobId, prBase, ProfileError } from "../src/data/index.js";
import { MemoryVaultStorage, Vault } from "../src/masking/index.js";

const sha = (t: string) => createHash("sha256").update(t).digest("hex");

/** A GitHub API in memory: commits with trees and parents, branches and pull requests, with every call recorded. */
function fakeGitHub(start: { branches?: Record<string, string>; files?: string[]; blobs?: Record<string, { sha: string; mode: string }>; truncated?: boolean; status?: number } = {}) {
  const commits: Record<string, { tree: string; parents: string[] }> = { c0: { tree: "t0", parents: [] } };
  const trees: Record<string, string[]> = { t0: [...(start.files ?? []), ...Object.keys(start.blobs ?? {})] };
  const entry = (p: string) => ({ path: p, type: "blob", ...start.blobs?.[p] });
  const branches: Record<string, string> = { main: "c0", ...start.branches };
  const pulls: Array<{ number: number; head: string; base: string; draft: boolean; body: string; title: string }> = [];
  const calls: string[] = [];
  const posted: Array<{ path: string; body: Record<string, unknown> }> = [];
  let n = 0;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  /** Whether `a` is `b` or one of its ancestors. */
  const ancestor = (a: string, b: string): boolean => a === b || (commits[b]?.parents ?? []).some((p) => ancestor(a, p));
  const fetch = async (input: string, init: RequestInit) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    const path = decodeURIComponent(url.pathname.replace("/repos/o/r", ""));
    calls.push(`${method} ${path}`);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    if (start.status) return json(start.status, { message: "Resource not accessible by integration" });
    if (method === "GET" && path === "") return json(200, { default_branch: "main" });
    const ref = /^\/git\/ref\/heads\/(.+)$/.exec(path);
    if (method === "GET" && ref) return branches[ref[1]!] ? json(200, { object: { sha: branches[ref[1]!] } }) : json(404, {});
    const commit = /^\/git\/commits\/(.+)$/.exec(path);
    if (method === "GET" && commit) return json(200, { tree: { sha: commits[commit[1]!]!.tree }, parents: commits[commit[1]!]!.parents.map((sha) => ({ sha })) });
    const tree = /^\/git\/trees\/(.+)$/.exec(path);
    if (method === "GET" && tree) {
      // A folder of a tree, as GitHub lists it without `recursive`: "<tree>::<folder>".
      const [id, prefix = ""] = tree[1]!.split("::");
      if (start.truncated && url.searchParams.get("recursive")) return json(200, { truncated: true, tree: [] });
      if (!url.searchParams.get("recursive")) {
        const below = trees[id!]!.filter((p) => p.startsWith(prefix ? `${prefix}/` : "")).map((p) => p.slice(prefix ? prefix.length + 1 : 0));
        const names = [...new Set(below.map((p) => p.split("/")[0]!))];
        return json(200, { tree: names.map((n) => (below.includes(n) ? { ...entry(prefix ? `${prefix}/${n}` : n), path: n } : { path: n, type: "tree", sha: `${id}::${prefix ? `${prefix}/` : ""}${n}` })) });
      }
      return json(200, { truncated: false, tree: trees[id!]!.map(entry) });
    }
    const compare = /^\/compare\/(.+)\.\.\.(.+)$/.exec(path);
    if (method === "GET" && compare) return json(200, { status: compare[1] === compare[2] ? "identical" : ancestor(compare[1]!, compare[2]!) ? "ahead" : "diverged" });
    if (method === "GET" && path === "/pulls") {
      const head = url.searchParams.get("head")!.split(":")[1];
      return json(200, pulls.filter((p) => p.head === head).map((p) => ({ number: p.number, html_url: `https://github.com/o/r/pull/${p.number}`, base: { ref: p.base }, draft: p.draft })));
    }
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    posted.push({ path, body });
    if (path === "/git/trees") {
      // As on GitHub: the tree's id depends on the tree it builds on.
      const added = (body.tree as Array<{ path: string; content: string }>).map((t) => `${t.path}=${t.content}`);
      const id = `t:${body.base_tree as string}+${added.join(",")}`;
      trees[id] = [...trees[body.base_tree as string]!, ...added.map((a) => a.split("=")[0]!)];
      return json(201, { sha: id });
    }
    if (path === "/git/commits") {
      const c = `c${++n}`;
      commits[c] = { tree: body.tree as string, parents: body.parents as string[] };
      return json(201, { sha: c });
    }
    if (path === "/git/refs") {
      branches[(body.ref as string).replace("refs/heads/", "")] = body.sha as string;
      return json(201, {});
    }
    if (path === "/pulls") {
      const p = { number: 40 + pulls.length, head: body.head as string, base: body.base as string, draft: body.draft as boolean, body: body.body as string, title: body.title as string };
      pulls.push(p);
      return json(201, { number: p.number, html_url: `https://github.com/o/r/pull/${p.number}`, draft: p.draft });
    }
    return json(500, {});
  };
  /** Someone pushes to a branch. */
  const push = (branch: string) => {
    const c = `p${++n}`;
    commits[c] = { tree: `tp${n}`, parents: [branches[branch]!] };
    trees[`tp${n}`] = [...trees[commits[branches[branch]!]!.tree]!, `other${n}.ts`];
    branches[branch] = c;
  };
  return { fetch, branches, pulls, calls, posted, push };
}

const ciGrant = async <T>(fn: (g: WriteGrant) => Promise<T>) => {
  const r = await new Policy({ mode: "ci", rules: { xray: "ask", confluence: "ask", testCode: "ask", jira: "ask", commands: "ask" }, audit: new MemoryAuditSink() }).guard({ target: "testCode", summary: "pr" }, fn);
  if (r.status !== "done") throw new Error("declined");
  return r.value;
};

describe("GitHubClient", () => {
  const pr = { branch: "agent-qa/run-1", files: [{ path: "tests/a.spec.ts", content: "test('a')\n" }], message: "m", title: "Agent-QA: tests", body: "b", draft: true };

  it("makes one commit of new files on a new branch, and a pull request from it into the base", async () => {
    const gh = fakeGitHub();
    const client = new GitHubClient({ repo: "o/r", token: "tok", fetch: gh.fetch, retries: 0 });
    const opened = await ciGrant((g) => client.openPullRequest(g, pr));
    expect(opened).toEqual({ number: 40, url: "https://github.com/o/r/pull/40", base: "main", branch: "agent-qa/run-1", draft: true, created: true });
    expect(gh.posted.map((p) => p.path)).toEqual(["/git/trees", "/git/commits", "/git/refs", "/pulls"]);
    expect(gh.posted[0]!.body).toMatchObject({ base_tree: "t0", tree: [{ path: "tests/a.spec.ts", mode: "100644", type: "blob", content: "test('a')\n" }] });
    expect(gh.posted[1]!.body).toMatchObject({ parents: ["c0"] });
    expect(gh.pulls[0]).toMatchObject({ head: "agent-qa/run-1", base: "main", draft: true });
    expect(gh.branches.main).toBe("c0"); // the base branch never moves

    // Again for the same run (a stop after the branch): the branch and the open pull request are taken as they are.
    const again = await ciGrant((g) => client.openPullRequest(g, pr));
    expect(again).toMatchObject({ number: 40, created: false });
    expect(gh.pulls).toHaveLength(1);
    expect(gh.posted.filter((p) => p.path === "/git/commits")).toHaveLength(1);
    // An open pull request into another base isn't this one.
    await expect(ciGrant((g) => client.openPullRequest(g, { ...pr, base: "develop" }))).rejects.toThrow();
  });

  it("goes on after a stop between the branch and the pull request, even when the base moved since", async () => {
    const gh = fakeGitHub();
    const client = new GitHubClient({ repo: "o/r", token: "tok", fetch: gh.fetch, retries: 0 });
    // The branch from the first try, made by hand as the client makes it.
    await ciGrant(async (g) => {
      const tree = (await client.http.request<{ sha: string }>("/repos/o/r/git/trees", { method: "POST", grant: g, body: { base_tree: "t0", tree: [{ path: "tests/a.spec.ts", mode: "100644", type: "blob", content: "test('a')\n" }] } })).sha;
      const c = (await client.http.request<{ sha: string }>("/repos/o/r/git/commits", { method: "POST", grant: g, body: { message: "m", tree, parents: ["c0"] } })).sha;
      await client.http.request("/repos/o/r/git/refs", { method: "POST", grant: g, body: { ref: "refs/heads/agent-qa/run-1", sha: c } });
    });
    gh.push("main");
    expect(await ciGrant((g) => client.openPullRequest(g, pr))).toMatchObject({ number: 40, created: true });
    expect(gh.posted.filter((p) => p.path === "/git/commits")).toHaveLength(1);
    // A branch whose commit holds other files, or sits on no commit of the base, is never taken.
    await expect(ciGrant((g) => client.openPullRequest(g, { ...pr, branch: "agent-qa/run-1", files: [{ path: "tests/a.spec.ts", content: "other" }] }))).rejects.toThrow(/exists with other commits or files/);
  });

  it("asks for a plain pull request where drafts aren't available, and never puts the token in an error", async () => {
    const denied = fakeGitHub({ status: 403 });
    const client = new GitHubClient({ repo: "o/r", token: "tok", fetch: denied.fetch, retries: 0 });
    const error = await ciGrant((g) => client.openPullRequest(g, pr)).catch((e: unknown) => e as Error);
    expect(error).toMatchObject({ code: "FORBIDDEN" });
    expect(JSON.stringify(error) + String((error as Error).message) + String((error as Error).stack)).not.toContain("tok");
  });

  it("refuses a file that exists on the base, a branch with other files, and a write without a grant", async () => {
    const gh = fakeGitHub({ files: ["tests/A.spec.ts", "tests/x"] });
    const client = new GitHubClient({ repo: "o/r", token: "tok", fetch: gh.fetch, retries: 0 });
    await expect(ciGrant((g) => client.openPullRequest(g, { ...pr, base: "main" }))).rejects.toThrow(/tests\/a\.spec\.ts exists on main: a new file must not be there yet/);
    await expect(ciGrant((g) => client.openPullRequest(g, { ...pr, files: [{ path: "tests/x/b.ts", content: "" }] }))).rejects.toThrow(/runs through a file on main/);
    expect(gh.posted).toEqual([]);

    const taken = fakeGitHub({ branches: { "agent-qa/run-1": "c0" } });
    const other = new GitHubClient({ repo: "o/r", token: "tok", fetch: taken.fetch, retries: 0 });
    await expect(ciGrant((g) => other.openPullRequest(g, pr))).rejects.toThrow(/exists with other commits or files/);
    expect(taken.posted).toEqual([]);

    await expect(other.openPullRequest(undefined as unknown as WriteGrant, pr)).rejects.toBeInstanceOf(PolicyDenied);
    await expect(ciGrant((g) => other.openPullRequest(g, { ...pr, branch: "../x" }))).rejects.toThrow(/isn't a branch name/);
    expect(() => new GitHubClient({ repo: "nope", token: "t" })).toThrow(/owner\/name/);
  });
});

describe("GitHubClient: changed files (S3-1)", () => {
  const blob = "0123456789abcdef0123456789abcdef01234567";
  const pr = { branch: "agent-qa/run-2", files: [{ path: "tests/a.spec.ts", content: "test('fixed')\n", base: blob }], message: "m", title: "t", body: "b", draft: true };

  it("changes a file the base still holds as it was read, keeping its mode, from the whole tree or folder by folder", async () => {
    for (const truncated of [false, true]) {
      const gh = fakeGitHub({ blobs: { "tests/a.spec.ts": { sha: blob, mode: "100755" } }, truncated });
      const client = new GitHubClient({ repo: "o/r", token: "tok", fetch: gh.fetch, retries: 0 });
      expect(await ciGrant((g) => client.openPullRequest(g, pr))).toMatchObject({ number: 40, created: true });
      expect(gh.posted[0]!.body).toMatchObject({ base_tree: "t0", tree: [{ path: "tests/a.spec.ts", mode: "100755", content: "test('fixed')\n" }] });
      // Again for the same run: the branch's one commit writes these very files.
      expect(await ciGrant((g) => client.openPullRequest(g, pr))).toMatchObject({ number: 40, created: false });
    }
  });

  it("refuses a changed file the base no longer holds as read, a link, or one that is gone", async () => {
    const cases: Array<[Record<string, { sha: string; mode: string }>, RegExp]> = [
      [{ "tests/a.spec.ts": { sha: "f".repeat(40), mode: "100644" } }, /changed on main since Agent-QA read it/],
      [{ "tests/a.spec.ts": { sha: blob, mode: "120000" } }, /isn't a plain file on main/],
      [{ "tests/b.spec.ts": { sha: blob, mode: "100644" } }, /isn't on main any more/],
    ];
    for (const truncated of [false, true]) {
      for (const [blobs, error] of cases) {
        const gh = fakeGitHub({ blobs, truncated });
        const client = new GitHubClient({ repo: "o/r", token: "tok", fetch: gh.fetch, retries: 0 });
        await expect(ciGrant((g) => client.openPullRequest(g, pr))).rejects.toThrow(error);
        expect(gh.posted).toEqual([]);
      }
    }
    // A new file is still checked folder by folder when the tree is too large.
    const gh = fakeGitHub({ blobs: { "tests/a.spec.ts": { sha: blob, mode: "100644" } }, truncated: true });
    const client = new GitHubClient({ repo: "o/r", token: "tok", fetch: gh.fetch, retries: 0 });
    await expect(ciGrant((g) => client.openPullRequest(g, { ...pr, files: [{ path: "tests/a.spec.ts", content: "x" }] }))).rejects.toThrow(/exists on main: a new file must not be there yet/);
  });
});

describe("DataAccess: pull requests from CI", () => {
  let dir: string;
  const vaults = new MemoryVaultStorage();
  const key = Buffer.alloc(32, 7);
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-pr-"));
    await mkdir(join(dir, ".git"));
    await mkdir(join(dir, "e2e", "tests"), { recursive: true });
    await writeFile(join(dir, "e2e", "agent-qa.yaml"), "");
    await writeFile(join(dir, "e2e", "agent-qa.profile.json"), JSON.stringify({ version: 1, folder: ".", kind: "playwright", commands: { test: ["npx", "playwright", "test"] }, reviewedAt: "2026-11-05T00:00:00.000Z" }));
    await writeFile(join(dir, "e2e", "tests", "a.spec.ts"), "test('a')\n");
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const data = (over: { mode?: "ci" | "ide"; git?: boolean; env?: NodeJS.ProcessEnv; github?: ReturnType<typeof fakeGitHub> } = {}) => {
    const gh = over.github ?? fakeGitHub();
    const d = new DataAccess({
      root: join(dir, "e2e"),
      store: new RunStore(join(dir, "e2e", ".agent-qa", "runs")),
      config: configSchema.parse({ version: 1, ...(over.git === false ? {} : { git: { platform: "github", repo: "o/r", token: "${env:GH_TOKEN}" } }) }),
      vault: new Vault({ storage: vaults, keys: { description: "t", getKey: async () => key } }),
      audit: new MemoryAuditSink(),
      env: { GH_TOKEN: "tok", ...over.env },
      secrets: { env: { GH_TOKEN: "tok" } },
      fetch: gh.fetch,
      mode: over.mode ?? "ci",
    });
    return { d, gh };
  };
  const files = [{ path: "tests/a.spec.ts", sha256: sha("test('a')\n") }];

  it("sends what Agent-QA wrote, from the repo root, into the branch CI checked out", async () => {
    const { d, gh } = data({ env: { GITHUB_HEAD_REF: "feature/x", GITHUB_BASE_REF: "main" }, github: fakeGitHub({ branches: { "feature/x": "c0" } }) });
    expect(await d.pullRequestReadiness()).toEqual({ ready: true, repo: "o/r" });
    const r = await d.openPullRequest("2026-11-05-ABC-1-x1", "2026-11-05-ABC-1-x1", ".", { files, title: "Agent-QA: tests for jane.doe@example.com", body: "Ask jane.doe@example.com or @team, ![x](https://evil.example/p.png) <PERSON_1>", draft: false });
    expect(r).toMatchObject({ status: "done", number: 40, base: "feature/x", branch: "agent-qa/2026-11-05-ABC-1-x1", draft: false, created: true });
    expect(gh.posted[0]!.body).toMatchObject({ tree: [{ path: "e2e/tests/a.spec.ts", content: "test('a')\n" }] });
    // Title and body are masked again before they leave, and the body mentions, links and tags nothing.
    expect(gh.pulls[0]!.title).not.toContain("jane.doe@example.com");
    expect(gh.pulls[0]!.body).not.toContain("jane.doe@example.com");
    expect(gh.pulls[0]!.body).not.toMatch(/@team|!\[x\]|<PERSON_1>/);
    expect(gh.pulls[0]!.body).toContain("\\<PERSON_1\\>");
  });

  it("sends a changed test file with the blob it was read as, and refuses a bad blob id", async () => {
    const blob = gitBlobId(Buffer.from("test('a')\n"));
    const gh = fakeGitHub({ blobs: { "e2e/tests/a.spec.ts": { sha: blob, mode: "100644" } } });
    const { d } = data({ github: gh });
    const [read] = await d.readTestFiles("r", "r", ".", ["tests/a.spec.ts"]);
    expect(read!.gitBlob).toBe(blob);
    const edit = await d.editTestFiles("r", "r", ".", [{ path: "tests/a.spec.ts", content: "test('fixed')\n", sha256: read!.sha256 }], true);
    if (edit.status !== "done") throw new Error("declined");
    expect(edit.pullRequest).toBe(true);
    const r = await d.openPullRequest("r", "r", ".", { files: edit.written.map((w) => ({ ...w, gitBlob: read!.gitBlob })), title: "t", body: "b", draft: true });
    expect(r).toMatchObject({ status: "done", number: 40 });
    expect(gh.posted[0]!.body).toMatchObject({ tree: [{ path: "e2e/tests/a.spec.ts", mode: "100644", content: "test('fixed')\n" }] });
    await expect(d.openPullRequest("r2", "r", ".", { files: edit.written.map((w) => ({ ...w, gitBlob: "nope" })), title: "t", body: "b", draft: true })).rejects.toThrow(/not a git blob id/);
  });

  it("goes into the branch the job's code came from", () => {
    expect(prBase({ GITHUB_HEAD_REF: "feature/x", GITHUB_BASE_REF: "main", GITHUB_REF: "refs/pull/3/merge" })).toBe("feature/x");
    expect(prBase({ GITHUB_REF: "refs/heads/develop" })).toBe("develop");
    expect(prBase({ GITHUB_REF: "refs/tags/v1" })).toBeUndefined();
    expect(prBase({ GITHUB_HEAD_REF: "", GITHUB_REF: "refs/heads/gh-readonly-queue/main/pr-3-abc" })).toBeUndefined();
    expect(prBase({})).toBeUndefined();
  });

  it("sends no link, no file outside the folder, and the token only to the job's own API", async () => {
    await mkdir(join(dir, ".github"), { recursive: true });
    await writeFile(join(dir, ".github", "x.yml"), "test('a')\n");
    await rm(join(dir, "e2e", "tests", "a.spec.ts"));
    await symlink(join(dir, ".github", "x.yml"), join(dir, "e2e", "tests", "a.spec.ts"));
    const { d, gh } = data();
    await expect(d.openPullRequest("r", "r", ".", { files, title: "t", body: "b", draft: true })).rejects.toThrow(/isn't a plain file/);
    await rm(join(dir, "e2e", "tests", "a.spec.ts"));
    await symlink(join(dir, ".github"), join(dir, "e2e", "tests", "linked"), "dir");
    await expect(d.openPullRequest("r", "r", ".", { files: [{ path: "tests/linked/x.yml", sha256: files[0]!.sha256 }], title: "t", body: "b", draft: true })).rejects.toThrow(/outside the approved folder/);
    expect(gh.posted).toEqual([]);
    await writeFile(join(dir, "e2e", "tests", "a.spec.ts"), "test('a')\n");
    await expect(data({ env: { GITHUB_API_URL: "https://ghe.example.com/api/v3" } }).d.openPullRequest("r", "r", ".", { files, title: "t", body: "b", draft: true })).rejects.toThrow(/isn't the API this job runs against/);
    expect(() => configSchema.parse({ version: 1, git: { platform: "github", repo: "o/r", token: "${env:T}", baseUrl: "http://ghe.example.com/api/v3" } })).toThrow();
    const refused = data({ github: fakeGitHub({ status: 403 }) });
    await expect(refused.d.openPullRequest("r", "r", ".", { files, title: "t", body: "b", draft: true })).rejects.toThrow(/pull-requests: write/);
  });

  it("refuses outside CI, without a git section, and a file changed since Agent-QA wrote it", async () => {
    expect(await data({ mode: "ide" }).d.pullRequestReadiness()).toMatchObject({ ready: false, reason: expect.stringContaining("from CI only") });
    expect(await data({ git: false }).d.pullRequestReadiness()).toMatchObject({ ready: false, reason: expect.stringContaining("no git section") });
    await expect(data({ git: false }).d.openPullRequest("r", "r", ".", { files, title: "t", body: "b", draft: true })).rejects.toBeInstanceOf(ProfileError);
    await writeFile(join(dir, "e2e", "tests", "a.spec.ts"), "test('b')\n");
    const { d, gh } = data();
    await expect(d.openPullRequest("r", "r", ".", { files, title: "t", body: "b", draft: true })).rejects.toThrow(/changed since Agent-QA wrote it/);
    await expect(d.openPullRequest("r", "r", ".", { files: [{ path: "package.json", sha256: sha("") }], title: "t", body: "b", draft: true })).rejects.toThrow(/never writes/);
    expect(gh.posted).toEqual([]);
  });
});
