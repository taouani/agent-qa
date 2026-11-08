import { createHash } from "node:crypto";
import { assertGrant, type WriteGrant } from "../core/index.js";
import { capPatches, checkIssueKey, DEFAULT_DIFF_BYTES, DEFAULT_PULL_REQUESTS, namesKey, type DiffOptions, type FindPullRequestsOptions, type GitHost, type PullRequestDiff, type PullRequestFileChange, type PullRequestRef } from "./git-host.js";
import { BRANCH, type OpenedPullRequest, type PullRequestFiles } from "./github.js";
import { ConnectorError, HttpClient, type FetchLike, type HttpClientOptions } from "./http.js";
import { unifiedDiff } from "./unified-diff.js";

/**
 * Azure DevOps Services' Git REST API (S4-2), the same jobs as the GitHub
 * client: one commit of files on a new branch through the pushes API (no
 * local git, nothing pushed to the base) and a pull request from it; and the
 * reads `commits` needs. `git.repo` is `organization/project/repository`, on
 * https://dev.azure.com (ADO Server on premises isn't supported).
 */

export const AZURE_DEVOPS_API = "https://dev.azure.com";
const API_VERSION = "7.1";
const ZERO = "0".repeat(40);
/** Files compared at most per pull request (two blob reads each). */
const MAX_COMPARED = 200;
/** An ADO pull request description holds at most 4000 characters. */
const MAX_DESCRIPTION = 4000;

export interface AzureDevOpsClientOptions extends Partial<Omit<HttpClientOptions, "service" | "baseUrl" | "headers" | "writeTarget" | "readOnlyPosts">> {
  /** organization/project/repository */
  repo: string;
  /** A personal access token, or the pipeline's System.AccessToken. */
  token: string;
  baseUrl?: string;
  fetch?: FetchLike;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const list = (v: unknown): Raw[] => (Array.isArray(obj(v).value) ? (obj(v).value as unknown[]).map(obj) : []);
const REPO = /^([A-Za-z0-9][A-Za-z0-9-]{0,49})\/([^/\\?#%]{1,64})\/([^/\\?#%]{1,64})$/;
const SHA = /^[0-9a-f]{40}$/;
const heads = (branch: string) => `refs/heads/${branch}`;
const unheads = (ref: string | undefined) => (ref?.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : (ref ?? ""));
/** git's id for a file's content. */
const blobId = (content: string) => {
  const bytes = Buffer.from(content, "utf8");
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
};

export class AzureDevOpsClient implements GitHost {
  readonly platform = "azure-devops" as const;
  readonly service = "Azure DevOps";
  readonly http: HttpClient;
  private readonly org: string;
  private readonly project: string;
  private readonly repo: string;
  private readonly web: string;

  constructor(options: AzureDevOpsClientOptions) {
    const m = REPO.exec(options.repo);
    if (!m || m[2]!.trim() !== m[2] || m[3]!.trim() !== m[3]) throw new Error("git.repo must be organization/project/repository on Azure DevOps");
    [, this.org, this.project, this.repo] = m as unknown as [string, string, string, string];
    const { fetch, timeoutMs, retries, maxWaitMs, sleep, random } = options;
    const rest = Object.fromEntries(Object.entries({ fetch, timeoutMs, retries, maxWaitMs, sleep, random }).filter(([, v]) => v !== undefined)) as Partial<HttpClientOptions>;
    const basic = Buffer.from(`:${options.token}`).toString("base64");
    const base = options.baseUrl ?? AZURE_DEVOPS_API;
    this.web = `${base.replace(/\/+$/, "")}/${encodeURIComponent(this.org)}/${encodeURIComponent(this.project)}/_git/${encodeURIComponent(this.repo)}`;
    this.http = new HttpClient({
      ...rest,
      service: "Azure DevOps",
      baseUrl: base,
      writeTarget: "testCode",
      // Finding the pull requests of commits is a POST that only reads.
      readOnlyPosts: [(path) => path === this.path("/pullrequestquery")],
      headers: () => ({ authorization: `Basic ${basic}` }),
    });
  }

  private path(rest: string): string {
    return `/${encodeURIComponent(this.org)}/${encodeURIComponent(this.project)}/_apis/git/repositories/${encodeURIComponent(this.repo)}${rest}`;
  }

  private get<T = unknown>(rest: string, query: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
    return this.http.get<T>(this.path(rest), { query: { ...query, "api-version": API_VERSION } });
  }

  private post(grant: WriteGrant | undefined, rest: string, body: unknown): Promise<unknown> {
    return this.http.request(this.path(rest), { method: "POST", ...(grant ? { grant } : {}), body, query: { "api-version": API_VERSION } });
  }

  private bad(method: string, what: string): ConnectorError {
    return new ConnectorError("INVALID_RESPONSE", "Azure DevOps", method, this.path(""), undefined, `Azure DevOps ${method}: ${what}`);
  }

  async defaultBranch(): Promise<string> {
    const b = unheads(str(obj(await this.get("")).defaultBranch));
    if (!b) throw this.bad("GET", "the repository has no default branch (is it empty?)");
    return b;
  }

  /** The commit a branch points at, or undefined when there is no such branch. */
  async branchHead(branch: string): Promise<string | undefined> {
    const refs = list(await this.get("/refs", { filter: `heads/${branch}` }));
    // The filter is a prefix: only the exact name counts.
    const sha = str(refs.find((r) => r.name === heads(branch))?.objectId);
    if (sha && !SHA.test(sha)) throw this.bad("GET", "a ref without a commit id");
    return sha;
  }

  private async treeOf(commit: string): Promise<Raw[]> {
    const tree = str(obj(await this.get(`/commits/${commit}`)).treeId);
    if (!tree || !SHA.test(tree)) throw this.bad("GET", "a commit without a tree");
    const entries = obj(await this.get(`/trees/${tree}`, { recursive: true })).treeEntries;
    return (Array.isArray(entries) ? entries : []).map(obj);
  }

  /**
   * Checks each file against the base commit's tree, as the GitHub client
   * does: a new file must not be there in any case nor run through a file; a
   * changed file must be there as a plain file holding exactly what Agent-QA read.
   */
  private async checkBase(files: PullRequestFiles["files"], commit: string, base: string): Promise<void> {
    const entries = await this.treeOf(commit);
    const exact = new Map(entries.map((e) => [String(e.relativePath), e]));
    const folded = new Map(entries.map((e) => [String(e.relativePath).toLowerCase(), e.gitObjectType]));
    for (const f of files) {
      if (f.base !== undefined) {
        const e = exact.get(f.path);
        if (!e || e.gitObjectType !== "blob") throw new Error(`${f.path} isn't on ${base} any more: run again on the current code`);
        if (e.mode !== "100644" && e.mode !== "100755") throw new Error(`${f.path} isn't a plain file on ${base}`);
        if (e.objectId !== f.base) throw new Error(`${f.path} changed on ${base} since Agent-QA read it: run again on the current code`);
        continue;
      }
      const parts = f.path.toLowerCase().split("/");
      if (folded.has(parts.join("/"))) throw new Error(`${f.path} exists on ${base}: a new file must not be there yet`);
      for (let i = 1; i < parts.length; i++) {
        const t = folded.get(parts.slice(0, i).join("/"));
        if (t !== undefined && t !== "tree") throw new Error(`${f.path} runs through a file on ${base}`);
      }
    }
  }

  /** The open pull request from `branch`, if any. */
  async openPullRequestFrom(branch: string): Promise<{ number: number; url: string; base: string; draft: boolean } | undefined> {
    const prs = list(await this.get("/pullrequests", { "searchCriteria.sourceRefName": heads(branch), "searchCriteria.status": "active", $top: 5 }));
    const first = prs[0];
    const id = first?.pullRequestId;
    if (!first || typeof id !== "number") return undefined;
    return { number: id, url: `${this.web}/pullrequest/${id}`, base: unheads(str(first.targetRefName)), draft: first.isDraft === true };
  }

  /**
   * One commit of these files on a new branch, and a pull request from it.
   * Run again for the same branch (a stop halfway), it takes the branch when
   * its one commit, on a commit of the base, changes exactly these files to
   * exactly this content, and the pull request already open from it.
   */
  async openPullRequest(grant: WriteGrant, pr: PullRequestFiles): Promise<OpenedPullRequest> {
    assertGrant(grant, "testCode");
    if (!BRANCH.test(pr.branch)) throw new Error(`${pr.branch} isn't a branch name Agent-QA uses`);
    if (pr.files.length === 0) throw new Error("a pull request needs at least one file");
    const base = pr.base ?? (await this.defaultBranch());
    if (base === pr.branch) throw new Error("the pull request's branch is its base");
    const baseHead = await this.branchHead(base);
    if (!baseHead) throw new Error(`the base branch ${base} isn't on Azure DevOps`);

    const existing = await this.branchHead(pr.branch);
    if (existing) {
      const tip = obj(await this.get(`/commits/${existing}`));
      const parents = Array.isArray(tip.parents) ? tip.parents.filter((p): p is string => typeof p === "string") : [];
      const parent = parents.length === 1 && SHA.test(parents[0]!) ? parents[0]! : undefined;
      // The base must contain the parent: the base is 0 commits behind it.
      const onBase =
        parent !== undefined &&
        (parent === baseHead || obj(await this.get("/diffs/commits", { baseVersion: parent, baseVersionType: "commit", targetVersion: baseHead, targetVersionType: "commit", $top: 1 })).behindCount === 0);
      let same = false;
      if (onBase) {
        await this.checkBase(pr.files, baseHead, base);
        const listed = obj(await this.get(`/commits/${existing}/changes`)).changes;
        // A push lists the folders it made too: only files count.
        const changes = (Array.isArray(listed) ? listed : []).map(obj).filter((c) => obj(c.item).isFolder !== true && obj(c.item).gitObjectType !== "tree");
        const changed = new Map(changes.map((c) => [String(obj(c.item).path).replace(/^\//, ""), str(obj(c.item).objectId)]));
        same = changed.size === pr.files.length && pr.files.every((f) => changed.get(f.path) === blobId(f.content));
      }
      if (!same) throw new Error(`the branch ${pr.branch} exists with other commits or files: delete it on Azure DevOps, then run again`);
    } else {
      await this.checkBase(pr.files, baseHead, base);
      const push = obj(
        await this.post(grant, "/pushes", {
          refUpdates: [{ name: heads(pr.branch), oldObjectId: ZERO }],
          commits: [
            {
              comment: pr.message,
              parents: [baseHead],
              changes: pr.files.map((f) => ({
                changeType: f.base !== undefined ? "edit" : "add",
                item: { path: `/${f.path}` },
                newContent: { content: Buffer.from(f.content, "utf8").toString("base64"), contentType: "base64encoded" },
              })),
            },
          ],
        }),
      );
      if (!Array.isArray(push.commits) || push.commits.length === 0) throw this.bad("POST", "the push made no commit");
    }
    const open = await this.openPullRequestFrom(pr.branch);
    if (open) {
      if (open.base !== base) throw new Error(`a pull request from ${pr.branch} is open into ${open.base}, not ${base}`);
      return { ...open, branch: pr.branch, created: false };
    }
    const note = "\n\n(cut: Azure DevOps keeps 4000 characters)";
    const description = pr.body.length > MAX_DESCRIPTION ? `${pr.body.slice(0, MAX_DESCRIPTION - note.length)}${note}` : pr.body;
    const made = obj(await this.post(grant, "/pullrequests", { sourceRefName: heads(pr.branch), targetRefName: heads(base), title: pr.title, description, isDraft: pr.draft }));
    const id = made.pullRequestId;
    if (typeof id !== "number") throw this.bad("POST", "no pull request id");
    return { number: id, url: `${this.web}/pullrequest/${id}`, base, branch: pr.branch, draft: made.isDraft === true, created: true };
  }

  /**
   * Pull requests naming the key. Azure DevOps has no text search over pull
   * requests or commits, so this reads the newest 200 pull requests (any
   * state) and the newest 200 commits of the default branch, and keeps those
   * where the key is a whole word in the title, description, branch or a
   * commit message; commits lead to their pull requests through a pull
   * request query. Older ones aren't found.
   */
  async findPullRequests(key: string, options: FindPullRequestsOptions = {}): Promise<PullRequestRef[]> {
    checkIssueKey(key);
    const max = options.max ?? DEFAULT_PULL_REQUESTS;
    const found = new Map<number, PullRequestRef>();
    const add = (p: Raw, where: PullRequestRef["matchedIn"]) => {
      const id = p.pullRequestId;
      if (typeof id !== "number") return;
      const known = found.get(id);
      if (known) {
        for (const w of where) if (!known.matchedIn.includes(w)) known.matchedIn.push(w);
        return;
      }
      const state = p.status === "active" ? "open" : p.status === "completed" ? "merged" : "closed";
      found.set(id, { id, url: `${this.web}/pullrequest/${id}`, title: str(p.title) ?? "", sourceBranch: unheads(str(p.sourceRefName)), targetBranch: unheads(str(p.targetRefName)), state, matchedIn: [...where] });
    };
    for (const p of list(await this.get("/pullrequests", { "searchCriteria.status": "all", $top: 200 }))) {
      const where: PullRequestRef["matchedIn"] = [];
      if (namesKey(str(p.title), key)) where.push("title");
      if (namesKey(str(p.description), key)) where.push("description");
      if (namesKey(unheads(str(p.sourceRefName)), key)) where.push("branch");
      if (where.length) add(p, where);
    }
    const commits = list(await this.get("/commits", { "searchCriteria.$top": 200 }))
      .filter((c) => namesKey(str(c.comment), key))
      .map((c) => str(c.commitId))
      .filter((c): c is string => !!c && SHA.test(c))
      .slice(0, 20);
    if (commits.length) {
      // A pull request's own commits, and the commit a squash or rebase merge left on the branch.
      const answer = obj(await this.post(undefined, "/pullrequestquery", { queries: [{ type: "commit", items: commits }, { type: "lastMergeCommit", items: commits }] }));
      for (const result of Array.isArray(answer.results) ? answer.results.map(obj) : []) {
        for (const prs of Object.values(result)) for (const p of Array.isArray(prs) ? prs.map(obj) : []) add(p, ["commit"]);
      }
    }
    return [...found.values()].sort((a, b) => b.id - a.id).slice(0, max);
  }

  /**
   * The files of the pull request's latest iteration. Azure DevOps gives no
   * patch, so each changed text file is read on both sides and compared here,
   * until `maxBytes` of patch text or 200 files; the files past it keep their path and status.
   */
  async pullRequestDiff(id: number, options: DiffOptions = {}): Promise<PullRequestDiff> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`${id} isn't a pull request id`);
    const maxBytes = options.maxBytes ?? DEFAULT_DIFF_BYTES;
    const iterations = list(await this.get(`/pullrequests/${id}/iterations`));
    const last = iterations.map((i) => i.id).filter((n): n is number => typeof n === "number").sort((a, b) => b - a)[0];
    if (last === undefined) return { files: [], truncated: false };
    const answer = obj(await this.get(`/pullrequests/${id}/iterations/${last}/changes`, { $top: 2000 }));
    const entries = (Array.isArray(answer.changeEntries) ? answer.changeEntries : []).map(obj);
    let truncated = typeof answer.nextSkip === "number" && answer.nextSkip > 0;
    let left = maxBytes;
    let compared = 0;
    const files: PullRequestFileChange[] = [];
    for (const e of entries) {
      const item = obj(e.item);
      if (item.isFolder === true || item.gitObjectType === "tree") continue;
      const path = (str(item.path) ?? str(e.originalPath) ?? "").replace(/^\//, "");
      if (!path) continue;
      const kind = String(e.changeType ?? "");
      const status: PullRequestFileChange["status"] = /delete/.test(kind) ? "removed" : /rename/.test(kind) ? "renamed" : /add/.test(kind) ? "added" : "modified";
      const change: PullRequestFileChange = { path, status };
      const previous = str(e.originalPath);
      if (status === "renamed" && previous) change.previousPath = previous.replace(/^\//, "");
      files.push(change);
      if (status === "removed" || left <= 0 || compared >= MAX_COMPARED) {
        if (status !== "removed") truncated = true;
        continue;
      }
      const after = str(item.objectId);
      const before = str(item.originalObjectId);
      if (!after || !SHA.test(after) || after === before) continue;
      const text = async (sha: string | undefined) => (sha && SHA.test(sha) ? this.http.request(this.path(`/blobs/${sha}`), { query: { $format: "text", "api-version": API_VERSION }, expect: "text" }) : "");
      const patch = unifiedDiff(await text(status === "added" ? undefined : before), await text(after));
      if (patch === undefined) {
        truncated = true;
        continue;
      }
      compared++;
      change.patch = patch;
      left -= Buffer.byteLength(patch, "utf8");
    }
    const capped = capPatches(files, maxBytes);
    return { files: capped.files, truncated: truncated || capped.truncated };
  }
}
