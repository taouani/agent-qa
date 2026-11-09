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
  /** Reads the value: hidden at a terminal, or all of stdin when piped. Undefined when interrupted. */
  readValue: (prompt: string) => Promise<string | undefined>;
  log?: (line: string) => void;
}

/** Resolves to the exit code: 0 done, 1 the keychain refused, 2 bad input. */
export async function secretCommand(opts: SecretOptions): Promise<number> {
  const log = opts.log ?? ((line: string) => void process.stderr.write(`${line}\n`));
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
