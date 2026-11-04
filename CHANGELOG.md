# sf-agent-qa

## 2.0.0-alpha.0

### Major Changes

- bcee622: Agent-QA v2, first alpha: a TypeScript rewrite of the v1 prompt pack, as an npm package with an MCP server for IDEs and a CLI for CI.

  - `requirements` and `test-cases` workflows from a Jira issue key or a JQL filter, with children and linked issues, and linked Confluence pages.
  - Personal data masked before any model sees it; real values kept in an encrypted local vault.
  - Test cases reviewed by a person, then pushed to Xray Cloud only on their own yes (an MCP prompt in IDEs that support it).
  - `agent-qa init`, `run`, `doctor`, `harness` and `mcp`; a cost report per run; a leak gate for CI.
