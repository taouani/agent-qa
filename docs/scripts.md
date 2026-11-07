# Generating Playwright scripts

The `scripts` workflow turns reviewed test cases (`test-cases@1`) into Playwright TypeScript in your repo's own style. A playwright-bdd repo gets Gherkin scenarios and any missing step definitions. Any other repo gets specs. You review the code before anything is written. Agent-QA then runs the tests and fixes what it is allowed to fix. A real bug in your app is reported, never "fixed" in the test.

## Before you start

- A reviewed framework profile (`agent-qa.profile.json`). If the folder has no Playwright project yet, the `profile` workflow can start one: see [profile.md](profile.md).
- A test-cases run whose cases you reviewed.
- Optional: an explore run of the same cases ([explore.md](explore.md)). Its `exploration@1` gives the elements and waits it found, so the code starts closer to your app.
- `npm install` in the repo: the type check uses the repo's own `typescript` and `tsconfig.json` (without them, the draft says the type check was unavailable). To run the tests, also `npx playwright install chromium`, and the sign-in your tests use (for a repo Agent-QA started, `.env` from `.env.example`).

## Run it

In the IDE, start the `scripts` workflow. On the command line:

```bash
agent-qa run scripts --input '{"testCasesRun":"<run id>"}' --accept typecheck --accept review --accept run
agent-qa run scripts --input '{"testCasesRun":"<run id>","explorationRun":"<run id>","cases":["TC-ABC-1-001"]}'
```

Optional inputs: `cases` (only these TC ids, up to 20; needed when the run has more than 20 reviewed cases), `explorationRun`, `fixRounds` (0 to 5, default 3; 0 runs the tests with no fixes) and `stabilityRuns` (1 to 10, default 3).

Three steps take your own yes. In the IDE, Agent-QA asks you directly; when the host can't, it gives you the `agent-qa run … --accept <step>` command to run in a terminal. The model's yes is refused, and `--yes` declines them. In a terminal without `--accept`, each step shows what it is about (for `review`, the whole files) and asks `<step>: accept? [y/N]`. With no terminal, the run stops (exit 3); continue it with `agent-qa run --resume <run id> --accept <step>` or `--decline <step>`. `--accept review,run` works too.

| Step | What it does | Without your yes |
|---|---|---|
| `typecheck` | asked first: type checks the generated code with the repo's own TypeScript and `tsconfig.json`; nothing is written | the code is kept unchecked, and the draft says so |
| `review` | writes the files to the repo: new files only, never replacing one | nothing is written |
| `run` | runs the tests with the repo's Playwright (after `bddgen` for playwright-bdd), then fixes and runs them again | nothing runs |

The `run` step is skipped when no files were written, when the profile has no test command, or when `policy.writes.commands` is `deny`.

## What happens

1. **Draft.** The model writes the code from the cases, the profile (your steps, page objects, fixtures, locator style) and, for Salesforce, the [Salesforce pack](salesforce-pack.md). The server checks it before you see it:
   - every case is covered, and each of its steps maps to a line of code (a Gherkin step, or a `test.step` in its test);
   - new files only, never sign-in code;
   - no fixed waits, `page.pause()`, XPath, generated Lightning ids, record ids, org URLs, `.only`, `.skip` or `.fixme`;
   - no reading files, the environment (`process.env`), cookies or `storageState`, and no `require` or `eval`: test code uses the repo's fixtures and config;
   - no changes to how checks work (`expect.extend`, `expect.configure`, a `.catch` or `.then` on a check);
   - no masked tokens;
   - every Gherkin step matches exactly one step definition.

   A draft that fails is sent back with the errors. The model gets three tries, then the run fails. The draft is kept as `scripts-draft@1`.
2. **Review.** You see every file, whole, with the type check's result. Saying yes writes them, all or none. If a file appeared meanwhile with other content, nothing is written. Either way the answer is recorded in `scripts-written@1`.
3. **Run and fix.** The tests run with no retries and one worker. For each failure, the model says what kind it is, and may change only what that kind allows, in the files Agent-QA wrote:

   | Kind | Allowed fix |
   |---|---|
   | `selector` | which element a locator picks (role and label first) |
   | `timing` | add a wait for an element or a state, never a fixed wait |
   | `data` | the test-data file, but never a value a check compares against |
   | `flake` | nothing: the tests run again (it still uses a fix round) |
   | `environment` | nothing: the run waits while you fix it (sign-in, the app or the network failed), then runs the same files again; it ends as `environment` if you say stop, or when no fix round would be left after that run |
   | `defect` | nothing: the run stops and reports it |

   A fix never changes a feature file, a test's title, or a check. One that tries is refused and sent back; after three tries the run fails. Passing tests then run `stabilityRuns` more times. Everything is recorded in `scripts-run@1`. Its status is one of `passed`, `unstable` (passes only sometimes), `defect`, `environment`, `gave-up` (still failing after the last round) or `declined`.

What a run shows the model (an error, the code around it, a page snapshot) is masked first, like everything else.

## API tests

With `api: true`, `scripts` writes Playwright `request` tests for the cases that describe API behaviour. These tests send requests and check what comes back, and drive no browser. They take no exploration (`explorationRun` is refused) and no Salesforce UI helpers.

```bash
agent-qa run scripts --input '{"testCasesRun":"<run id>","api":true,"cases":["TC-ABC-1-004"]}' --accept typecheck,review,run
```

Each test sends to a path under the config's `baseURL` (Salesforce: `/services/data/vNN.0/…`). It checks the status, then the body field by field. The model is told to delete the records a test creates, but nothing checks that it does. The repo's own API fixture or request context authenticates it. If your repo has none, the draft's notes say that the request fixture needs its auth, for example `extraHTTPHeaders` in the config. On top of the checks above, the server refuses a draft that:

- uses `page`, `context` or `browser`, a locator, `goto`, `newPage`, a browser type, or a launch;
- sends to anything but a path written where it's sent (a string or template starting with `/` and its first segment). This also refuses a full or protocol-relative URL anywhere, a backslash, a `baseURL` of its own, and the global `fetch`;
- hands the request context on in a way the check can't follow: into an object or array, `bind` or `call`, a method, a class, a callback or `arguments`. Passing it to your own helpers (relative imports and tsconfig path aliases) or to a function in the same file is fine;
- handles credentials: an OAuth path, or an `Authorization`, cookie, secret or password key;
- sends no request at all.

When an API test fails, the run and fix loop works as above, with one more kind. `request` means the test sent the wrong path, method, payload or field, for example a 404 for a path the app doesn't have. That is the test's mistake, not a defect in your app: nothing is changed, and the run stops as `gave-up` for you to fix. `selector` isn't a kind for API tests, since they pick no element. Every case in the run gets a test. Leave out the cases with no API behaviour using `cases`. Known limits are in [backlog.md](backlog.md#api-test-guard-limits).

## In CI

With `--ci`, the generated files are written into the job's checkout and run there, and leave it only as a pull request: one commit of new files on a branch `agent-qa/<run id>`, with the run's report as the description. It is a draft unless every test passed and stayed stable. The result is `scripts-pr@1`. Nobody is asked in CI, so accept every step, including `pr`:

```bash
agent-qa run scripts --ci --input '{"testCasesRun":"<run id>"}' --accept typecheck,review,run,pr
```

`--yes` opens the pull request too, but declines the other three steps, so nothing would be written. The job needs:

- a git checkout of the repo, with `agent-qa.profile.json` committed (CI never writes it);
- the test-cases run: run `test-cases` in the same job, or restore `.agent-qa/runs/` (or `AGENT_QA_RUNS_DIR`), which is git-ignored;
- `policy.writes.testCode` and `policy.writes.commands` not set to `deny` (in CI, anything else allows);
- a `git` section in `agent-qa.yaml`. GitHub only for now: `gitlab` and `azure-devops` pass the schema but are refused.

  ```yaml
  git:
    platform: github
    repo: owner/name
    token: ${env:GITHUB_TOKEN}
    # baseUrl: https://github.example.com/api/v3   # GitHub Enterprise Server
  ```

- a token with `contents: write` and `pull-requests: write`, and the repo setting that lets GitHub Actions create pull requests (Settings, Actions, General).

## How it is checked

The quality harness has a case for the most important rule: a product bug is reported, never fixed in the test. Its stand-in app rejects a request it says it submitted. The generated test fails on it, a fix that changes the expected status is refused, and the run must end as `defect` with the test unchanged. See [harness.md](harness.md).
