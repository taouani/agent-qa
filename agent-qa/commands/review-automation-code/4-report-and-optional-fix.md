# Phase 4: Report and Optional Fix

## Core Responsibilities

- Write the review report
- Optionally apply fixes, behind the approval gate

## Workflow Steps

### Step 1: Write the Report

Write `{selected_folder}/reviews/code-review.md` with YAML front matter per
`@agent-qa/rules/output-standards.md`:

    ---
    type: code-review
    generated: YYYY-MM-DD
    files_reviewed: {count}
    findings: {critical}/{high}/{medium}/{low}
    ---

Body: a summary table of findings by severity, then one section per file, each finding showing
path and line, severity, the problem, why it matters, and the replacement code in a fenced block.

### Step 2: Evaluate the Approval Gate

Fixes may be applied ONLY when ALL of the following hold:

1. `automation.allow_source_edits` is `true` in `agent-qa/config.yml`.
2. Every target path resolves under `playwright_project_root`.
3. No target path matches the deny-list.
4. The framework profile has `reviewed: true`.

If any condition fails, report which one and stop after the report. Do not offer a partial
workaround.

### Step 3: Ask

Present the numbered findings and ask which to apply. Accept "all", a list of numbers, or "none".
Never apply a fix the user did not name.

### Step 4: Apply

For each chosen finding: apply exactly the replacement code shown in the report, then re-read the
file to confirm the edit landed as intended. If a fix no longer applies cleanly, skip it and say
so — never improvise a different change.

After all fixes, run the profile's `typecheck_command` if it records one other than "none
observed", and report the result. Do not run the full suite here; that is `debug-tests`.

### Step 5: Write the Applied-Fixes Record

Append an `## Applied Fixes` section to the report listing what was changed and what was skipped,
with the reason for each skip.

### Step 6: Generate Output Index

Follow the instructions in `@agent-qa/commands/common/generate-output-index.md`.

### Step 7: Execute Post-Generation Hooks

Follow the instructions in `@agent-qa/commands/common/execute-post-hooks.md`.

## Data Storage

- `report_path`: path to the written report
- `applied`, `skipped`: lists of finding identifiers

## Constraints

- Never write outside `agent-qa/` unless all four gate conditions in Step 2 hold
- Never modify `playwright.config.ts` — report the needed change instead
- Never apply a fix listed under `## Never-Apply Fixes` in `automation-conventions.md`
- Never commit; committing is the engineer's decision
