# Running your suite, and recording it in Xray

The `run-tests` workflow runs a chosen part of your repo's own Playwright suite (not only tests Agent-QA wrote), with your repo's Playwright and the commands in the reviewed profile (`agent-qa.profile.json`). With Xray set up, it can then record the results in Xray as a new Test Execution, and tell you what changed since the last one.

## Run it

Pick the tests with at least one of `files`, `grep`, `tag` or `failedIn`:

```bash
agent-qa run run-tests --input '{"tag":"@smoke"}' --accept run
agent-qa run run-tests --input '{"files":["tests/features/ROPS-227-FRA.feature"]}' --accept run,xray
agent-qa run run-tests --input '{"failedIn":"playwright-report/report.json"}' --accept run
```

| Input | What it picks |
|---|---|
| `files` | spec or feature paths in the profile's folder (a spec may end with `:line`), up to 50 |
| `grep` | text in the tests' titles (plain text, not a pattern) |
| `tag` | a tag such as `@smoke` (tags that start with it count too); not together with `grep` |
| `project` | one Playwright project of your config |
| `failedIn` | a Playwright JSON report in the folder: its failed and flaky tests run again |
| `repeatEach`, `workers` | run each test 1 to 10 times; 1 to 4 workers (default 1) |

A selection Playwright can't take stops the run before anything is asked.

| Step | What it does | Without your yes |
|---|---|---|
| `run` | runs the tests; your repo is never changed | nothing runs |
| `xray` | records the results in Xray as a new Test Execution (only with an `xray` section) | nothing is recorded |

`run` takes your own yes: the model's is refused. The result is `test-run@1`, masked (titles, errors and the `grep` text included).

## Recording in Xray

The `xray` step comes after a run in which some test ran. It needs `xray` and `atlassian` sections in `agent-qa.yaml` (cases are found by label through Jira), and `policy.writes.xray` not set to `deny`. Before asking, it:

1. finds each test's case by the TC id in its title or tags (`TC-ABC-1-001`), and that case's Xray test by its `agent-qa:TC-ID` label, the one a `test-cases` push sets;
2. finds the last run of the same selection that recorded a Test Execution in the same Xray project, in your run folder (`.agent-qa/runs/`, newest by when it was recorded, among the last 500 runs of any workflow in the folder). Nothing is read back from Xray for this. In CI the run folder is new each time unless you keep it, so keep it between jobs (restore and save it as a cache or artifact, or point `AGENT_QA_RUNS_DIR` at a kept folder), or the step says there is nothing to compare with;
3. shows you each result and what changed: now failing, now passing, still failing, before neither passed nor failed (such as `TODO`), not in the last one, skipped now, not run now.

Each case gets one result. If any of its tests failed (another project, a repeat), it is `FAILED`, with where it failed and the first line of the masked error. A flaky case is `PASSED`, with a comment saying it passed on a retry. Skipped tests, tests with no TC id, and cases that were never pushed aren't recorded, and the step says which.

On your yes, Agent-QA records a new Test Execution, labelled `agent-qa`, `agent-qa:exec:<hash of the selection>` and `agent-qa:run:<hash of the run id>`. The selection's text never shows in a label. If Jira can't be read before the question, nothing is recorded and the run still finishes. Agent-QA notes `recording` in the run folder just before the import. If the import fails, or the run stops during it, the step ends as `uncertain`: the execution may or may not be in Xray, so it is never sent again, and the step names the `agent-qa:run:` label to look for in Xray. Everything is kept in `xray-execution@1`, with status `recorded`, `declined`, `nothing` (no case of the run is in Xray), `unavailable` (Jira couldn't be read), `recording` or `uncertain`. Only a `recorded` run is used as the comparison for later runs.

What goes to Xray is masked text: a comment holds tokens such as `<PERSON_1>` as they are, even with `masking.restoreOnWrite`.

In CI, set `policy.writes.xray: allow` and accept the step (`--accept run,xray`). With `ask`, the step is skipped altogether in CI, because nobody can be asked, so `--accept xray` alone does nothing.

**Not yet checked against a live Xray** (assumption): that the start and finish dates are kept when the issue fields come in the multipart `info` part.
