import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AzureDevOpsClient, createGitHost, unifiedDiff } from "../src/connectors/index.js";
import { configSchema, MemoryAuditSink, Policy, RunStore, type WriteGrant } from "../src/core/index.js";
import { DataAccess, jobApiOrigin, prBase } from "../src/data/index.js";
import { MemoryVaultStorage, Vault } from "../src/masking/index.js";

const ciGrant = async <T>(fn: (g: WriteGrant) => Promise<T>) => {
  const r = await new Policy({ mode: "ci", rules: { xray: "ask", confluence: "ask", testCode: "ask", jira: "ask", commands: "ask" }, audit: new MemoryAuditSink() }).guard({ target: "testCode", summary: "pr" }, fn);
  if (r.status !== "done") throw new Error("declined");
  return r.value;
};
const blobId = (t: string) => createHash("sha1").update(`blob ${Buffer.byteLength(t)}\0`).update(t).digest("hex");
const sha = (c: string) => c.repeat(40);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ROOT = "/org/My%20Project/_apis/git/repositories/repo";

/** An Azure DevOps Git API in memory for org/My Project/repo, with every call recorded. */
function fakeAdo(start: { tree?: Array<{ relativePath: string; gitObjectType: string; objectId?: string; mode?: string }>; status?: number } = {}) {
  const branches: Record<string, string> = { "refs/heads/main": sha("a") };
  const commits: Record<string, { parents: string[]; treeId: string; changes: Array<{ item: { path: string; objectId: string } }> }> = { [sha("a")]: { parents: [], treeId: sha("e"), changes: [] } };
  const pulls: Array<Record<string, unknown>> = [];
  const pushes: Array<Record<string, unknown>> = [];
  const calls: string[] = [];
  const auths = new Set<string>();
  let n = 0;
  const fetch = async (input: string, init: RequestInit) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    auths.add((init.headers as Record<string, string>).authorization!);
    expect(url.searchParams.get("api-version")).toBe("7.1");
    if (!url.pathname.startsWith(ROOT)) return json(404, {});
    const path = url.pathname.slice(ROOT.length);
    calls.push(`${method} ${path}`);
    if (start.status) return json(start.status, {});
    if (method === "GET" && path === "") return json(200, { defaultBranch: "refs/heads/main" });
    if (method === "GET" && path === "/refs") {
      const prefix = `refs/${url.searchParams.get("filter")}`;
      return json(200, { value: Object.entries(branches).filter(([name]) => name.startsWith(prefix)).map(([name, objectId]) => ({ name, objectId })) });
    }
    const commit = /^\/commits\/([0-9a-f]{40})(\/changes)?$/.exec(path);
    if (method === "GET" && commit) {
      const c = commits[commit[1]!]!;
      return commit[2] ? json(200, { changes: c.changes }) : json(200, { treeId: c.treeId, parents: c.parents });
    }
    if (method === "GET" && /^\/trees\//.test(path)) return json(200, { treeEntries: start.tree ?? [{ relativePath: "e2e", gitObjectType: "tree" }] });
    if (method === "GET" && path === "/diffs/commits") return json(200, { behindCount: url.searchParams.get("baseVersion") === sha("a") ? 0 : 3 });
    if (method === "GET" && path === "/pullrequests") {
      const source = url.searchParams.get("searchCriteria.sourceRefName");
      return json(200, { value: pulls.filter((p) => !source || (p.sourceRefName === source && p.status === "active")) });
    }
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    if (path === "/pushes") {
      pushes.push(body);
      const c = sha(String(++n));
      const commit = (body.commits as Array<{ parents: string[]; changes: Array<{ item: { path: string }; newContent: { content: string } }> }>)[0]!;
      commits[c] = { parents: commit.parents, treeId: sha("f"), changes: commit.changes.map((ch) => ({ item: { path: ch.item.path, objectId: blobId(Buffer.from(ch.newContent.content, "base64").toString("utf8")) } })) };
      branches[(body.refUpdates as Array<{ name: string }>)[0]!.name] = c;
      return json(201, { commits: [{ commitId: c }] });
    }
    if (path === "/pullrequests") {
      const p = { pullRequestId: 70 + pulls.length, status: "active", isDraft: body.isDraft, ...body };
      pulls.push(p);
      return json(201, p);
    }
    return json(404, {});
  };
  return { fetch, calls, pushes, pulls, branches, commits, auths };
}

const files = [{ path: "e2e/tests/a.spec.ts", content: "test('a')\n" }];
const pr = (over: Record<string, unknown> = {}) => ({ branch: "agent-qa/run-1", files, message: "Agent-QA: tests", title: "Agent-QA: tests", body: "b", draft: true, ...over });

describe("Azure DevOps (S4-2)", () => {
  it("opens a pull request through one push, with a PAT, and takes the same branch again after a stop halfway", async () => {
    const ado = fakeAdo();
    const client = new AzureDevOpsClient({ repo: "org/My Project/repo", token: "pat", fetch: ado.fetch });
    const opened = await ciGrant((g) => client.openPullRequest(g, pr()));
    expect(opened).toEqual({ number: 70, url: "https://dev.azure.com/org/My%20Project/_git/repo/pullrequest/70", base: "main", branch: "agent-qa/run-1", draft: true, created: true });
    expect([...ado.auths]).toEqual([`Basic ${Buffer.from(":pat").toString("base64")}`]);
    expect(ado.pushes[0]).toEqual({
      refUpdates: [{ name: "refs/heads/agent-qa/run-1", oldObjectId: "0".repeat(40) }],
      commits: [{ comment: "Agent-QA: tests", parents: [sha("a")], changes: [{ changeType: "add", item: { path: "/e2e/tests/a.spec.ts" }, newContent: { content: Buffer.from("test('a')\n").toString("base64"), contentType: "base64encoded" } }] }],
    });
    expect(ado.pulls[0]).toMatchObject({ sourceRefName: "refs/heads/agent-qa/run-1", targetRefName: "refs/heads/main", isDraft: true });
    // Again: the branch holds exactly these files on the base, and its pull request is open.
    expect(await ciGrant((g) => client.openPullRequest(g, pr()))).toMatchObject({ number: 70, created: false });
    expect(ado.pushes).toHaveLength(1);
    // Other content on the branch: refused, nothing pushed.
    await expect(ciGrant((g) => client.openPullRequest(g, pr({ files: [{ path: "e2e/tests/a.spec.ts", content: "other" }] })))).rejects.toThrow("exists with other commits or files: delete it on Azure DevOps");
    expect(ado.pushes).toHaveLength(1);
  });

  it("checks the base: a new file must be new in any case, a changed one must hold what was read; descriptions are cut to 4000", async () => {
    const blob = blobId("old\n");
    const ado = fakeAdo({ tree: [{ relativePath: "e2e", gitObjectType: "tree" }, { relativePath: "e2e/tests/A.spec.ts", gitObjectType: "blob", objectId: blob, mode: "100644" }] });
    const client = new AzureDevOpsClient({ repo: "org/My Project/repo", token: "pat", fetch: ado.fetch });
    await expect(ciGrant((g) => client.openPullRequest(g, pr()))).rejects.toThrow("exists on main: a new file must not be there yet");
    await expect(ciGrant((g) => client.openPullRequest(g, pr({ files: [{ path: "e2e/tests/A.spec.ts", content: "new\n", base: blobId("other\n") }] })))).rejects.toThrow("changed on main since Agent-QA read it");
    const edited = await ciGrant((g) => client.openPullRequest(g, pr({ files: [{ path: "e2e/tests/A.spec.ts", content: "new\n", base: blob }], body: "x".repeat(5000) })));
    expect(edited.created).toBe(true);
    expect((ado.pushes[0]!.commits as Array<{ changes: Array<{ changeType: string }> }>)[0]!.changes[0]!.changeType).toBe("edit");
    expect(String(ado.pulls[0]!.description).length).toBeLessThanOrEqual(4000);
    expect(String(ado.pulls[0]!.description)).toContain("Azure DevOps keeps 4000 characters");
  });

  it("takes organization/project/repository only, and is made for git.platform azure-devops", () => {
    for (const bad of ["org/repo", "org/p/r/x", "org/ p/r", "o?x/p/r"]) expect(() => new AzureDevOpsClient({ repo: bad, token: "t" }), bad).toThrow("organization/project/repository");
    expect(createGitHost({ platform: "azure-devops", repo: "org/p/r" }, "t").service).toBe("Azure DevOps");
  });

  it("finds pull requests by title, description, branch and commit, the commit query sent as a read", async () => {
    const calls: string[] = [];
    const fetch = async (input: string, init: RequestInit) => {
      const url = new URL(input);
      const path = url.pathname.slice(ROOT.length);
      calls.push(`${init.method ?? "GET"} ${path}`);
      if (path === "/pullrequests")
        return json(200, {
          value: [
            { pullRequestId: 12, title: "ABC-1 login", status: "completed", sourceRefName: "refs/heads/feature/ABC-1", targetRefName: "refs/heads/main" },
            { pullRequestId: 13, title: "Docs", description: "for ABC-1", status: "active", sourceRefName: "refs/heads/docs", targetRefName: "refs/heads/main" },
            { pullRequestId: 14, title: "ABC-11", status: "abandoned", sourceRefName: "refs/heads/x", targetRefName: "refs/heads/main" },
          ],
        });
      if (path === "/commits") return json(200, { value: [{ commitId: sha("c"), comment: "ABC-1 fix" }, { commitId: sha("d"), comment: "ABC-12" }] });
      if (path === "/pullrequestquery") {
        expect(JSON.parse(String(init.body))).toEqual({ queries: [{ type: "commit", items: [sha("c")] }] });
        return json(200, { results: [{ [sha("c")]: [{ pullRequestId: 9, title: "Hotfix", status: "abandoned", sourceRefName: "refs/heads/hotfix", targetRefName: "refs/heads/main" }] }] });
      }
      return json(404, {});
    };
    const client = new AzureDevOpsClient({ repo: "org/My Project/repo", token: "pat", fetch });
    expect(await client.findPullRequests("ABC-1")).toEqual([
      { id: 13, url: "https://dev.azure.com/org/My%20Project/_git/repo/pullrequest/13", title: "Docs", sourceBranch: "docs", targetBranch: "main", state: "open", matchedIn: ["description"] },
      { id: 12, url: "https://dev.azure.com/org/My%20Project/_git/repo/pullrequest/12", title: "ABC-1 login", sourceBranch: "feature/ABC-1", targetBranch: "main", state: "merged", matchedIn: ["title", "branch"] },
      { id: 9, url: "https://dev.azure.com/org/My%20Project/_git/repo/pullrequest/9", title: "Hotfix", sourceBranch: "hotfix", targetBranch: "main", state: "closed", matchedIn: ["commit"] },
    ]);
    expect(calls).toContain("POST /pullrequestquery");
    await expect(client.findPullRequests("abc-1")).rejects.toThrow("isn't a Jira issue key");
  });

  it("makes each changed file's patch from both sides of the latest iteration, under the cap", async () => {
    const blobs: Record<string, string> = { [sha("1")]: "a\nb\nc\n", [sha("2")]: "a\nB\nc\n", [sha("3")]: "new\n", [sha("4")]: "bin\0ary", [sha("5")]: "x\n".repeat(400) };
    const fetch = async (input: string) => {
      const url = new URL(input);
      const path = url.pathname.slice(ROOT.length);
      if (path === "/pullrequests/5/iterations") return json(200, { value: [{ id: 1 }, { id: 3 }, { id: 2 }] });
      if (path === "/pullrequests/5/iterations/3/changes")
        return json(200, {
          changeEntries: [
            { changeType: "edit", item: { path: "/src/a.ts", objectId: sha("2"), originalObjectId: sha("1") } },
            { changeType: "add", item: { path: "/src/new.ts", objectId: sha("3") } },
            { changeType: "delete", item: { path: "/src/gone.ts", originalObjectId: sha("1") } },
            { changeType: "edit, rename", item: { path: "/src/b.ts", objectId: sha("2"), originalObjectId: sha("1") }, originalPath: "/src/old-b.ts" },
            { changeType: "edit", item: { path: "/img.png", objectId: sha("4"), originalObjectId: sha("1") } },
            { changeType: "add", item: { path: "/big.txt", objectId: sha("5") } },
            { changeType: "add", item: { path: "/src", isFolder: true } },
          ],
        });
      const blob = /^\/blobs\/([0-9a-f]{40})$/.exec(path);
      if (blob) return new Response(blobs[blob[1]!]!, { status: 200 });
      return json(404, {});
    };
    const client = new AzureDevOpsClient({ repo: "org/My Project/repo", token: "pat", fetch });
    const diff = await client.pullRequestDiff(5, { maxBytes: 300 });
    expect(diff.files).toEqual([
      { path: "src/a.ts", status: "modified", patch: "@@ -1,3 +1,3 @@\n a\n-b\n+B\n c" },
      { path: "src/new.ts", status: "added", patch: "@@ -0,0 +1,1 @@\n+new" },
      { path: "src/gone.ts", status: "removed" },
      { path: "src/b.ts", status: "renamed", previousPath: "src/old-b.ts", patch: "@@ -1,3 +1,3 @@\n a\n-b\n+B\n c" },
      { path: "img.png", status: "modified" },
      { path: "big.txt", status: "added" },
    ]);
    expect(diff.truncated).toBe(true);
  });

  it("writes a unified diff git can read", () => {
    expect(unifiedDiff("same\n", "same\n")).toBe("");
    expect(unifiedDiff("", "a\n")).toBe("@@ -0,0 +1,1 @@\n+a");
    expect(unifiedDiff("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n", "1\nX\n3\n4\n5\n6\n7\n8\nY\n10\n")).toBe("@@ -1,10 +1,10 @@\n 1\n-2\n+X\n 3\n 4\n 5\n 6\n 7\n 8\n-9\n+Y\n 10");
    expect(unifiedDiff("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n", "X\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\nY\n")).toBe("@@ -1,4 +1,4 @@\n-1\n+X\n 2\n 3\n 4\n@@ -9,4 +9,4 @@\n 9\n 10\n 11\n-12\n+Y");
    expect(unifiedDiff("a\0", "b")).toBeUndefined();
  });

  it("reads Azure Pipelines' branch and API, and accepts an old visualstudio.com collection", () => {
    expect(prBase({ SYSTEM_PULLREQUEST_SOURCEBRANCH: "refs/heads/feature/x", BUILD_SOURCEBRANCH: "refs/pull/4/merge" })).toBe("feature/x");
    expect(prBase({ BUILD_SOURCEBRANCH: "refs/heads/develop" })).toBe("develop");
    expect(prBase({ BUILD_SOURCEBRANCH: "refs/tags/v1" })).toBeUndefined();
    expect(jobApiOrigin("azure-devops", { SYSTEM_COLLECTIONURI: "https://dev.azure.com/org/" })).toBe("https://dev.azure.com");
    expect(jobApiOrigin("azure-devops", { SYSTEM_COLLECTIONURI: "https://org.visualstudio.com/" })).toBe("https://dev.azure.com");
    expect(jobApiOrigin("azure-devops", { SYSTEM_COLLECTIONURI: "https://ado.corp.example/tfs/" })).toBe("https://ado.corp.example");
    expect(jobApiOrigin("azure-devops", {})).toBeUndefined();
    expect(jobApiOrigin("github", { SYSTEM_COLLECTIONURI: "https://x.example/" })).toBeUndefined();
  });

  describe("from the data layer", () => {
    let dir: string;
    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "agent-qa-ado-"));
      await mkdir(join(dir, ".git"));
      await mkdir(join(dir, "e2e", "tests"), { recursive: true });
    });
    afterEach(() => rm(dir, { recursive: true, force: true }));

    const data = (env: NodeJS.ProcessEnv, fetch: ReturnType<typeof fakeAdo>["fetch"]) =>
      new DataAccess({
        root: join(dir, "e2e"),
        store: new RunStore(join(dir, "e2e", ".agent-qa", "runs")),
        config: configSchema.parse({ version: 1, git: { platform: "azure-devops", repo: "org/My Project/repo", token: "${env:ADO_PAT}" } }),
        vault: new Vault({ storage: new MemoryVaultStorage(), keys: { description: "t", getKey: async () => Buffer.alloc(32, 1) } }),
        audit: new MemoryAuditSink(),
        env,
        secrets: { env: { ADO_PAT: "pat" } },
        fetch,
        mode: "ci",
      });

    it("is ready on Azure DevOps in CI, not yet on GitLab", async () => {
      expect(await data({}, fakeAdo().fetch).pullRequestReadiness()).toEqual({ ready: true, repo: "org/My Project/repo" });
      const gitlab = new DataAccess({
        root: join(dir, "e2e"),
        store: new RunStore(join(dir, "e2e", ".agent-qa", "runs")),
        config: configSchema.parse({ version: 1, git: { platform: "gitlab", repo: "g/p", token: "${env:T}" } }),
        vault: new Vault({ storage: new MemoryVaultStorage(), keys: { description: "t", getKey: async () => Buffer.alloc(32, 1) } }),
        mode: "ci",
      });
      expect(await gitlab.pullRequestReadiness()).toMatchObject({ ready: false, reason: expect.stringContaining("GitLab aren't supported yet") });
    });
  });
});
