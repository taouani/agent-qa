# Debugging failing tests

The `debug` workflow takes your repo's own failing tests, the ones you wrote, and does what `scripts` does for the tests it writes. It runs them, says what kind each failure is, and proposes only the fixes that kind allows. You see each diff before anything is written. A real defect in your app is reported, never "fixed" in the test.

## Run it

Pick the tests as `run-tests` does ([run-tests.md](run-tests.md)): `files`, `grep`, `tag` (several too), `project` or `failedIn`. Or give `testRun`, the id of a `run-tests` run, to debug the same tests it ran (one picked by `grep` can't: the run keeps that text masked, so give it again). Optional: `fixRounds` (0 to 5, default 3), `stabilityRuns` (1 to 10, default 3) and `headed` (`true` shows the browser; not in CI).

```bash
agent-qa run debug --input '{"testRun":"2026-11-08-run-tests-f5tm"}' --accept run
```

```bash
agent-qa run debug --input '{"failedIn":"playwright-report/report.json"}' --accept run
```

| Step | What it does | Without your yes |
|---|---|---|
| `run` | runs the tests, and lets Agent-QA propose fixes | nothing runs |
| `apply-1`, `apply-2`… | writes one round's fix (you see the whole diff), then the tests run again | nothing is written, and the run ends as `declined`, keeping the diff |

Both take your own yes: the model's is refused. In a terminal, each `apply-N` shows the diff and asks.

## What a fix may do

The failure kinds are the ones in [scripts.md](scripts.md), with one difference: debug **reports** a test-data failure and changes no test data.

| Kind | What happens |
|---|---|
| `selector` | a fix may change which element a locator picks |
| `timing` | a fix may add a wait for an element or a state, never a fixed wait |
| `flake` | nothing changes: the tests run again |
| `data` | reported: the run ends as `data`, and nothing changes |
| `environment` | reported: sign-in, the app or the network failed |
| `defect` | reported: the app does what the test says it must not |

A fix changes only files the model was shown, meaning the failing specs and the files their errors point at, up to 10. It never changes a feature file, a test's title or a check, never adds a branch or a fixed wait, and never removes or softens a check. A wait or an action may get a longer timeout. A check whose element is read through a page object stays pinned to that element. A file that changed since Agent-QA read it is never overwritten. The model sees masked text only, and the write puts the real values back.

After the last fix the tests run `stabilityRuns` more times. Everything is kept in `debug-report@1`. Its status is one of `passed`, `nothing-to-fix` (everything passed the first time), `unstable`, `defect`, `environment`, `data`, `gave-up`, `declined`, `no-tests` or `unavailable`.

## In CI

With `--ci`, accepted changes are written into the job's checkout and leave only as a pull request, as for `scripts` (see [scripts.md](scripts.md#in-ci)). Accept the steps, including `pr`:

```bash
agent-qa run debug --ci --input '{"tag":"@smoke"}' --accept run,apply-1,apply-2,apply-3,pr
```
