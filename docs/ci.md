# Running Agent-QA in CI

`agent-qa run` runs a workflow unattended: each generate step goes to a model, and each confirm step takes the answer you give up front (`--accept`, `--decline`, `--yes`). In CI (`--ci`, or when `CI` is set) nobody is asked: an `ask` write rule is denied, and generated test code leaves only as a pull request. Exit codes: 0 done, 1 failed, 2 bad setup or input, 3 the run waits for a person.

The model is either an API key (the `models` section of `agent-qa.yaml`), or a headless agent CLI with its own sign-in.

## Headless agent CLIs

`--headless claude-code` or `--headless copilot` asks Claude Code (`claude -p`) or GitHub Copilot CLI (`copilot`) for each step's answer, instead of a model API key. Nothing else changes: the same steps, checks, retries, approvals and exit codes. The `models` section isn't needed.

The CLI is used as a model, not as an agent:

- every tool is off, and no MCP server, slash command, skill or project instruction file is loaded;
- it runs in a new empty temporary folder, never in your checkout;
- the masked prompt goes on standard input, so it never shows in a process list;
- its environment keeps only its own sign-in variables of the secrets (and not one that `agent-qa.yaml` names for something else, such as `git.token: ${env:GH_TOKEN}`): the Jira, Xray and git tokens, and the other providers' keys, are removed;
- Claude Code loads no user settings, hooks or `~/.claude/CLAUDE.md`, and keeps no session. Copilot CLI is also denied the shell, writes and the rest of the temp folder, and writes its logs to the temporary folder; it may still keep the session (masked text) under `~/.copilot`;
- each call is a `commands` write in the audit log, so `policy.writes.commands: deny` turns it off.

| CLI | Install | Sign-in in CI | `--model` |
|---|---|---|---|
| Claude Code | `npm install -g @anthropic-ai/claude-code` | `CLAUDE_CODE_OAUTH_TOKEN` (made with `claude setup-token`, for a Claude subscription) or `ANTHROPIC_API_KEY` | `anthropic:<id>` or a bare id; default: Claude Code's own |
| Copilot CLI | `npm install -g @github/copilot` | `COPILOT_GITHUB_TOKEN` or `GH_TOKEN`: a fine-grained personal access token with the Copilot Requests permission | `copilot:<id>` or a bare id; default: Copilot's own |

The prompt still goes to the provider behind the CLI (Anthropic, or GitHub Copilot's models), masked as with an API key. A headless run is not priced in the cost report (a subscription isn't billed per token); its token counts are recorded when the CLI reports them.

Not checked live yet: both CLIs' flags come from their `--help` (Claude Code 2.1, Copilot CLI 1.0.107). In particular, that Copilot CLI reads the prompt from standard input, and what its usage file holds.

## GitHub Actions

```yaml
name: test cases
on:
  workflow_dispatch:
    inputs:
      jql: { description: "JQL filter", required: true }
jobs:
  cases:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm install -g @anthropic-ai/claude-code
      - run: npx -y sf-agent-qa@next run test-cases --jql "$JQL" --headless claude-code --accept review,push
        env:
          JQL: ${{ inputs.jql }}
          CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          ATLASSIAN_EMAIL: ${{ secrets.ATLASSIAN_EMAIL }}
          ATLASSIAN_TOKEN: ${{ secrets.ATLASSIAN_TOKEN }}
          XRAY_CLIENT_ID: ${{ secrets.XRAY_CLIENT_ID }}
          XRAY_CLIENT_SECRET: ${{ secrets.XRAY_CLIENT_SECRET }}
          AGENT_QA_VAULT_KEY: ${{ secrets.AGENT_QA_VAULT_KEY }}
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: agent-qa-runs, path: .agent-qa/runs/ }
```

With Copilot CLI, install `@github/copilot`, pass `--headless copilot`, and set `COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_TOKEN }}` instead. The job's own `GITHUB_TOKEN` can't call Copilot.

## Azure Pipelines

```yaml
trigger: none
pool: { vmImage: ubuntu-latest }
steps:
  - task: NodeTool@0
    inputs: { versionSpec: "22.x" }
  - script: npm install -g @anthropic-ai/claude-code
  - script: npx -y sf-agent-qa@next run test-cases --jql "$(JQL)" --headless claude-code --accept review,push
    env:
      CLAUDE_CODE_OAUTH_TOKEN: $(CLAUDE_CODE_OAUTH_TOKEN)
      ATLASSIAN_EMAIL: $(ATLASSIAN_EMAIL)
      ATLASSIAN_TOKEN: $(ATLASSIAN_TOKEN)
      XRAY_CLIENT_ID: $(XRAY_CLIENT_ID)
      XRAY_CLIENT_SECRET: $(XRAY_CLIENT_SECRET)
      AGENT_QA_VAULT_KEY: $(AGENT_QA_VAULT_KEY)
  - publish: .agent-qa/runs
    artifact: agent-qa-runs
    condition: always()
```

Secret pipeline variables aren't passed to scripts on their own: map each one under `env`, as above.

## GitLab CI

```yaml
test-cases:
  image: node:22
  when: manual
  script:
    - npm install -g @anthropic-ai/claude-code
    - npx -y sf-agent-qa@next run test-cases --jql "$JQL" --headless claude-code --accept review,push
  artifacts:
    when: always
    paths: [.agent-qa/runs/]
```

Set `CLAUDE_CODE_OAUTH_TOKEN`, the Atlassian and Xray variables and `AGENT_QA_VAULT_KEY` as masked CI/CD variables (Settings, CI/CD, Variables).

## Notes for every CI

- A `${keychain:NAME}` reference in `agent-qa.yaml` reads the variable `NAME` on a CI runner, which has no keychain: set the CI secret under that exact name.
- The push to Xray needs `policy.writes.xray: allow` in `agent-qa.yaml`: `ask` is denied in CI.
- `AGENT_QA_VAULT_KEY` (`openssl rand -base64 32`, kept as a CI secret) is the key of the vault that holds the masked values: a CI runner has no OS keychain to keep one in. With the same key, a later job that restores `.agent-qa/` can resume a run or push it (`--resume`, `--push-from`).
- The run folder is git-ignored: keep it as a job artifact, as above, to read the cases and the cost report.
- For the `scripts` workflow in CI (a pull request with the generated tests), see [scripts.md](scripts.md#in-ci).
