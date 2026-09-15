# Phase 4: Upload and Report

## Core Responsibilities

- Perform the real upload, only now that Phase 3 recorded engineer approval
- Read and surface `{selected_folder}/xray/upload-report.md`
- Update the output index and run any configured post-generation hooks

## Precondition

`engineer_approved` from Phase 3 is `true`. If this phase is somehow reached without it, stop and
return to Phase 3 — do not execute.

## Workflow Steps

### Step 1: Execute the Upload

Follow `@agent-qa/framework/xray/operations/upload-tests.md`, Step 3. Invoke:

```bash
python3 scripts/xray/upload.py --folder {selected_folder} --execute
```

This is the only invocation in this command that writes to Jira. It writes
`{selected_folder}/xray/upload-report.md` whatever its outcome — a partial failure still writes
the report, because everything that succeeded is worth recording.

### Step 2: Read the Upload Report

Read `{selected_folder}/xray/upload-report.md` and interpret it using
`@agent-qa/framework/xray/formats/upload-report.md`. Treat its front-matter `created`, `updated`,
and `failed` counts as authoritative — do not recompute them by counting bullets.

### Step 3: Surface Notices Verbatim

If the report has a "Read this" section, show it to the engineer verbatim, before the counts.
These notices describe things that succeeded but did less than expected (for example, a
Server/DC update that changed fields but not steps, or a re-imported Gherkin feature file) — they
are not failures and must never be folded into the failure count, but they must never be dropped
either.

### Step 4: Report Results

Present to the engineer:

```
Xray upload complete.

Platform: {platform}   Project: {project}

Created ({N}):
  - PROJ-101
  - PROJ-102

Updated ({N}):
  - PROJ-150

Failed ({N}):
  - TC-PROJ-123-004: Xray bulk test import returned HTTP 400
```

Name every failure with its Jira/test identifier and its exact reason from the report — never
collapse failures into a bare count.

### Step 5: State Resumability If Anything Failed

If `failed` is greater than zero, tell the engineer explicitly, following
`@agent-qa/framework/xray/operations/match-existing.md`: it is safe to re-run this command
unmodified. Matching is label-based per test case — whatever already succeeded will be found by
its label and updated, not duplicated, and whatever failed will be retried as a new attempt. Do
not suggest the folder needs manual cleanup first.

### Step 6: Generate Output Index

Follow the instructions in `@agent-qa/commands/common/generate-output-index.md` to update the
`README.md` index in `{selected_folder}`.

### Step 7: Execute Post-Generation Hooks

Follow the instructions in `@agent-qa/commands/common/execute-post-hooks.md` to run any
`hooks.post_generate` commands configured in `agent-qa/config.yml`.

### Step 8: Refuse Credentials Offered in Chat

As in every earlier phase: refuse any Xray or Jira credential offered in chat and point the
engineer at `agent-qa/.xray-credentials`.

## Constraints

- Do NOT invoke `--execute` unless Phase 3 recorded `engineer_approved: true`
- Do NOT write to `{selected_folder}/xray/upload-report.md` directly — only
  `scripts/xray/upload.py --execute` writes it
- Do NOT collapse a failure into a bare number; name the test case (or feature file) and its
  reason
- Do NOT accept, store, or repeat any credential value the user offers in chat
