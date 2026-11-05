# Generating Playwright scripts

The `scripts` workflow turns reviewed test cases (`test-cases@1`) into Playwright TypeScript in your repo's own style. A playwright-bdd repo gets Gherkin scenarios and any missing step definitions. Any other repo gets specs. You review the code before anything is written. Agent-QA then runs the tests and fixes what it is allowed to fix. A real bug in your app is reported, never "fixed" in the test.

## Before you start

- A reviewed framework profile (`agent-qa.profile.json`). If the folder has no Playwright project yet, the same workflow can start one: see [profile.md](profile.md).
- A test-cases run whose cases you reviewed.
- Optional: an explore run of the same cases ([explore.md](explore.md)). Its `exploration@1` gives the elements and waits it found, so the code starts closer to your app.
- To run the tests: `npm install` and `npx playwright install chromium` in the repo, and the sign-in your tests use (for a repo Agent-QA started, `.env` from `.env.example`).

## Run it

In the IDE, start the `scripts` workflow. On the command line:

```bash
agent-qa run scripts --input '{"testCasesRun":"<run id>"}' --accept typecheck --accept review --accept run
agent-qa run scripts --input '{"testCasesRun":"<run id>","explorationRun":"<run id>","cases":["TC-ABC-1-001"]}'
```

Optional inputs: `cases` (only these TC ids, up to 20), `explorationRun`, `fixRounds` (default 3, at most 5) and `stabilityRuns` (default 3).

Three steps take your own yes. The model's yes is refused, and `--yes` declines them:

| Step | What it does | Without your yes |
|---|---|---|
| `typecheck` | type checks the generated code with the repo's own TypeScript and `tsconfig.json`; nothing is written | the code is kept unchecked, and the draft says so |
| `review` | writes the files to the repo: new files only, never replacing one | nothing is written |
| `run` | runs the tests with the repo's Playwright, then fixes and runs them again | nothing runs |

## What happens

1. **Draft.** The model writes the code from the cases, the profile (your steps, page objects, fixtures, locator style) and, for Salesforce, the [Salesforce pack](salesforce-pack.md). The server checks it before you see it:
   - every case is covered, and each of its steps maps to a line of code (a Gherkin step, or a `test.step` in its test);
   - new files only, never sign-in code;
   - no fixed waits, XPath, generated Lightning ids, record ids, org URLs, `.only` or `.skip`;
   - no masked tokens;
   - every Gherkin step matches exactly one step definition.

   A draft that fails is sent back, up to three times. It is kept as `scripts-draft@1`.
2. **Review.** You see every file, whole, with the type check's result. Saying yes writes them (`scripts-written@1`). If a file appeared meanwhile with other content, nothing is written.
3. **Run and fix.** The tests run with no retries and one worker. For each failure, the model says what kind it is, and may change only what that kind allows, in the files Agent-QA wrote:

   | Kind | Allowed fix |
   |---|---|
   | `selector` | which element a locator picks (role and label first) |
   | `timing` | add a wait for an element or a state, never a fixed wait |
   | `data` | the test-data file, but never a value a check compares against |
   | `flake` | nothing: the tests run again |
   | `environment` | nothing: the run stops (sign-in, the app or the network failed) |
   | `defect` | nothing: the run stops and reports it |

   A fix never changes a feature file, a test's title, or a check. One that tries is refused and sent back. Passing tests then run `stabilityRuns` more times. Everything is recorded in `scripts-run@1`. Its status is one of `passed`, `unstable` (passes only sometimes), `defect`, `environment`, `gave-up` (still failing after the last round) or `declined`.

What a run shows the model (an error, the code around it, a page snapshot) is masked first, like everything else.

## In CI

With `--ci`, the generated files never stay in the job's checkout. They leave only as a pull request: one commit of new files on a branch of its own, with the run's report as the description. It is a draft unless every test passed and stayed stable. This needs a `git` section in `agent-qa.yaml` (GitHub for now) and a token with `contents: write` and `pull-requests: write`. The result is `scripts-pr@1`.

## How it is checked

The quality harness has a case for the most important rule: a product bug is reported, never fixed in the test. Its stand-in app rejects a request it says it submitted. The generated test fails on it, a fix that changes the expected status is refused, and the run must end as `defect` with the test unchanged. See [harness.md](harness.md).
