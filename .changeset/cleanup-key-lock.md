---
"sf-agent-qa": patch
---

The vault key is created in the OS keychain under a lock file, `~/.agent-qa/vault-key.lock`, shared by the user's Agent-QA processes, so an MCP server and a CLI run starting at the same moment can't each create a key (one process's vaults would then be unreadable). Only its owner removes it, and one left by a crash is taken over once it has not changed for 3 minutes (long, because a keychain prompt can hold the process meanwhile). If `~/.agent-qa` can't be written, the key is created without the lock, as before.
