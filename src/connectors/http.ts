import { assertGrant, type WriteGrant, type WriteTarget } from "../core/index.js";

/**
 * HTTP client for every connector (slice 1, S1-1). It adds timeouts, retries
 * with backoff, `Retry-After` on 429 and 503, and errors that never carry a
 * header, a credential or a response body: Jira and Xray bodies can quote
 * personal data, and errors end up in logs and reports.
 *
 * A request that changes something remote must carry a `WriteGrant` from
 * `Policy.guard`. Reads sent as POST (Jira's JQL search, Xray's auth and
 * GraphQL queries) say so with `readOnly: true`.
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
}

function describe(code: ConnectorErrorCode, service: string, method: string, path: string, status?: number): string {
  const where = `${service} ${method} ${path}`;
  switch (code) {
    case "AUTH":
      return `${where}: authentication failed (401). Check the token and email in agent-qa.yaml; run agent-qa doctor.`;
    case "FORBIDDEN":
      return `${where}: permission denied (403). The account can't access this resource.`;
    case "NOT_FOUND":
      return `${where}: not found (404).`;
    case "RATE_LIMITED":
      return `${where}: still rate limited after retries (429).`;
    case "TIMEOUT":
      return `${where}: timed out.`;
    case "NETWORK":
      return `${where}: network error. If you are behind a proxy, set HTTPS_PROXY; for a corporate CA, set NODE_EXTRA_CA_CERTS.`;
    case "INVALID_RESPONSE":
      return `${where}: the response was not the JSON expected.`;
    case "BAD_REQUEST":
      return `${where}: the server rejected the request (${status ?? 400}).`;
    case "OFF_ORIGIN":
      return `${where}: refused to follow a URL on another host.`;
    default:
      return `${where}: HTTP ${status ?? "error"}.`;
  }
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
  /** Shown in errors, e.g. "Jira". */
  service: string;
  /** `https://site.atlassian.net`; paths are resolved against it. */
  baseUrl: string;
  /** Headers added to every request, e.g. Authorization. Called per attempt, so a token can refresh. */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
  timeoutMs?: number;
  /** Extra attempts after the first. */
  retries?: number;
  /** Upper bound for one wait, including `Retry-After`. */
  maxWaitMs?: number;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Required for a request that changes something remote. */
  grant?: { grant: WriteGrant; target: WriteTarget };
  /** A POST that only reads (search, auth, GraphQL query). */
  readOnly?: boolean;
  /** Retry a non-idempotent request on 429 or a network error. Default: only GET, PUT and DELETE retry. */
  retry?: boolean;
  /** Return the body as text instead of parsing JSON. */
  text?: boolean;
}

const RETRY_STATUS = new Set([429, 502, 503, 504]);
const IDEMPOTENT = new Set(["GET", "PUT", "DELETE"]);

/** Seconds or an HTTP date, in milliseconds from now; undefined if absent or unreadable. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000);
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class HttpClient {
  private readonly origin: string;
  private readonly basePath: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly maxWaitMs: number;
  private readonly fetchImpl: FetchLike | undefined;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(private readonly options: HttpClientOptions) {
    const base = new URL(options.baseUrl);
    if (base.username || base.password) throw new Error(`${options.service} base URL must not contain credentials`);
    this.origin = base.origin;
    this.basePath = base.pathname.replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.retries = options.retries ?? 3;
    this.maxWaitMs = options.maxWaitMs ?? 60_000;
    this.fetchImpl = options.fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
  }

  /** Resolve a path or a same-origin absolute URL (pagination links). Anything on another host is refused. */
  url(pathOrUrl: string, query?: RequestOptions["query"]): URL {
    let url: URL;
    if (/^https?:\/\//i.test(pathOrUrl)) {
      url = new URL(pathOrUrl);
      if (url.origin !== this.origin) throw new ConnectorError("OFF_ORIGIN", this.options.service, "GET", url.pathname);
    } else {
      url = new URL(this.basePath + (pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`), this.origin);
    }
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    return url;
  }

  async get<T = unknown>(path: string, options: Omit<RequestOptions, "method" | "body" | "grant" | "readOnly"> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? "GET";
    const service = this.options.service;
    const url = this.url(path, options.query);
    if (method !== "GET") {
      if (options.grant) assertGrant(options.grant.grant, options.grant.target);
      else if (!(method === "POST" && options.readOnly)) {
        throw new ConnectorError("BAD_REQUEST", service, method, url.pathname, undefined, `${service} ${method} ${url.pathname}: a write needs a policy grant`);
      }
    }
    const canRetry = options.retry ?? IDEMPOTENT.has(method);
    const fetchImpl = this.fetchImpl ?? (await defaultFetch());

    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = { Accept: "application/json", ...(await this.options.headers?.()), ...options.headers };
      let body: string | undefined;
      if (options.body !== undefined) {
        body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
        headers["Content-Type"] ??= "application/json";
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(url.toString(), { method, headers, ...(body !== undefined ? { body } : {}), signal: controller.signal, redirect: "manual" });
      } catch {
        clearTimeout(timer);
        const timedOut = controller.signal.aborted;
        // A timed-out write may have landed; only retry it when the caller said it is safe.
        if (attempt < this.retries && (canRetry || (!timedOut && options.readOnly))) {
          await this.sleep(this.backoff(attempt));
          continue;
        }
        throw new ConnectorError(timedOut ? "TIMEOUT" : "NETWORK", service, method, url.pathname, undefined, undefined);
      }

      // The timeout also covers reading the body.
      let text: string;
      try {
        text = response.status === 204 ? "" : await response.text();
      } catch {
        clearTimeout(timer);
        throw new ConnectorError(controller.signal.aborted ? "TIMEOUT" : "NETWORK", service, method, url.pathname, response.status);
      }
      clearTimeout(timer);

      if (response.ok) {
        if (options.text) return text as T;
        try {
          return (text === "" ? undefined : JSON.parse(text)) as T;
        } catch {
          throw new ConnectorError("INVALID_RESPONSE", service, method, url.pathname, response.status);
        }
      }

      // The error body is read (so the connection can be reused) but never goes into the error.
      const status = response.status;
      if (RETRY_STATUS.has(status) && attempt < this.retries && (canRetry || status === 429 || options.readOnly)) {
        const hinted = parseRetryAfter(response.headers.get("retry-after"));
        await this.sleep(Math.min(this.maxWaitMs, hinted ?? this.backoff(attempt)));
        continue;
      }
      throw new ConnectorError(codeFor(status), service, method, url.pathname, status);
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
  if (status >= 300 && status < 400) return "OFF_ORIGIN";
  if (status >= 400 && status < 500) return "BAD_REQUEST";
  return "HTTP";
}

let cachedFetch: FetchLike | undefined;

/**
 * Node's fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY is set (Node 24
 * and late 22.x). When a proxy is configured without it, use undici's fetch
 * with an EnvHttpProxyAgent, which honours HTTPS_PROXY, HTTP_PROXY and NO_PROXY.
 */
async function defaultFetch(): Promise<FetchLike> {
  cachedFetch ??= await selectFetch(process.env);
  return cachedFetch;
}

/** The fetch to use for this environment (exported for tests). */
export async function selectFetch(env: NodeJS.ProcessEnv): Promise<FetchLike & { proxied?: boolean }> {
  const proxied = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy;
  if (proxied && !env.NODE_USE_ENV_PROXY) {
    const undici = await import("undici");
    const pick = (...names: string[]) => names.map((n) => env[n]).find((v): v is string => !!v);
    const agentOptions: ConstructorParameters<typeof undici.EnvHttpProxyAgent>[0] = {};
    const https = pick("HTTPS_PROXY", "https_proxy");
    const http = pick("HTTP_PROXY", "http_proxy");
    const none = pick("NO_PROXY", "no_proxy");
    if (https) agentOptions.httpsProxy = https;
    if (http) agentOptions.httpProxy = http;
    if (none) agentOptions.noProxy = none;
    const dispatcher = new undici.EnvHttpProxyAgent(agentOptions);
    const viaProxy = ((input: string, init: RequestInit) =>
      undici.fetch(input, { ...(init as object), dispatcher } as never) as unknown as Promise<Response>) as FetchLike & { proxied?: boolean };
    viaProxy.proxied = true;
    return viaProxy;
  }
  return (input, init) => fetch(input, init);
}
