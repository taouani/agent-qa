---
"sf-agent-qa": minor
---

`agent-qa init` also sets up Claude Code (`.mcp.json`) and Cursor (`.cursor/mcp.json`) besides VS Code. `--host vscode,claude-code,cursor` picks which; all three by default. Existing servers are kept, and a file that isn't plain JSON is left alone with the server to add printed.
