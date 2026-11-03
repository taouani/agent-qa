# Agent-QA v2

> **Looking for v1?** The markdown prompt pack is frozen at tag `v1.0.0` on the [`v1` branch](https://github.com/taouani/agent-qa/tree/v1). Its install commands still work, including the old `master` URLs, which forward to `v1`.

Agent-QA v2 is an open-source QA agent, published on npm as `sf-agent-qa` (the command is `agent-qa`). It turns Jira, Confluence and Xray Cloud data into validated test cases and runnable Playwright TypeScript scripts, with a focus on Salesforce. It runs in GitHub Copilot, Claude Code and Cursor through an MCP server, and in CI through its own CLI.

Two rules shape the design:

- **Personal data is masked before any model sees it.** It's replaced with tokens, and the real values stay in an encrypted local vault (GDPR, PIPL, CCPA).
- **Every output is validated and every write is gated.** Artifacts are typed JSON checked against schemas, and pushes to Xray, Confluence or your test code go through a policy layer.

## Status

v2 is in alpha: `2.0.0-alpha.0` on the npm `next` tag. Expect breaking changes before 2.0.0, planned for 28 February 2027. The alpha covers requirements analysis and test cases pushed to Xray. For everything else v1 did (test plans, strategies, Gherkin, Playwright, release notes and more), keep using v1 for now: see [docs/migrating-from-v1.md](docs/migrating-from-v1.md).

## Quickstart

Requires Node.js 20 or later, a Jira Cloud site with an API token, and for pushes, an Xray Cloud API key.

```bash
cd your-project
npx -y sf-agent-qa@next init --site https://your-site.atlassian.net --xray-project QA
```

`init` writes `agent-qa.yaml` (settings only: secrets stay in environment variables or your OS keychain), `.vscode/mcp.json` and the `.gitignore` lines for `.agent-qa/`. Then set the variables it names and check the setup:

```bash
export ATLASSIAN_EMAIL=you@example.com ATLASSIAN_TOKEN=... XRAY_CLIENT_ID=... XRAY_CLIENT_SECRET=...
npx -y sf-agent-qa@next doctor
```

**In VS Code with Copilot** (agent mode), start the MCP server from `.vscode/mcp.json`, then run `/agent-qa.test-cases` with inputs such as `{"key":"ABC-123"}` or `{"jql":"project = ABC AND sprint in openSprints()"}`. Copilot writes the cases, you review them, and Agent-QA asks you before anything goes to Xray. See [docs/ide.md](docs/ide.md).

**From a terminal or CI**, with a model API key (`ANTHROPIC_API_KEY` for the default model):

```bash
npx -y sf-agent-qa@next run test-cases --key ABC-123
npx -y sf-agent-qa@next run test-cases --jql "project = ABC AND fixVersion = 2.4" --ci --yes
```

`--yes` accepts the review as unattended and never pushes; `--accept push` pushes. In CI (`--ci`), a push also needs `policy.writes.xray: allow` in `agent-qa.yaml`, because `ask` is denied when nobody can be asked. Each run's files are in `.agent-qa/runs/`, with a cost report. To check that no personal data reaches a model, see [docs/harness.md](docs/harness.md).

## Development

Requires Node.js 20 or later.

```bash
npm install
npm run check      # typecheck, lint, test, build
```

The source is split into modules under `src/`, and lint rules enforce which modules may import which. Only `src/data` may call the connectors, so every read goes through the masking gateway. See `eslint.config.js`.

## License

[Apache-2.0](LICENSE)
