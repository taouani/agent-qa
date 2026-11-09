import { literalSecretKind } from "../core/index.js";
import type { SecretStore } from "../data/index.js";

/**
 * `agent-qa secret set|delete <NAME>` (S5-1b): keeps a secret in the OS keychain,
 * where `${keychain:NAME}` in agent-qa.yaml reads it. An IDE's Agent-QA server
 * finds it however the IDE was started, unlike a variable set in a terminal.
 * The value is never an argument (it would stay in the shell's history), never
 * printed, and never logged.
 */
export interface SecretOptions {
  action: "set" | "delete";
  name: string;
  store: SecretStore;
  /**
   * Reads the value: hidden at a terminal, or all of stdin when piped. Undefined when
   * interrupted; a {@link ValueRefused} when the typing can't be kept as it is.
   */
  readValue: (prompt: string) => Promise<string | ValueRefused | undefined>;
  log?: (line: string) => void;
}

/** Resolves to the exit code: 0 done, 1 the keychain refused, 2 bad input. */
export async function secretCommand(opts: SecretOptions): Promise<number> {
  const log = opts.log ?? ((line: string) => void process.stderr.write(`${line}\n`));
  // A token pasted where the name goes would end up in the shell's history: say so, without echoing it.
  const kind = literalSecretKind(opts.name);
  if (kind) {
    log(`agent-qa secret: the name looks like a secret (${kind}), not a name. Give a name such as JIRA_TOKEN; the value is asked for after. If it was a real secret, it is now in your shell's history: clear it there, and rotate the secret.`);
    return 2;
  }
  try {
    if (opts.action === "delete") {
      const removed = await opts.store.delete(opts.name);
      log(removed ? `${opts.name}: removed from the OS keychain` : `${opts.name}: not in the OS keychain`);
      return 0;
    }
    // Checks the name and that the keychain opens before asking for anything.
    const replaced = await opts.store.has(opts.name);
    const value = await opts.readValue(`Value for ${opts.name} (not shown): `);
    if (value === undefined) {
      log("agent-qa secret: stopped, nothing stored");
      return 2;
    }
    if (typeof value !== "string") {
      log(`agent-qa secret: ${value.refused}, nothing stored`);
      return 2;
    }
    // A pasted value often brings a line end; spaces inside it are kept.
    const secret = value.replace(/\r?\n$/, "");
    if (!secret.trim()) {
      log("agent-qa secret: the value is empty, nothing stored");
      return 2;
    }
    await opts.store.set(opts.name, secret);
    log(`${opts.name}: ${replaced ? "replaced" : "stored"} in the OS keychain (service ${opts.store.service}). agent-qa.yaml reads it as \${keychain:${opts.name}}.`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`agent-qa secret: ${message}`);
    return /isn't a secret name|vault key's own entry/.test(message) ? 2 : 1;
  }
}

/** The reader refused the typing (see {@link typedValue}). */
export interface ValueRefused {
  refused: string;
}

/** Where the hidden typing stands after one chunk of terminal input. */
export type Typing =
  | { state: "typing"; value: string }
  | { state: "done"; value: string }
  | { state: "cancelled" }
  | { state: "refused"; reason: string };

/**
 * Applies one chunk of raw terminal input to the value typed so far. Enter ends the
 * value, Ctrl+C (or Ctrl+D on an empty value) cancels, backspace deletes, escape
 * sequences (arrow keys and the like) and other control characters are dropped. A
 * paste with text after a line end is refused rather than cut: what follows the
 * line end would otherwise be left for the shell to run.
 */
export function typedValue(value: string, chunk: string): Typing {
  const text = chunk.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\u001bO./g, "").replace(/\u001b[@-_]?/g, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "\r" || ch === "\n") {
      const rest = text.slice(i + 1).replace(/^\n/, "");
      if (rest.length > 0) return { state: "refused", reason: "the pasted value has more than one line: pipe it in instead, as docs/getting-started.md shows" };
      return { state: "done", value };
    }
    if (ch === "\u0003" || (ch === "\u0004" && value === "")) return { state: "cancelled" };
    if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
    else if (ch >= " ") value += ch;
  }
  return { state: "typing", value };
}
