# Phase 4: Write Audit Report

## Core Responsibilities

Write the architecture review and stop for engineer review.

## Workflow Steps

### Step 1: Write the Report

Write `{selected_folder}/reviews/architecture-review.md`:

    ---
    type: architecture-review
    generated: YYYY-MM-DD
    project_root: {playwright_project_root}
    files_sampled: {n} of {population}
    findings: {critical}/{high}/{medium}/{low}
    ---

Body sections, in order:

1. `## Scope` — what was inventoried, what was sampled, and the sampling limits
2. `## Summary` — the three findings that matter most, in plain sentences
3. `## Findings` — one subsection per finding, headed `### AF-NNN — {title}`, each carrying
   severity, impact, risk, effort, `depends_on`, evidence with file and line, and what good
   would look like. No code changes here
4. `## Ranking` — the ordered list with the ordering rule stated
5. `## Not Assessed` — what the sample did not cover

### Step 2: Generate Output Index

Follow `@agent-qa/commands/common/generate-output-index.md`.

### Step 3: Execute Post-Generation Hooks

Follow `@agent-qa/commands/common/execute-post-hooks.md`.

### Step 4: Stop for Review

Report:

    Architecture review written to {path}.
    Read it and decide which findings to act on, then run /agent-qa:refactor-framework.

Do not offer to start fixing. Planning is a separate command with its own gate.

## Data Storage

- `report_path`

## Constraints

- Write ONLY under `{selected_folder}/reviews/`
- Never modify the host repository
- Never generate a refactor plan here
