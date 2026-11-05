import { BlockList, isIP } from "node:net";
import { assertGrant, PolicyDenied, type WriteGrant, type WriteTarget } from "../core/index.js";

/**
 * HTTP client for every connector (slice 1, S1-1). It adds timeouts, retries
 * with backoff, `Retry-After` on 429 and 503, and errors that never carry a
 * header, a credential, a query string or a response body: Jira and Xray
 * bodies can quote personal data, and errors end up in logs and reports.
 *
 * Writes: a client is built for one write target (Jira, Xray, Confluence) or
 * none. A request other than GET needs a `WriteGrant` from `Policy.guard` for
 * that target, unless it is a POST that the client was built to treat as a
 * read (Jira's JQL search, Xray's authenticate, a GraphQL query).
 */

export type ConnectorErrorCode =
  | "AUTH"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "HTTP"
  | "TIMEOUT"
  | "NETWORK"
  | "INVALID_RESPONSE"
  | "BAD_REQUEST"
  | "REDIRECT"
  | "OFF_ORIGIN";

export class ConnectorError extends Error {
  constructor(
    readonly code: ConnectorErrorCode,
    readonly service: string,
    readonly method: string,
    /** Path only, never the query string: a JQL filter can hold a name. */
    readonly path: string,
    readonly status?: number,
    message?: string,
  ) {
    super(message ?? describe(code, service, method, path, status));
    this.name = "ConnectorError";
  }

  /** For an Xray import job that was started: its id, so the record can point to it. */
  jobId?: string;
  /** The service's own error code, when the client reads one (`HttpClientOptions.errorCode`). */
  remoteCode?: string;
}

/**
 * The system error code behind a failed fetch (undici puts it on `cause`),
 * such as ENOTFOUND or SELF_SIGNED_CERT_IN_CHAIN. Only a bare code is kept,
 * never a message, which can quote a host or a path.
 */
export function networkCause(error: unknown): string | undefined {
  for (let e = error, depth = 0; e && typeof e === "object" && depth < 4; e = (e as { cause?: unknown }).cause, depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z][A-Z0-9_]{1,40}$/.test(code)) return code;
  }
  return undefined;
}

const TLS_CODES = /CERT|SELF_SIGNED|UNABLE_TO_(GET|VERIFY)|ERR_TLS|ERR_SSL/;

/** A network error's message, with what its cause usually means. */
export function networkMessage(where: string, cause: string | undefined): string {
  if (!cause) return `${where}: network error. If you are behind a proxy, set HTTPS_PROXY; for a corporate CA, set NODE_EXTRA_CA_CERTS.`;
  const hint = TLS_CODES.test(cause)
    ? "The certificate isn't trusted: behind a proxy that re-signs TLS, set NODE_OPTIONS=--use-system-ca (Node 22.15+; in PowerShell: $env:NODE_OPTIONS = \"--use-system-ca\"), or set NODE_EXTRA_CA_CERTS to its CA certificate (.pem)."
    : cause === "ENOTFOUND" || cause === "EAI_AGAIN"
      ? "The host name didn't resolve: check the site URL in agent-qa.yaml; on a network that only reaches out through a proxy, set HTTPS_PROXY."
      : "The connection failed: if you are behind a proxy, set HTTPS_PROXY (and NO_PROXY for hosts that skip it).";
  return `${where}: network error (${cause}). ${hint}`;
}

function describe(code: ConnectorErrorCode, service: string, method: string, path: string, status?: number): string {
  const where = `${service} ${method} ${path}`;
  switch (code) {
    case "AUTH":
      return `${where}: authentication failed (401). Check the credentials in agent-qa.yaml; run agent-qa doctor.`;
    case "FORBIDDEN":
      return `${where}: permission denied (403). The account can't access this resource.`;
    case "NOT_FOUND":
      return `${where}: not found (404).`;
    case "RATE_LIMITED":
      return `${where}: rate limited (429), and the server asked to wait longer than allowed or retries ran out.`;
    case "TIMEOUT":
      return `${where}: timed out.`;
    case "NETWORK":
      return `${where}: network error. If you are behind a proxy, set HTTPS_PROXY; for a corporate CA, set NODE_EXTRA_CA_CERTS.`;
    case "INVALID_RESPONSE":
      return `${where}: the response was not what was expected.`;
    case "BAD_REQUEST":
      return `${where}: the server rejected the request (${status ?? 400}).`;
    case "REDIRECT":
      return `${where}: the server answered with a redirect (${status ?? "3xx"}), which is not followed. Check the site URL in agent-qa.yaml.`;
    case "OFF_ORIGIN":
      return `${where}: refused a URL outside the configured site.`;
    default:
      return `${where}: HTTP ${status ?? "error"}.`;
  }
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Decides whether a POST without a grant is a read. Gets the resolved path and
 * the request body. A matcher for an endpoint that can also write, such as
 * GraphQL, must check the body (e.g. refuse a `mutation`), not only the path.
 */
export type ReadOnlyPost = (path: string, body: unknown) => boolean;

export interface HttpClientOptions {
  /** Shown in errors, e.g. "Jira". */
  service: string;
  /** `https://site.atlassian.net`; paths are resolved against it and must stay under it. */
  baseUrl: string;
  /** The policy target this client writes to. Without it, the client can't write at all. */
  writeTarget?: WriteTarget;
  /** POSTs that only read. Everything else that isn't GET needs a grant. */
  readOnlyPosts?: ReadOnlyPost[];
  /** Headers added to every request, e.g. Authorization. Called per attempt, so a token can refresh. */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
  timeoutMs?: number;
  /** Extra attempts after the first. */
  retries?: number;
  /** Upper bound for one wait. A `Retry-After` longer than this fails the request instead. */
  maxWaitMs?: number;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /**
   * Reads a machine code from an error body, e.g. OAuth's `invalid_grant`.
   * Only a bare code (lowercase letters, digits, `_`, up to 60) is kept, as
   * `ConnectorError.remoteCode`; the body itself never goes into an error.
   */
  errorCode?: (body: string) => string | undefined;
}

export type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export interface RequestOptions {
  method?: Method;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Required for a request that changes something remote, from `Policy.guard` for this client's write target. */
  grant?: WriteGrant;
  /**
   * Also retry this request on 5xx and network errors. By default only GET,
   * PUT, DELETE and read-only POSTs are; a 429 is always retried, since the
   * server refused the request without acting on it.
   */
  retry?: boolean;
  /** `json` (default), `text`, or `none` for an empty answer. */
  expect?: "json" | "text" | "none";
}

const RETRY_STATUS = new Set([429, 502, 503, 504]);
const IDEMPOTENT = new Set(["GET", "PUT", "DELETE"]);
const METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH"]);

/** Seconds or an HTTP date, in milliseconds from now; undefined if absent or unreadable. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000);
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Thrown by a single attempt; `retry` says whether another attempt may help. */
class AttemptError extends Error {
  constructor(
    readonly error: ConnectorError,
    readonly retry: boolean,
    readonly waitMs?: number,
  ) {
    super(error.message);
  }
}

export class HttpClient {
  private readonly origin: string;
  private readonly basePath: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly maxWaitMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private fetchImpl: FetchLike | undefined;

  constructor(private readonly options: HttpClientOptions) {
    let base: URL;
    try {
      base = new URL(options.baseUrl);
    } catch {
      throw new Error(`${options.service} base URL is not a valid URL`);
    }
    if (base.username || base.password) throw new Error(`${options.service} base URL must not contain credentials`);
    if (base.protocol !== "https:" && base.protocol !== "http:") throw new Error(`${options.service} base URL must be http(s)`);
    this.origin = base.origin;
    this.basePath = base.pathname.replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.retries = options.retries ?? 3;
    this.maxWaitMs = options.maxWaitMs ?? 60_000;
    this.fetchImpl = options.fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
  }

  /**
   * Resolve a path, or an absolute URL such as a pagination link, and check
   * that the result is on the configured origin and under its base path.
   * `//host` and backslashes are refused, and `..` can't escape: the check runs on the result.
   */
  url(pathOrUrl: string, query?: RequestOptions["query"], method = "GET"): URL {
    const service = this.options.service;
    const pathPart = pathOrUrl.split(/[?#]/)[0]!;
    if (pathPart.includes("\\") || pathPart.startsWith("//")) throw new ConnectorError("OFF_ORIGIN", service, method, "(outside the site)");
    let url: URL;
    try {
      url = /^https?:\/\//i.test(pathOrUrl) ? new URL(pathOrUrl) : new URL(this.basePath + "/" + pathOrUrl.replace(/^\/+/, ""), this.origin);
    } catch {
      throw new ConnectorError("BAD_REQUEST", service, method, "(invalid path)", undefined, `${service} ${method}: the request path is not a valid URL`);
    }
    const inside =
      url.origin === this.origin && (this.basePath === "" || url.pathname === this.basePath || url.pathname.startsWith(this.basePath + "/"));
    if (!inside) throw new ConnectorError("OFF_ORIGIN", service, method, "(outside the site)");
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    return url;
  }

  async get<T = unknown>(path: string, options: Omit<RequestOptions, "method" | "body" | "grant" | "expect"> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  request(path: string, options: RequestOptions & { expect: "none" }): Promise<void>;
  request(path: string, options: RequestOptions & { expect: "text" }): Promise<string>;
  request<T = unknown>(path: string, options?: RequestOptions & { expect?: "json" }): Promise<T>;
  async request<T>(path: string, options: RequestOptions = {}): Promise<T | string | void> {
    const service = this.options.service;
    const method = options.method ?? "GET";
    if (!METHODS.has(method)) throw new ConnectorError("BAD_REQUEST", service, "?", "(any)", undefined, `${service}: unsupported HTTP method`);
    const url = this.url(path, options.query, method);
    if ((method === "GET" || method === "DELETE") && options.body !== undefined) {
      throw new ConnectorError("BAD_REQUEST", service, method, url.pathname, undefined, `${service} ${method} ${url.pathname}: a ${method} request can't have a body`);
    }

    let readOnly = method === "GET";
    if (method !== "GET") {
      const target = this.options.writeTarget;
      if (options.grant) {
        if (!target) throw new PolicyDenied("unknown", `the ${service} client is read-only`);
        assertGrant(options.grant, target);
      } else if (method === "POST" && (this.options.readOnlyPosts ?? []).some((isRead) => isRead(url.pathname, options.body))) {
        readOnly = true;
      } else {
        throw new PolicyDenied(target ?? "unknown", `${service} ${method} ${url.pathname} is a write and needs a policy grant`);
      }
    }
    const canRetry = options.retry ?? (readOnly || IDEMPOTENT.has(method));
    this.fetchImpl ??= await defaultFetch(this.origin);

    for (let attempt = 0; ; attempt++) {
      try {
        return (await this.attempt(url, method, options, canRetry)) as T | string | void;
      } catch (error) {
        if (!(error instanceof AttemptError)) throw error;
        if (!error.retry || attempt >= this.retries) throw error.error;
        await this.sleep(error.waitMs ?? this.backoff(attempt));
      }
    }
  }

  private async attempt(url: URL, method: Method, options: RequestOptions, canRetry: boolean): Promise<unknown> {
    const service = this.options.service;
    const fail = (code: ConnectorErrorCode, retry: boolean, status?: number, waitMs?: number, message?: string) =>
      new AttemptError(new ConnectorError(code, service, method, url.pathname, status, message), retry, waitMs);
    const dropped = (error: unknown, status?: number) =>
      controller.signal.aborted
        ? fail("TIMEOUT", canRetry, status)
        : fail("NETWORK", canRetry, status, undefined, networkMessage(`${service} ${method} ${url.pathname}`, networkCause(error)));

    // Header names are case-insensitive: normalise so a caller's content-type replaces the default.
    const headers: Record<string, string> = { accept: "application/json" };
    const merge = (from: Record<string, string> | undefined) => {
      for (const [k, v] of Object.entries(from ?? {})) headers[k.toLowerCase()] = v;
    };
    let body: string | undefined;
    if (options.body !== undefined) {
      body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
      headers["content-type"] = "application/json";
    }
    merge(await this.options.headers?.());
    merge(options.headers);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let response: Response;
      try {
        response = await this.fetchImpl!(url.toString(), {
          method,
          headers,
          ...(body !== undefined ? { body } : {}),
          signal: controller.signal,
          redirect: "manual",
        });
      } catch (error) {
        // A timed-out or dropped write may have landed; only retry it when that is safe.
        throw dropped(error);
      }

      // The timeout also covers reading the body. The body of an error is read (so the
      // connection can be reused) but never goes into the error.
      let text: string;
      try {
        text = response.status === 204 ? "" : await response.text();
      } catch (error) {
        throw dropped(error, response.status);
      }

      const status = response.status;
      if (response.ok) {
        const expect = options.expect ?? "json";
        if (expect === "none") return undefined;
        if (expect === "text") return text;
        // 204, or an empty body on a granted write (Jira's PUT and transitions), means "done, nothing
        // to return". A read, including a read-only POST, with an empty body is still an error.
        if (status === 204 || (text === "" && options.grant !== undefined)) return undefined;
        try {
          if (text === "") throw new Error("empty");
          return JSON.parse(text) as unknown;
        } catch {
          throw fail("INVALID_RESPONSE", false, status);
        }
      }
      if (RETRY_STATUS.has(status)) {
        const hinted = parseRetryAfter(response.headers.get("retry-after"));
        // Waiting less than the server asked would only earn another refusal.
        if (hinted !== undefined && hinted > this.maxWaitMs) throw fail(codeFor(status), false, status);
        throw fail(codeFor(status), canRetry || status === 429, status, hinted);
      }
      const failed = fail(codeFor(status), false, status);
      const remote = this.options.errorCode?.(text);
      if (remote !== undefined && /^[a-z0-9_]{1,60}$/.test(remote)) failed.error.remoteCode = remote;
      throw failed;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Exponential backoff with full jitter: up to 0.5 s, 1 s, 2 s, ... capped at maxWaitMs. */
  private backoff(attempt: number): number {
    return Math.floor(this.random() * Math.min(this.maxWaitMs, 500 * 2 ** attempt));
  }
}

function codeFor(status: number): ConnectorErrorCode {
  if (status === 401) return "AUTH";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 300 && status < 400) return "REDIRECT";
  if (status >= 400 && status < 500) return "BAD_REQUEST";
  return "HTTP";
}

const fetchByOrigin = new Map<string, FetchLike>();

async function defaultFetch(origin: string): Promise<FetchLike> {
  let f = fetchByOrigin.get(origin);
  if (!f) {
    f = await selectFetch(process.env, origin);
    fetchByOrigin.set(origin, f);
  }
  return f;
}

/** Node reads HTTPS_PROXY itself from 24.0 and 22.21, when NODE_USE_ENV_PROXY=1. */
export function nodeHandlesProxy(env: NodeJS.ProcessEnv, version = process.versions.node): boolean {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  return env.NODE_USE_ENV_PROXY === "1" && (major >= 24 || (major === 22 && minor >= 21));
}

/**
 * True when NO_PROXY exempts `host`: `*`, an exact host, a domain suffix such
 * as `.corp` or `corp`, an exact IP address, or an IP range such as `10.0.0.0/8`.
 */
export function noProxyMatches(host: string, port: string, noProxy: string | undefined): boolean {
  if (!noProxy) return false;
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  const hostIp = isIP(h);
  for (const raw of noProxy.split(/[\s,]+/)) {
    const entry = raw.trim().toLowerCase();
    if (!entry) continue;
    if (entry === "*") return true;
    const cidr = /^\[?([0-9a-f.:]+)\]?\/(\d{1,3})$/.exec(entry);
    if (cidr) {
      const family = isIP(cidr[1]!);
      if (hostIp && family === hostIp) {
        const list = new BlockList();
        try {
          list.addSubnet(cidr[1]!, Number(cidr[2]), family === 6 ? "ipv6" : "ipv4");
        } catch {
          continue; // a malformed range exempts nothing
        }
        if (list.check(h, hostIp === 6 ? "ipv6" : "ipv4")) return true;
      }
      continue;
    }
    let name = entry;
    let entryPort: string | undefined;
    const bracket = /^\[([^\]]+)\](?::(\d+))?$/.exec(entry);
    if (bracket) {
      name = bracket[1]!;
      entryPort = bracket[2];
    } else if (/^[^:]+:\d+$/.test(entry)) {
      [name, entryPort] = entry.split(":") as [string, string];
    }
    if (entryPort && entryPort !== port) continue;
    // IP addresses match exactly: the entry `0.0.1` must not exempt `127.0.0.1`.
    if (hostIp || isIP(name)) {
      // Compare as addresses, so `0:0:0:0:0:0:0:1` matches `::1`.
      if (hostIp && isIP(name) === hostIp) {
        const list = new BlockList();
        list.addAddress(name, hostIp === 6 ? "ipv6" : "ipv4");
        if (list.check(h, hostIp === 6 ? "ipv6" : "ipv4")) return true;
      }
      continue;
    }
    const domain = name.replace(/^\*?\./, "");
    if (h === domain || h.endsWith("." + domain)) return true;
  }
  return false;
}

/**
 * The fetch for one origin (exported for tests). Behind a proxy that Node
 * doesn't handle itself, it uses undici's stable ProxyAgent, after checking
 * NO_PROXY for that origin.
 */
export async function selectFetch(
  env: NodeJS.ProcessEnv,
  origin: string,
  version = process.versions.node,
): Promise<FetchLike & { proxy?: string }> {
  const plain: FetchLike = (input, init) => fetch(input, init);
  if (nodeHandlesProxy(env, version)) return plain;
  const u = new URL(origin);
  const port = u.port || (u.protocol === "https:" ? "443" : "80");
  const pick = (...names: string[]) => names.map((n) => env[n]).find((v): v is string => !!v);
  // Like curl and undici, HTTPS falls back to HTTP_PROXY when HTTPS_PROXY is unset.
  const proxy = u.protocol === "https:" ? pick("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy") : pick("HTTP_PROXY", "http_proxy");
  if (!proxy || noProxyMatches(u.hostname, port, pick("NO_PROXY", "no_proxy"))) return plain;
  // Like curl, a proxy without a scheme is an HTTP proxy.
  const proxyUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(proxy) ? proxy : `http://${proxy}`;
  let parsed: URL | undefined;
  try {
    parsed = new URL(proxyUrl);
  } catch {
    parsed = undefined;
  }
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    throw new ConnectorError(
      "NETWORK", "proxy", "CONNECT", "(proxy)", undefined,
      "HTTPS_PROXY/HTTP_PROXY is not a usable proxy URL: use http://host:port or https://host:port (SOCKS is not supported).",
    );
  }
  const undici = await import("undici");
  const dispatcher = new undici.ProxyAgent(parsed.href);
  const viaProxy = ((input: string, init: RequestInit) =>
    undici.fetch(input, { ...(init as object), dispatcher } as never) as unknown as Promise<Response>) as FetchLike & { proxy?: string };
  viaProxy.proxy = parsed.host; // never the credentials in the proxy URL
  return viaProxy;
}
