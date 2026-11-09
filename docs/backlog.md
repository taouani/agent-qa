# Backlog

Improvements planned after a shippable product (2.0.0). Until then, the remaining slices of the [final plan](planning/06-final-plan.md) come first.

## Accessibility tests

Moved out of slice 3 on 6 Nov 2026 (it was S3-7, estimated at 6 to 8 h). `@axe-core/playwright` checks for the pages an exploration visited, written as new files through the `scripts` pipeline.

## Fixing test data in `debug`

Decided on 6 Nov 2026 (PR #69 review): `debug` reports a test-data failure and changes nothing for it. To fix data, it would have to find the JSON a failing test loads (by path, or by scenario name as playwright-bdd suites do) and protect every value a check anywhere in the suite compares against, not only in the files shown.

## Branches per test in `review` fixes

Found in the PR #72 review (6 Nov 2026). A review fix may not add a branch, but branches are counted for the whole file. A fix that removes one `if` and puts a check behind a new one keeps the total and passes. Counting branches per test would close this.

## Refactor guard limits

Found in the PR #74 review (6 Nov 2026). `refactor` checks each task against the code with only its renames applied. Three limits remain:
- Outside a test's own scope, what it reaches is matched by name, not by symbol. A check moved into a page-object method can be passed another existing value of the same name and still pass. The type check and the test run remain, but a test run rarely catches this for a negative check (`toBeHidden`, `.not`).
- Checks must stay word for word, apart from `this.page` in a page object standing for a spec's `page`. A check whose element moves into a page-object getter (`expect(requestPage.status)`) is refused, even when it reads the same element.
- Branches are counted, not placed: a function body that is a single return doesn't count, but any other new return does, even one that skips nothing.
- Names declared in a test, and a called function's parameters, resolve to their own values. Any other name, such as a method or a constant in another file, still expands every declaration of it. A beforeEach counts only for the tests of its own describe block, and beforeAll not at all.
- A callback passed to a promise that never resolves (`new Promise(() => {}).then(…)`) counts as run. The test hangs until its timeout, so the test run fails it and the phase is put back.
- The lint step isn't run: the report says so, and the type check stands in. Path aliases are read from the folder, not from tsconfig's `baseUrl`, and renames don't reach files that weren't read.

## API test guard limits

Found in the PR #75 review (7 Nov 2026). In API tests, a request context may only be sent on, disposed of, or passed to the person's own helpers (relative imports and tsconfig path aliases) or to a function in the same file. Two limits remain:
- A context reached inside the repo's own fixture or helper (`sfApi.raw.get(url)`) is the person's code and isn't followed.
- Fixtures other than `request` may be the repo's API fixture or plain test data, so their non-send members are read as usual (`testData.name`). Only a send on them is path-checked.

## Xray Test Execution limits

From the PR #76 review (7 Nov 2026):
- Checked live on 7 Nov 2026: Xray ignores the dates in the results' `info` in a multipart import. The Test Execution's own dates are set through `xray.executionDates` (PR #86).
- The rerun comparison comes from the local run folder (Tarek's choice, 7 Nov 2026). In CI it needs the folder kept between jobs; a shared Xray read-back could be added later if teams ask for it.
- An `uncertain` recording (import failed or cut off) is never sent again and never used as a comparison; the person checks Xray by the `agent-qa:run:` label. No automatic check yet.
- The screenshot handle is an unsalted hash of the file's path in the output folder.
- One screenshot per case, even when the case ran in several projects. The count in the question can be higher than what is sent (a file gone, or over the 10 MB limit), never lower.

## Pushing reviewed cases later (`--push-from`)

The four limits from the PR #82 review were closed in the clean-up pass (7 Nov 2026): a push takes a claim on the cases' run across processes, every run is searched, a push with failed cases can be pushed again (all cases are sent; those already in Xray are updated), and the vault is needed only with `restoreOnWrite`. Left: a claim left by a crash is never taken over; the message names the file to delete.

## Test run limits

From the PR #83 review (7 Nov 2026):
- A test that hangs until the 15-minute `--global-timeout` shows as skipped, not failed.
- A smaller `globalTimeout` in the repo's Playwright config is replaced by Agent-QA's.

## Long runs inside an MCP call

From the PR #55 review (5 Nov 2026): a long test run inside one MCP `workflow_submit` can hit the host's own timeout. Agent-QA sends progress only when the host gives a progress token.

## Masking across runs and machines

From the PR #112 review (8 Nov 2026), on repo path tokens:
- Path tokens come from the vault key, so CI and a laptop with different keys give the same file different tokens. Runs compared across them (a rerun's reuse of earlier cases) see different paths.
- A name masked in one run can appear in clear in another run that uses a different vault, when only the second run's detectors miss it. Keeping the tokens each run showed would let later runs mask them too.
- The shown form of a test command's file filters is made by plain text replacement, which can also rewrite a longer path that contains a shorter one. Only what is shown and recorded is affected, never the command that runs.
- Review globs that a person writes with real names match the masked paths only when the name isn't masked.

## Masking detectors

- No address detector yet: `address` in `masking.detectors` does nothing, and an address is masked only through `masking.fields`.
- `masking.presidio` is accepted and checked by doctor, but nothing sends text to it.

## Audit log

The audit log records what was asked and its outcome, but not who said yes. Recording how the answer came (Agent-QA's own prompt, MCP elicitation, or the model in chat) would let a reviewer tell a person's yes from a model's.

## Release and repository

From the slice 5 reviews (9 Nov 2026):
- Repository settings, for Tarek: protect `master` with the DCO and CI checks required (today nothing blocks a merge); turn on private vulnerability reporting, which SECURITY.md and the issue form rely on; and turn on sign-off for web-based commits, which CONTRIBUTING.md relies on.
- CODEOWNERS on `.github/workflows/` and `scripts/dco*.mjs`. A pull request runs its own workflow file, so only branch protection and code owners stop one from skipping its DCO step.
- "Version packages" pull requests are opened with the workflow's own token, so GitHub runs no checks on them: CI is started by hand on `changeset-release/master`. A GitHub App token for the changesets step would run them, and the `install` jobs with them.
- `@cucumber/gherkin` stays on 39 while `engines` allows Node 20 before 20.10: releases 40 and later need import attributes.
- `@playwright/test` stays at 1.49.1 as the oldest supported version; its advisory covers only `playwright install`. `esbuild`'s dev-server advisory doesn't apply (no dev server runs), and goes when tsup allows 0.28.
- `playwright.testDir` and `playwright.profile` in `agent-qa.yaml` are read by nothing: the reviewed profile is always `agent-qa.profile.json`. Removing them is a breaking config change.
- The lint message for an import of `src/index.ts` from inside `src` has an empty target name.

## Done or moved into a slice

### Healing existing scripts

Moved into slice 3 on 6 Nov 2026: the `debug` workflow (S3-3) is this feature. It runs a chosen part of a repo's existing suite (S3-2), sorts each failure into the kinds the `scripts` run uses (selector, timing, data, flake, environment, defect), reports real bugs and test-data problems, and heals what is allowed: selectors and waits, never a check, a title or a feature file. The edits to files Agent-QA didn't write (S3-1) are shown as a whole diff for review, and go as a pull request in CI.
