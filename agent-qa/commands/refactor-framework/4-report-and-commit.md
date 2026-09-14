# Phase 4: Report and Commit

## Core Responsibilities

Report what changed and offer, but never force, a commit.

## Workflow Steps

### Step 1: Write the Report

Write `{selected_folder}/reviews/refactor-report.md`:

    ---
    type: refactor-report
    generated: YYYY-MM-DD
    source_plan: {path}
    phase_executed: {n}
    tasks_completed: {c}
    tasks_stopped: {s}
    ---

Body: one section per executed task with the finding id, files changed, a summary diff, and the
validation output. Then `## Remaining` listing the tasks and phases not executed, so the next run
has a starting point.

### Step 2: Offer a Commit

Show the full list of changed files and a proposed conventional commit message, for example:

    refactor(automation): centralise login fixture (AF-003)

Ask whether to commit. If the engineer declines, leave the working tree as it is and say so. Never
commit without an explicit yes.

### Step 3: Point at the Next Step

State which phase is next and that it requires a fresh run, so each phase keeps its own review
point.

### Step 4: Generate Output Index

Follow `@agent-qa/commands/common/generate-output-index.md`.

### Step 5: Execute Post-Generation Hooks

Follow `@agent-qa/commands/common/execute-post-hooks.md`.

## Data Storage

- `report_path`, `committed`

## Constraints

- Never commit without explicit approval
- Never push
- Never execute the next phase in the same run
