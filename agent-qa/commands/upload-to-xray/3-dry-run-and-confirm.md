# Phase 3: Dry Run and Confirm

## Core Responsibilities

- Run the Xray upload as a dry run — the only way this phase is allowed to invoke the CLI
- Present the dry run's output to the engineer verbatim
- STOP and wait for explicit approval before any later phase is allowed to write to Jira

## Workflow Steps

### Step 1: Run the Dry Run

Follow `@agent-qa/framework/xray/operations/upload-tests.md`, Step 1. Invoke:

```bash
python3 scripts/xray/upload.py --folder {selected_folder}
```

Do not add `--execute` in this phase, under any circumstance. This invocation is always a dry
run: it reaches Jira only to search for existing tests by label
(`@agent-qa/framework/xray/operations/match-existing.md`) and writes nothing — no test is
created, no test is updated, no `upload-report.md` is written.

### Step 2: Present the Plan Verbatim

Show the engineer exactly what the CLI printed — the counts of tests that would be created, the
counts that would be updated, and the split between Cucumber and Manual. Do not summarize it away
or paraphrase over it; this is the engineer's only look at the plan before anything is written.

State plainly, in your own words as well as the CLI's:

```
This was a dry run. Nothing has been written to Jira.

Proceeding to an actual upload requires re-running scripts/xray/upload.py with --execute, and
that only happens after you approve it here.
```

### Step 3: Stop and Wait for Approval

STOP here. Do not proceed to Phase 4 until the engineer explicitly approves performing the real
upload. A response that only acknowledges the plan ("looks fine", "ok") without approving the
write is not approval — ask directly: "Proceed with the real upload using --execute? (yes/no)"

This dry run is not optional and may never be skipped, regardless of how confident the engineer
is or how small the folder is. There is no flag, setting, or engineer request that authorizes
going straight to Phase 4 without first showing this dry run's output and receiving approval on
it.

If the engineer declines, stop the command here. Nothing has been written; there is nothing to
undo.

### Step 4: Refuse Credentials Offered in Chat

As in every earlier phase: refuse any Xray or Jira credential offered in chat and point the
engineer at `agent-qa/.xray-credentials`. This applies here too, including if the engineer offers
one "to speed up the execute run."

## Data Storage

Store for Phase 4:
- `dry_run_output`: the CLI's dry-run output, for reference
- `engineer_approved`: `true` only once the engineer has explicitly approved the real upload

## Constraints

- Do NOT pass `--execute` in this phase under any circumstance
- Do NOT proceed to Phase 4 without explicit engineer approval recorded in `engineer_approved`
- Do NOT offer to skip the dry run, regardless of how the engineer phrases the request
- Do NOT accept, store, or repeat any credential value the user offers in chat
