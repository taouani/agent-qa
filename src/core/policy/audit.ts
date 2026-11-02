import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AuditEntry, AuditSink } from "./policy.js";

/** Appends JSON lines to the audit log. Entries hold masked summaries only. */
export class FileAuditSink implements AuditSink {
  constructor(readonly file: string) {}

  /** The default log for a project: `{root}/.agent-qa/audit.jsonl`. */
  static forRoot(root: string): FileAuditSink {
    return new FileAuditSink(join(root, ".agent-qa", "audit.jsonl"));
  }

  async append(entry: AuditEntry): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    // One appendFile call per entry: the line is written with O_APPEND in a single write.
    await appendFile(this.file, JSON.stringify(entry) + "\n", "utf8");
  }
}
