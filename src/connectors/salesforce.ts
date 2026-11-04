import { createPrivateKey, createSign, type KeyObject } from "node:crypto";
import { inspect } from "node:util";
import { ConnectorError, HttpClient, type FetchLike, type HttpClientOptions } from "./http.js";

/**
 * Salesforce sign-in for one user (S2-3), with the OAuth 2.0 JWT bearer flow
 * of an External Client App: no password, so no MFA prompt.
 *
 * 1. Sign an RS256 assertion (iss = consumer key, sub = username, aud = login
 *    host) with the app's private key.
 * 2. Exchange it at {loginUrl}/services/oauth2/token for an access token.
 * 3. Exchange that at {instance}/services/oauth2/singleaccess for a single-use
 *    frontdoor URL (about a minute, works once), which opens a browser session.
 *
 * Nothing is stored: each sign-in mints what it needs, and the token and URL
 * live only in memory. Both POSTs only read: they change nothing in the org.
 */

export interface SalesforceAuthOptions {
  /** https://login.salesforce.com, https://test.salesforce.com or the My Domain URL. */
  loginUrl: string;
  /** Audience of the assertion. Default: see defaultAudience. */
  audience?: string;
  /** The org's My Domain URL (salesforce.baseUrl). When set, a token for another org is refused. */
  orgUrl?: string;
  /** The External Client App's consumer key. */
  clientId: string;
  /** The app's private key (PEM). */
  privateKey: string;
  fetch?: FetchLike;
  now?: () => number;
  timeoutMs?: number;
  /** For tests. */
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

const REDACTED = "[redacted]";

/**
 * What a sign-in gives: secret, never logged, stored or shown to a model. An
 * MCP tool must never return it. JSON and console output show the URL redacted.
 */
export class SalesforceSession {
  constructor(
    /** My Domain URL of the org. */
    readonly instanceUrl: string,
    /** Single-use URL that opens a signed-in browser session. Valid for about a minute. */
    readonly frontdoorUrl: string,
  ) {}

  toJSON() {
    return { instanceUrl: this.instanceUrl, frontdoorUrl: REDACTED };
  }

  [inspect.custom]() {
    return `SalesforceSession { instanceUrl: ${JSON.stringify(this.instanceUrl)}, frontdoorUrl: ${REDACTED} }`;
  }
}

/** The fix for each OAuth error, as the reference repo's auth check explains them. */
export const OAUTH_HINTS: Record<string, string> = {
  invalid_app_access:
    "the user is not authorized for the app: assign them the permission set that carries the External Client App, or add their profile to the app's OAuth policies",
  app_not_found: "Salesforce could not find the app for this user: the consumer key belongs to another org, or the username doesn't exist in this org",
  invalid_grant:
    "usually the private key doesn't match the app's certificate, the username is wrong for this org, or the audience doesn't match the login host (https://test.salesforce.com for sandboxes)",
  invalid_client: "the consumer key doesn't match an app in this org, or a new app hasn't propagated yet (up to 30 minutes)",
  invalid_client_id: "the consumer key is not valid for this org",
  inactive_user: "the Salesforce user is inactive",
  inactive_org: "the org is inactive, locked or expired",
  user_non_admin_approved: 'the app still asks each user to approve it: set its policy to "Admin approved users are pre-authorized"',
};

export class SalesforceAuthError extends Error {
  constructor(
    message: string,
    /** The OAuth error code, e.g. invalid_grant. */
    readonly oauthCode?: string,
  ) {
    super(message);
    this.name = "SalesforceAuthError";
  }
}

const b64url = (data: Buffer | string) => Buffer.from(data).toString("base64url");
const TOKEN_PATH = "/services/oauth2/token";
const SINGLE_ACCESS_PATH = "/services/oauth2/singleaccess";
/** Reads OAuth's `{"error": "invalid_grant", …}`; the description is not kept (it can name the user). */
const oauthCode = (body: string) => {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed.error === "string" ? parsed.error : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The assertion's audience when none is given: Salesforce takes only
 * https://login.salesforce.com or https://test.salesforce.com (or an
 * Experience Cloud site), never a My Domain URL.
 */
export function defaultAudience(loginUrl: string): string {
  const url = new URL(loginUrl);
  const host = url.hostname.toLowerCase();
  if (host === "test.salesforce.com" || host.endsWith(".sandbox.my.salesforce.com")) return "https://test.salesforce.com";
  if (host === "login.salesforce.com" || host.endsWith(".my.salesforce.com")) return "https://login.salesforce.com";
  return url.origin;
}

/** A key as the test repo's .env holds it: PEM, PEM with literal \n, or base64 of the PEM. */
export function normalizePem(value: string): string {
  const text = value.trim();
  if (text.includes("-----BEGIN")) return text.replace(/(?:\\r)?\\n/g, "\n");
  if (/^[A-Za-z0-9+/=\s]+$/.test(text)) {
    const decoded = Buffer.from(text, "base64").toString("utf8");
    if (decoded.includes("-----BEGIN")) return decoded;
  }
  return text;
}

/** The origin of an https URL, or undefined. Never throws: a bad URL can hold a secret, and Node's error keeps it. */
function httpsOrigin(value: unknown): string | undefined {
  if (typeof value !== "string" || !URL.canParse(value)) return undefined;
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password ? url.origin : undefined;
}

/** The assertion for the JWT bearer flow. Salesforce refuses one valid for more than about five minutes. */
export function signAssertion(options: { clientId: string; username: string; audience: string; key: KeyObject; now: number; lifetimeSeconds?: number }): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: options.clientId, sub: options.username, aud: options.audience, exp: Math.floor(options.now / 1000) + (options.lifetimeSeconds ?? 180) }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  signer.end();
  return `${header}.${claims}.${b64url(signer.sign(options.key))}`;
}

export class SalesforceAuth {
  private readonly key: KeyObject;
  private readonly login: HttpClient;
  private readonly audience: string;
  private readonly now: () => number;

  constructor(private readonly options: SalesforceAuthOptions) {
    try {
      this.key = createPrivateKey(normalizePem(options.privateKey));
    } catch {
      // Never the key's text, not even part of it.
      throw new SalesforceAuthError("the Salesforce private key can't be read: it must be an RSA private key in PEM form");
    }
    if (this.key.asymmetricKeyType !== "rsa") throw new SalesforceAuthError("the Salesforce private key must be an RSA key (RS256)");
    const login = new URL(options.loginUrl);
    this.audience = options.audience ?? defaultAudience(options.loginUrl);
    this.now = options.now ?? Date.now;
    this.login = new HttpClient({ ...this.http(), service: "Salesforce", baseUrl: login.origin, readOnlyPosts: [(path) => path === TOKEN_PATH] });
  }

  private http(): Omit<HttpClientOptions, "service" | "baseUrl"> {
    const { fetch, timeoutMs, retries, sleep } = this.options;
    // The assertion lives three minutes and is signed once: retries must not wait past it.
    return { ...(fetch ? { fetch } : {}), ...(timeoutMs ? { timeoutMs } : {}), ...(retries !== undefined ? { retries } : {}), ...(sleep ? { sleep } : {}), maxWaitMs: 20_000, errorCode: oauthCode };
  }

  /** An access token for `username`. The username and token are never put in an error. */
  async accessToken(username: string): Promise<{ accessToken: string; instanceUrl: string }> {
    const assertion = signAssertion({ clientId: this.options.clientId, username, audience: this.audience, key: this.key, now: this.now() });
    let payload: { access_token?: unknown; instance_url?: unknown };
    try {
      payload = await this.login.request(TOKEN_PATH, {
        method: "POST",
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
        headers: { "content-type": "application/x-www-form-urlencoded" },
      });
    } catch (error) {
      throw explain(error, "the token request");
    }
    const instance = httpsOrigin(payload.instance_url);
    if (typeof payload.access_token !== "string" || !instance) {
      throw new SalesforceAuthError("Salesforce answered the token request without an access token and an https instance URL");
    }
    if (this.options.orgUrl && instance !== new URL(this.options.orgUrl).origin) {
      throw new SalesforceAuthError("the user signed in to a different org than salesforce.baseUrl: check baseUrl (the org's My Domain URL), loginUrl and the username");
    }
    return { accessToken: payload.access_token, instanceUrl: instance };
  }

  /** Signs in `username`: a fresh single-use frontdoor URL, nothing stored. */
  async session(username: string): Promise<SalesforceSession> {
    const token = await this.accessToken(username);
    const instance = new HttpClient({
      ...this.http(),
      service: "Salesforce",
      baseUrl: token.instanceUrl,
      readOnlyPosts: [(path) => path === SINGLE_ACCESS_PATH],
      headers: () => ({ Authorization: `Bearer ${token.accessToken}` }),
    });
    let payload: { frontdoor_uri?: unknown };
    try {
      payload = await instance.request(SINGLE_ACCESS_PATH, { method: "POST", body: "", headers: { "content-type": "application/x-www-form-urlencoded" } });
    } catch (error) {
      throw explain(error, 'the frontdoor URL request (the app needs the "web" or "full" OAuth scope)');
    }
    // Only a URL on the org's own site is opened.
    if (httpsOrigin(payload.frontdoor_uri) !== token.instanceUrl) {
      throw new SalesforceAuthError('Salesforce gave no frontdoor URL on the org\'s site: check that the app grants the "web" or "full" OAuth scope');
    }
    return new SalesforceSession(token.instanceUrl, payload.frontdoor_uri as string);
  }
}

function explain(error: unknown, what: string): Error {
  if (!(error instanceof ConnectorError)) return error instanceof Error ? error : new Error(String(error));
  const code = error.remoteCode;
  const hint = code && Object.hasOwn(OAUTH_HINTS, code) ? `: ${OAUTH_HINTS[code]}` : "";
  return new SalesforceAuthError(`Salesforce refused ${what}${code ? ` (${code})` : ` (${error.message})`}${hint}`, code);
}
