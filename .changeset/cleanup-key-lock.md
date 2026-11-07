---
"sf-agent-qa": patch
---

The vault key is created in the OS keychain under a lock file shared by the user's Agent-QA processes, so an MCP server and a CLI run starting at the same moment can't each create a key (one process's vaults would then be unreadable). A lock left by a crash is taken over after 30 s.
