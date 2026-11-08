# Spike: headless CI drivers (S4-10, 8 Nov 2026)

**Question.** Can Agent-QA use Claude Code or GitHub Copilot CLI in CI, with their own sign-in, instead of a model API key, without letting the agent see anything but the masked prompt?

**Answer: yes, as one CLI call per step with every tool off.** Both CLIs have a non-interactive mode and flags to turn tools, MCP servers and instruction files off. Checked from `claude --help` (Claude Code 2.1.319) and `copilot --help` (Copilot CLI 1.0.107, installed from npm). No live call was made: that needs a signed-in CLI (live check, S4-12).

| | Claude Code | Copilot CLI |
|---|---|---|
| Non-interactive | `-p`, prompt on stdin | `-p <text>`, or piped stdin (from the help of `--fleet`; to check live) |
| Tools off | `--tools ""` | `--available-tools=` (to check live that an empty list means none), plus `--deny-tool=shell`, `--deny-tool=write`, `--disallow-temp-dir` |
| No MCP, settings or instructions | `--strict-mcp-config`, `--disable-slash-commands`, `--setting-sources project` in an empty folder (no hooks, no CLAUDE.md); not `--bare`, which refuses OAuth | `--disable-builtin-mcps`, `--no-custom-instructions`, `-C <empty folder>` |
| Structured answer | `--output-format json`, `--json-schema` (answer in `structured_output`) | none: the schema is in the prompt, the engine validates and retries |
| Usage | `usage` in the JSON result | `--usage-output-file` (shape not documented) |
| CI sign-in | `CLAUDE_CODE_OAUTH_TOKEN` (`claude setup-token`) or `ANTHROPIC_API_KEY` | `COPILOT_GITHUB_TOKEN`, `GH_TOKEN` |

**Not chosen: the agent drives the MCP server.** Starting `claude -p` or `copilot -p` with the agent-qa MCP server and letting it run the step loop would need a new way to approve steps in CI (a headless host has no elicitation, and a model's yes isn't a person's), would leave the agent its tools unless turned off, and would make each run depend on the model following the loop. The per-step driver keeps `--accept`, retries and exit codes as they are.

**Built:** `HeadlessDriver` (src/llm/headless-driver.ts) and `DataAccess.modelCli` (src/data/access.ts), `agent-qa run --headless`. See [docs/ci.md](../ci.md).
