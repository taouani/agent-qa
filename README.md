# Agent-QA v2

> **Looking for v1?** The markdown prompt pack is frozen at tag `v1.0.0` on the [`v1` branch](https://github.com/taouani/agent-qa/tree/v1). Its install commands still work, including the old `master` URLs, which forward to `v1`.

Agent-QA v2 is an open-source QA agent, published on npm as `sf-agent-qa` (the command is `agent-qa`). It turns Jira, Confluence and Xray Cloud data into validated test cases and runnable Playwright TypeScript scripts, with a focus on Salesforce. It runs in GitHub Copilot, Claude Code and Cursor through an MCP server, and in CI through its own CLI.

Two rules shape the design:

- **Personal data is masked before any model sees it.** It's replaced with tokens, and the real values stay in an encrypted local vault (GDPR, PIPL, CCPA).
- **Every output is validated and every write is gated.** Artifacts are typed JSON checked against schemas, and pushes to Xray, Confluence or your test code go through a policy layer.

## Status

v2 is under active development and isn't ready to use yet. The first release, 2.0.0, is planned for 28 February 2027. Until then, use v1.

Using it in an IDE: see [docs/ide.md](docs/ide.md). Checking that no personal data reaches a model: see [docs/harness.md](docs/harness.md).

## Development

Requires Node.js 20 or later.

```bash
npm install
npm run check      # typecheck, lint, test, build
```

The source is split into modules under `src/`, and lint rules enforce which modules may import which. Only `src/data` may call the connectors, so every read goes through the masking gateway. See `eslint.config.js`.

## License

[Apache-2.0](LICENSE)
