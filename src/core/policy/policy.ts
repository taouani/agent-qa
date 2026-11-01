import { randomBytes } from "node:crypto";
import type { Config } from "../config/index.js";

/**
 * The policy layer (slice 0, T6). Every write outside the run folder goes
 * through `Policy.guard`: pushes to Xray, Confluence publishes, test code, and
 * any Jira change. Connectors that write take a `WriteGrant`, which only
 * `guard` can create, so an unguarded write doesn't type-check.
 */

export const WRITE_TARGETS = ["xray", "confluence", "testCode", "jira"] as const;
export type WriteTarget = (typeof WRITE_TARGETS)[number];
export type WriteRule = "allow" | "ask" | "deny";
export type Mode = "ide" | "ci";

export type Decision =
  | { kind: "allow" }
  | { kind: "ask" }
  | { kind: "pull-request" }
  | { kind: "deny"; reason: string };

export interface WriteRequest {
  target: WriteTarget;
  /** What will happen, in masked text only, e.g. "Push 14 test cases to Xray project PROJ". */
  summary: string;
  runId?: string;
}

declare const grantBrand: unique symbol;
/** Proof that a write was approved. Only `Policy.guard` creates one. */
export interface WriteGrant {
  readonly [grantBrand]: true;
  readonly id: string;
  readonly target: WriteTarget;
  readonly via: "direct" | "pull-request";
}

export interface AuditEntry {
  at: string;
  id: string;
  mode: Mode;
  target: WriteTarget;
  summary: string;
  runId?: string;
  decision: Decision["kind"];
  /** `approved` is written before the write runs; a write never runs if that entry can't be stored. */
  outcome: "approved" | "done" | "declined" | "denied" | "failed";
  error?: string;
}

export interface AuditSink {
  append(entry: AuditEntry): Promise<void>;
}

export class MemoryAuditSink implements AuditSink {
  readonly entries: AuditEntry[] = [];
  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}

export class PolicyDenied extends Error {
  constructor(
    readonly target: WriteTarget,
    readonly reason: string,
    options?: { cause?: unknown },
  ) {
    super(`Write to ${target} denied: ${reason}`, options);
    this.name = "PolicyDenied";
  }
}

export interface PolicyOptions {
  rules: Config["policy"]["writes"];
  mode: Mode;
  audit: AuditSink;
  /** Asks the user; resolves true to proceed. Required for `ask` in IDE mode. */
  confirm?: (request: WriteRequest) => Promise<boolean>;
  now?: () => Date;
  /**
   * Called when the audit entry for a finished write can't be stored. The write
   * already happened, so guard still returns its result; the `approved` entry stays.
   */
  onAuditError?: (error: unknown) => void;
}

const isTarget = (t: unknown): t is WriteTarget => (WRITE_TARGETS as readonly unknown[]).includes(t);
const RULES: readonly unknown[] = ["allow", "ask", "deny"];

/** Error names go into the audit log; anything that isn't a plain identifier becomes "Error". */
function errorName(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  return /^[A-Za-z]{1,40}$/.test(name) ? name : "Error";
}

/** Grants issued by `guard`. A look-alike object built elsewhere isn't in here. */
const issued = new WeakSet<object>();

export type GuardResult<T> = { status: "done"; value: T } | { status: "declined" };

export class Policy {
  private readonly now: () => Date;

  constructor(private readonly options: PolicyOptions) {
    this.now = options.now ?? (() => new Date());
  }

  /** What would happen for a write to `target`, without doing it. Unknown targets and rules are denied. */
  decide(target: WriteTarget): Decision {
    if (!isTarget(target)) return { kind: "deny", reason: "unknown write target" };
    const rules = this.options.rules as Record<string, unknown>;
    const rule = Object.hasOwn(rules, target) ? rules[target] : undefined;
    if (!RULES.includes(rule)) return { kind: "deny", reason: `policy.writes.${target} is not allow, ask or deny` };
    if (rule === "deny") return { kind: "deny", reason: `policy.writes.${target} is "deny"` };
    if (this.options.mode === "ci") {
      // CI rule: test code only ever leaves as a pull or merge request.
      if (target === "testCode") return { kind: "pull-request" };
      if (rule === "ask") {
        return { kind: "deny", reason: `nobody can answer "ask" in CI; set policy.writes.${target}: allow to write from CI` };
      }
      return { kind: "allow" };
    }
    return rule === "allow" ? { kind: "allow" } : { kind: "ask" };
  }

  /**
   * The one way to write outside the run folder. Decides, asks if needed,
   * records `approved`, runs `perform` with a grant that is valid only while
   * `perform` runs, and records the outcome. Throws PolicyDenied when the
   * policy forbids the write or the audit log can't record the approval.
   */
  async guard<T>(request: WriteRequest, perform: (grant: WriteGrant) => Promise<T>): Promise<GuardResult<T>> {
    const decision = this.decide(request.target);
    const id = randomBytes(6).toString("hex");
    const record = (outcome: AuditEntry["outcome"], error?: string) =>
      this.options.audit.append({
        at: this.now().toISOString(),
        id,
        mode: this.options.mode,
        target: request.target,
        summary: request.summary,
        ...(request.runId ? { runId: request.runId } : {}),
        decision: decision.kind,
        outcome,
        ...(error ? { error } : {}),
      });
    const deny = async (reason: string, note?: string): Promise<never> => {
      try {
        await record("denied", note);
      } catch (cause) {
        throw new PolicyDenied(request.target, reason, { cause });
      }
      throw new PolicyDenied(request.target, reason);
    };
    const quietly = async (outcome: AuditEntry["outcome"], error?: string) => {
      try {
        await record(outcome, error);
      } catch (auditError) {
        this.options.onAuditError?.(auditError);
      }
    };

    if (decision.kind === "deny") return deny(decision.reason);
    if (decision.kind === "ask") {
      if (!this.options.confirm) return deny("approval required but no way to ask the user", "no way to ask the user");
      let approved: boolean;
      try {
        approved = await this.options.confirm(request);
      } catch (error) {
        await quietly("failed", errorName(error));
        throw error;
      }
      if (!approved) {
        await quietly("declined");
        return { status: "declined" };
      }
    }

    try {
      await record("approved");
    } catch (cause) {
      throw new PolicyDenied(request.target, "the audit log can't be written, so the write was not made", { cause });
    }

    const grant = Object.freeze({
      id,
      target: request.target,
      via: decision.kind === "pull-request" ? "pull-request" : "direct",
    }) as WriteGrant;
    issued.add(grant);
    let value: T;
    try {
      value = await perform(grant);
    } catch (error) {
      await quietly("failed", errorName(error));
      throw error;
    } finally {
      issued.delete(grant); // a grant kept by a connector is worthless after guard returns
    }
    await quietly("done");
    return { status: "done", value };
  }
}

/** For connectors: refuse to write without a grant for the right target. */
export function assertGrant(grant: WriteGrant | undefined, target: WriteTarget): asserts grant is WriteGrant {
  if (!grant || !issued.has(grant) || grant.target !== target) {
    throw new PolicyDenied(target, "write attempted without a policy grant");
  }
}
