# Moving from v1 to v2

v1 is a markdown prompt pack that you install into a project, and your IDE's model follows its commands. v2 is an npm package, `sf-agent-qa`. It runs as an MCP server in your IDE and as a CLI in CI. In v2 the code reads Jira, masks the data, checks every answer, and gates every write. The model only writes the content.

v1 stays available and unchanged at tag `v1.0.0` on the [`v1` branch](https://github.com/taouani/agent-qa/tree/v1). Its install commands still work. You can use both side by side: they keep their files in different places (v1 in `agent-qa/`, v2 in `agent-qa.yaml` and `.agent-qa/`).

## What the alpha covers

| v1 command | v2 alpha | Notes |
|---|---|---|
| `analyze-requirements` | `requirements` workflow | Jira issue key or JQL filter, with children (epic, story, sub-task), linked issues and their children, and linked Confluence pages. Gives a quality score, gaps, open questions and inferred criteria for each issue. |
| `generate-test-cases` | `test-cases` workflow | At least one case per acceptance criterion, at most 30 per issue, `TC-{KEY}-{NNN}`, P1 to P4. You review the cases before they're kept. They're then pushed straight to Xray Cloud (create or update), not exported as CSV. |
| `health-check` | `agent-qa doctor` | Checks config, credentials and the environment. |
| `validate-outputs` | built in | Every step's answer is checked against a schema before it's accepted. A wrong answer is sent back to the model with the errors. |
| `common/discover-framework-profile` | `profile` workflow | Reads the repo's Playwright project without running it. You review it, and it is saved as `agent-qa.profile.json`: the only commands Agent-QA may run. In an empty folder it starts a new repo instead. See [profile.md](profile.md). |
| `explore-ui` | `explore` workflow | Walks reviewed cases in a real browser on a sandbox, from masked pages. See [explore.md](explore.md). |
| `generate-gherkin`, `generate-playwright-tests`, `debug-tests` | `scripts` workflow | One workflow: Gherkin scenarios and steps for a playwright-bdd repo, specs otherwise, then a run with strictly limited fixes. A real defect is reported, never fixed in the test. See [scripts.md](scripts.md). |
| `debug-tests` (your own tests) | `debug` workflow | Runs your failing tests and proposes selector and wait fixes, each as a diff you approve. Defects, test data and the environment are reported, not fixed. See [debug.md](debug.md). |
| `review-automation-code` | `review` workflow | Findings by severity on the files you name, with optional small fixes you approve as one diff. See [review.md](review.md). |
| `audit-framework` | `audit` workflow | Read-only, with findings ranked by impact and risk, and a score per area. See [audit.md](audit.md). |
| `refactor-framework` | `refactor` workflow | Plans phases from an audit and carries out one phase per run with ts-morph, type-checked, keeping what every test checks. See [refactor.md](refactor.md). |
| `generate-api-tests` | `scripts` with `api: true` | Playwright `request` tests, no browser. See [scripts.md](scripts.md#api-tests). |
| `generate-test-plan` | `document` with `type: test-plan` | From the requirements and, if you give them, the reviewed test cases, with a coverage table Agent-QA counts. Markdown only for now; Confluence publishing comes later. See [documents.md](documents.md). |
| everything else | not yet | Commit analysis, test strategy, charter and data, risk register, traceability, release notes, accessibility and Confluence publishing are planned for later v2 releases. Keep using v1 for these. |

## What changes

- **Install.** Instead of the base and project install scripts, run `npx -y sf-agent-qa@next init` in your project (see the [README](../README.md#quickstart)). It doesn't touch v1's files.
- **Jira and Confluence access.** v1 went through the Atlassian MCP server. v2 calls Jira, Confluence and Xray itself with an API token, so it can mask the data before any model sees it. Secrets go in environment variables or the OS keychain. `agent-qa.yaml` holds only `${env:NAME}` or `${keychain:NAME}` references.
- **Config.** v1's `agent-qa/config.yml` doesn't carry over. v2's `agent-qa.yaml` has its own schema (`schema/agent-qa.schema.json`, with editor completion through the `yaml-language-server` line that `init` writes). Repository settings are now the `git` section, used only for the pull requests the `scripts` workflow opens in CI (GitHub only): see [scripts.md](scripts.md#in-ci).
- **Personal data.** Names, emails, phone numbers, IBANs, card numbers, national ids and IP addresses are replaced with tokens such as `<PERSON_1>` before a model sees them. Real values are put back only when writing to Xray, and only if you turn that on (`masking.restoreOnWrite`). Addresses aren't detected yet.
- **Starting a command.** In VS Code with Copilot, run `/mcp.agent-qa.test-cases` where v1 had you reference its prompt files (in Claude Code, v1's `/agent-qa:generate-test-cases`). If the slash command doesn't show up, ask the model to call `#workflow_start` (see [ide.md](ide.md)). In CI, `agent-qa run test-cases --key ABC-123` replaces `run-pipeline`.
- **Outputs.** v1 wrote markdown files under `agent-qa/`. v2 writes one folder per run in `.agent-qa/runs/{date}-{context}-{id}/`. Each folder holds typed JSON with a matching `.md` for people, the masking report and the cost report. `.agent-qa/` is git-ignored.
- **Xray.** v1 produced a CSV to import. v2 pushes test cases through the Xray API after your review and your own yes, and labels each test `agent-qa:TC-…`. A rerun on the same issue is shown the tests already in Xray: a case that checks the same thing keeps its test's id and updates it, new cases are numbered after the existing ones, and tests the rerun doesn't cover are left alone. The push question lists each update with the test's old title.
