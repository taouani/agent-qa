# Phase 3: Execute With Validation

## Core Responsibilities

Apply the selected tasks one at a time, validating after each, and stopping on the first failure.

## Workflow Steps

### Step 1: Checkpoint

Before each task, create a restore point:

```bash
cd "{playwright_project_root}" && git stash push -u -m "agent-qa-refactor-task-{n}"
git stash pop
```

This records a recoverable state and immediately restores the tree, so the stash entry exists as a
fallback while work continues.

### Step 2: Apply One Task

Modify only the files the task names. Do not opportunistically improve a neighbouring file — that
breaks the traceability between findings and changes, and widens the revert.

### Step 3: Validate

Run, in order, stopping at the first failure:

1. Type check — the profile's `typecheck_command`, typically `npx tsc --noEmit`. If it records
   "none observed", skip this step and say so in the report rather than inventing a command
2. Lint — the profile's `lint_command`, skipped the same way when not recorded
3. Targeted tests — the tests covering the changed files, per the task's validation command

```bash
cd "{playwright_project_root}" && npx tsc --noEmit
```

### Step 4: Stop on Failure

If any validation step fails:

1. Report the exact failure output
2. Offer to revert this task:

```bash
cd "{playwright_project_root}" && git checkout -- {files_in_task}
```

3. STOP the phase. Do not continue to the next task, and do not attempt a second fix on top of a
   failed change. The engineer decides what happens next.

Never skip a failing validation. Never continue past an error because the remaining tasks look
independent.

### Step 5: Record and Continue

On success, record the task, its files, and the validation output. Continue to the next selected
task from Step 1.

### Step 6: Phase Completion

After the last selected task, run the profile's full type check and the tests covering every file
touched in this phase. Report the result.

## Data Storage

- `executed`: per task — files, validation output, outcome
- `stopped_at`: the task that halted the phase, if any

## Constraints

- One task at a time, validated before the next
- Never modify `playwright.config.ts`
- Never modify a file outside the current task's list
- Never continue after a failed validation
- Never commit — that is Phase 4 and the engineer's choice
