import { keychainStore, type KeyringFactory } from "../masking/index.js";

/**
 * `agent-qa secret` (S5-1b): the OS keychain entries that `${keychain:NAME}`
 * references in agent-qa.yaml read, under the service sf-agent-qa. The value
 * comes from the person at a hidden prompt, and is never printed or logged.
 */
export function secretStore(factory?: KeyringFactory) {
  return keychainStore(factory);
}
export type SecretStore = ReturnType<typeof secretStore>;
