import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GitHubClient } from "../src/connectors/index.js";
import { configSchema, MemoryAuditSink, Policy, PolicyDenied, RunStore, type WriteGrant } from "../src/core/index.js";
import { DataAccess, ProfileError } from "../src/data/index.js";
import { MemoryVaultStorage, Vault } from "../src/masking/index.js";

const sha = (t: string) => createHash("sha256").update(t).digest("hex");

/** A GitHub API in memory: branches, trees and pull requests, with every call recorded. */
function fakeGitHub(start: { branches?: Record<string, string>; files?: string[] } = {}) {
  const branches: Record<string, string> = { main: "c0", ...start.branches };
  const trees: Record<string, string> = { c0: "t0" };
  const onBase = new Set(start.files ?? []);
  const pulls: Array<{ number: number; head: string; base: string; draft: boolean; body: string; title: string }> = [];
  const calls: string[] = [];
  const posted: Array<{ path: string; body: Record<string, unknown> }> = [];
  let n = 0;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetch = async (input: string, init: RequestInit) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    const path = decodeURIComponent(url.pathname.replace("/repos/o/r", ""));
    calls.push(`${method} ${path}`);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    if (method === "GET" && path === "") return json(200, { default_branch: "main" });
    const ref = /^\/git\/ref\/heads\/(.+)$/.exec(path);
    if (method === "GET" && ref) return branches[ref[1]!] ? json(200, { object: { sha: branches[ref[1]!] } }) : json(404, {});
    const commit = /^\/git\/commits\/(.+)$/.exec(path);
    if (method === "GET" && commit) return json(200, { tree: { sha: trees[commit[1]!] } });
    const contents = /^\/contents\/(.+)$/.exec(path);
    if (method === "GET" && contents) return onBase.has(contents[1]!) ? json(200, {}) : json(404, {});
    if (method === "GET" && path === "/pulls") {
      const head = url.searchParams.get("head")!.split(":")[1];
      return json(200, pulls.filter((p) => p.head === head).map((p) => ({ number: p.number, html_url: `https://github.com/o/r/pull/${p.number}`, base: { ref: p.base }, draft: p.draft })));
    }
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    posted.push({ path, body });
    if (path === "/git/trees") return json(201, { sha: `t:${JSON.stringify((body.tree as Array<{ path: string; content: string }>).map((t) => [t.path, t.content]))}` });
    if (path === "/git/commits") {
      const c = `c${++n}`;
      trees[c] = body.tree as string;
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
  return { fetch, branches, pulls, calls, posted, trees };
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
  });

  it("refuses a file that exists on the base, a branch with other files, and a write without a grant", async () => {
    const gh = fakeGitHub({ files: ["tests/a.spec.ts"] });
    const client = new GitHubClient({ repo: "o/r", token: "tok", fetch: gh.fetch, retries: 0 });
    await expect(ciGrant((g) => client.openPullRequest(g, { ...pr, base: "main" }))).rejects.toThrow(/tests\/a\.spec\.ts exists on main: Agent-QA only adds new files/);
    expect(gh.posted).toEqual([]);

    const taken = fakeGitHub({ branches: { "agent-qa/run-1": "c0" } });
    const other = new GitHubClient({ repo: "o/r", token: "tok", fetch: taken.fetch, retries: 0 });
    await expect(ciGrant((g) => other.openPullRequest(g, pr))).rejects.toThrow(/exists with other files/);
    expect(taken.posted.map((p) => p.path)).toEqual(["/git/trees"]);

    await expect(other.openPullRequest(undefined as unknown as WriteGrant, pr)).rejects.toBeInstanceOf(PolicyDenied);
    await expect(ciGrant((g) => other.openPullRequest(g, { ...pr, branch: "../x" }))).rejects.toThrow(/isn't a branch name/);
    expect(() => new GitHubClient({ repo: "nope", token: "t" })).toThrow(/owner\/name/);
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
    const { d, gh } = data({ env: { GITHUB_BASE_REF: "develop" }, github: fakeGitHub({ branches: { develop: "c0" } }) });
    expect(await d.pullRequestReadiness()).toEqual({ ready: true, repo: "o/r" });
    const r = await d.openPullRequest("2026-11-05-ABC-1-x1", "2026-11-05-ABC-1-x1", ".", { files, title: "Agent-QA: tests for TC-ABC-1-001", body: "Ask jane.doe@example.com", draft: false });
    expect(r).toMatchObject({ status: "done", number: 40, base: "develop", branch: "agent-qa/2026-11-05-ABC-1-x1", draft: false, created: true });
    expect(gh.posted[0]!.body).toMatchObject({ tree: [{ path: "e2e/tests/a.spec.ts", content: "test('a')\n" }] });
    // The body is masked again before it leaves.
    expect(gh.pulls[0]!.body).not.toContain("jane.doe@example.com");
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
