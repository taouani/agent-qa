import { randomBytes } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
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
  outcome: "done" | "declined" | "denied" | "failed";
  error?: string;
}

export interface AuditSink {
  append(entry: AuditEntry): Promise<void>;
}

/** Appends JSON lines to `.agent-qa/audit.jsonl`. Entries hold masked summaries only. */
export class FileAuditSink implements AuditSink {
  constructor(private readonly file: string) {}
  async append(entry: AuditEntry): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    await appendFile(this.file, JSON.stringify(entry) + "\n", "utf8");
  }
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
  ) {
    super(`Write to ${target} denied: ${reason}`);
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
}

/** Grants issued by `guard`. A look-alike object built elsewhere isn't in here. */
const issued = new WeakSet<object>();

export type GuardResult<T> = { status: "done"; value: T } | { status: "declined" };

export class Policy {
  private readonly now: () => Date;

  constructor(private readonly options: PolicyOptions) {
    this.now = options.now ?? (() => new Date());
  }

  /** What would happen for a write to `target`, without doing it. */
  decide(target: WriteTarget): Decision {
    const rule = this.options.rules[target];
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
   * runs `perform` with a grant, and records the outcome in the audit log.
   * Throws PolicyDenied when the policy forbids the write.
   */
  async guard<T>(request: WriteRequest, perform: (grant: WriteGrant) => Promise<T>): Promise<GuardResult<T>> {
    if (!(WRITE_TARGETS as readonly string[]).includes(request.target)) {
      throw new PolicyDenied(request.target, "unknown write target");
    }
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

    if (decision.kind === "deny") {
      await record("denied");
      throw new PolicyDenied(request.target, decision.reason);
    }
    if (decision.kind === "ask") {
      if (!this.options.confirm) {
        await record("denied", "no way to ask the user");
        throw new PolicyDenied(request.target, "approval required but no way to ask the user");
      }
      if (!(await this.options.confirm(request))) {
        await record("declined");
        return { status: "declined" };
      }
    }

    const grant = { id, target: request.target, via: decision.kind === "pull-request" ? "pull-request" : "direct" } as WriteGrant;
    try {
      Object.freeze(grant);
      issued.add(grant);
      const value = await perform(grant);
      await record("done");
      return { status: "done", value };
    } catch (error) {
      await record("failed", error instanceof Error ? error.name : "Error");
      throw error;
    }
  }
}

/** For connectors: refuse to write without a grant for the right target. */
export function assertGrant(grant: WriteGrant | undefined, target: WriteTarget): asserts grant is WriteGrant {
  if (!grant || !issued.has(grant) || grant.target !== target) {
    throw new PolicyDenied(target, "write attempted without a policy grant");
  }
}
