# Phase 5: Verify and Report

## Core Responsibilities

Prove the fix holds, then report what happened.

## Workflow Steps

### Step 1: Re-run the Target

```bash
cd "{playwright_project_root}" && {run_command} "{spec_path}" -g "{test_title}" \
  --retries=0 --workers=1
```

If it still fails, the classification was wrong. Revert the change with
`git checkout -- {spec_path}`, return to Phase 3 with the new evidence, and say so in the report.
Do not stack a second fix on top of a failed one.

### Step 2: Confirm Stability

Re-run `automation.stability_runs` times, all passing, before calling the fix stable. Anything less
is reported as "passes intermittently", never as fixed.

### Step 3: Check for Collateral Damage

Run the other tests in the same spec file, and any test the profile records as sharing the fixture
or page object that changed. A fix that breaks a neighbour is not a fix.

### Step 4: Write the Report

Write `{selected_folder}/debug/report.md`:

    ---
    type: debug-report
    generated: YYYY-MM-DD
    targets: {n}
    fixed: {f}
    defects_found: {d}
    ---

Body: one section per target with the original error, the classification and its evidence, the fix
applied as a diff or the reason none was, the stability result, and the collateral check.

Real defects go in their own `## Defects Found` section at the top, because that is the part a
reader must not miss.

### Step 5: Generate Output Index

Follow `@agent-qa/commands/common/generate-output-index.md`.

### Step 6: Execute Post-Generation Hooks

Follow `@agent-qa/commands/common/execute-post-hooks.md`.

## Data Storage

- `verification`: per target — stable, intermittent, or still failing
- `report_path`

## Constraints

- Never report a test as fixed without the configured consecutive passes
- Never leave a failed fix applied — revert it
- Never commit
