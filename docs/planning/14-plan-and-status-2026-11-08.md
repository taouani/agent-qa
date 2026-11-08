# Agent-QA v2: plan and status, 8 Nov 2026

8 Nov 2026 · @Tarek AOUANI

This replaces [12, plan and status of 7 Nov](12-plan-and-status-2026-11-07.md) as the current master plan. The decisions in the [final plan](06-final-plan.md) and your slice 4 answers of 8 Nov (all recommended options: 1a, 2a, 3a, 4a, 5a, 6a, 7b) still stand. Facts come from `master` and the merged PRs #93–#104. Anything I couldn't check is marked as an assumption.

## 1. Where we are

Slice 4's code is built and merged. None of it has run against a real ADO, GitLab, Confluence, Claude Code, Cursor or Copilot CLI yet: every one of those is tested against stand-ins only. The live check ([13](13-live-check-guide-slice4-2026-11-08.md)) is what turns "code done" into "done".

| Slice | Planned by | Status |
| --- | --- | --- |
| 0 to 2 | 15 Nov to 10 Jan | **Done** (see [12](12-plan-and-status-2026-11-07.md)) |
| 3 Maintain automation | 24 Jan | **Code done** 7 Nov. Your live check is in progress; `2.0.0-alpha.2` (release PR #67) waits for it |
| 4 Breadth and hosts | 14 Feb | **Code done** 8 Nov (PRs #93–#104). Live check not started |
| 5 Hardening and release | 28 Feb 2027 | Not started |

## 2. Slice 4: what was built

| Task | PR | What it does |
| --- | --- | --- |
| S4-1 Git host interface | #93 | One interface for GitHub, Azure DevOps and GitLab: open a pull request, find pull requests by Jira key, read a diff |
| S4-2 Azure DevOps | #94 | Pull requests in CI from Azure Pipelines; the token goes only to the job's own org |
| S4-3, S4-4 Document engine | #95, #96 | `run document --type ...`: strategy, plan, charter, risk register, test data, traceability, release notes |
| S4-5 Confluence publish | #97 | `--publish confluence`, after a yes; creates under your parent page with the `agent-qa` label, and updates only a page it labelled |
| S4-6 PR context (`commits` a) | #98 | `--with-pull-requests`: the masked diffs of the PRs naming each issue go into the requirements analysis, capped (5 PRs and 200 KB per issue) |
| S4-7 Technical release notes (`commits` b) | #99 | A "Technical changes" section in release notes, from the PRs of the fix version |
| S4-8 GitLab | #100 | Merge requests in CI from GitLab CI; GitLab 15.7 or later |
| S4-9 Host setup | #101 | `init --host claude-code` / `cursor` writes `.mcp.json` / `.cursor/mcp.json`; the server finds the project from a subfolder |
| S4-10 Headless drivers | #102 | `--headless claude-code` or `copilot`: each step answered by the CLI and its own sign-in, every agent tool off, in an empty folder. CI job examples in `docs/ci.md` |
| S4-11 Harness | #103 | `harness --headless`, and the live check guide [13](13-live-check-guide-slice4-2026-11-08.md) |
| S4-14 `--changed-only` | #104 | `run test-cases --changed-only`: only the issues new or changed since their cases were written are analyzed |

**Exit check (final plan):** every workflow passes the harness on all three hosts and the CLI. Not met yet: it needs the live check.

## 3. Known limits from slice 4

From the reviews; each is small, none blocks the alpha.

- **Unverified API shapes.** The ADO, GitLab and Confluence REST calls, Copilot CLI's flags (`--available-tools=` with an empty list, the prompt on standard input, its usage file) are built from the docs. Assumption: some will need a fix after the live check.
- **Headless design.** I built option A of the card I sent you (one CLI call per step, tools off). Option B (the CLI as an agent with Agent-QA's MCP server) is not built. Your answer on the card is still open; A can stay either way.
- **Confluence:** a document from a JQL filter is titled with a hash of the filter; if its vault entry expires, the next publish makes a new page instead of updating.
- **Pull requests:** a wrong `repo` gives NOT_FOUND without a hint about the token; PR masking counts are in `pull-requests@1`, not the masking report.
- **`--changed-only`:** an issue counts as covered only when an earlier run wrote at least one case for it. An issue whose cases were all dropped at review is analyzed again.

## 4. What remains

1. **Your live checks:** slice 3 (then alpha.2), and slice 4 with guide 13. Parts 1–5 need your laptop, GitLab test project and Confluence space; part 6 waits for your ADO org.
2. **Fixes from the live check**, one PR each, as for slice 3.
3. **Slice 5** (40–50 h plus buffer): kept and runnable rates on your real runs, harness dashboard, contribution guide, security policy, fresh-install guide, `2.0.0`.

Backlog additions from slice 4 (in [../backlog.md](../backlog.md) once slice 5 starts): CI pipelines (decision 7b), stand-alone `gherkin` (5a).

## 5. Still open with you

| # | What | Needed for |
| --- | --- | --- |
| 1 | Slice 3 live check, then the go for alpha.2 | Merging #67 |
| 2 | Slice 4 live check (guide 13) | Slice 4 done |
| 3 | Personal ADO org | Part 6 of guide 13 |
| 4 | Model IDs other than Anthropic's | Before 2.0.0 |
| 5 | The headless design card (A or B) | Only if you want B |

## 6. Schedule

Calendar dates stay far ahead of plan. The release date stays 28 Feb 2027.
