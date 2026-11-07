# sf-agent-qa

## 2.0.0-alpha.2

### Minor Changes

- 3167252: `scripts` writes API tests with `api: true`: Playwright request tests for cases that describe API behaviour. They send to paths under the config's baseURL and check status and body. They drive no browser, take no exploration and use no Salesforce UI helpers. The server refuses a draft that uses `page`, a locator, a full URL, or sends no request (S3-8).
- 23a52a8: The `audit` workflow (slice 3, S3-5): a read-only architecture audit of the repo's own Playwright suite, ported from v1's audit-framework.

  Agent-QA does the inventory itself. It counts the files by role (specs, steps, page objects, fixtures, other code, features, data, configs) with their lines, and lists the largest files and the entry points. Configs are never read. It also runs its code scan over every code file it can read, up to 400. The scan counts fixed waits, focus or skip, XPath, generated ids, record ids and org URLs.

  The model reads a sample in full:

  - every fixture;
  - the ten largest files;
  - a fixed draw of specs, page objects, step files and data.

  It reports findings by area: layering, patterns, reuse, locators, waits, data, naming and scalability. Each finding cites evidence in the sample and has a severity, impact, risk of change and effort, and can name what it depends on.

  Agent-QA then ranks the findings: high impact and low risk first, each one after the findings it depends on. It numbers them AF-001 onward, scores each area out of 10, and records the result as `audit@1`, which `refactor` will read. The harness gets an `audit` case.

- dfee604: In CI, `debug` opens its changes as a pull request (step `pr`). Each changed file goes in once and is checked against its blob on the base from before the first change. The pull request is a draft unless every test passed and stayed stable. It is recorded under `pr` in `debug-report@1`.
- 737e1f0: `debug` workflow (slice 3, S3-3), which closes the backlog item "healing existing scripts". It runs a chosen part of the repo's own suite and classifies each failure as selector, timing, data, flake, environment or defect. A defect, an environment failure or a test-data failure is reported and nothing is changed for it. For the others it proposes only the fixes each kind allows, in the test files it showed the model, as one diff that waits for the person's own yes. Each file is written only if it is unchanged since it was read, then the tests run again and, once green, run again to show they are stable. A declined change is kept as a diff in `debug-report@1`. A fix may no longer change the locator of an element that a check like `toBeVisible()`, `toHaveCount()` or `expect.soft` checks, whether the locator is inline, held in a variable, or a page-object field. A wait for an element that the next statements act on can still change with them. This applies to `scripts` fixes too.
- 6f8872f: Changing existing test files (slice 3, S3-1): the data layer reads test files masked, with the sha256 and git blob id of their real bytes, and writes a reviewed edit back with its real values, all or none, only while each file still holds what was read. An edit keeps only the masking tokens of that file. Configs (at any depth), `package.json`, `.env`, the profile, auth and session files, git-ignored files and JSON outside a test data folder are never read or changed. A unified diff (`unifiedDiff`) shows the person the whole change first. In CI, pull requests can now carry changed files: the base must still hold each one as it was read.
- e848838: The `refactor` workflow (slice 3, task S3-6), ported from v1's refactor-framework. It works from an audit run's findings (`audit@1`), by default all of them, and the folder's code, masked. The model plans phases. Each task serves audit findings and is made of operations that Agent-QA applies in memory with ts-morph (new dependency):

  - a rename, where every reference follows across files, path aliases included;
  - an exact edit;
  - a new file.

  Before the person sees the plan, Agent-QA checks it:

  - every task applies;
  - the tasks of a phase touch different files;
  - nothing is planned before what it depends on;
  - no task changes what the tests check. Across the folder, checks, test titles and literal values stay as they were. No fixed wait, skip or soft check is added. Masked values stay in their files.

  A run carries out the first phase. The person sees its whole diff and says yes to all of its tasks or to some. Each task is type-checked with the repo's TypeScript over the whole folder and is written only if it adds no type error. The phase stops at the first task that does add one.

  The specs the changes reach, through imports, are listed. They run on a second yes, and if one fails, the phase is put back: edited files get their earlier text and new files are removed (new data method `removeTestFiles`). In CI the changes go out as a pull request, a draft unless the tests passed. The result is recorded as `refactor-report@1`. Linting isn't run yet, because the profile records no lint command.

- 893b0f1: `review` workflow (slice 3, S3-4). It does a file-scoped review of the repo's own test code: files, or globs with `*` and `**`, in the profile's folder. Each finding has a file and line, a severity (critical, high, medium or low) and a kind. Findings come from the code scan (fixed waits, focus or skip, XPath, generated ids, record ids, org URLs) and from the model, which reviews against v1's checklist.

  A finding may carry a small fix: an exact piece of the file and its replacement. A fix is refused if:

  - it doesn't apply cleanly;
  - it adds a fixed wait or a skip;
  - it removes or changes a check (what it checks, what it expects, `.not`), or makes one soft;
  - it adds a branch (`if`, `try`, `return`, `?:`, a loop) or a longer timeout;
  - it changes a test's title;
  - it brings in a masked value the file doesn't hold.

  The fixes are shown as one diff and type-checked with the repo's TypeScript across the whole folder, so a fix that breaks a file importing it is caught; any fix that adds a type error stops them all. If the type check can't run, nothing is written (`unchecked`). They are written only on the person's own yes. In CI they open as a draft pull request.

  The result is recorded as `findings@1`. The harness gets a `review` case: a hand-written test with two known flaws, both of which must be reported.

- 7d02f8d: `run-tests` workflow (slice 3, S3-2): runs a chosen part of the repo's own Playwright suite, not only generated tests: spec or feature paths (a spec may name a line), a title text, a tag, a project, or the failed and flaky tests of an earlier JSON report (from CI too). It asks the person before anything runs and records the result as `test-run@1`, masked.
- 5fb54c6: `run-tests` can record its results in Xray as a new Test Execution (S3-9). If Jira can't be read, nothing is recorded and the run still finishes. A run is never sent twice: if the import fails or is cut off, the step ends as `uncertain` and says which label to look for in Xray. Each test is matched to its case's Xray test through the `agent-qa:TC-ID` label. A skipped test, or one with no case in Xray, isn't recorded. Before asking, it compares with the last recorded run of the same selection in the local run folder (`.agent-qa/runs`; keep it between CI jobs) and says what changed: now failing, now passing, still failing, new, and not run this time. The result is `xray-execution@1`. Recording takes the person's yes (`--accept xray` in CI) and goes through the `xray` write policy.

### Patch Changes

- b6ccf53: Docs for maintaining an existing suite: `docs/run-tests.md` (including the Xray Test Execution), `docs/debug.md`, `docs/review.md`, `docs/audit.md` and `docs/refactor.md`, plus API tests in `docs/scripts.md` and the README.
- cbeea4d: The harness's browser run now includes a `debug` case (S3-10). A hand-written test and page object, not generated ones, open a seeded person's request on the stand-in app and fail on its seeded bug. The run must report a defect, refuse the fix that expects what the app shows, leave both files unchanged, and keep the person's names, the error and the page snapshot masked. The harness never approves a change, so this case also runs with a real model.

## 2.0.0-alpha.1

### Minor Changes

- 9e2f8a5: `explore` workflow (slice 2): walks reviewed test cases in a real browser on a Salesforce sandbox, one model action per step from a masked accessibility snapshot, after the person's own approval. Writes `exploration@1` (elements, waits, deviations per step) for script generation.
- 9a390b1: Explorer groundwork (slice 2): a browser driven with the Playwright from your own repo, accessibility snapshots masked before a model sees them (typed values and table records become tokens), sandbox-only Salesforce targets, and looping workflow steps. The `explore` workflow that uses them comes next.
- 5cf9a35: Framework profile (slice 2): the `profile` workflow and `agent-qa profile` read the repo's Playwright project (playwright-bdd steps, page objects, fixtures, features, locator style) without running it, and on the user's yes save `agent-qa.profile.json`, the only commands Agent-QA may run there. `agent-qa run` no longer needs a models section for workflows that never ask a model.
- 5632bb3: `agent-qa harness` prints the runnable rate next to the kept rate. It is read from the project's own runs (`scripts-run@1`) and judges each test case once, by its latest finished run.

  - **Runnable**: a case whose tests passed, then passed again in the stability runs.
  - **Left out of the rate, but shown**: a case that passed once but was never run again, and a case stopped on a real defect or on the environment.
  - **Not counted**: runs whose tests never ran, and runs still in their fix loop.

  `--json` adds `runnableRate`.

  The run loop now records an attempt whose tests couldn't run at all, and stops on the environment when that happens in a stability run too.

- 8eb1c4f: `agent-qa harness --browser` also explores a stand-in app in a real browser: a few Lightning-like pages served on 127.0.0.1, whose records show the case's seeded personal data in list cells, a record heading and title, detail fields and a toast. Each page snapshot the explorer's model sees, each action result and the exploration@1 record are scanned for the seeds, so CI checks the explorer's masking without Salesforce. It uses the Playwright and Chromium installed in the project (or the folder given). Without `--browser`, the browser cases are skipped with a note.
- e24aae7: Salesforce sign-in (slice 2): a `salesforce` section in agent-qa.yaml (login URL, consumer key, private key or key file, one user per role) and the JWT bearer flow of an External Client App. Each sign-in mints a single-use frontdoor URL; nothing is stored. `agent-qa doctor` signs in each role and explains OAuth errors.

  Breaking for alpha configs: the `salesforce` section's old `auth: storage-state` placeholder is gone. Replace it with `clientId`, `privateKey` (or `privateKeyFile`) and `users`, as `docs/salesforce.md` shows.

- 5403d83: Salesforce pack: Lightning rules, the locator order, and a Playwright helper file (`packs/salesforce/lightning.ts`) that generated tests use when the repo's page objects have no method for the same job.
- 30f7a7b: Start a new Playwright repo (S2-12): in a folder with no Playwright project, the `profile` workflow asks the style (Gherkin with playwright-bdd by default, or plain specs), then, on the person's own yes (`--accept scaffold`), creates a TypeScript repo for Salesforce with JWT bearer sign-in, the pack's Lightning helpers, faker test data, ESLint and a GitHub Actions workflow, and saves its reviewed `agent-qa.profile.json`. It writes new files only, never in CI, and removes what it created if a write fails.
- 4329cff: Generated-code checks for the coming `scripts` workflow: `scripts-draft@1`, and checks for new files only, no tokens, no fixed waits or XPath, and every test step mapped to a Gherkin step or `test.step`. Gherkin steps must match one step definition. The framework profile now records page-object method signatures.
- fcad132: In CI, `agent-qa run scripts --ci --accept review,run --yes` writes the generated tests into the job's own checkout, runs and fixes them there, then opens one pull request on GitHub with the files Agent-QA wrote and the run's report as its description (`scripts-pr@1`). It is a draft unless every test passed and stayed stable; tests that weren't run say so at the top. The branch is `agent-qa/<run id>`. The base is the branch the job's code came from (a pull request's own branch, else the pushed branch, else the default branch), and it is never written to. Only new files are added. Configure `git: { platform: github, repo: owner/name, token: ${env:GITHUB_TOKEN} }` and give the job `permissions: contents: write, pull-requests: write`. A pull request opened with `GITHUB_TOKEN` doesn't start the repo's other workflows. A run stopped halfway can go on only in the same job, since a new job's checkout no longer has the files.
- 7961988: `scripts` now runs the tests it wrote. On your own yes (asked once), Agent-QA runs them with your repo's Playwright: `npx bddgen` first for playwright-bdd, then `npx playwright test` on the generated files only, with the JSON reporter, no retries and one worker. For each failure the model says what it is: a selector, a wait, test data, a flake, the environment, or a real defect. It may fix only selectors, waits and test data, and only in the files Agent-QA wrote and you haven't edited since. It never changes the scenarios or a test's title, and never removes, softens or skips a check. A real defect or a broken environment stops the loop and is reported. Passing tests run again (`stabilityRuns`, 3 by default) to show they are stable. Everything is recorded in `scripts-run@1`. New inputs: `fixRounds` (3 by default, at most 5) and `stabilityRuns`.
- df49656: `scripts` type-checks generated code with your repo's own TypeScript and tsconfig before keeping it, with the files laid over the repo in memory (nothing is written). It asks once per run first; with a no, or when the repo has no TypeScript, `scripts-draft@1` says the type check was skipped or unavailable.
- 657ec5f: New `scripts` workflow: writes Playwright code (specs, or Gherkin scenarios and missing step definitions for playwright-bdd) for reviewed test cases, from the reviewed framework profile, the Salesforce pack and an optional exploration. The server checks the code and keeps it as `scripts-draft@1` for review; nothing is written to the repo yet.
- a52a21e: `scripts` now ends with a review: you see every generated file whole, with the notes and the type check result, and on your own yes Agent-QA writes them to the repo through the policy layer (`policy.writes.testCode`). Files are only created, never replaced, all or none; `scripts-written@1` records what was written. In CI nothing is written (the pull request comes with the GitHub adapter). The files go only to the folder you were asked about, and only the draft you were shown: a profile saved since, or a draft changed in the run folder, writes nothing. A file that already holds exactly the generated bytes counts as written, so a write that stopped halfway can run again. File names Windows can't write as given (`:`, `CON`, a trailing dot) and new root tool configs (`*.config.js`, `.pnpmfile.cjs`) are refused.

### Patch Changes

- 29d0359: Docs for slice 2: `docs/scripts.md` (generate, review, run and fix, CI pull requests), the README's Playwright section, and the v1 migration table for `profile`, `explore` and `scripts`.
- 32a3d29: The harness's browser run now includes a seeded product bug (S2-10). A generated test for the stand-in app fails because the app rejects a request it says it submitted. The run must report a defect, refuse a fix that changes what the test expects, leave the test unchanged, and keep the test's error and page snapshot masked.
- 2129db5: doctor warns when the editor schema line in agent-qa.yaml names another version; certificate hints give the NODE_OPTIONS line for a terminal; the profile review says "this folder" instead of ".".
- b5c68ab: Releases are published with npm provenance, now that the repository is public.
- bcde624: scripts: an environment failure (sign-in, the app, the network) no longer ends the run. The run waits while you fix it, then runs the same files again and goes on with the fix loop. It ends as `environment`, as before, if you say stop or when no fix round would be left after the retry. The IDE approval note now says plainly that the model's submit only opens your prompt.

## 2.0.0-alpha.0

### Major Changes

- bcee622: Agent-QA v2, first alpha: a TypeScript rewrite of the v1 prompt pack, as an npm package with an MCP server for IDEs and a CLI for CI.

  - `requirements` and `test-cases` workflows from a Jira issue key or a JQL filter, with children and linked issues, and linked Confluence pages.
  - Personal data masked before any model sees it; real values kept in an encrypted local vault.
  - Test cases reviewed by a person, then pushed to Xray Cloud only on their own yes (an MCP prompt in IDEs that support it).
  - `agent-qa init`, `run`, `doctor`, `harness` and `mcp`; a cost report per run; a leak gate for CI.
