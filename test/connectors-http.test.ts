import { describe, expect, it } from "vitest";
import {
  ConnectorError,
  HttpClient,
  nodeHandlesProxy,
  noProxyMatches,
  parseRetryAfter,
  selectFetch,
  type FetchLike,
  type HttpClientOptions,
} from "../src/connectors/http.js";
import { MemoryAuditSink, Policy, PolicyDenied, parseConfig, type WriteGrant, type WriteTarget } from "../src/core/index.js";

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: Array<Response | Error | ((call: Call) => Response | Promise<Response>)>) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    const call = { url, init };
    calls.push(call);
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(call) : next;
  };
  return { fetch, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function client(fetch: FetchLike, extra: Partial<HttpClientOptions> = {}) {
  const waits: number[] = [];
  const c = new HttpClient({
    service: "Jira",
    baseUrl: "https://example.atlassian.net",
    writeTarget: "jira",
    readOnlyPosts: [(path) => path === "/rest/api/3/search/jql"],
    headers: () => ({ Authorization: "Basic c2VjcmV0" }),
    fetch,
    sleep: async (ms) => {
      waits.push(ms);
    },
    random: () => 1,
    ...extra,
  });
  return { c, waits };
}

/** Runs `body` inside a live guard for `target`, so the grant is valid. */
async function withGrant<T>(target: WriteTarget, body: (grant: WriteGrant) => Promise<T>): Promise<T> {
  const rules = { ...parseConfig("version: 1\n").policy.writes, [target]: "allow" as const };
  const policy = new Policy({ rules, mode: "ide", audit: new MemoryAuditSink() });
  const result = await policy.guard({ target, summary: "test" }, body);
  if (result.status !== "done") throw new Error("declined");
  return result.value;
}

const headerOf = (call: Call, name: string) => (call.init.headers as Record<string, string>)[name];

describe("parseRetryAfter", () => {
  it("reads seconds and HTTP dates", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    expect(parseRetryAfter("1.5")).toBe(1500);
    const now = Date.parse("2026-11-03T00:00:00Z");
    expect(parseRetryAfter("Tue, 03 Nov 2026 00:00:10 GMT", now)).toBe(10_000);
    expect(parseRetryAfter("soon")).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});

describe("HttpClient URLs", () => {
  it("resolves paths, adds query params and headers, and parses JSON", async () => {
    const { fetch, calls } = fakeFetch([json({ ok: 1 })]);
    const { c } = client(fetch);
    expect(await c.get("/rest/api/3/issue/ABC-1", { query: { fields: "summary", skip: undefined } })).toEqual({ ok: 1 });
    expect(calls[0]!.url).toBe("https://example.atlassian.net/rest/api/3/issue/ABC-1?fields=summary");
    expect(headerOf(calls[0]!, "authorization")).toBe("Basic c2VjcmV0");
    expect(calls[0]!.init.redirect).toBe("manual");
  });

  it("keeps a base path", async () => {
    const { fetch, calls } = fakeFetch([json({})]);
    const { c } = client(fetch, { baseUrl: "https://xray.cloud.getxray.app/api/v2/" });
    await c.get("import/test/bulk/1/status");
    expect(calls[0]!.url).toBe("https://xray.cloud.getxray.app/api/v2/import/test/bulk/1/status");
  });

  it("follows same-origin absolute URLs and refuses other hosts", async () => {
    const { fetch, calls } = fakeFetch([json({})]);
    const { c } = client(fetch);
    await c.get("https://example.atlassian.net/rest/api/3/search/jql?nextPageToken=x");
    expect(calls[0]!.url).toContain("nextPageToken=x");
    await expect(c.get("https://evil.example.com/steal")).rejects.toMatchObject({ code: "OFF_ORIGIN" });
    expect(calls).toHaveLength(1);
  });

  it("never sends a protocol-relative or backslash path to another host", async () => {
    const { fetch, calls } = fakeFetch([]);
    const { c } = client(fetch);
    for (const path of ["\\\\evil.com/x", "/\\evil.com/x", "\\/evil.com/x", "//evil.com/x", "///evil.com/x"]) {
      await expect(c.get(path)).rejects.toMatchObject({ code: "OFF_ORIGIN" });
    }
    expect(calls).toHaveLength(0);
  });

  it("keeps requests under the base path", async () => {
    const { fetch, calls } = fakeFetch([]);
    const { c } = client(fetch, { baseUrl: "https://xray.cloud.getxray.app/api/v2" });
    await expect(c.get("../../../rest/api/3/myself")).rejects.toMatchObject({ code: "OFF_ORIGIN" });
    await expect(c.get("https://xray.cloud.getxray.app/other")).rejects.toMatchObject({ code: "OFF_ORIGIN" });
    expect(calls).toHaveLength(0);
  });

  it("wraps an invalid URL without echoing it", async () => {
    const { fetch } = fakeFetch([]);
    const { c } = client(fetch);
    const error = await c.get("https://exa mple.atlassian.net/x?jql=assignee%3DMarguerite").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConnectorError);
    expect(String((error as Error).message) + JSON.stringify(error)).not.toContain("Marguerite");
  });

  it("refuses a bad base URL", () => {
    expect(() => new HttpClient({ service: "Jira", baseUrl: "https://u:p@example.com" })).toThrow(/credentials/);
    expect(() => new HttpClient({ service: "Jira", baseUrl: "not a url" })).toThrow(/valid URL/);
    expect(() => new HttpClient({ service: "Jira", baseUrl: "file:///etc" })).toThrow(/http/);
  });
});

describe("HttpClient retries", () => {
  it("waits Retry-After on 429 and retries", async () => {
    const { fetch, calls } = fakeFetch([new Response("slow down", { status: 429, headers: { "retry-after": "2" } }), json({ done: true })]);
    const { c, waits } = client(fetch);
    expect(await c.get("/x")).toEqual({ done: true });
    expect(waits).toEqual([2000]);
    expect(calls).toHaveLength(2);
  });

  it("gives up when Retry-After is longer than maxWaitMs", async () => {
    const { fetch, calls } = fakeFetch([new Response("", { status: 429, headers: { "retry-after": "3600" } }), json({})]);
    const { c, waits } = client(fetch, { maxWaitMs: 5000 });
    await expect(c.get("/x")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(waits).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("backs off exponentially on 5xx and network errors, then gives up", async () => {
    const { fetch, calls } = fakeFetch([new Response("", { status: 502 }), new TypeError("fetch failed"), new Response("", { status: 504 }), new Response("", { status: 503 })]);
    const { c, waits } = client(fetch);
    await expect(c.get("/x")).rejects.toMatchObject({ code: "HTTP", status: 503 });
    expect(calls).toHaveLength(4);
    expect(waits).toEqual([500, 1000, 2000]);
  });

  it("retries a GET whose body read fails", async () => {
    const broken = new Response(new ReadableStream({ pull: (ctl) => ctl.error(new Error("ECONNRESET")) }), { status: 200 });
    const { fetch, calls } = fakeFetch([broken, json({ ok: true })]);
    const { c } = client(fetch);
    expect(await c.get("/x")).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it("does not retry a non-retryable status", async () => {
    const { fetch, calls } = fakeFetch([new Response("", { status: 500 }), json({})]);
    const { c } = client(fetch);
    await expect(c.get("/x")).rejects.toMatchObject({ code: "HTTP", status: 500 });
    expect(calls).toHaveLength(1);
  });
});

describe("HttpClient errors", () => {
  it("maps statuses to codes with messages that hold no body, query or credential", async () => {
    const secretBody = JSON.stringify({ errorMessages: ["User Marguerite Quillfeather not found"] });
    for (const [status, code] of [
      [401, "AUTH"],
      [403, "FORBIDDEN"],
      [404, "NOT_FOUND"],
      [400, "BAD_REQUEST"],
      [500, "HTTP"],
      [302, "REDIRECT"],
      [303, "REDIRECT"],
    ] as const) {
      const { fetch } = fakeFetch([new Response(secretBody, { status, headers: { location: "/y" } })]);
      const { c } = client(fetch);
      const error = await c.get("/rest/api/3/search", { query: { jql: "assignee = 'Marguerite'" } }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConnectorError);
      expect(error).toMatchObject({ code, status, path: "/rest/api/3/search" });
      const text = String((error as Error).message) + JSON.stringify(error);
      expect(text).not.toMatch(/Marguerite|c2VjcmV0|Basic/);
    }
  });

  it("says a same-origin redirect is a redirect, not another host", async () => {
    const { fetch } = fakeFetch([new Response("", { status: 303, headers: { location: "/y" } })]);
    const { c } = client(fetch);
    const error = (await c.get("/x").catch((e: unknown) => e)) as ConnectorError;
    expect(error.message).toMatch(/redirect/);
    expect(error.message).not.toMatch(/outside/);
  });

  it("reports a network failure with a proxy hint and no cause text", async () => {
    const { fetch } = fakeFetch([new Error("connect ECONNREFUSED secret-host"), new Error("x"), new Error("x"), new Error("x")]);
    const { c } = client(fetch);
    const error = (await c.get("/x").catch((e: unknown) => e)) as ConnectorError;
    expect(error.code).toBe("NETWORK");
    expect(error.message).toContain("HTTPS_PROXY");
    expect(error.message).not.toContain("secret-host");
  });

  it("times out a hanging request, and retries it when it is a GET", async () => {
    let attempts = 0;
    const hang: FetchLike = (_url, init) => {
      attempts++;
      return new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    };
    const { c } = client(hang, { timeoutMs: 10, retries: 2 });
    await expect(c.get("/x")).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(attempts).toBe(3);
  });

  it("times out a body that stalls after the headers", async () => {
    const stalled: FetchLike = async (_url, init) =>
      new Response(
        new ReadableStream({
          start(ctl) {
            init.signal!.addEventListener("abort", () => ctl.error(new DOMException("aborted", "AbortError")));
          },
        }),
        { status: 200 },
      );
    const { c } = client(stalled, { timeoutMs: 10, retries: 0 });
    await expect(c.get("/x")).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("rejects invalid or empty JSON on success", async () => {
    const { fetch } = fakeFetch([new Response("<html>", { status: 200 }), new Response("", { status: 200 })]);
    const { c } = client(fetch);
    await expect(c.get("/x")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(c.get("/x")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("returns nothing for expect none and text for expect text", async () => {
    const { fetch } = fakeFetch([new Response(null, { status: 204 }), new Response('"token-abc"', { status: 200 })]);
    const { c } = client(fetch, { readOnlyPosts: [(p) => p === "/auth"] });
    expect(await c.request("/x", { expect: "none" })).toBeUndefined();
    expect(await c.request("/auth", { method: "POST", body: { a: 1 }, expect: "text" })).toBe('"token-abc"');
  });

  it("treats a 204 or an empty body on a write as done", async () => {
    const { fetch } = fakeFetch([new Response(null, { status: 204 }), new Response("", { status: 200 }), new Response(null, { status: 204 })]);
    const { c } = client(fetch);
    await withGrant("jira", async (grant) => {
      expect(await c.request("/issue/QA-1", { method: "PUT", body: { a: 1 }, grant })).toBeUndefined();
      expect(await c.request("/issue/QA-1/transitions", { method: "POST", body: { a: 1 }, grant })).toBeUndefined();
    });
    expect(await c.get("/x")).toBeUndefined();
  });

  it("still rejects an empty body on a read-only POST", async () => {
    const { fetch } = fakeFetch([new Response("", { status: 200 })]);
    const { c } = client(fetch);
    await expect(c.request("/rest/api/3/search/jql", { method: "POST", body: { jql: "x" } })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("refuses a body on GET or DELETE before sending", async () => {
    const { fetch, calls } = fakeFetch([]);
    const { c } = client(fetch);
    await expect(c.request("/x", { method: "GET", body: {} })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(calls).toHaveLength(0);
  });

  it("lets a caller's content-type replace the default, whatever its case", async () => {
    const { fetch, calls } = fakeFetch([json({})]);
    const { c } = client(fetch, { readOnlyPosts: [() => true] });
    await c.request("/x", { method: "POST", body: "a=b", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(Object.keys(headers).filter((k) => k.toLowerCase() === "content-type")).toHaveLength(1);
  });
});

describe("HttpClient writes", () => {
  it("allows only the configured read-only POSTs without a grant", async () => {
    const { fetch, calls } = fakeFetch([json({ issues: [] })]);
    const { c } = client(fetch);
    expect(await c.request("/rest/api/3/search/jql", { method: "POST", body: { jql: "project = A" } })).toEqual({ issues: [] });
    await expect(c.request("/rest/api/3/issue", { method: "POST", body: {} })).rejects.toBeInstanceOf(PolicyDenied);
    expect(calls).toHaveLength(1);
  });

  it("refuses every other method without a grant, whatever its case", async () => {
    const { fetch, calls } = fakeFetch([]);
    const { c } = client(fetch);
    for (const method of ["PUT", "DELETE", "PATCH"] as const) {
      await expect(c.request("/rest/api/3/issue/A-1", { method, ...(method === "DELETE" ? {} : { body: {} }) })).rejects.toBeInstanceOf(PolicyDenied);
    }
    await expect(c.request("/x", { method: "delete" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(calls).toHaveLength(0);
  });

  it("accepts a live grant for the client's own target", async () => {
    const { fetch, calls } = fakeFetch([json({ id: "10001" })]);
    const { c } = client(fetch);
    expect(await withGrant("jira", (g) => c.request("/rest/api/3/issue", { method: "POST", body: {}, grant: g }))).toEqual({ id: "10001" });
    expect(calls).toHaveLength(1);
  });

  it("refuses a live grant for another target", async () => {
    const { fetch, calls } = fakeFetch([json({})]);
    const { c } = client(fetch); // a Jira client
    await expect(withGrant("xray", (g) => c.request("/rest/api/3/issue/A-1", { method: "DELETE", grant: g }))).rejects.toBeInstanceOf(PolicyDenied);
    expect(calls).toHaveLength(0);
  });

  it("refuses a grant after its guard has finished", async () => {
    const { fetch, calls } = fakeFetch([json({})]);
    const { c } = client(fetch);
    const stale = await withGrant("jira", async (g) => g);
    await expect(c.request("/rest/api/3/issue", { method: "POST", body: {}, grant: stale })).rejects.toBeInstanceOf(PolicyDenied);
    expect(calls).toHaveLength(0);
  });

  it("refuses any grant on a read-only client", async () => {
    const { fetch } = fakeFetch([json({})]);
    const { c } = client(fetch, { writeTarget: undefined } as unknown as Partial<HttpClientOptions>);
    await expect(withGrant("jira", (g) => c.request("/x", { method: "POST", body: {}, grant: g }))).rejects.toBeInstanceOf(PolicyDenied);
  });

  it("does not retry a write on a 5xx or a timeout, but does on 429", async () => {
    const first = fakeFetch([new Response("", { status: 503 })]);
    const c1 = client(first.fetch).c;
    await expect(withGrant("jira", (g) => c1.request("/x", { method: "POST", body: {}, grant: g }))).rejects.toMatchObject({ code: "HTTP" });
    expect(first.calls).toHaveLength(1);

    let attempts = 0;
    const hang: FetchLike = (_url, init) => {
      attempts++;
      return new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    };
    const c2 = client(hang, { timeoutMs: 10 }).c;
    await expect(withGrant("jira", (g) => c2.request("/x", { method: "POST", body: {}, grant: g }))).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(attempts).toBe(1);

    const third = fakeFetch([new Response("", { status: 429, headers: { "retry-after": "1" } }), json({ ok: true })]);
    const c3 = client(third.fetch).c;
    expect(await withGrant("jira", (g) => c3.request("/x", { method: "POST", body: {}, grant: g }))).toEqual({ ok: true });
    expect(third.calls).toHaveLength(2);
  });
});

describe("proxy selection", () => {
  it("knows which Node versions read the proxy themselves", () => {
    expect(nodeHandlesProxy({ NODE_USE_ENV_PROXY: "1" }, "24.1.0")).toBe(true);
    expect(nodeHandlesProxy({ NODE_USE_ENV_PROXY: "1" }, "22.21.0")).toBe(true);
    expect(nodeHandlesProxy({ NODE_USE_ENV_PROXY: "1" }, "22.20.0")).toBe(false);
    expect(nodeHandlesProxy({ NODE_USE_ENV_PROXY: "1" }, "20.19.0")).toBe(false);
    expect(nodeHandlesProxy({ NODE_USE_ENV_PROXY: "0" }, "24.1.0")).toBe(false);
  });

  it("matches NO_PROXY entries", () => {
    expect(noProxyMatches("example.atlassian.net", "443", "*")).toBe(true);
    expect(noProxyMatches("example.atlassian.net", "443", "localhost, .atlassian.net")).toBe(true);
    expect(noProxyMatches("example.atlassian.net", "443", "atlassian.net")).toBe(true);
    expect(noProxyMatches("example.atlassian.net", "443", "*.atlassian.net")).toBe(true);
    expect(noProxyMatches("example.atlassian.net", "443", "atlassian.net:8443")).toBe(false);
    expect(noProxyMatches("notatlassian.net", "443", "atlassian.net")).toBe(false);
    expect(noProxyMatches("::1", "443", "[::1]")).toBe(true);
    expect(noProxyMatches("example.com", "443", undefined)).toBe(false);
    // IP addresses match exactly or by range, never by suffix.
    expect(noProxyMatches("127.0.0.1", "443", "0.0.1")).toBe(false);
    expect(noProxyMatches("127.0.0.1", "443", "127.0.0.1")).toBe(true);
    expect(noProxyMatches("127.0.0.1", "443", "127.0.0.0/8")).toBe(true);
    expect(noProxyMatches("169.254.10.2", "443", "10.0.0.0/8,169.254.0.0/16")).toBe(true);
    expect(noProxyMatches("11.0.0.1", "443", "10.0.0.0/8")).toBe(false);
    expect(noProxyMatches("example.com", "443", "10.0.0.0/8")).toBe(false);
    expect(noProxyMatches("fd00::5", "443", "fd00::/8")).toBe(true);
    expect(noProxyMatches("::1", "443", "0:0:0:0:0:0:0:1")).toBe(true);
  });

  it("uses a proxy agent only when a proxy applies to the origin and Node doesn't handle it", async () => {
    const origin = "https://example.atlassian.net";
    expect((await selectFetch({}, origin, "20.19.0")).proxy).toBeUndefined();
    expect((await selectFetch({ HTTPS_PROXY: "http://user:pw@proxy.local:3128" }, origin, "20.19.0")).proxy).toBe("proxy.local:3128");
    expect((await selectFetch({ HTTP_PROXY: "http://proxy.local:3128" }, origin, "20.19.0")).proxy).toBe("proxy.local:3128");
    // No scheme means an HTTP proxy, as in curl; SOCKS is refused with a clear error.
    expect((await selectFetch({ HTTPS_PROXY: "proxy.local:3128" }, origin, "20.19.0")).proxy).toBe("proxy.local:3128");
    expect((await selectFetch({ HTTPS_PROXY: "user:pw@proxy.local:3128" }, origin, "20.19.0")).proxy).toBe("proxy.local:3128");
    await expect(selectFetch({ HTTPS_PROXY: "socks5://proxy.local:1080" }, origin, "20.19.0")).rejects.toMatchObject({ code: "NETWORK" });
    expect((await selectFetch({ HTTPS_PROXY: "http://proxy.local:3128", NO_PROXY: ".atlassian.net" }, origin, "20.19.0")).proxy).toBeUndefined();
    expect((await selectFetch({ HTTPS_PROXY: "http://proxy.local:3128", NODE_USE_ENV_PROXY: "1" }, origin, "24.1.0")).proxy).toBeUndefined();
    expect((await selectFetch({ HTTPS_PROXY: "http://proxy.local:3128" }, "http://localhost:8080", "20.19.0")).proxy).toBeUndefined();
  });
});
