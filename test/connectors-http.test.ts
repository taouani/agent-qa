import { describe, expect, it } from "vitest";
import { ConnectorError, HttpClient, parseRetryAfter, selectFetch, type FetchLike } from "../src/connectors/http.js";
import { MemoryAuditSink, Policy, parseConfig } from "../src/core/index.js";

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

function client(fetch: FetchLike, extra: Partial<ConstructorParameters<typeof HttpClient>[0]> = {}) {
  const waits: number[] = [];
  const c = new HttpClient({
    service: "Jira",
    baseUrl: "https://example.atlassian.net",
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

async function grantFor(target: "xray" | "jira") {
  const rules = { ...parseConfig("version: 1\n").policy.writes, [target]: "allow" as const };
  const policy = new Policy({ rules, mode: "ide", audit: new MemoryAuditSink() });
  let captured: Parameters<Parameters<Policy["guard"]>[1]>[0] | undefined;
  await policy.guard({ target, summary: "test" }, async (g) => {
    captured = g;
  });
  return captured!;
}

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

describe("HttpClient", () => {
  it("resolves paths, adds query params and headers, and parses JSON", async () => {
    const { fetch, calls } = fakeFetch([json({ ok: 1 })]);
    const { c } = client(fetch);
    expect(await c.get("/rest/api/3/issue/ABC-1", { query: { fields: "summary", skip: undefined } })).toEqual({ ok: 1 });
    expect(calls[0]!.url).toBe("https://example.atlassian.net/rest/api/3/issue/ABC-1?fields=summary");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Basic c2VjcmV0");
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

  it("waits Retry-After on 429 and retries", async () => {
    const { fetch, calls } = fakeFetch([new Response("slow down", { status: 429, headers: { "retry-after": "2" } }), json({ done: true })]);
    const { c, waits } = client(fetch);
    expect(await c.get("/x")).toEqual({ done: true });
    expect(waits).toEqual([2000]);
    expect(calls).toHaveLength(2);
  });

  it("caps Retry-After at maxWaitMs", async () => {
    const { fetch } = fakeFetch([new Response("", { status: 503, headers: { "retry-after": "3600" } }), json({})]);
    const { c, waits } = client(fetch, { maxWaitMs: 5000 });
    await c.get("/x");
    expect(waits).toEqual([5000]);
  });

  it("backs off exponentially on 5xx and network errors, then gives up", async () => {
    const { fetch, calls } = fakeFetch([new Response("", { status: 502 }), new TypeError("fetch failed"), new Response("", { status: 504 }), new Response("", { status: 503 })]);
    const { c, waits } = client(fetch);
    await expect(c.get("/x")).rejects.toMatchObject({ code: "HTTP", status: 503 });
    expect(calls).toHaveLength(4);
    expect(waits).toEqual([500, 1000, 2000]);
  });

  it("maps statuses to codes with messages that hold no body, query or credential", async () => {
    const secretBody = JSON.stringify({ errorMessages: ["User Marguerite Quillfeather not found"] });
    for (const [status, code] of [
      [401, "AUTH"],
      [403, "FORBIDDEN"],
      [404, "NOT_FOUND"],
      [400, "BAD_REQUEST"],
      [500, "HTTP"],
      [302, "OFF_ORIGIN"],
    ] as const) {
      const { fetch } = fakeFetch([new Response(secretBody, { status })]);
      const { c } = client(fetch);
      const error = await c.get("/rest/api/3/search", { query: { jql: "assignee = 'Marguerite'" } }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConnectorError);
      expect(error).toMatchObject({ code, status, path: "/rest/api/3/search" });
      const text = String((error as Error).message) + JSON.stringify(error);
      expect(text).not.toMatch(/Marguerite|c2VjcmV0|Basic/);
    }
  });

  it("reports a network failure with a proxy hint and no cause text", async () => {
    const { fetch } = fakeFetch([new Error("connect ECONNREFUSED secret-host"), new Error("x"), new Error("x"), new Error("x")]);
    const { c } = client(fetch);
    const error = (await c.get("/x").catch((e: unknown) => e)) as ConnectorError;
    expect(error.code).toBe("NETWORK");
    expect(error.message).toContain("HTTPS_PROXY");
    expect(error.message).not.toContain("secret-host");
  });

  it("times out a hanging request", async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    const { c } = client(hang, { timeoutMs: 20, retries: 0 });
    await expect(c.get("/x")).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("rejects invalid JSON on success", async () => {
    const { fetch } = fakeFetch([new Response("<html>", { status: 200 })]);
    const { c } = client(fetch);
    await expect(c.get("/x")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("returns undefined for 204 and text when asked", async () => {
    const { fetch } = fakeFetch([new Response(null, { status: 204 }), new Response("token-abc", { status: 200 })]);
    const { c } = client(fetch);
    expect(await c.get("/x")).toBeUndefined();
    expect(await c.request("/auth", { method: "POST", readOnly: true, body: { a: 1 }, text: true })).toBe("token-abc");
  });

  it("refuses a write without a policy grant", async () => {
    const { fetch, calls } = fakeFetch([json({})]);
    const { c } = client(fetch);
    await expect(c.request("/rest/api/3/issue", { method: "POST", body: {} })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(c.request("/rest/api/3/issue/A-1", { method: "PUT", body: {} })).rejects.toThrow(/policy grant/);
    expect(calls).toHaveLength(0);
  });

  it("refuses a grant for another target, and accepts the right one", async () => {
    const { fetch, calls } = fakeFetch([json({ id: 1 })]);
    const { c } = client(fetch);
    const xray = await grantFor("xray");
    await expect(c.request("/x", { method: "POST", body: {}, grant: { grant: xray, target: "jira" } })).rejects.toThrow(/without a policy grant/);
    expect(calls).toHaveLength(0);
    // The grant from a finished guard is no longer valid.
    await expect(c.request("/x", { method: "POST", body: {}, grant: { grant: xray, target: "xray" } })).rejects.toThrow(/without a policy grant/);
  });

  it("does not retry a POST write on a 5xx or a timeout, but does on 429", async () => {
    const rules = { ...parseConfig("version: 1\n").policy.writes, xray: "allow" as const };
    const policy = new Policy({ rules, mode: "ide", audit: new MemoryAuditSink() });
    const { fetch, calls } = fakeFetch([new Response("", { status: 503 })]);
    const { c } = client(fetch);
    await expect(policy.guard({ target: "xray", summary: "t" }, (g) => c.request("/x", { method: "POST", body: {}, grant: { grant: g, target: "xray" } }))).rejects.toMatchObject({ code: "HTTP" });
    expect(calls).toHaveLength(1);

    const second = fakeFetch([new Response("", { status: 429, headers: { "retry-after": "1" } }), json({ ok: true })]);
    const c2 = client(second.fetch).c;
    const result = await policy.guard({ target: "xray", summary: "t" }, (g) => c2.request("/x", { method: "POST", body: {}, grant: { grant: g, target: "xray" } }));
    expect(result).toMatchObject({ value: { ok: true } });
    expect(second.calls).toHaveLength(2);
  });

  it("refuses a base URL with credentials", () => {
    expect(() => new HttpClient({ service: "Jira", baseUrl: "https://u:p@example.com" })).toThrow(/credentials/);
  });
});

describe("selectFetch", () => {
  it("uses undici with a proxy agent only when a proxy is set and Node's own proxy support is off", async () => {
    expect((await selectFetch({})).proxied).toBeUndefined();
    expect((await selectFetch({ HTTPS_PROXY: "http://proxy.local:3128" })).proxied).toBe(true);
    expect((await selectFetch({ HTTPS_PROXY: "http://proxy.local:3128", NODE_USE_ENV_PROXY: "1" })).proxied).toBeUndefined();
  });
});
