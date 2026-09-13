# Phase 2: Select Phase and Tasks

## Core Responsibilities

- Present the plan and take the engineer's selection
- Verify the working tree is safe to modify

## Workflow Steps

### Step 1: Verify the Gate

Execution requires ALL of:

1. `automation.allow_source_edits` is `true`
2. The framework profile has `reviewed: true`
3. A refactor plan exists
4. The git working tree under `playwright_project_root` is clean

Check the tree with:

```bash
cd "{playwright_project_root}" && git status --porcelain
```

If it is not clean, stop and ask the engineer to commit or stash first. Mixing a refactor with
uncommitted work makes the revert path unreliable.

If any other condition fails, report which and stop.

### Step 2: Present the Plan

List the phases with their goals, task counts, and file counts. Then list the tasks of each phase
numbered, showing the finding id and the files touched.

### Step 3: Take the Selection

Ask which phase to execute, then which tasks within it. Accept "all tasks in this phase" or a list
of numbers. Execute exactly one phase per run — phases are review points, not steps to batch
through.

### Step 4: Confirm Scope

Restate the selection as the full list of files that will be modified, and ask for a final
confirmation before any edit.

## Data Storage

- `selected_phase`, `selected_tasks`, `files_in_scope`

## Constraints

- Never execute more than one phase per run
- Never start with a dirty working tree
- Never modify a file outside `files_in_scope`
