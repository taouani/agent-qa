# Agent-QA v2: plan and status, 10 Nov 2026

10 Nov 2026 · @Tarek AOUANI

This replaces [14, plan and status of 8 Nov](14-plan-and-status-2026-11-08.md) as the current master plan. Your answers to the alignment of 10 Nov are in section 5. Facts come from `master` and the merged PRs up to #128. Anything I couldn't check is marked as an assumption.

## 1. Where we are

All five slices are built and merged. `sf-agent-qa@2.0.0-rc.3` was published on npm on 10 Nov, on the `next` and `rc` tags; `latest` is still the 0.0.0 placeholder. One gate remains before 2.0.0: your release live check, [16](16-release-live-check-2026-11-10.md). 2.0.0 ships as soon as it passes, instead of waiting for 28 Feb 2027 (your answer 3).

| Slice | Status |
| --- | --- |
| 0 to 2: core, test cases, Playwright scripts | Done, checked live (alpha.0 on 4 Nov, alpha.1 on 6 Nov) |
| 3 Maintain automation | Done, checked live on 8 Nov (fixes #106 to #110), alpha.2 on 8 Nov |
| 4 Breadth and hosts | Done, checked live on 8 Nov except Azure DevOps, which ships marked untested (answer 2) |
| 5 Hardening and release | Code done (#112 to #128), rc.3 on 10 Nov. Release live check next |

Assumption: the slice 3 and 4 live checks are complete. On 8 Nov you called them "almost done".

## 2. Slice 5: what was built

| Task | PR | What it gives you |
| --- | --- | --- |
| S5-4 Mask repo paths | #112 | Path parts the detectors flag reach the model as tokens, and are restored from the run's vault |
| S5-8 Model list | #114 | Anthropic's models only (decision 3b); other providers through OpenRouter or LiteLLM, with a doctor warning |
| S5-2 Real-run rates | #115 | `agent-qa report`: kept and runnable rates, week by week ([rates.md](../rates.md)) |
| S5-3 Dashboard | #116 | `agent-qa report --html`: a local, self-contained page (decision 1a) |
| S5-1 Fresh install | #117, #125 | `init` asks for the site and Xray key; `agent-qa secret set` keeps keys in the OS keychain, which an IDE finds however it starts |
| S5-7 Packaging | #118 | Package check, and an install test on Ubuntu and Windows in CI |
| S5-5 Security | #119, #120, #124 | SECURITY.md, [security.md](../security.md), a weekly audit job; no high or critical advisory in runtime dependencies |
| S5-6 Contributing | #121, #127 | CONTRIBUTING, issue and PR templates, the DCO check (decision 5a), and its run by hand for release PRs |
| S5-9 Docs | #122 | [config.md](../config.md) generated from the schema, [troubleshooting.md](../troubleshooting.md), the README's docs index |
| S5-11 Backlog | #123 | The slice 5 follow-ups in [../backlog.md](../backlog.md) |
| S5-10 Release candidate | #126, #128, #113 | The switch to rc, a lookup-click fix the release CI found, then 2.0.0-rc.3 |

**Exit check (final plan):** every workflow passes on all three hosts and the CLI. Met for slices 0 to 4, apart from Azure DevOps. Guide 16 checks it once more on the published package.

## 3. What remains before 2.0.0

1. **Before the live check, rc.4**, with two of your answers in it: `playwright.testDir` and `playwright.profile` removed (answer 7, a breaking config change), and Azure DevOps marked untested in the docs (answer 2).
2. **Your release live check** with [16](16-release-live-check-2026-11-10.md), on rc.4. About 2 h.
3. **Fixes from it**, one reviewed PR each, in the next rc. Estimate: 8 to 16 h, a guess based on the 8 Nov check, which needed 5 fix PRs.
4. **The release notes for 2.0.0**, from the changesets.
5. **2.0.0**: a PR runs `changeset pre exit`, then the "Version packages" PR publishes 2.0.0 on `latest`. The workflow points `next` at it and deprecates 0.0.0 (decision 6a). Publishing needs your go.
6. **After 2.0.0**: one edit on the `v1` branch, a README line pointing to v2 (answer 4).

## 4. Known limits at 2.0.0

The full list is in [../backlog.md](../backlog.md). These are the ones a user may meet:

- **Azure DevOps** is untested against a real org. GitHub and GitLab, which share its interface, are checked live.
- **The DCO check** can be changed by the branch it checks, until the repository settings in guide 17 are made.
- **Path tokens** differ between machines (each has its own vault key), and a name the detectors miss in one run can show in clear in another.
- **No address detector**, and `masking.presidio` is accepted but never called.
- **The vault key on Linux with no Secret Service** can vanish after the session. `AGENT_QA_VAULT_KEY` avoids it, as the docs say.
- **Windows Credential Manager** holds at most 2560 bytes per entry, so a 4096-bit key stays in a variable.
- **A long test run inside one MCP call** can hit the host's own timeout.
- **The fix guards** of debug, review, refactor and API tests have known gaps, listed per PR in the backlog. The diff review is the last guard.

## 5. Your answers of 10 Nov

| # | Question | Answer |
| --- | --- | --- |
| 1 | The release live check | A short checklist: [16](16-release-live-check-2026-11-10.md) |
| 2 | Azure DevOps with no test org | Ship 2.0.0 with it marked untested |
| 3 | Release date | Ship 2.0.0 as soon as the live check passes |
| 4 | The v1 branch | One README edit after 2.0.0 is allowed |
| 5 | DCO from a fixed ref | Wanted: a guide for your side, [17](17-repository-settings-guide-2026-11-10.md) |
| 6 | Release PRs without the "Approve and run" click | Wanted: a guide for your side ([17](17-repository-settings-guide-2026-11-10.md)), and I do the workflow side |
| 7 | `playwright.testDir` and `playwright.profile` | Remove them before 2.0.0 |

Earlier decisions still stand: the final plan's, slice 5's 1a, 2a, 3b, 4a, 5a, 6a, the secrets card (a: `agent-qa secret set`), the DCO card (agent commits pass on your own pull requests), and the headless card (A: one CLI call per step, tools off).

## 6. After 2.0.0

The backlog comes next, as you decided on 6 Nov. Its largest items are accessibility tests (6 to 8 h), CI pipeline templates (slice 4 decision 7b), a stand-alone `gherkin` workflow (5a), keeping masked names across runs and machines, and an address detector. I'll size and order them in a plan for you once 2.0.0 is out.

## 7. Still open with you

| # | What | Needed for |
| --- | --- | --- |
| 1 | The release live check (guide 16), on rc.4 | 2.0.0 |
| 2 | The settings in guide 17 (DCO from a fixed ref, the release App) | Closing the DCO gap; release PRs without a click |
| 3 | The go to publish 2.0.0 | 2.0.0 |
| 4 | Optional: `npm dist-tag rm sf-agent-qa alpha`, with your npm login | A clean tag list |
