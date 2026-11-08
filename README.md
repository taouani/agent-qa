# Agent-QA v2

> **Looking for v1?** The markdown prompt pack is frozen at tag `v1.0.0` on the [`v1` branch](https://github.com/taouani/agent-qa/tree/v1). Its install commands still work, including the old `master` URLs, which forward to `v1`.

Agent-QA v2 is an open-source QA agent, published on npm as `sf-agent-qa` (the command is `agent-qa`). It turns Jira, Confluence and Xray Cloud data into validated test cases and runnable Playwright TypeScript scripts, with a focus on Salesforce. It runs in GitHub Copilot, Claude Code and Cursor through an MCP server, and in CI through its own CLI.

Two rules shape the design:

- **Personal data is masked before any model sees it.** It's replaced with tokens, and the real values stay in an encrypted local vault (GDPR, PIPL, CCPA).
- **Every output is validated and every write is gated.** Artifacts are typed JSON checked against schemas, and pushes to Xray, Confluence or your test code go through a policy layer.

## Status

v2 is in alpha, on the npm `next` tag. Expect breaking changes before 2.0.0, planned for 28 February 2027. The alpha covers requirements analysis, test cases pushed to Xray, Playwright scripts (Gherkin with playwright-bdd, specs, or API tests) written into your repo and run there, and maintaining an existing suite (run, debug, review, audit, refactor). It also writes QA documents (strategy, plan, charter, risk register, test data, traceability and release notes) and can publish them to Confluence. The analysis can also read the pull requests that name each issue. For everything else v1 did (accessibility), keep using v1 for now: see [docs/migrating-from-v1.md](docs/migrating-from-v1.md).

## Quickstart

Requires Node.js 20 or later, a Jira Cloud site with an API token, and for pushes, an Xray Cloud API key.

```bash
cd your-project
npx -y sf-agent-qa@next init --site https://your-site.atlassian.net --xray-project QA
```

`init` writes `agent-qa.yaml` (settings only: secrets stay in environment variables or your OS keychain), the MCP settings for VS Code (`.vscode/mcp.json`), Claude Code (`.mcp.json`) and Cursor (`.cursor/mcp.json`), and the `.gitignore` lines for `.agent-qa/`. Then set the variables it names and check the setup:

```bash
export ATLASSIAN_EMAIL=you@example.com ATLASSIAN_TOKEN=... XRAY_CLIENT_ID=... XRAY_CLIENT_SECRET=...
npx -y sf-agent-qa@next doctor
```

**In VS Code with Copilot** (agent mode), start the MCP server from `.vscode/mcp.json`, then run `/mcp.agent-qa.test-cases` (type `/agent-qa` and pick it) with inputs such as `{"key":"ABC-123"}` or `{"jql":"project = ABC AND sprint in openSprints()"}`. Copilot writes the cases, you review them, and Agent-QA asks you before anything goes to Xray. See [docs/ide.md](docs/ide.md).

**From a terminal or CI**, with a model API key (`ANTHROPIC_API_KEY` for the default model):

```bash
npx -y sf-agent-qa@next run test-cases --key ABC-123
npx -y sf-agent-qa@next run test-cases --jql "project = ABC AND fixVersion = 2.4" --ci --yes
```

Without an API key, `--headless claude-code` or `--headless copilot` answers each step with Claude Code or Copilot CLI and its own sign-in, every agent tool off. See [docs/ci.md](docs/ci.md) for that and for GitHub Actions, Azure Pipelines and GitLab CI jobs.

`--yes` accepts the review as unattended and never pushes; `--accept push` pushes. In CI (`--ci`), a push also needs `policy.writes.xray: allow` in `agent-qa.yaml`, because `ask` is denied when nobody can be asked. Each run's files are in `.agent-qa/runs/`, with a cost report. To check that no personal data reaches a model, see [docs/harness.md](docs/harness.md).

**Playwright.** Three workflows, each asking you before it writes or runs anything:

1. `profile` reads your repo's Playwright project (playwright-bdd steps, page objects, fixtures) without running it. `agent-qa run profile --accept review` saves `agent-qa.profile.json`, the only commands Agent-QA may run in your repo. In a folder with no Playwright project and no `package.json`, `agent-qa run profile --accept scaffold` starts a new Salesforce Playwright repo instead. See [docs/profile.md](docs/profile.md).
2. `explore` (optional) walks reviewed test cases in a browser on your sandbox, from masked pages, into `exploration@1`. See [docs/explore.md](docs/explore.md) and, for sign-in, [docs/salesforce.md](docs/salesforce.md).
3. `scripts` writes the code for reviewed cases, checks it, writes it to your repo on your yes, runs it, and fixes only selectors, waits and test data. A real defect is reported, never fixed in the test. In CI, the code leaves as a pull request. With `api: true` it writes API tests (Playwright `request`, no browser). See [docs/scripts.md](docs/scripts.md).

**Your existing suite.** These workflows work on tests Agent-QA didn't write. You see every diff before anything is written, and in CI changes leave as a pull request:

- `run-tests` runs a chosen part of the suite, and can record the results in Xray as a Test Execution with what changed since the last one: [docs/run-tests.md](docs/run-tests.md).
- `debug` fixes failing tests' selectors and waits, and reports defects, test data and the environment: [docs/debug.md](docs/debug.md).
- `review` reviews the files you name, with optional small fixes: [docs/review.md](docs/review.md).
- `audit` is a read-only architecture audit of the suite: [docs/audit.md](docs/audit.md).
- `refactor` carries out an audit's findings phase by phase, keeping what every test checks: [docs/refactor.md](docs/refactor.md).
- `document` writes a test strategy, plan, charter, risk register, test data, traceability report or release notes from the requirements, reviewed test cases and test results: [docs/documents.md](docs/documents.md).

## Development

Requires Node.js 20 or later.

```bash
npm install
npm run check      # typecheck, lint, test, build
```

The source is split into modules under `src/`, and lint rules enforce which modules may import which. Only `src/data` may call the connectors, so every read goes through the masking gateway. See `eslint.config.js`.

## License

[Apache-2.0](LICENSE)
