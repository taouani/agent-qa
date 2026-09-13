# Phase 2: Reproduce

## Core Responsibilities

Reproduce the failure under clean conditions and gather evidence.

## Workflow Steps

### Step 1: Run Under Clean Conditions

```bash
cd "{playwright_project_root}" && {run_command} "{spec_path}" -g "{test_title}" \
  --retries=0 --workers=1 --reporter=list
```

Retries disabled and a single worker so the failure is not masked and not polluted by parallelism.

### Step 2: Capture the Full Error

Record the complete error, the failing line, and the stack. Never work from a truncated message.

### Step 3: Determine Reproducibility

Run it three times.

| Outcome | Meaning |
|---------|---------|
| Fails every time | Deterministic. Continue to Phase 3 |
| Fails sometimes | A race. Note the pass and fail counts; continue, and treat timing as the prime suspect |
| Passes every time | Not reproducible here. STOP and report the environment difference rather than changing code |

### Step 4: Gather Supporting Evidence

Collect what exists — trace, screenshot, or video paths from the run, and any
`{selected_folder}/ui-snapshots/` entry for the pages involved. Snapshots are the authoritative
source for a correct locator. Reference paths; do not paste large artefacts into the report.

## Data Storage

- `reproduction`: per target — deterministic, intermittent with counts, or not reproducible
- `error_text`, `failing_line`, `evidence_paths`

## Constraints

- Do NOT modify any file in this phase
- Do NOT run with retries enabled
- Do NOT proceed on a failure you could not reproduce
