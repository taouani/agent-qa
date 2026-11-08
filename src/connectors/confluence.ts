import type { WriteGrant } from "../core/index.js";
import { ConnectorError, HttpClient, type FetchLike, type HttpClientOptions } from "./http.js";
import { storageToText, type StorageText } from "./storage.js";

/**
 * Confluence Cloud client (slice 1, S1-3). It fetches the pages a Jira issue
 * links to, through the v2 API, as plain text. The page version goes into
 * the requirement's `sourceHash`, so an edited page is a new input.
 *
 * Since S4-5 it also publishes a document as a page: it creates the page,
 * or updates it to a new version, and labels it. Writes need a policy grant
 * for `confluence`.
 *
 * What it returns is NOT masked. Only the data service calls connectors.
 */

export interface ConfluencePage {
  id: string;
  title: string;
  spaceId?: string;
  /** Version number; it changes on every edit. */
  version: number;
  /** When that version was made (ISO). */
  versionCreatedAt?: string;
  url: string;
  body: StorageText;
}

export interface SkippedPage {
  url: string;
  reason: "not-confluence" | "other-site" | "not-a-page" | "not-found" | "forbidden" | "limit" | "unreadable";
}

export interface ConfluenceClientOptions extends Partial<Omit<HttpClientOptions, "service" | "baseUrl" | "headers" | "writeTarget" | "readOnlyPosts">> {
  /** `https://site.atlassian.net`, the same site as Jira. */
  site: string;
  email: string;
  token: string;
  fetch?: FetchLike;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

const PAGE_ID = /^\d{1,20}$/;

/**
 * Page id from a tiny link (`/wiki/x/AbCd`). The tiny id is the page id as
 * little-endian bytes in base64, with `/` and `+` swapped for `-` and `_`.
 * Assumption: this is Confluence's long-standing scheme; no public spec exists.
 */
export function tinyToPageId(tiny: string): string | undefined {
  // 11 characters hold 8 bytes, the most a page id needs.
  if (!/^[A-Za-z0-9_-]{1,11}$/.test(tiny)) return undefined;
  let b64 = tiny.replace(/-/g, "/").replace(/_/g, "+");
  while (b64.length % 4 !== 0) b64 += "A";
  const bytes = Buffer.from(b64, "base64");
  let id = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) id = (id << 8n) | BigInt(bytes[i]!);
  return id > 0n && PAGE_ID.test(id.toString()) ? id.toString() : undefined;
}

/** The inverse of `tinyToPageId`, for tests and for building tiny links. */
export function pageIdToTiny(id: string): string {
  let n = BigInt(id);
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.push(Number(n & 0xffn));
    n >>= 8n;
  }
  return Buffer.from(bytes).toString("base64").replace(/=+$/, "").replace(/A+$/, "").replace(/\//g, "-").replace(/\+/g, "_");
}

/**
 * The page id a URL points at, when it is a Confluence page on `site`.
 * Handles `/wiki/spaces/KEY/pages/123/Title`, `/wiki/pages/viewpage.action?pageId=123`,
 * `/wiki/spaces/KEY/pages/edit-v2/123` and tiny links `/wiki/x/AbCd`.
 */
export function pageIdFromUrl(url: string, site: string): { id: string } | { skip: SkippedPage["reason"] } {
  let u: URL;
  let s: URL;
  try {
    u = new URL(url);
    s = new URL(site);
  } catch {
    return { skip: "not-confluence" };
  }
  if (u.origin !== s.origin) return { skip: "other-site" };
  if (!u.pathname.startsWith("/wiki/")) return { skip: "not-confluence" };
  const path = u.pathname.slice("/wiki".length);
  const pages = /^\/spaces\/[^/]+\/pages\/(?:edit-v2\/|edit\/)?(\d+)(?:\/|$)/.exec(path);
  if (pages) return { id: pages[1]! };
  if (/^\/pages\/viewpage\.action$/.test(path)) {
    const id = u.searchParams.get("pageId") ?? "";
    return PAGE_ID.test(id) ? { id } : { skip: "not-a-page" };
  }
  const tiny = /^\/x\/([A-Za-z0-9_-]+)\/?$/.exec(path);
  if (tiny) {
    const id = tinyToPageId(tiny[1]!);
    return id ? { id } : { skip: "not-a-page" };
  }
  return { skip: "not-a-page" };
}

export class ConfluenceClient {
  readonly http: HttpClient;
  readonly site: string;

  constructor(options: ConfluenceClientOptions) {
    const { site, email, token, ...rest } = options;
    const auth = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
    this.site = new URL(site).origin;
    this.http = new HttpClient({
      ...rest,
      service: "Confluence",
      baseUrl: `${this.site}/wiki`,
      writeTarget: "confluence",
      headers: () => ({ Authorization: auth }),
    });
  }

  async page(id: string): Promise<ConfluencePage> {
    if (!PAGE_ID.test(id)) throw new Error(`Not a Confluence page id: ${JSON.stringify(id.slice(0, 40))}`);
    const raw = obj(await this.http.get(`/api/v2/pages/${id}`, { query: { "body-format": "storage" } }));
    const version = obj(raw.version);
    // The version goes into sourceHash; without it an edited page would look unchanged.
    if (typeof version.number !== "number") throw new ConnectorError("INVALID_RESPONSE", "Confluence", "GET", "/api/v2/pages/{id}", 200);
    const webui = str(obj(raw._links).webui);
    const spaceId = str(raw.spaceId) ?? (typeof raw.spaceId === "number" ? String(raw.spaceId) : undefined);
    const versionCreatedAt = str(version.createdAt);
    return {
      id: str(raw.id) ?? id,
      title: str(raw.title) ?? "",
      ...(spaceId ? { spaceId } : {}),
      version: version.number,
      ...(versionCreatedAt ? { versionCreatedAt } : {}),
      url: webui ? `${this.site}/wiki${webui.startsWith("/") ? "" : "/"}${webui}` : `${this.site}/wiki/pages/viewpage.action?pageId=${id}`,
      body: storageToText(str(obj(obj(raw.body).storage).value)),
    };
  }

  /**
   * The pages behind a list of URLs (e.g. an issue's remote links). Links to
   * other sites, non-page links, and pages the account can't read are skipped
   * and reported, not thrown: one missing page shouldn't stop a run.
   */
  async pages(urls: string[], options: { maxPages?: number } = {}): Promise<{ pages: ConfluencePage[]; skipped: SkippedPage[] }> {
    const maxPages = options.maxPages ?? 20;
    const pages: ConfluencePage[] = [];
    const skipped: SkippedPage[] = [];
    const seen = new Set<string>();
    for (const url of urls) {
      const found = pageIdFromUrl(url, this.site);
      if ("skip" in found) {
        skipped.push({ url, reason: found.skip });
        continue;
      }
      if (seen.has(found.id)) continue;
      if (seen.size >= maxPages) {
        skipped.push({ url, reason: "limit" });
        continue;
      }
      seen.add(found.id);
      try {
        pages.push(await this.page(found.id));
      } catch (error) {
        if (error instanceof ConnectorError && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) {
          skipped.push({ url, reason: error.code === "NOT_FOUND" ? "not-found" : "forbidden" });
          continue;
        }
        // A body too deep or odd to convert: skip that page, keep the rest of the run.
        if (error instanceof RangeError) {
          skipped.push({ url, reason: "unreadable" });
          continue;
        }
        throw error;
      }
    }
    return { pages, skipped };
  }

  /** The id of the space with this key, or undefined. */
  async spaceId(key: string): Promise<string | undefined> {
    const raw = obj(await this.http.get("/api/v2/spaces", { query: { keys: key, limit: "1" } }));
    const first = obj(Array.isArray(raw.results) ? raw.results[0] : undefined);
    return idOf(first.id);
  }

  /** The current page with this exact title in the space, with its version and labels. */
  async pageByTitle(spaceId: string, title: string): Promise<PageRef | undefined> {
    const raw = obj(await this.http.get("/api/v2/pages", { query: { "space-id": spaceId, title, status: "current", limit: "5" } }));
    const found = (Array.isArray(raw.results) ? raw.results : []).map(obj).find((p) => str(p.title) === title);
    const id = found && idOf(found.id);
    return id ? this.pageRef(id) : undefined;
  }

  /** A page's id, title, version, labels and link; undefined when it doesn't exist (any more). */
  async pageRef(id: string): Promise<PageRef | undefined> {
    if (!PAGE_ID.test(id)) throw new Error(`Not a Confluence page id: ${JSON.stringify(id.slice(0, 40))}`);
    let raw: Raw;
    try {
      raw = obj(await this.http.get(`/api/v2/pages/${id}`));
    } catch (error) {
      if (error instanceof ConnectorError && error.code === "NOT_FOUND") return undefined;
      throw error;
    }
    const version = obj(raw.version).number;
    if (typeof version !== "number") throw new ConnectorError("INVALID_RESPONSE", "Confluence", "GET", "/api/v2/pages/{id}", 200);
    const labels = obj(await this.http.get(`/api/v2/pages/${id}/labels`, { query: { limit: "50" } }));
    return {
      id,
      title: str(raw.title) ?? "",
      version,
      labels: (Array.isArray(labels.results) ? labels.results : []).flatMap((l) => str(obj(l).name) ?? []),
      url: this.urlOf(raw, id),
    };
  }

  /** Creates a page in storage format, under `parentId` when given. */
  async createPage(page: { spaceId: string; parentId?: string | undefined; title: string; storage: string }, grant: WriteGrant): Promise<{ id: string; version: number; url: string }> {
    const body = { spaceId: page.spaceId, status: "current", title: page.title, ...(page.parentId ? { parentId: page.parentId } : {}), body: { representation: "storage", value: page.storage } };
    const raw = obj(await this.http.request("/api/v2/pages", { method: "POST", body, grant }));
    const id = idOf(raw.id);
    if (!id) throw new ConnectorError("INVALID_RESPONSE", "Confluence", "POST", "/api/v2/pages", 200);
    return { id, version: typeof obj(raw.version).number === "number" ? (obj(raw.version).number as number) : 1, url: this.urlOf(raw, id) };
  }

  /** Replaces a page's title and body as version `version` (the current one plus 1). */
  async updatePage(page: { id: string; title: string; storage: string; version: number; message: string }, grant: WriteGrant): Promise<{ id: string; version: number; url: string }> {
    if (!PAGE_ID.test(page.id)) throw new Error(`Not a Confluence page id: ${JSON.stringify(page.id.slice(0, 40))}`);
    const body = { id: page.id, status: "current", title: page.title, body: { representation: "storage", value: page.storage }, version: { number: page.version, message: page.message } };
    const raw = obj(await this.http.request(`/api/v2/pages/${page.id}`, { method: "PUT", body, grant }));
    return { id: page.id, version: page.version, url: this.urlOf(raw, page.id) };
  }

  /** Adds a global label to a page (the v1 API: v2 has no label write). */
  async addLabel(id: string, name: string, grant: WriteGrant): Promise<void> {
    if (!PAGE_ID.test(id)) throw new Error(`Not a Confluence page id: ${JSON.stringify(id.slice(0, 40))}`);
    await this.http.request(`/rest/api/content/${id}/label`, { method: "POST", body: [{ prefix: "global", name }], grant });
  }

  private urlOf(raw: Raw, id: string): string {
    const webui = str(obj(raw._links).webui);
    return webui ? `${this.site}/wiki${webui.startsWith("/") ? "" : "/"}${webui}` : `${this.site}/wiki/pages/viewpage.action?pageId=${id}`;
  }
}

export interface PageRef {
  id: string;
  title: string;
  version: number;
  labels: string[];
  url: string;
}

const idOf = (v: unknown): string | undefined => {
  const id = typeof v === "number" ? String(v) : str(v);
  return id && PAGE_ID.test(id) ? id : undefined;
};
