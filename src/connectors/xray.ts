import type { WriteGrant } from "../core/index.js";
import { ConnectorError, HttpClient, type FetchLike, type HttpClientOptions } from "./http.js";

/**
 * Xray Cloud (S1-10): client-credential auth, the bulk test import and its
 * job status. Writes need a policy grant for `xray`.
 *
 * API shapes (Xray Cloud REST v2), from Xray's public docs; not yet checked
 * against a live tenant:
 * - POST /api/v2/authenticate {client_id, client_secret} → the token, as a JSON string
 * - POST /api/v2/import/test/bulk [tests] → {jobId}
 * - GET  /api/v2/import/test/bulk/{jobId}/status → {status, result: {errors, issues, warnings}}
 * - POST /api/v2/import/execution/multipart, parts `results` (Xray JSON:
 *   {info, tests: [{testKey, status, comment}]}) and `info` (the Test
 *   Execution's Jira fields) → {id, key} (S3-9)
 */

/** A date as Xray JSON's examples write it: seconds and an offset, no milliseconds (2026-11-07T20:00:13+00:00). */
export const xrayDate = (d: Date): string => `${d.toISOString().slice(0, 19)}+00:00`;

export const XRAY_CLOUD_URL = "https://xray.cloud.getxray.app";
const AUTH_PATH = "/api/v2/authenticate";
const BULK_PATH = "/api/v2/import/test/bulk";
/** Xray's documented limit per bulk import. */
export const XRAY_BULK_LIMIT = 1000;
const JOB_ID = /^[A-Za-z0-9_-]{1,100}$/;
const EXECUTION_PATH = "/api/v2/import/execution/multipart";
const ISSUE_KEY = /^[A-Z][A-Z0-9_]+-\d+$/;

/** The statuses Agent-QA records; Xray's built-in ones. */
export type XrayRunStatus = "PASSED" | "FAILED" | "TODO";

export interface XrayExecutionResult {
  testKey: string;
  status: XrayRunStatus;
  /** Masked: where it failed, the error and the code. */
  comment?: string;
  start?: Date;
  finish?: Date;
  /** Files attached to the test run, such as a failure screenshot. */
  evidence?: XrayEvidence[];
}

export interface XrayEvidence {
  /** Base64. */
  data: string;
  filename: string;
  contentType: string;
}

export interface XrayExecutionInput {
  project: string;
  summary: string;
  description: string;
  labels: string[];
  startedAt: Date;
  finishedAt: Date;
  tests: XrayExecutionResult[];
}

export interface XrayStep {
  action: string;
  data: string;
  result: string;
}

/** One test in Xray's bulk import format. */
export interface XrayTest {
  testtype: "Manual";
  /** Update this existing test instead of creating one. */
  update_key?: string;
  fields: {
    summary: string;
    project: { key: string };
    labels: string[];
    description?: string;
    priority?: { name: string };
  };
  /** Links the test to its requirement ("tests" / "is tested by"). */
  update?: { issuelinks: Array<{ add: { type: { name: string }; outwardIssue: { key: string } } }> };
  steps: XrayStep[];
}

export interface XrayJobIssue {
  /** Index of the test in the import, from 0. */
  elementNumber: number;
  key: string;
}

export interface XrayJobResult {
  status: "successful" | "partially_successful" | "failed";
  issues: XrayJobIssue[];
  /** Errors by element: only the rejected field names, never Xray's texts. */
  errors: Array<{ elementNumber?: number; message: string }>;
}

export interface XrayClientOptions extends Partial<Omit<HttpClientOptions, "service" | "baseUrl" | "headers" | "writeTarget" | "readOnlyPosts">> {
  clientId: string;
  clientSecret: string;
  /** Default the global Xray Cloud; regional tenants use e.g. https://eu.xray.cloud.getxray.app. */
  baseUrl?: string;
  fetch?: FetchLike;
  /** Wait between job status checks. Default 2 s. */
  pollMs?: number;
  /** Longest wait for one import job. Default 10 minutes. */
  jobTimeoutMs?: number;
  now?: () => number;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export class XrayClient {
  readonly http: HttpClient;
  private readonly auth: HttpClient;
  private token: Promise<string> | undefined;
  private readonly pollMs: number;
  private readonly jobTimeoutMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: XrayClientOptions) {
    const { baseUrl, pollMs, jobTimeoutMs, now, fetch, timeoutMs, retries, maxWaitMs, sleep, random } = options;
    // Only HTTP settings go to the clients: never the credentials.
    const rest = Object.fromEntries(Object.entries({ fetch, timeoutMs, retries, maxWaitMs, sleep, random }).filter(([, v]) => v !== undefined)) as Partial<HttpClientOptions>;
    const base = baseUrl ?? XRAY_CLOUD_URL;
    // Authentication is a POST that changes nothing remote.
    this.auth = new HttpClient({ ...rest, service: "Xray", baseUrl: base, readOnlyPosts: [(path) => path === AUTH_PATH] });
    this.http = new HttpClient({
      ...rest,
      service: "Xray",
      baseUrl: base,
      writeTarget: "xray",
      headers: async () => ({ Authorization: `Bearer ${await this.bearer()}` }),
    });
    this.pollMs = pollMs ?? 2000;
    this.jobTimeoutMs = jobTimeoutMs ?? 10 * 60_000;
    this.now = now ?? Date.now;
    this.sleep = rest.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  private bearer(): Promise<string> {
    this.token ??= this.auth
      .request<unknown>(AUTH_PATH, { method: "POST", body: { client_id: this.options.clientId, client_secret: this.options.clientSecret } })
      .then((t) => {
        if (typeof t !== "string" || !t) throw new ConnectorError("INVALID_RESPONSE", "Xray", "POST", AUTH_PATH, undefined, "Xray authentication returned no token");
        return t;
      });
    this.token.catch(() => (this.token = undefined));
    return this.token;
  }

  /** Starts a bulk import; returns its job id. */
  async importTests(tests: XrayTest[], grant: WriteGrant): Promise<string> {
    if (tests.length === 0 || tests.length > XRAY_BULK_LIMIT) throw new Error(`An Xray bulk import takes 1 to ${XRAY_BULK_LIMIT} tests, not ${tests.length}`);
    const answer = obj(await this.http.request(BULK_PATH, { method: "POST", body: tests, grant }));
    const jobId = answer.jobId;
    if (typeof jobId !== "string" || !JOB_ID.test(jobId)) throw new ConnectorError("INVALID_RESPONSE", "Xray", "POST", BULK_PATH, undefined, "Xray bulk import returned no job id");
    return jobId;
  }

  /** The job's state: still running (`undefined`), or its result. */
  async jobStatus(jobId: string): Promise<XrayJobResult | undefined> {
    if (!JOB_ID.test(jobId)) throw new Error("Not an Xray job id");
    const answer = obj(await this.http.get(`${BULK_PATH}/${jobId}/status`));
    const status = answer.status;
    if (status === "pending" || status === "working") return undefined;
    if (typeof status !== "string") throw new ConnectorError("INVALID_RESPONSE", "Xray", "GET", `${BULK_PATH}/{jobId}/status`, undefined, "Xray job status has no status");
    // Any other status is final; one Agent-QA doesn't know (e.g. "unsuccessful") counts as failed, keeping its errors.
    const final: XrayJobResult["status"] = status === "successful" || status === "partially_successful" ? status : "failed";
    const result = obj(answer.result);
    const issues = arr(result.issues)
      .map(obj)
      .filter((i) => typeof i.key === "string" && typeof i.elementNumber === "number")
      .map((i) => ({ elementNumber: i.elementNumber as number, key: i.key as string }));
    const errors = arr(result.errors).map((e) => {
      const o = obj(e);
      // Only the field names: Xray's texts can quote data from Jira (names, summaries).
      const fields = o.errors && typeof o.errors === "object" ? Object.keys(o.errors as Raw) : [];
      const message = fields.length ? `rejected: ${fields.join(", ")}` : "rejected by Xray";
      return { ...(typeof o.elementNumber === "number" ? { elementNumber: o.elementNumber } : {}), message: message.slice(0, 500) };
    });
    return { status: final, issues, errors };
  }

  /** Imports and waits for the job to finish. */
  async importAndWait(tests: XrayTest[], grant: WriteGrant): Promise<XrayJobResult & { jobId: string }> {
    const jobId = await this.importTests(tests, grant);
    const deadline = this.now() + this.jobTimeoutMs;
    try {
      for (;;) {
        const result = await this.jobStatus(jobId);
        if (result) return { ...result, jobId };
        if (this.now() >= deadline) {
          throw new ConnectorError("TIMEOUT", "Xray", "GET", `${BULK_PATH}/{jobId}/status`, undefined, `Xray import job ${jobId} did not finish in ${Math.round(this.jobTimeoutMs / 1000)} s; it may still complete in Xray, so check Xray before pushing again`);
        }
        await this.sleep(this.pollMs);
      }
    } catch (error) {
      if (error instanceof ConnectorError) error.jobId = jobId;
      throw error;
    }
  }

  /**
   * Records results as a new Test Execution (S3-9), with its labels, so a
   * person can find it in Xray. Only keys and statuses, plus a masked comment,
   * go out.
   */
  async importExecution(input: XrayExecutionInput, grant: WriteGrant): Promise<{ key: string }> {
    if (!/^[A-Z][A-Z0-9_]+$/.test(input.project)) throw new Error("Not a Jira project key");
    if (input.tests.length === 0) throw new Error("A Test Execution needs at least one result");
    for (const t of input.tests) if (!ISSUE_KEY.test(t.testKey)) throw new Error("Not an Xray test key");
    const results = {
      info: { summary: input.summary, description: input.description, startDate: xrayDate(input.startedAt), finishDate: xrayDate(input.finishedAt) },
      tests: input.tests.map((t) => ({
        testKey: t.testKey,
        ...(t.start ? { start: xrayDate(t.start) } : {}),
        ...(t.finish ? { finish: xrayDate(t.finish) } : {}),
        status: t.status,
        ...(t.comment ? { comment: t.comment } : {}),
        ...(t.evidence?.length ? { evidence: t.evidence.map((e) => ({ data: e.data, filename: e.filename, contentType: e.contentType })) } : {}),
      })),
    };
    const info = { fields: { project: { key: input.project }, summary: input.summary, description: input.description, issuetype: { name: "Test Execution" }, labels: input.labels } };
    const boundary = `agent-qa-${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
    const part = (name: string, value: unknown) => `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${name}.json"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(value)}\r\n`;
    const body = `${part("results", results)}${part("info", info)}--${boundary}--\r\n`;
    const answer = obj(await this.http.request(EXECUTION_PATH, { method: "POST", body, headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, grant }));
    const key = answer.key;
    if (typeof key !== "string" || !ISSUE_KEY.test(key)) throw new ConnectorError("INVALID_RESPONSE", "Xray", "POST", EXECUTION_PATH, undefined, "Xray execution import returned no issue key");
    return { key };
  }
}
