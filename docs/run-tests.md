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
| `tag` | a tag such as `@smoke` (tags that start with it count too); not together with `grep`. Several: `"@a @b"` runs the tests that have both, `"@a\|@b"` those with either, `"@a @b\|@c"` those with both of the first or the last. With several, Playwright first lists the selection (nothing runs), then only the tests with the tags run, by file and line. A line that defines several tests (a loop, a parameterised test) runs all of them; playwright-bdd puts each scenario on its own line. If a file doesn't load, nothing runs and its error is shown |
| `project` | one Playwright project of your config |
| `failedIn` | a Playwright JSON report in the folder: its failed and flaky tests run again |
| `repeatEach`, `workers` | run each test 1 to 10 times; 1 to 4 workers (default 1) |
| `headed` | `true` shows the browser while the tests run (Playwright's `--headed`); refused in CI |

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

Each case gets one result, with its start and end time (from its first test's start to its last test's end). If any of its tests failed (another project, a repeat), it is `FAILED`, and its comment says where it failed (the line in your code, and the test), then the masked error with Playwright's call log, then the code around that line, up to 4,000 characters. Dates go out as Xray's JSON examples write them (`2026-11-07T20:00:13+00:00`). The comment is masked like everything the model sees, but it carries more than a first line: Playwright's call log can show an element's attributes and the code can hold test data, which the detectors may not recognise. Masked values stay tokens (`<PERSON_1>`) in Xray, even with `restoreOnWrite`. A flaky case is `PASSED`, with a comment saying it passed on a retry. Skipped tests, tests with no TC id, and cases that were never pushed aren't recorded, and the step says which.

With `attachScreenshots: true` in the `xray` section of agent-qa.yaml, each case also gets Playwright's screenshot as evidence, passed or failed: with `screenshot: 'on'` in the Playwright config every test has one, with `'only-on-failure'` only the failed ones do. When a test failed and then passed on a retry, the failure's screenshot goes. It is off by default: **a screenshot can't be masked**, so what the page showed (names, emails, record data) goes to Xray as it is. Only Playwright's own screenshot attachment in a project's output folder is sent, PNG or JPEG, only if it is still there when the results are recorded. The question you answer says how many unmasked screenshots go out, and so does the audit log. Agent-QA keeps no screenshot path in the run folder (Playwright names its folders after the test titles): only the output folder and a hash of the file's path, found again when the results are recorded. At most 5 MB each and 10 MB per execution.

On your yes, Agent-QA records a new Test Execution, labelled `agent-qa`, `agent-qa:exec:<hash of the selection>` and `agent-qa:run:<hash of the run id>`. The selection's text never shows in a label. If Jira can't be read before the question, nothing is recorded and the run still finishes. Agent-QA notes `recording` in the run folder just before the import. If the import fails, or the run stops during it, the step ends as `uncertain`: the execution may or may not be in Xray, so it is never sent again, and the step names the `agent-qa:run:` label to look for in Xray. Everything is kept in `xray-execution@1`, with status `recorded`, `declined`, `nothing` (no case of the run is in Xray), `unavailable` (Jira couldn't be read), `recording` or `uncertain`. Only a `recorded` run is used as the comparison for later runs.

What goes to Xray is masked text: a comment holds tokens such as `<PERSON_1>` as they are, even with `masking.restoreOnWrite`.

In CI, set `policy.writes.xray: allow` and accept the step (`--accept run,xray`). With `ask`, the step is skipped altogether in CI, because nobody can be asked, so `--accept xray` alone does nothing.

Xray sets each test run's start and finish from the results, but not the Test Execution's own dates in this import. To fill them, name the execution's date fields (Jira admin, Custom fields) in agent-qa.yaml:

```yaml
xray:
  executionDates:
    start: { field: customfield_10014, type: date }      # a date field gets the UTC day
    end: { field: customfield_10505, type: datetime }    # the default type
```

The start is when the run step began and the end is when it finished. Xray's import leaves these fields empty even when they are sent with it, so Agent-QA sets them on the new execution with a Jira edit right after the import, under the same yes (the policy summary says so; `writes.jira` stays `deny`). It needs the `atlassian` section, and both fields must be editable on the Test Execution. If the edit fails, the execution is still recorded, and the run says to set the dates by hand.
