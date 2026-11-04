import { createVerify, generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { inspect } from "node:util";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultAudience, normalizePem, SalesforceAuth, SalesforceAuthError, signAssertion } from "../src/connectors/index.js";
import { configSchema, MemoryAuditSink, RunStore } from "../src/core/index.js";
import { DataAccess, runDoctor } from "../src/data/index.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const USER = "store.manager@acme.com.uat";
const INSTANCE = "https://acme--uat.sandbox.my.salesforce.com";
const FRONTDOOR = `${INSTANCE}/secur/frontdoor.jsp?otp=one-time`;

interface Call {
  url: string;
  body: string;
  headers: Record<string, string>;
}

function decode(jwt: string) {
  const [h, c, sig] = jwt.split(".");
  const verify = createVerify("RSA-SHA256");
  verify.update(`${h}.${c}`);
  return { header: JSON.parse(Buffer.from(h!, "base64url").toString()), claims: JSON.parse(Buffer.from(c!, "base64url").toString()), valid: verify.verify(publicKey, Buffer.from(sig!, "base64url")) };
}

/** A fake Salesforce: the token endpoint, then singleaccess. */
function salesforce(over: { token?: () => Response; single?: () => Response } = {}) {
  const calls: Call[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    calls.push({ url, body: String(init.body ?? ""), headers: init.headers as Record<string, string> });
    if (url.endsWith("/services/oauth2/token")) return over.token?.() ?? Response.json({ access_token: "00D!secret-token", instance_url: `${INSTANCE}/` });
    if (url.endsWith("/services/oauth2/singleaccess")) return over.single?.() ?? Response.json({ frontdoor_uri: FRONTDOOR });
    return new Response("not found", { status: 404 });
  };
  return { calls, fetch };
}

describe("SalesforceAuth (S2-3)", () => {
  it("signs a JWT bearer assertion Salesforce accepts", () => {
    const jwt = signAssertion({ clientId: "3MVG9.key", username: USER, audience: "https://test.salesforce.com", key: privateKey, now: 1_000_000_000_000 });
    const { header, claims, valid } = decode(jwt);
    expect(valid).toBe(true);
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });
    expect(claims).toEqual({ iss: "3MVG9.key", sub: USER, aud: "https://test.salesforce.com", exp: 1_000_000_180 });
  });

  it("mints a single-use frontdoor URL: token, then singleaccess with the bearer", async () => {
    const sf = salesforce();
    const auth = new SalesforceAuth({ loginUrl: "https://test.salesforce.com", clientId: "3MVG9.key", privateKey: PEM, fetch: sf.fetch });
    expect(await auth.session(USER)).toEqual({ instanceUrl: INSTANCE, frontdoorUrl: FRONTDOOR });
    expect(sf.calls.map((c) => c.url)).toEqual(["https://test.salesforce.com/services/oauth2/token", `${INSTANCE}/services/oauth2/singleaccess`]);
    const form = new URLSearchParams(sf.calls[0]!.body);
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(decode(form.get("assertion")!).claims).toMatchObject({ sub: USER, aud: "https://test.salesforce.com" });
    expect(sf.calls[0]!.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(sf.calls[1]!.headers.authorization).toBe("Bearer 00D!secret-token");
  });

  it("explains OAuth errors by their code, without the username or Salesforce's text", async () => {
    const sf = salesforce({ token: () => Response.json({ error: "invalid_app_access", error_description: `user ${USER} is not admin approved` }, { status: 400 }) });
    const auth = new SalesforceAuth({ loginUrl: "https://login.salesforce.com", clientId: "k", privateKey: PEM, fetch: sf.fetch, retries: 0 });
    const error = await auth.session(USER).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SalesforceAuthError);
    expect((error as SalesforceAuthError).oauthCode).toBe("invalid_app_access");
    expect((error as Error).message).toMatch(/refused the token request \(invalid_app_access\): the user is not authorized for the app/);
    expect((error as Error).message).not.toContain(USER);
    // A code that isn't a bare code is not kept.
    const odd = salesforce({ token: () => Response.json({ error: "Bad <script> for jane" }, { status: 400 }) });
    const msg = await new SalesforceAuth({ loginUrl: "https://login.salesforce.com", clientId: "k", privateKey: PEM, fetch: odd.fetch, retries: 0 }).session(USER).catch((e: Error) => e.message);
    expect(msg).not.toMatch(/script|jane/);
  });

  it("refuses a frontdoor URL off the org's site, a missing scope, and a bad key", async () => {
    for (const single of [() => Response.json({ frontdoor_uri: "https://evil.example/frontdoor" }), () => Response.json({})]) {
      const sf = salesforce({ single });
      await expect(new SalesforceAuth({ loginUrl: "https://login.salesforce.com", clientId: "k", privateKey: PEM, fetch: sf.fetch }).session(USER)).rejects.toThrow(/no frontdoor URL on the org's site/);
    }
    const http = salesforce({ token: () => Response.json({ access_token: "t", instance_url: "http://insecure.example" }) });
    await expect(new SalesforceAuth({ loginUrl: "https://login.salesforce.com", clientId: "k", privateKey: PEM, fetch: http.fetch }).session(USER)).rejects.toThrow(/https instance URL/);
    expect(() => new SalesforceAuth({ loginUrl: "https://login.salesforce.com", clientId: "k", privateKey: "-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----" })).toThrow(/can't be read/);
    const ec = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(() => new SalesforceAuth({ loginUrl: "https://login.salesforce.com", clientId: "k", privateKey: ec })).toThrow(/must be an RSA key/);
  });
});

describe("SalesforceAuth review fixes", () => {
  const make = (sf: ReturnType<typeof salesforce>, extra: Record<string, string> = {}) => new SalesforceAuth({ loginUrl: "https://test.salesforce.com", clientId: "k", privateKey: PEM, fetch: sf.fetch, ...extra });

  it("refuses malformed, lookalike, userinfo and http frontdoor URLs without echoing them", async () => {
    for (const uri of ["https://[bad/secur/frontdoor.jsp?otp=SECRET", `${INSTANCE}.evil.example/secur/frontdoor.jsp?otp=SECRET`, `https://x:y@${INSTANCE.slice(8)}/f?otp=SECRET`, `${INSTANCE.replace("https", "http")}/f?otp=SECRET`]) {
      const error = await make(salesforce({ single: () => Response.json({ frontdoor_uri: uri }) })).session(USER).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SalesforceAuthError);
      expect(inspect(error)).not.toContain("SECRET");
    }
  });

  it("refuses a token for another org than baseUrl", async () => {
    const sf = salesforce({ token: () => Response.json({ access_token: "t", instance_url: "https://other.my.salesforce.com" }) });
    await expect(make(sf, { orgUrl: INSTANCE }).session(USER)).rejects.toThrow(/different org than salesforce.baseUrl/);
    expect(sf.calls).toHaveLength(1);
    expect((await make(salesforce(), { orgUrl: `${INSTANCE}/` }).session(USER)).instanceUrl).toBe(INSTANCE);
  });

  it("redacts the frontdoor URL in JSON and console output", async () => {
    const session = await make(salesforce()).session(USER);
    expect(session.frontdoorUrl).toBe(FRONTDOOR);
    expect(JSON.stringify(session)).not.toContain("otp");
    expect(inspect(session)).not.toContain("otp");
    expect(`${JSON.stringify({ session })}`).toContain("[redacted]");
  });

  it("picks the audience Salesforce accepts for each login host", () => {
    expect(defaultAudience("https://test.salesforce.com")).toBe("https://test.salesforce.com");
    expect(defaultAudience("https://acme--uat.sandbox.my.salesforce.com")).toBe("https://test.salesforce.com");
    expect(defaultAudience("https://acme.my.salesforce.com")).toBe("https://login.salesforce.com");
    expect(defaultAudience("https://login.salesforce.com/")).toBe("https://login.salesforce.com");
    expect(defaultAudience("https://acme.my.site.com/partners")).toBe("https://acme.my.site.com");
  });

  it("reads a key as the test repo's .env holds it: flattened \\n or base64", async () => {
    const flat = PEM.trim().replace(/\n/g, "\\n");
    expect(flat).not.toContain("\n");
    expect(normalizePem(flat)).toBe(PEM.trim());
    expect(normalizePem(Buffer.from(PEM).toString("base64"))).toBe(PEM);
    for (const key of [flat, Buffer.from(PEM).toString("base64")]) {
      expect((await new SalesforceAuth({ loginUrl: "https://test.salesforce.com", clientId: "k", privateKey: key, fetch: salesforce().fetch }).session(USER)).instanceUrl).toBe(INSTANCE);
    }
  });
});

describe("salesforce config", () => {
  const base = { baseUrl: INSTANCE, clientId: "${env:SF_CLIENT_ID}", users: { "StoreManager-FRA": "${env:SF_USER_SM_FRA}" } };
  it("takes one key source, a secret reference or a file, and at least one user", () => {
    expect(configSchema.parse({ version: 1, salesforce: { ...base, privateKey: "${env:SF_JWT_KEY}" } }).salesforce).toMatchObject({ auth: "jwt", loginUrl: "https://login.salesforce.com" });
    expect(configSchema.safeParse({ version: 1, salesforce: { ...base, privateKey: "-----BEGIN PRIVATE KEY-----" } }).success).toBe(false);
    expect(configSchema.safeParse({ version: 1, salesforce: { ...base } }).success).toBe(false);
    expect(configSchema.safeParse({ version: 1, salesforce: { ...base, privateKey: "${env:K}", privateKeyFile: "k.pem" } }).success).toBe(false);
    expect(configSchema.safeParse({ version: 1, salesforce: { ...base, privateKeyFile: "../certs/server.key", users: {} } }).success).toBe(false);
    expect(configSchema.safeParse({ version: 1, salesforce: { ...base, privateKeyFile: "../certs/server.key", users: { "bad role": "x" } } }).success).toBe(false);
    // A pasted key is refused in privateKeyFile; a reference to the path is taken.
    expect(configSchema.safeParse({ version: 1, salesforce: { ...base, privateKeyFile: "-----BEGIN PRIVATE KEY-----\nabc" } }).success).toBe(false);
    expect(configSchema.safeParse({ version: 1, salesforce: { ...base, privateKeyFile: "${env:SF_JWT_KEY_FILE}" } }).success).toBe(true);
  });
});

describe("DataAccess.salesforceSession and doctor", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-sf-"));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("signs in a role's user, with the key from a file and the username from the environment", async () => {
    await writeFile(join(dir, "server.key"), PEM);
    const config = configSchema.parse({ version: 1, salesforce: { baseUrl: INSTANCE, loginUrl: "https://test.salesforce.com", clientId: "3MVG9.key", privateKeyFile: "server.key", users: { "StoreManager-FRA": "${env:SF_USER}" } } });
    const sf = salesforce();
    const data = new DataAccess({ root: dir, store: new RunStore(join(dir, "runs")), config, audit: new MemoryAuditSink(), env: { SF_USER: USER }, secrets: { env: { SF_USER: USER }, keychain: async () => undefined }, fetch: sf.fetch });
    expect(await data.salesforceRoles()).toEqual(["StoreManager-FRA"]);
    expect((await data.salesforceSession("StoreManager-FRA")).frontdoorUrl).toBe(FRONTDOOR);
    expect(decode(new URLSearchParams(sf.calls[0]!.body).get("assertion")!).claims.sub).toBe(USER);
    await expect(data.salesforceSession("Admin")).rejects.toThrow(/no Salesforce user for the role "Admin"; the roles are StoreManager-FRA/);
  });

  it("doctor signs in each role without printing usernames, and reads the key offline", async () => {
    await writeFile(join(dir, "agent-qa.yaml"), `version: 1\nsalesforce:\n  baseUrl: ${INSTANCE}\n  clientId: k\n  privateKey: \${env:SF_KEY}\n  users:\n    StoreManager-FRA: ${USER}\n    Approver-EUR: other@acme.com\n`);
    const env = { SF_KEY: PEM };
    const offline = (await runDoctor({ cwd: dir, env, online: false })).find((r) => r.id === "salesforce");
    expect(offline).toMatchObject({ status: "pass" });
    expect(offline?.detail).toContain("2 role(s): StoreManager-FRA, Approver-EUR");
    let n = 0;
    const fetch = (async (url: string) => {
      if (!url.endsWith("/services/oauth2/token")) return new Response("ok");
      return ++n === 1 ? Response.json({ access_token: "t", instance_url: INSTANCE }) : Response.json({ error: "inactive_user" }, { status: 400 });
    }) as typeof globalThis.fetch;
    const online = (await runDoctor({ cwd: dir, env, fetch })).find((r) => r.id === "salesforce");
    expect(online).toMatchObject({ status: "fail" });
    expect(online?.detail).toBe("Approver-EUR: Salesforce refused the token request (inactive_user): the Salesforce user is inactive");
    expect(JSON.stringify(online)).not.toContain("acme.com");
  });

  it("doctor warns for a key file in the project unless it is gitignored, and takes its path from a reference", async () => {
    await writeFile(join(dir, "server.key"), PEM);
    await writeFile(join(dir, "agent-qa.yaml"), `version: 1\nsalesforce:\n  baseUrl: ${INSTANCE}\n  clientId: k\n  privateKeyFile: \${env:SF_KEY_FILE}\n  users:\n    StoreManager-FRA: \${env:SF_USER}\n`);
    const env = { SF_KEY_FILE: "server.key" };
    const check = async () => (await runDoctor({ cwd: dir, env, online: false })).find((r) => r.id === "salesforce")!;
    expect(await check()).toMatchObject({ status: "warn", detail: expect.stringContaining("not gitignored") });
    await writeFile(join(dir, ".gitignore"), "*.key\n");
    expect(await check()).toMatchObject({ status: "pass" });
    // A user whose reference doesn't resolve is named by its variable.
    const online = (await runDoctor({ cwd: dir, env, fetch: (async () => Response.json({})) as typeof globalThis.fetch })).find((r) => r.id === "salesforce")!;
    expect(online.detail).toContain("SF_USER");
  });
});
