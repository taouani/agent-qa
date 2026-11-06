import { assertGrant, type WriteGrant } from "../core/index.js";
import { ConnectorError, HttpClient, type FetchLike, type HttpClientOptions } from "./http.js";

/**
 * GitHub's REST API for one thing (S2-9): a branch, one commit on it (new
 * files, and since S3-1 changes to existing test files), and a pull request
 * from it. Nothing is pushed with git and nothing
 * touches the base branch: CI's files leave only as a pull request.
 */

export const GITHUB_API = "https://api.github.com";

export interface GitHubClientOptions extends Partial<Omit<HttpClientOptions, "service" | "baseUrl" | "headers" | "writeTarget" | "readOnlyPosts">> {
  /** owner/name */
  repo: string;
  token: string;
  /** The REST API root: https://api.github.com, or https://HOST/api/v3 on GitHub Enterprise Server. */
  baseUrl?: string;
  fetch?: FetchLike;
}

export interface PullRequestFiles {
  /** The branch the pull request goes into. Undefined: the repo's default branch. */
  base?: string | undefined;
  /** The new branch, e.g. agent-qa/scripts-<run>. */
  branch: string;
  /**
   * Paths from the repo root, with forward slashes, and their text. A file
   * with `base` (the git blob id it was read as) changes that file, which the
   * base branch must still hold; any other file must be new there.
   */
  files: ReadonlyArray<{ path: string; content: string; base?: string | undefined }>;
  message: string;
  title: string;
  body: string;
  draft: boolean;
}

export interface OpenedPullRequest {
  number: number;
  url: string;
  base: string;
  branch: string;
  draft: boolean;
  /** false: the branch and the pull request were there already, from an earlier try of the same run. */
  created: boolean;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
/** A branch name git and GitHub both take: no "..", no leading or trailing "/" or ".", no ".lock". */
export const BRANCH = /^(?!.*\.\.)(?!.*\/\/)(?!\/)(?!.*\/$)(?!.*\.lock$)(?!\.)[A-Za-z0-9._/-]{1,200}$/;
const seg = (s: string) => s.split("/").map(encodeURIComponent).join("/");

export class GitHubClient {
  readonly http: HttpClient;
  private readonly repo: string;

  constructor(options: GitHubClientOptions) {
    if (!REPO.test(options.repo)) throw new Error("git.repo must be owner/name");
    const { fetch, timeoutMs, retries, maxWaitMs, sleep, random } = options;
    const rest = Object.fromEntries(Object.entries({ fetch, timeoutMs, retries, maxWaitMs, sleep, random }).filter(([, v]) => v !== undefined)) as Partial<HttpClientOptions>;
    const token = options.token;
    this.repo = options.repo;
    this.http = new HttpClient({
      ...rest,
      service: "GitHub",
      baseUrl: options.baseUrl ?? GITHUB_API,
      writeTarget: "testCode",
      headers: () => ({ authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" }),
    });
  }

  private path(rest: string): string {
    return `/repos/${seg(this.repo)}${rest}`;
  }

  private bad(method: string, path: string, what: string): ConnectorError {
    return new ConnectorError("INVALID_RESPONSE", "GitHub", method, path, undefined, `GitHub ${method} ${path}: ${what}`);
  }

  async defaultBranch(): Promise<string> {
    const b = str(obj(await this.http.get(this.path(""))).default_branch);
    if (!b) throw this.bad("GET", "/repos/{repo}", "no default branch");
    return b;
  }

  /** The commit a branch points at, or undefined when there is no such branch. */
  async branchHead(branch: string): Promise<string | undefined> {
    try {
      const ref = obj(await this.http.get(this.path(`/git/ref/heads/${seg(branch)}`)));
      const sha = str(obj(ref.object).sha);
      if (!sha) throw this.bad("GET", "/git/ref", "a ref without a commit");
      return sha;
    } catch (error) {
      if (error instanceof ConnectorError && error.code === "NOT_FOUND") return undefined;
      throw error;
    }
  }

  /** Whether a path exists at a commit. */
  async exists(path: string, ref: string): Promise<boolean> {
    try {
      await this.http.get(this.path(`/contents/${seg(path)}`), { query: { ref } });
      return true;
    } catch (error) {
      if (error instanceof ConnectorError && error.code === "NOT_FOUND") return false;
      throw error;
    }
  }

  private async commit(sha: string): Promise<{ tree: string; parents: string[] }> {
    const c = obj(await this.http.get(this.path(`/git/commits/${sha}`)));
    const tree = str(obj(c.tree).sha);
    if (!tree) throw this.bad("GET", "/git/commits", "a commit without a tree");
    const parents = (Array.isArray(c.parents) ? c.parents : []).map((p) => str(obj(p).sha)).filter((x): x is string => !!x);
    return { tree, parents };
  }

  /**
   * Checks each file against the base's tree and gives its mode. A new file
   * must not be taken there in any case (a Windows or macOS checkout can't
   * hold both) nor run through a file. A changed file must be there as a
   * plain blob holding exactly what Agent-QA read (`base`), and keeps its
   * mode. From the whole tree when GitHub sends it whole, else folder by
   * folder.
   */
  private async checkBase(files: PullRequestFiles["files"], tree: string, base: string): Promise<string[]> {
    const answer = obj(await this.http.get(this.path(`/git/trees/${tree}`), { query: { recursive: 1 } }));
    const whole = answer.truncated !== true;
    const all = Array.isArray(answer.tree) ? answer.tree.map(obj) : [];
    const exact = new Map(all.map((e) => [String(e.path), e]));
    const folded = new Map(all.map((e) => [String(e.path).toLowerCase(), e.type]));
    const modes: string[] = [];
    for (const f of files) {
      if (f.base !== undefined) {
        const e = whole ? exact.get(f.path) : await this.entryAt(tree, f.path);
        if (!e || e.type !== "blob") throw new Error(`${f.path} isn't on ${base} any more: run again on the current code`);
        if (e.mode !== "100644" && e.mode !== "100755") throw new Error(`${f.path} isn't a plain file on ${base}`);
        if (e.sha !== f.base) throw new Error(`${f.path} changed on ${base} since Agent-QA read it: run again on the current code`);
        modes.push(String(e.mode));
        continue;
      }
      if (whole) {
        const parts = f.path.toLowerCase().split("/");
        if (folded.has(parts.join("/"))) throw new Error(`${f.path} exists on ${base}: a new file must not be there yet`);
        for (let i = 1; i < parts.length; i++) {
          const t = folded.get(parts.slice(0, i).join("/"));
          if (t !== undefined && t !== "tree") throw new Error(`${f.path} runs through a file on ${base}`);
        }
      } else if (await this.entryAt(tree, f.path)) throw new Error(`${f.path} exists on ${base}: a new file must not be there yet`);
      modes.push("100644");
    }
    return modes;
  }

  /** The entry at a path of a tree, one folder at a time (when the whole tree is too large to send). */
  private async entryAt(tree: string, path: string): Promise<Raw | undefined> {
    let at = tree;
    const parts = path.split("/");
    for (let i = 0; i < parts.length; i++) {
      const listed = obj(await this.http.get(this.path(`/git/trees/${at}`)));
      const e = (Array.isArray(listed.tree) ? listed.tree.map(obj) : []).find((x) => x.path === parts[i]);
      if (!e) return undefined;
      if (i === parts.length - 1) return e;
      if (e.type !== "tree" || !str(e.sha)) throw new Error(`${path} runs through a file`);
      at = str(e.sha)!;
    }
    return undefined;
  }

  private async tree(grant: WriteGrant, baseTree: string, files: PullRequestFiles["files"], modes: string[]): Promise<string> {
    const body = { base_tree: baseTree, tree: files.map((f, i) => ({ path: f.path, mode: modes[i] ?? "100644", type: "blob", content: f.content })) };
    const tree = str(obj(await this.http.request(this.path("/git/trees"), { method: "POST", grant, body })).sha);
    if (!tree) throw this.bad("POST", "/git/trees", "no tree");
    return tree;
  }

  /** The open pull request from `branch`, if any. */
  async openPullRequestFrom(branch: string): Promise<{ number: number; url: string; base: string; draft: boolean } | undefined> {
    const owner = this.repo.split("/")[0]!;
    const list = await this.http.get<unknown>(this.path("/pulls"), { query: { head: `${owner}:${branch}`, state: "open", per_page: 5 } });
    const first = Array.isArray(list) ? obj(list[0]) : {};
    const number = first.number;
    const url = str(first.html_url);
    const base = str(obj(first.base).ref);
    if (typeof number !== "number" || !url || !base) return undefined;
    return { number, url, base, draft: first.draft === true };
  }

  /**
   * One commit of these files on a new branch, and a pull request from it.
   * Run again for the same branch (a stop halfway), it takes the branch when
   * its one commit writes exactly these files over a commit of the base, and
   * the pull request already open from it into the same base.
   */
  async openPullRequest(grant: WriteGrant, pr: PullRequestFiles): Promise<OpenedPullRequest> {
    assertGrant(grant, "testCode");
    if (!BRANCH.test(pr.branch)) throw new Error(`${pr.branch} isn't a branch name Agent-QA uses`);
    if (pr.files.length === 0) throw new Error("a pull request needs at least one file");
    const base = pr.base ?? (await this.defaultBranch());
    if (base === pr.branch) throw new Error("the pull request's branch is its base");
    const baseHead = await this.branchHead(base);
    if (!baseHead) throw new Error(`the base branch ${base} isn't on GitHub`);

    const existing = await this.branchHead(pr.branch);
    if (existing) {
      // An earlier try of the same run: its one commit sits on a commit of the base and adds these very files.
      const tip = await this.commit(existing);
      const parent = tip.parents.length === 1 ? tip.parents[0]! : undefined;
      const onBase = parent !== undefined && ["ahead", "identical"].includes(String(obj(await this.http.get(this.path(`/compare/${parent}...${baseHead}`))).status));
      // The files are checked on the base as it is now too: a change made there since the first try stops this one.
      if (onBase) await this.checkBase(pr.files, (await this.commit(baseHead)).tree, base);
      const parentTree = onBase ? (await this.commit(parent)).tree : undefined;
      if (!parentTree || (await this.tree(grant, parentTree, pr.files, await this.checkBase(pr.files, parentTree, base))) !== tip.tree) {
        throw new Error(`the branch ${pr.branch} exists with other commits or files: delete it on GitHub, then run again`);
      }
    } else {
      const baseTree = (await this.commit(baseHead)).tree;
      const tree = await this.tree(grant, baseTree, pr.files, await this.checkBase(pr.files, baseTree, base));
      const commit = str(obj(await this.http.request(this.path("/git/commits"), { method: "POST", grant, body: { message: pr.message, tree, parents: [baseHead] } })).sha);
      if (!commit) throw this.bad("POST", "/git/commits", "no commit");
      await this.http.request(this.path("/git/refs"), { method: "POST", grant, body: { ref: `refs/heads/${pr.branch}`, sha: commit } });
    }
    const open = await this.openPullRequestFrom(pr.branch);
    if (open) {
      if (open.base !== base) throw new Error(`a pull request from ${pr.branch} is open into ${open.base}, not ${base}`);
      return { ...open, branch: pr.branch, created: false };
    }
    const send = (draft: boolean, title: string) => this.http.request(this.path("/pulls"), { method: "POST", grant, body: { title, head: pr.branch, base, body: pr.body, draft } });
    let made: Raw;
    try {
      made = obj(await send(pr.draft, pr.title));
    } catch (error) {
      // Draft pull requests aren't on every plan (private repos on GitHub Free): a plain one, marked in its title.
      if (!(pr.draft && error instanceof ConnectorError && error.status === 422)) throw error;
      made = obj(await send(false, `[draft] ${pr.title}`.slice(0, 200)));
    }
    const number = made.number;
    const url = str(made.html_url);
    if (typeof number !== "number" || !url) throw this.bad("POST", "/pulls", "no pull request number");
    return { number, url, base, branch: pr.branch, draft: made.draft === true, created: true };
  }
}
