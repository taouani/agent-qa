# Backlog

Improvements planned after a shippable product (2.0.0). Until then, the remaining slices of the [final plan](planning/06-final-plan.md) come first.

## Healing existing scripts

Run a repo's existing Playwright suite, sort each failure into the same kinds the `scripts` run uses (selector, timing, data, flake, environment, defect), report real bugs, and heal what is allowed: selectors and waits, never a check, a title or a feature file.

Two sizes were discussed on 5 Nov 2026 (estimates, not measured):

- **Triage only** (about 8 to 12 h): a report, no edits. It keeps the "new files only" rule.
- **Triage and heal** (about 25 to 40 h): also fixes existing files, shown as a whole diff for review, and as a pull request in CI. It needs a decision to let Agent-QA change files it didn't write.
