# sf-agent-qa

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
