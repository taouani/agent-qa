import { createHash } from "node:crypto";
import { assertGrant, type WriteGrant } from "../core/index.js";
import { capPatches, checkIssueKey, DEFAULT_DIFF_BYTES, DEFAULT_PULL_REQUESTS, namesKey, type DiffOptions, type FindPullRequestsOptions, type GitHost, type PullRequestDiff, type PullRequestFileChange, type PullRequestRef } from "./git-host.js";
import { BRANCH, type OpenedPullRequest, type PullRequestFiles } from "./github.js";
import { ConnectorError, HttpClient, type FetchLike, type HttpClientOptions } from "./http.js";

/**
 * GitLab's REST API v4 (S4-8), the same jobs as the GitHub and Azure DevOps
 * clients: one commit of files on a new branch through the commits API (no
 * local git, nothing pushed to the base) and a merge request from it; and the
 * reads `commits` needs. `git.repo` is the project's full path
 * (`group/subgroup/project`), on https://gitlab.com or a self-managed
 * instance (`git.baseUrl: https://HOST/api/v4`). What GitLab calls a merge
 * request is a pull request here; its id is the project-scoped iid.
 */

export const GITLAB_API = "https://gitlab.com/api/v4";
/** Directory listings read at most per folder (100 entries each), when checking a new file's path. */
const MAX_TREE_PAGES = 20;
/** Pages of merge request diffs read at most (100 files each). */
const MAX_DIFF_PAGES = 30;

export interface GitLabClientOptions extends Partial<Omit<HttpClientOptions, "service" | "baseUrl" | "headers" | "writeTarget" | "readOnlyPosts">> {
  /** The project's full path, group/subgroup/project. */
  repo: string;
  /** A personal, group or project access token with the api scope. */
  token: string;
  /** The REST API root: https://gitlab.com/api/v4, or https://HOST/api/v4. */
  baseUrl?: string;
  fetch?: FetchLike;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? v.map(obj) : []);
/** group(/subgroup)*\/project, GitLab's path characters. */
const REPO = /^(?:[A-Za-z0-9_][A-Za-z0-9_.-]{0,254}\/){1,20}[A-Za-z0-9_][A-Za-z0-9_.-]{0,254}$/;
const SHA = /^[0-9a-f]{40}$/;
/** git's id for a file's content. */
const blobId = (content: string) => {
  const bytes = Buffer.from(content, "utf8");
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
};

export class GitLabClient implements GitHost {
  readonly platform = "gitlab" as const;
  readonly service = "GitLab";
  readonly http: HttpClient;
  private readonly project: string;
  private readonly web: string;

  constructor(options: GitLabClientOptions) {
    if (!REPO.test(options.repo) || options.repo.split("/").some((s) => s.endsWith(".git") || s.endsWith(".atom") || s.includes(".."))) {
      throw new Error("git.repo must be the GitLab project's full path, group/project or group/subgroup/project");
    }
    this.project = `/projects/${encodeURIComponent(options.repo)}`;
    const { fetch, timeoutMs, retries, maxWaitMs, sleep, random } = options;
    const rest = Object.fromEntries(Object.entries({ fetch, timeoutMs, retries, maxWaitMs, sleep, random }).filter(([, v]) => v !== undefined)) as Partial<HttpClientOptions>;
    const base = (options.baseUrl ?? GITLAB_API).replace(/\/+$/, "");
    this.web = `${base.replace(/\/api\/v4$/, "")}/${options.repo.split("/").map(encodeURIComponent).join("/")}`;
    this.http = new HttpClient({
      ...rest,
      service: "GitLab",
      baseUrl: base,
      writeTarget: "testCode",
      headers: () => ({ "private-token": options.token }),
    });
  }

  private get<T = unknown>(rest: string, query: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
    return this.http.get<T>(`${this.project}${rest}`, { query });
  }

  private async getOrUndefined(rest: string, query: Record<string, string | number | boolean | undefined> = {}): Promise<unknown> {
    try {
      return await this.get(rest, query);
    } catch (error) {
      if (error instanceof ConnectorError && error.code === "NOT_FOUND") return undefined;
      throw error;
    }
  }

  private post(grant: WriteGrant, rest: string, body: unknown): Promise<unknown> {
    return this.http.request(`${this.project}${rest}`, { method: "POST", grant, body });
  }

  private bad(method: string, what: string): ConnectorError {
    return new ConnectorError("INVALID_RESPONSE", "GitLab", method, this.project, undefined, `GitLab ${method}: ${what}`);
  }

  private mrUrl(iid: number): string {
    return `${this.web}/-/merge_requests/${iid}`;
  }

  async defaultBranch(): Promise<string> {
    const b = str(obj(await this.get("")).default_branch);
    if (!b) throw this.bad("GET", "the project has no default branch (is it empty?)");
    return b;
  }

  /** The commit a branch points at, or undefined when there is no such branch. */
  async branchHead(branch: string): Promise<string | undefined> {
    const raw = await this.getOrUndefined(`/repository/branches/${encodeURIComponent(branch)}`);
    if (raw === undefined) return undefined;
    const sha = str(obj(obj(raw).commit).id);
    if (!sha || !SHA.test(sha)) throw this.bad("GET", "a branch without a commit id");
    return sha;
  }

  /** A file's blob id at a commit, or undefined when there is no such file. */
  private async blobAt(path: string, ref: string): Promise<string | undefined> {
    const raw = await this.getOrUndefined(`/repository/files/${encodeURIComponent(path)}`, { ref });
    if (raw === undefined) return undefined;
    const id = str(obj(raw).blob_id);
    if (!id || !SHA.test(id)) throw this.bad("GET", "a file without a blob id");
    return id;
  }

  /** One folder's entries at a commit: name and type (blob, tree, commit). */
  private async folder(path: string, ref: string, cache: Map<string, Promise<Raw[]>>): Promise<Raw[]> {
    let entries = cache.get(path);
    if (!entries) {
      entries = (async () => {
        const out: Raw[] = [];
        for (let page = 1; page <= MAX_TREE_PAGES; page++) {
          const raw = await this.getOrUndefined("/repository/tree", { ref, per_page: 100, page, ...(path ? { path } : {}) });
          const rows = Array.isArray(raw) ? arr(raw) : [];
          out.push(...rows);
          if (rows.length < 100) return out;
        }
        throw this.bad("GET", `the folder ${path || "/"} has too many entries to check`);
      })();
      cache.set(path, entries);
    }
    return entries;
  }

  /**
   * Checks each file against the base commit, as the other clients do: a new
   * file must not be there in any case nor run through a file; a changed file
   * must be there holding exactly what Agent-QA read.
   */
  private async checkBase(files: PullRequestFiles["files"], commit: string, base: string): Promise<void> {
    const cache = new Map<string, Promise<Raw[]>>();
    for (const f of files) {
      if (f.base !== undefined) {
        const blob = await this.blobAt(f.path, commit);
        if (!blob) throw new Error(`${f.path} isn't on ${base} any more: run again on the current code`);
        if (blob !== f.base) throw new Error(`${f.path} changed on ${base} since Agent-QA read it: run again on the current code`);
        const parent = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
        const entry = (await this.folder(parent, commit, cache)).find((e) => e.name === f.path.split("/").pop());
        if (entry && entry.mode !== "100644" && entry.mode !== "100755") throw new Error(`${f.path} isn't a plain file on ${base}`);
        continue;
      }
      const parts = f.path.split("/");
      for (let i = 0; i < parts.length; i++) {
        const entries = await this.folder(parts.slice(0, i).join("/"), commit, cache);
        const hit = entries.find((e) => String(e.name).toLowerCase() === parts[i]!.toLowerCase());
        if (!hit) break;
        if (i === parts.length - 1) throw new Error(`${f.path} exists on ${base}: a new file must not be there yet`);
        if (hit.type !== "tree") throw new Error(`${f.path} runs through a file on ${base}`);
        // Another case of the same folder would be a second folder on a case-sensitive host.
        if (hit.name !== parts[i]) throw new Error(`${f.path} differs only in case from ${parts.slice(0, i + 1).join("/")} on ${base}`);
      }
    }
  }

  /** The open merge request from `branch`, if any. */
  async openPullRequestFrom(branch: string): Promise<{ number: number; url: string; base: string; draft: boolean } | undefined> {
    const mrs = arr(await this.get("/merge_requests", { source_branch: branch, state: "opened", per_page: 5 }));
    const first = mrs[0];
    const iid = first?.iid;
    if (!first || typeof iid !== "number") return undefined;
    return { number: iid, url: this.mrUrl(iid), base: str(first.target_branch) ?? "", draft: first.draft === true || first.work_in_progress === true };
  }

  /**
   * One commit of these files on a new branch, and a merge request from it.
   * Run again for the same branch (a stop halfway), it takes the branch when
   * its one commit, on a commit of the base, changes exactly these files to
   * exactly this content, and the merge request already open from it.
   */
  async openPullRequest(grant: WriteGrant, pr: PullRequestFiles): Promise<OpenedPullRequest> {
    assertGrant(grant, "testCode");
    if (!BRANCH.test(pr.branch)) throw new Error(`${pr.branch} isn't a branch name Agent-QA uses`);
    if (pr.files.length === 0) throw new Error("a pull request needs at least one file");
    const base = pr.base ?? (await this.defaultBranch());
    if (base === pr.branch) throw new Error("the merge request's branch is its base");
    const baseHead = await this.branchHead(base);
    if (!baseHead) throw new Error(`the base branch ${base} isn't on GitLab`);

    const existing = await this.branchHead(pr.branch);
    if (existing) {
      const tip = obj(await this.get(`/repository/commits/${existing}`));
      const parents = Array.isArray(tip.parent_ids) ? tip.parent_ids.filter((p): p is string => typeof p === "string") : [];
      const parent = parents.length === 1 && SHA.test(parents[0]!) ? parents[0]! : undefined;
      // The base must contain the parent: no commit of the parent is missing from the base.
      let onBase = parent !== undefined && parent === baseHead;
      if (parent !== undefined && !onBase) {
        const commits = obj(await this.get("/repository/compare", { from: baseHead, to: parent })).commits;
        onBase = Array.isArray(commits) && commits.length === 0;
      }
      let same = false;
      if (onBase) {
        await this.checkBase(pr.files, baseHead, base);
        const changed = arr(await this.get(`/repository/commits/${existing}/diff`, { per_page: 100 })).map((d) => str(d.new_path) ?? "");
        const blobs = await Promise.all(pr.files.map((f) => this.blobAt(f.path, existing)));
        same = changed.length === pr.files.length && pr.files.every((f, i) => changed.includes(f.path) && blobs[i] === blobId(f.content));
      }
      if (!same) throw new Error(`the branch ${pr.branch} exists with other commits or files: delete it on GitLab, then run again`);
    } else {
      await this.checkBase(pr.files, baseHead, base);
      const made = obj(
        await this.post(grant, "/repository/commits", {
          branch: pr.branch,
          start_sha: baseHead,
          commit_message: pr.message,
          actions: pr.files.map((f) => ({
            action: f.base !== undefined ? "update" : "create",
            file_path: f.path,
            content: Buffer.from(f.content, "utf8").toString("base64"),
            encoding: "base64",
          })),
        }),
      );
      if (!str(made.id)) throw this.bad("POST", "the commit was not made");
    }
    const open = await this.openPullRequestFrom(pr.branch);
    if (open) {
      if (open.base !== base) throw new Error(`a merge request from ${pr.branch} is open into ${open.base}, not ${base}`);
      return { ...open, branch: pr.branch, created: false };
    }
    // GitLab marks a draft by its title.
    const title = pr.draft ? `Draft: ${pr.title}` : pr.title;
    const made = obj(await this.post(grant, "/merge_requests", { source_branch: pr.branch, target_branch: base, title, description: pr.body, remove_source_branch: true }));
    const iid = made.iid;
    if (typeof iid !== "number") throw this.bad("POST", "no merge request id");
    return { number: iid, url: this.mrUrl(iid), base, branch: pr.branch, draft: made.draft === true || pr.draft, created: true };
  }

  /**
   * Merge requests naming the key: GitLab's search over titles and
   * descriptions, the newest 100 merge requests' source branches, and the
   * newest 100 commits of the default branch (to their merge requests).
   * Older ones aren't found.
   */
  async findPullRequests(key: string, options: FindPullRequestsOptions = {}): Promise<PullRequestRef[]> {
    checkIssueKey(key);
    const max = options.max ?? DEFAULT_PULL_REQUESTS;
    const found = new Map<number, PullRequestRef>();
    const add = (m: Raw, where: PullRequestRef["matchedIn"]) => {
      const iid = m.iid;
      if (typeof iid !== "number") return;
      const known = found.get(iid);
      if (known) {
        for (const w of where) if (!known.matchedIn.includes(w)) known.matchedIn.push(w);
        return;
      }
      const state = m.state === "opened" ? "open" : m.state === "merged" ? "merged" : "closed";
      found.set(iid, { id: iid, url: this.mrUrl(iid), title: str(m.title) ?? "", sourceBranch: str(m.source_branch) ?? "", targetBranch: str(m.target_branch) ?? "", state, matchedIn: [...where] });
    };
    const match = (m: Raw): PullRequestRef["matchedIn"] => [
      ...(namesKey(str(m.title), key) ? ["title" as const] : []),
      ...(namesKey(str(m.description), key) ? ["description" as const] : []),
      ...(namesKey(str(m.source_branch), key) ? ["branch" as const] : []),
    ];
    // The search matches words loosely (ABC-12 for ABC-1): keep only whole-word matches.
    for (const m of arr(await this.get("/merge_requests", { search: key, in: "title,description", state: "all", order_by: "created_at", sort: "desc", per_page: 50 }))) {
      const where = match(m);
      if (where.length) add(m, where);
    }
    for (const m of arr(await this.get("/merge_requests", { state: "all", order_by: "created_at", sort: "desc", per_page: 100 }))) {
      const where = match(m);
      if (where.length) add(m, where);
    }
    const commits = arr(await this.get("/repository/commits", { per_page: 100 }))
      .filter((c) => namesKey(str(c.message), key))
      .map((c) => str(c.id))
      .filter((c): c is string => !!c && SHA.test(c))
      .slice(0, 20);
    for (const sha of commits) for (const m of arr(await this.get(`/repository/commits/${sha}/merge_requests`))) add(m, ["commit"]);
    return [...found.values()].sort((a, b) => b.id - a.id).slice(0, max);
  }

  /** The merge request's changed files with their patches, until `maxBytes` of patch text; the files past it keep their path and status. */
  async pullRequestDiff(id: number, options: DiffOptions = {}): Promise<PullRequestDiff> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`${id} isn't a merge request id`);
    const maxBytes = options.maxBytes ?? DEFAULT_DIFF_BYTES;
    const files: PullRequestFileChange[] = [];
    let truncated = false;
    for (let page = 1; ; page++) {
      if (page > MAX_DIFF_PAGES) {
        truncated = true;
        break;
      }
      const rows = arr(await this.get(`/merge_requests/${id}/diffs`, { per_page: 100, page }));
      for (const d of rows) {
        const path = str(d.deleted_file === true ? d.old_path : d.new_path) ?? str(d.old_path);
        if (!path) continue;
        const status: PullRequestFileChange["status"] = d.deleted_file === true ? "removed" : d.renamed_file === true ? "renamed" : d.new_file === true ? "added" : "modified";
        const change: PullRequestFileChange = { path, status };
        const previous = str(d.old_path);
        if (status === "renamed" && previous) change.previousPath = previous;
        const patch = str(d.diff);
        // GitLab leaves the diff out of a large or binary file.
        if (patch && status !== "removed" && d.too_large !== true && d.collapsed !== true) change.patch = patch;
        else if (status !== "removed") truncated = true;
        files.push(change);
      }
      if (rows.length < 100) break;
    }
    const capped = capPatches(files, maxBytes);
    return { files: capped.files, truncated: truncated || capped.truncated };
  }
}
