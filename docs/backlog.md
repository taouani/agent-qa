# Backlog

Improvements planned after a shippable product (2.0.0). Until then, the remaining slices of the [final plan](planning/06-final-plan.md) come first.

## Accessibility tests

Moved out of slice 3 on 6 Nov 2026 (it was S3-7, estimated at 6 to 8 h). `@axe-core/playwright` checks for the pages an exploration visited, written as new files through the `scripts` pipeline.

## Fixing test data in `debug`

Decided on 6 Nov 2026 (PR #69 review): `debug` reports a test-data failure and changes nothing for it. To fix data, it would have to find the JSON a failing test loads (by path, or by scenario name as playwright-bdd suites do) and protect every value a check anywhere in the suite compares against, not only in the files shown.

## Done or moved into a slice

### Healing existing scripts

Moved into slice 3 on 6 Nov 2026: the `debug` workflow (S3-3) is this feature. It runs a chosen part of a repo's existing suite (S3-2), sorts each failure into the kinds the `scripts` run uses (selector, timing, data, flake, environment, defect), reports real bugs and test-data problems, and heals what is allowed: selectors and waits, never a check, a title or a feature file. The edits to files Agent-QA didn't write (S3-1) are shown as a whole diff for review, and go as a pull request in CI.
