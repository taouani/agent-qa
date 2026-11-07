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
| 3 Maintain automation | `run-tests`, `debug`, `review`, `audit`, `refactor`, API tests, Xray Test Executions with the rerun diff | 24 Jan | **Code done** 7 Nov (PRs #66, #68–#78, then live-check fixes #79–#86). Your live check is in progress; `2.0.0-alpha.2` waits for it |
| 4 Breadth and hosts | Document engine, Confluence publish, `commits`, GitLab and Azure DevOps, Claude Code and Cursor setup, headless CI drivers | 14 Feb | Not started |
| 5 Hardening and release | Kept-rate and runnable-rate targets, harness dashboard, docs, contribution guide, security policy, `2.0.0` | 28 Feb 2027 | Not started |

The npm `latest` tag still points at the 0.0.0 placeholder, so testers install `sf-agent-qa@next`.

## 2. What was achieved

### Slices 0 to 2 (summary)

See [10](10-plan-and-status-2026-11-04.md) for slices 0 and 1, and [09](09-slice2-plan.md) for slice 2. Live evidence so far:
- 21 Xray tests created on SFSC-3123 with the right fields and links, and a rerun updated all 21 with no duplicates;
- MCP elicitation (the yes/no pop-up) works in VS Code;
- explore and scripts passed on TC-SFSC-3168-002 against your sandbox (6 Nov, as you reported it in our thread; not recorded in the repo).

### Slice 3 (6–7 Nov)

| Task | PR | What it does |
| --- | --- | --- |
| S3-1 Edit existing test files | #66 | Changes to files Agent-QA didn't write, with a sha guard and a whole diff to review |
| S3-2 `run-tests` | #68 | Runs a chosen part of the repo's suite (files, grep or tag) and records `test-run@1` |
| S3-3 `debug` | #69, #70 | Sorts each failure (selector, timing, data, flake, environment, defect), heals selectors and waits only, reports defects and test-data problems; in CI the fixes go as a pull request |
| S3-4 `review` | #72 | `findings@1`, plus optional fixes that keep every check |
| S3-5 `audit` | #73 | Inventory, scan and sample, findings `AF-001`… ranked, area scores (`audit@1`) |
| S3-6 `refactor` | #74 | A phased plan from an audit, ts-morph edits that keep what each test does, type-checked per task, tests on a second yes, rollback |
| S3-7 Accessibility tests | — | Moved to the backlog on 6 Nov (your decision) |
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

Estimate from the final plan: 120–140 h. The BDD (Gherkin) output of `scripts` moved forward into slice 2 and is built; the GitHub adapter was always in slice 2 and is built.

**Exit check (final plan):** every workflow passes the harness on all three hosts (Copilot, Claude Code, Cursor) and the CLI. Today the harness and the live checks have run on Copilot and the CLI only, so this check is itself a large part of the remaining work.

**If it slips (final plan):** the harness dashboard, the Cursor setup, executable accessibility tests and the third git adapter can move to 2.1 without moving the date.

| Item | State | Notes |
| --- | --- | --- |
| `document` engine: strategy, plan, charter, risk register, test data, traceability, release notes | Not started | One engine, seven templates (decision F1) |
| Confluence publish | Not started | Confluence is read-only today; it needs a write through the policy layer (`confluence` target already exists) |
| `gherkin` workflow (stand-alone) | Partly done | `scripts` writes BDD scenarios and missing steps; a stand-alone "test cases to feature files" workflow is not built |
| `commits` | Not started | Your answer, 7 Nov: two features from v1. (a) The diffs of PRs linked to a story as optional extra context in the requirements analysis, never a required input. (b) A technical release note for a fix version, built from the code that changed in its scope |
| Azure DevOps adapter (pull requests in CI) | Not started | **First** (your choice, 7 Nov). `git.platform` already accepts `azure-devops` and `gitlab` in `src/core/config/schema.ts`; only GitHub has an adapter. Live check on a personal ADO org you will provide |
| GitLab adapter (merge requests in CI) | Not started | Second. You will provide a test project |
| Claude Code and Cursor setup in `init` | Not started | `init` writes `agent-qa.yaml`, `.gitignore` and one host config, VS Code's `.vscode/mcp.json` (`src/cli/setup-files.ts`) |
| Headless CI drivers: Copilot CLI and Claude Code | Not started | The CLI runs with a model API key today |

### Slice 5: hardening and release

Estimate: 40–50 h plus buffer.
- **Kept rate and runnable rate on real runs.** The harness computes both (`src/harness/kept-rate.ts`, `runnable-rate.ts`), but neither has been measured on enough of your reviewed runs. The targets are 95% kept and 90% runnable.
- **Harness dashboard** (decision F3).
- **Docs:** contribution guide, security policy, a fresh-install guide (the exit check is install to first run in under 10 minutes).
- **Packaging and `2.0.0`**, which also moves the npm `latest` tag.

## 4. Limitations today

These are known, and each is written up in [../backlog.md](../backlog.md), the user docs or [10](10-plan-and-status-2026-11-04.md). None blocks the alpha.

### Data protection

- **Screenshots are not masked.** That is why `xray.attachScreenshots` is off by default; the question and the audit log count them.
- **No street-address detector.** The type exists in `src/masking/engine/detectors.ts`; a harness canary test keeps the gap visible.
- **Repo paths are not masked** in `review` and `debug` (a file named after a person). Backlog.
- **A failure comment in Xray** carries Playwright's call log and code, masked, but the detectors may miss test data they don't recognise. Masked values stay tokens in Xray.

### Workflows

- **Rerun matching of test cases is a title heuristic** (`sameCheck` in `src/workflows/test-cases/workflow.ts`). You see every update next to its old title before the push.
- **Reusing an earlier analysis** (#81) compares the input only, not the prompt template's version, so an analysis made with older templates is still offered (`docs/requirements.md`).
- **`--push-from`:** two pushes started at the same moment from two terminals aren't stopped; a partly failed push can't be retried this way; the "already pushed" check looks at the newest 200 runs only; the vault check is stricter than it needs to be when `restoreOnWrite` is off.
- **Xray Test Executions:** the rerun diff needs the run folder kept between CI jobs; an `uncertain` recording is never sent again and needs a manual look in Xray.
- **Screenshots in Xray:** one per case, even when the case ran in several projects; the count in the question can be higher than what is sent (a file gone, or over the 10 MB limit), never lower; the handle kept in the run folder is an unsalted hash of the path.
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

## 6. Your answers (7 Nov) and what is still open

| # | Question | Answer |
| --- | --- | --- |
| 1 | Slice 3 live check and alpha.2 | You will finish it soon. It doesn't block slice 4. "Publish" merges the open release PR #67 ("Version Packages (alpha)") |
| 2 | First git platform in slice 4 | Azure DevOps, then GitLab |
| 3 | Test access | A personal Azure DevOps org (you will provide it; your company's ADO stays out of testing), a GitLab project and a Confluence space for testing. Claude Code and Cursor are on your laptop |
| 4 | Document engine | All seven document types stay in 2.0.0, published to Confluence (my reading of your "yes" to both parts) |
| 5 | `commits` | Two features: linked PR diffs as optional context for requirements, and a technical release note per fix version (see section 3) |
| 6 | Model IDs | Not available yet. Not a blocker: the catalog stays as it is and doctor warns about models outside it. To confirm before 2.0.0 |
| 7 | Clean-up pass before slice 4 | Yes: the open follow-ups (the slice 0 items in [10](10-plan-and-status-2026-11-04.md), the `--push-from` limits and similar small items) come first, about 6–10 h |

Still open: the live check (1), the ADO org and the GitLab and Confluence access (3), the model IDs (6).

## Next steps

1. The clean-up pass, one PR per item, as usual.
2. A detailed slice 4 plan, with tasks, estimates and the decisions it needs from you, as for slices 1 to 3.

## 7. Schedule

Calendar dates are well ahead of plan; hours spent aren't tracked here, so I can't say how the effort compares with the estimates. The release date stays 28 Feb 2027. If slices 4 and 5 keep this pace, 2.0.0 could ship much earlier; that is your call once slice 4 has a detailed plan.
