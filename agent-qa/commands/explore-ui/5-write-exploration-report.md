# Phase 5: Write Exploration Report

## Core Responsibilities

Write the exploration report and stop for engineer approval.

## Workflow Steps

### Step 1: Write the Report

Write `{selected_folder}/ui-snapshots/exploration.md`:

    ---
    type: ui-exploration
    generated: YYYY-MM-DD
    test_cases_explored: {n}
    steps_verified: {v}
    steps_unverifiable: {u}
    base_url: {base_url}
    ---

Body sections, in this order and with these exact table headers, because
`generate-playwright-tests` parses them:

    ## Locators

    | Test Case | Step | Element | Locator | Rank | Source Snapshot |

    ## Waits

    | Page | Condition | Observed On |

    ## Messages

    | Text | State | Source Snapshot |

    ## Deviations

    One entry per observed behaviour the test case did not describe, with the snapshot.

    ## Unverifiable Steps

    One entry per step that could not be reproduced, with the reason.

    ## Recovery Notes

    Any step that needed a forced click or manual intervention, with the method that worked.

### Step 2: Generate Output Index

Follow `@agent-qa/commands/common/generate-output-index.md`.

### Step 3: Execute Post-Generation Hooks

Follow `@agent-qa/commands/common/execute-post-hooks.md`.

### Step 4: Stop for Approval

Report:

    Exploration report written to {path}.
    {v} steps verified, {u} unverifiable.
    Review it — especially Deviations and Unverifiable Steps — then run
    /agent-qa:generate-playwright-tests to generate specs using these locators.

Do not generate test code here. That is a separate command with its own gate.

## Data Storage

- `exploration_report_path`

## Constraints

- Write ONLY under `{selected_folder}/ui-snapshots/`
- Never omit the Unverifiable Steps section, even when empty — its absence would imply full coverage
- Never generate test code in this command
