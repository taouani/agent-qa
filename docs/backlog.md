# Backlog

Improvements planned after a shippable product (2.0.0). Until then, the remaining slices of the [final plan](planning/06-final-plan.md) come first.

## Accessibility tests

Moved out of slice 3 on 6 Nov 2026 (it was S3-7, estimated at 6 to 8 h). `@axe-core/playwright` checks for the pages an exploration visited, written as new files through the `scripts` pipeline.

## Fixing test data in `debug`

Decided on 6 Nov 2026 (PR #69 review): `debug` reports a test-data failure and changes nothing for it. To fix data, it would have to find the JSON a failing test loads (by path, or by scenario name as playwright-bdd suites do) and protect every value a check anywhere in the suite compares against, not only in the files shown.

## Masking repo paths

Found in the PR #72 review (6 Nov 2026). `review` and `debug` send test-file paths to the model as they are, and record them that way in their reports. A file named after a person, such as `tests/users/<a name>.spec.ts`, is therefore not masked. Today paths are refused only when they already hold tokens. The fix belongs in the data layer, so that it applies to every workflow.

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

From the PR #76 review (7 Nov 2026), not yet checked against a live Xray:
- The start and finish dates go in the Xray JSON `info` part. In a multipart import the issue fields come from the `info` part, and some instances keep the dates in custom fields.
- The rerun comparison comes from the local run folder (Tarek's choice, 7 Nov 2026). In CI it needs the folder kept between jobs; a shared Xray read-back could be added later if teams ask for it.
- An `uncertain` recording (import failed or cut off) is never sent again and never used as a comparison; the person checks Xray by the `agent-qa:run:` label. No automatic check yet.

## Done or moved into a slice

### Healing existing scripts

Moved into slice 3 on 6 Nov 2026: the `debug` workflow (S3-3) is this feature. It runs a chosen part of a repo's existing suite (S3-2), sorts each failure into the kinds the `scripts` run uses (selector, timing, data, flake, environment, defect), reports real bugs and test-data problems, and heals what is allowed: selectors and waits, never a check, a title or a feature file. The edits to files Agent-QA didn't write (S3-1) are shown as a whole diff for review, and go as a pull request in CI.
