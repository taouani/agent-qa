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

The `xray` step comes after a run in which some test ran, when `agent-qa.yaml` has an `xray` section and `policy.writes.xray` isn't `deny`. Before asking, it:

1. finds each test's case by the TC id in its title or tags (`TC-ABC-1-001`), and that case's Xray test by its `agent-qa:TC-ID` label, the one a `test-cases` push sets;
2. reads back from Xray the newest Agent-QA Test Execution of the same selection, so this works in CI too, where `.agent-qa/runs/` is new each time;
3. shows you each result and what changed: now failing, now passing, still failing, not in the last one, skipped now, not run now.

Each case gets one result. If any of its tests failed (another project, a repeat), it is `FAILED`, with where it failed and the first line of the masked error. A flaky case is `PASSED`, with a comment saying it passed on a retry. Skipped tests, tests with no TC id, and cases that were never pushed aren't recorded, and the step says which.

On your yes, Agent-QA records a new Test Execution, labelled `agent-qa`, `agent-qa:exec:<hash of the selection>` and `agent-qa:run:<hash of the run id>`. The selection's text never shows in a label. A retry after a stop finds the run's own label and doesn't record it twice. If Jira or Xray can't be read, nothing is recorded and the run still finishes. Everything is kept in `xray-execution@1`, with status `recorded`, `declined`, `nothing` (no case of the run is in Xray) or `unavailable`.

What goes to Xray is masked text: a comment holds tokens such as `<PERSON_1>` as they are, even with `masking.restoreOnWrite`.

In CI, accept the step (`--accept run,xray`) and allow the write with `policy.writes.xray: allow`, because `ask` is denied when nobody can be asked.

**Not yet checked against a live Xray** (assumptions): that Xray returns Test Executions in the JQL's `ORDER BY created DESC` order, and that the start and finish dates are kept when the issue fields come in the multipart `info` part.
