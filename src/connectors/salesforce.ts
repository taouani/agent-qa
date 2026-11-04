import { createPrivateKey, createSign, type KeyObject } from "node:crypto";
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
  /** Audience of the assertion. Default: the login URL's origin. Sandboxes use https://test.salesforce.com. */
  audience?: string;
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

/** What a sign-in gives: secret, never logged, stored or shown to a model. */
export interface SalesforceSession {
  /** My Domain URL of the org. */
  instanceUrl: string;
  /** Single-use URL that opens a signed-in browser session. Valid for about a minute. */
  frontdoorUrl: string;
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
      this.key = createPrivateKey(options.privateKey);
    } catch {
      // Never the key's text, not even part of it.
      throw new SalesforceAuthError("the Salesforce private key can't be read: it must be an RSA private key in PEM form");
    }
    if (this.key.asymmetricKeyType !== "rsa") throw new SalesforceAuthError("the Salesforce private key must be an RSA key (RS256)");
    const login = new URL(options.loginUrl);
    this.audience = options.audience ?? login.origin;
    this.now = options.now ?? Date.now;
    this.login = new HttpClient({ ...this.http(), service: "Salesforce", baseUrl: login.origin, readOnlyPosts: [(path) => path === TOKEN_PATH] });
  }

  private http(): Omit<HttpClientOptions, "service" | "baseUrl"> {
    const { fetch, timeoutMs, retries, sleep } = this.options;
    return { ...(fetch ? { fetch } : {}), ...(timeoutMs ? { timeoutMs } : {}), ...(retries !== undefined ? { retries } : {}), ...(sleep ? { sleep } : {}), errorCode: oauthCode };
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
    if (typeof payload.access_token !== "string" || typeof payload.instance_url !== "string" || !/^https:\/\//.test(payload.instance_url)) {
      throw new SalesforceAuthError("Salesforce answered the token request without an access token and an https instance URL");
    }
    return { accessToken: payload.access_token, instanceUrl: payload.instance_url.replace(/\/+$/, "") };
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
    const url = typeof payload.frontdoor_uri === "string" ? payload.frontdoor_uri : "";
    // Only a URL on the org's own site is opened.
    if (!url.startsWith("https://") || new URL(url).origin !== new URL(token.instanceUrl).origin) {
      throw new SalesforceAuthError('Salesforce gave no frontdoor URL on the org\'s site: check that the app grants the "web" or "full" OAuth scope');
    }
    return { instanceUrl: token.instanceUrl, frontdoorUrl: url };
  }
}

function explain(error: unknown, what: string): Error {
  if (!(error instanceof ConnectorError)) return error instanceof Error ? error : new Error(String(error));
  const code = error.remoteCode;
  const hint = code && Object.hasOwn(OAUTH_HINTS, code) ? `: ${OAUTH_HINTS[code]}` : "";
  return new SalesforceAuthError(`Salesforce refused ${what}${code ? ` (${code})` : ` (${error.message})`}${hint}`, code);
}
