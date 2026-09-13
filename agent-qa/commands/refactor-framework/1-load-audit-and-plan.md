# Phase 1: Load Audit and Plan

## Core Responsibilities

- Load the architecture review
- Produce a dependency-aware, phased refactor plan
- Stop for approval

## Workflow Steps

### Step 1: Resolve the Framework Profile

Follow `@agent-qa/commands/common/discover-framework-profile.md`. If it stops, this command stops.

### Step 2: Locate the Architecture Review

Find the most recent `agent-qa/*/reviews/architecture-review.md`. If none exists, report and stop:

    No architecture review found. Run /agent-qa:audit-framework first.

Never assess the framework here — that is a different command with a different method.

### Step 3: Build the Plan

Read every `### AF-NNN` finding with its severity, impact, risk, effort, and `depends_on`.

Group findings into phases so that:

- A finding never precedes anything it depends on
- Each phase is independently valuable — the suite is healthy if work stops after any phase
- High impact and low risk come first
- A phase touching many files is split until each phase is reviewable

For each task within a phase record: the finding id it serves, the exact files to change, what
changes, the validation command that proves it, and how to revert.

### Step 4: Write the Plan

Write `{selected_folder}/reviews/refactor-plan.md`:

    ---
    type: refactor-plan
    generated: YYYY-MM-DD
    source_review: {path}
    phases: {n}
    ---

Body: one `## Phase N — {goal}` section per phase, each listing numbered tasks with finding id,
files, change description, validation command, and revert note.

### Step 5: Stop for Approval

Report:

    Refactor plan written to {path}.
    Review it, then re-run /agent-qa:refactor-framework to execute selected phases.

Do not execute anything in this phase.

## Data Storage

- `plan`: parsed phases and tasks
- `plan_path`

## Constraints

- Never modify host source in this phase
- Never include a task that is not traceable to a finding id
- Never plan a change listed under `## Never-Apply Fixes`
