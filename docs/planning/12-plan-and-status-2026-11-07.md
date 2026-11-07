# Agent-QA v2: plan and status, 7 Nov 2026

7 Nov 2026 · @Tarek AOUANI

This replaces [10, plan and status of 4 Nov](10-plan-and-status-2026-11-04.md) as the current master plan. The decisions in the [final plan](06-final-plan.md) still stand; only status, scope moves and open items change here. Facts come from `master` (5baafb1) and the merged PRs. Anything I couldn't check is marked as an assumption.

## 1. Where we are

Slices 0 to 3 are built and merged, eleven weeks ahead of the plan's dates. Slices 4 and 5 are not started.

| Slice | What it delivers | Planned by | Status |
| --- | --- | --- | --- |
| 0 Foundation | Skeleton, CI, config, vault, policy, run store, engine, MCP server, doctor, harness, release pipeline, Copilot spike | 15 Nov | **Done** 2 Nov (PRs #5–#18) |
| 1 Requirements to Xray | Jira and Confluence reading, masking, `requirements` and `test-cases`, review step, Xray push, CLI `run` and `init`, cost report, leak gate | 13 Dec (alpha gate) | **Done** 4 Nov (PRs #19–#43), `2.0.0-alpha.0` on npm |
| 2 Playwright scripts | Framework profile, explorer, Salesforce pack and sign-in, `scripts` with run-and-fix, GitHub pull requests in CI, new-repo scaffold | 10 Jan | **Done** 6 Nov (PRs #44–#64), `2.0.0-alpha.1` on npm with provenance |
| 3 Maintain automation | `run-tests`, `debug`, `review`, `audit`, `refactor`, API tests, Xray Test Executions with the rerun diff | 24 Jan | **Code done** 7 Nov (PRs #66–#86). Your live check is in progress; `2.0.0-alpha.2` waits for it |
| 4 Breadth and hosts | Document engine, Confluence publish, `commits`, GitLab and Azure DevOps, Claude Code and Cursor setup, headless CI drivers | 14 Feb | Not started |
| 5 Hardening and release | Kept-rate and runnable-rate targets, harness dashboard, docs, contribution guide, security policy, `2.0.0` | 28 Feb 2027 | Not started |

The npm `latest` tag still points at the 0.0.0 placeholder, so testers install `sf-agent-qa@next`.

## 2. What was achieved

### Slices 0 to 2 (summary)

See [10](10-plan-and-status-2026-11-04.md) for slices 0 and 1, and [09](09-slice2-plan.md) for slice 2. Live evidence so far:
- 21 Xray tests created on SFSC-3123 with the right fields and links, and a rerun updated all 21 with no duplicates;
- MCP elicitation (the yes/no pop-up) works in VS Code;
- explore and scripts passed on TC-SFSC-3168-002 against your sandbox (6 Nov).

### Slice 3 (6–7 Nov)

| Task | PR | What it does |
| --- | --- | --- |
| S3-1 Edit existing test files | #66 | Changes to files Agent-QA didn't write, with a sha guard and a whole diff to review |
| S3-2 `run-tests` | #68 | Runs a chosen part of the repo's suite (files, grep or tag) and records `test-run@1` |
| S3-3 `debug` | #69, #70 | Sorts each failure (selector, timing, data, flake, environment, defect), heals selectors and waits only, reports defects and test-data problems; in CI the fixes go as a pull request |
| S3-4 `review` | #72 | `findings@1`, plus optional fixes that keep every check |
| S3-5 `audit` | #73 | Inventory, scan and sample, findings `AF-001`… ranked, area scores (`audit@1`) |
| S3-6 `refactor` | #74 | A phased plan from an audit, ts-morph edits that keep what each test does, type-checked per task, tests on a second yes, rollback |
| S3-8 API tests | #75 | `scripts` with `api: true`: request tests with no browser, paths only |
| S3-9 Xray Test Executions | #76, #78 | `run-tests` records a Test Execution; the diff with the last one comes from the local run folder (your choice) |
| S3-10 Harness | #71 | A seeded bug in a hand-written test must be reported, never fixed |
| S3-11 Docs | #77 | `docs/run-tests.md`, `debug.md`, `review.md`, `audit.md`, `refactor.md` |

### Fixes from your live checks (7 Nov)

| PR | Fix |
| --- | --- |
| #79 | Each test not recorded in Xray says why (no TC id, or its case was never pushed) |
| #80 | A story with no acceptance criteria gets up to three related `.feature` files from the repo, masked and labelled (your choice) |
| #81 | `test-cases` offers to reuse an earlier analysis when the story is unchanged (your choice) |
| #82 | `--push-from <run>` pushes the reviewed cases of a run whose push was declined (your choice) |
| #83 | Test runs stop through Playwright's `--global-timeout` at 15 minutes, so `debug` still gets a report |
| #84 | Per-test start and finish in Xray, and a full masked failure comment (where, the error with its call log, the code) |
| #85, #86 | `xray.attachScreenshots` (off by default, your choice) sends Playwright's screenshots, passed and failed; `xray.executionDates` fills the Test Execution's own date fields |

Not yet confirmed live: the #83 timeout, the #86 date fields and screenshots. You said you would continue testing later.

## 3. What remains

### Slice 4: breadth and hosts

Estimate from the final plan: 120–140 h. Some of it already moved into slice 2: the BDD (Gherkin) output of `scripts` and the GitHub adapter are built.

| Item | State | Notes |
| --- | --- | --- |
| `document` engine: strategy, plan, charter, risk register, test data, traceability, release notes | Not started | One engine, seven templates (decision F1) |
| Confluence publish | Not started | Confluence is read-only today; it needs a write through the policy layer (`confluence` target already exists) |
| `gherkin` workflow (stand-alone) | Partly done | `scripts` writes BDD scenarios and missing steps; a stand-alone "test cases to feature files" workflow is not built |
| `commits` | Not started | Assumption: the v1 command that drafts commit messages from a diff; scope to confirm |
| GitLab adapter (merge requests in CI) | Not started | `git.platform` already accepts `gitlab` and `azure-devops` in `src/core/config/schema.ts`; only GitHub has an adapter |
| Azure DevOps adapter (pull requests in CI) | Not started | Same |
| Claude Code and Cursor setup in `init` | Not started | `init` writes only `.vscode/mcp.json` today (`src/cli/setup-files.ts`) |
| Headless CI drivers: Copilot CLI and Claude Code | Not started | The CLI runs with a model API key today |

### Slice 5: hardening and release

Estimate: 40–50 h plus buffer.
- **Kept rate and runnable rate on real runs.** The harness computes both (`src/harness/kept-rate.ts`, `runnable-rate.ts`), but neither has been measured on enough of your reviewed runs. The targets are 95% kept and 90% runnable.
- **Harness dashboard** (decision F3).
- **Docs:** contribution guide, security policy, a fresh-install guide (the exit check is install to first run in under 10 minutes).
- **Packaging and `2.0.0`**, which also moves the npm `latest` tag.

## 4. Limitations today

These are known and documented. None blocks the alpha.

### Data protection

- **Screenshots are not masked.** That is why `xray.attachScreenshots` is off by default; the question and the audit log count them.
- **No street-address detector.** The type exists in `src/masking/engine/detectors.ts`; a harness canary test keeps the gap visible.
- **Repo paths are not masked** in `review` and `debug` (a file named after a person). Backlog.
- **A failure comment in Xray** carries Playwright's call log and code, masked, but the detectors may miss test data they don't recognise. Masked values stay tokens in Xray.

### Workflows

- **Rerun matching of test cases is a title heuristic** (`sameCheck` in `src/workflows/test-cases/workflow.ts`). You see every update next to its old title before the push.
- **`--push-from`:** two pushes started at the same moment from two terminals aren't stopped; a partly failed push can't be retried this way; the vault check is stricter than it needs to be when `restoreOnWrite` is off.
- **Xray Test Executions:** the rerun diff needs the run folder kept between CI jobs; an `uncertain` recording is never sent again and needs a manual look in Xray.
- **Test runs:** a test that hangs until the 15-minute stop shows as skipped, and a smaller `globalTimeout` in your Playwright config is replaced by ours.
- **`debug` never fixes test data**; it reports it (your decision, 6 Nov).
- **Guards on code changes** (`scripts` fix loop, `review`, `refactor`, API tests) have documented edge cases in [../backlog.md](../backlog.md). The diff you review is the final safety net in each.
- **Long runs inside an MCP call** can hit the host's timeout when the host gives no progress token.

### Environment

- Your Windows machine needs `npm run build:tsc` (esbuild gets Access denied) and `node --use-system-ca` (the corporate network re-signs TLS).
- **Non-Anthropic model IDs** in `src/core/config/catalog.ts` come from public listings and are unverified.

## 5. Backlog (after 2.0.0)

Kept in [../backlog.md](../backlog.md):
- accessibility tests (moved out of slice 3, 6–8 h);
- fixing test data in `debug`;
- masking repo paths;
- counting branches per test in `review` fixes;
- refactor guard limits;
- API test guard limits;
- Xray Test Execution limits;
- `--push-from` limits and test-run limits (added today).

Moved out of the backlog: healing existing scripts became `debug` (slice 3).

## 6. Inputs needed from you

In order of importance:

1. **Finish the slice 3 live check** (the steps are in `slice3-live-check.md` in the project files), including the retest of #83 (debug timeout) and #86 (execution dates, screenshots). Then say "publish" for `2.0.0-alpha.2`.
2. **Which git platform comes first in slice 4: Azure DevOps or GitLab?** The plan builds both. Assumption: your team uses Azure DevOps (your browser showed ADO pipelines and pull requests), which would make it the first.
3. **Test access for slice 4:** an ADO project (and/or a GitLab project) where CI may open pull requests, a Confluence space where publishing is allowed, and Claude Code and Cursor installed on your machine.
4. **Document engine scope:** are all seven document types still needed for 2.0.0, and should they publish to Confluence, or stay as files in the run folder plus markdown?
5. **`commits`:** confirm what it should do, or drop it.
6. **Model IDs:** confirm or correct the OpenAI, Google, Mistral and xAI model lists in `src/core/config/catalog.ts`.
7. **Before slice 4, a short clean-up pass** on the open follow-ups (the slice 0 items in [10](10-plan-and-status-2026-11-04.md) and the `--push-from` limits)? Assumption: about 6–10 h.

## 7. Schedule

Calendar dates are well ahead of plan; hours spent aren't tracked here, so I can't say how the effort compares with the estimates. The release date stays 28 Feb 2027. If slices 4 and 5 keep this pace, 2.0.0 could ship much earlier; that is your call once slice 4 has a detailed plan.
