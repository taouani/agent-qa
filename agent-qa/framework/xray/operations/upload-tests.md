# Upload Tests to Xray

The neutral operation for uploading an Agent-QA output folder's test cases into Jira as Xray
tests. Unlike the git-repository framework's operations, there is no per-platform file to route
to here: `scripts/xray/upload.py` reads `xray_platform` from `agent-qa/config.yml` itself and
dispatches between Cloud and Server/DC internally. A command phase always invokes the same
script, on either flavour.

## Purpose

This instruction file provides a standardized way to run an Xray upload. Commands should invoke
`scripts/xray/upload.py` exactly as described here rather than constructing Xray API calls
directly — the script is the only client, and `agent-qa/framework/xray/api-contract.md` is the
only source of record for the endpoints it calls.

## Core Responsibilities

1. **Run Preflight**: Complete `agent-qa/framework/xray/config/validate-xray.md` first
2. **Default to Dry Run**: Never pass `--execute` without explicit engineer approval
3. **Invoke the CLI**: One invocation per output folder
4. **Explain the Outcome**: Dry run vs. executed, Gherkin vs. Manual, resumability on failure

## Precondition

`agent-qa/framework/xray/config/validate-xray.md` has completed with status `configured`. If it
reported `skipped` or `stopped`, this operation does not run.

## Workflow

### Step 1: Dry Run First — Always

Invoke the CLI without `--execute`:

```bash
python3 scripts/xray/upload.py --folder {selected_folder}
```

`{selected_folder}` is the Agent-QA output folder (`agent-qa/YYYY-MM-DD-{context}/`) selected by
the command's earlier phase — it must contain `test-cases/` and, optionally, `gherkin/`.

**Dry run is the default and writes nothing.** Without `--execute`, the CLI reaches Jira only to
search for existing tests by label (see
`agent-qa/framework/xray/operations/match-existing.md`) — it never creates, updates, or imports
anything. The command prints a plan: how many tests will be created, how many updated, and how
many of the creates are Cucumber vs. Manual. Show this plan to the engineer.

### Step 2: Get Explicit Approval

Do not add `--execute` on your own initiative. Present the dry-run plan and wait for the engineer
to approve the write before proceeding to Step 3. This mirrors the write-gate pattern used
elsewhere in this repository for anything that reaches outside `agent-qa/`.

### Step 3: Execute, Only After Approval

```bash
python3 scripts/xray/upload.py --folder {selected_folder} --execute
```

This is the only invocation that writes to Jira. It reports what was created, updated, and
failed, and writes `{selected_folder}/xray/upload-report.md` (see
`agent-qa/framework/xray/formats/upload-report.md`). The dry-run invocation in Step 1 never
writes that report file — only `--execute` does.

### Step 4: Explain Classification

Within one output folder, each test case is uploaded through one of two paths, decided
automatically:

- **Gherkin wins.** A test case whose TC-ID appears inside a `.feature` file under
  `gherkin/` is uploaded as a Cucumber test, through Xray's feature-import endpoint.
- **Manual covers the rest.** Every other test case is uploaded as a Manual test, through Xray's
  bulk test-import (Cloud) or Jira's own bulk issue-create plus per-step calls (Server/DC — see
  `agent-qa/framework/xray/api-contract.md`, "3. Bulk test import").

A test case is never uploaded through both paths.

### Step 5: Explain Resumability on Partial Failure

A run that reports some failures is safe to re-run unmodified. Matching is label-based per test
case (`agent-qa/framework/xray/operations/match-existing.md`): whatever already succeeded is
found by its label on the next run and updated, not duplicated; whatever failed is retried as a
new attempt. Tell the engineer this explicitly rather than implying the folder needs to be
"cleaned up" before retrying.

### Step 6: Surface Notices, Not Just Pass/Fail

The CLI's output and report can carry `NOTE` lines for things that **succeeded** but did less
than a reader might assume. Two are expected:

- **Server/DC field-only update.** Updating an existing test on Server/DC updates its Jira
  fields (summary, labels) but does **not** update its steps. Xray Server/DC's pinned step API
  documents creation only; re-sending steps on update would append a duplicate set on every run,
  and the alternative (delete-then-recreate) can leave a test with no steps at all if it fails
  partway. If the engineer changed a test case's steps and it was reported as updated, the step
  change must be applied by hand in Jira. State this plainly — it is a real, permanent limitation
  of this flavour, not a bug to work around.
- **Gherkin re-import.** Every `.feature` file is sent in full on every run; Xray's own scenario
  matching — not the TC-ID label — is what is relied on to update existing Cucumber tests rather
  than create second copies, and the vendor does not document that matching
  (`agent-qa/framework/xray/api-contract.md`, `## Unverified` item 7). If duplicated Cucumber
  tests turn up in the project after a re-run, this is why.

Never fold a notice into a failure count, and never drop it from what you show the engineer —
both survive into `upload-report.md`'s "Read this" section for the same reason.

## Command Reference

| Flag | Default | Meaning |
|---|---|---|
| `--folder` | required | Agent-QA output folder to read `test-cases/` and `gherkin/` from |
| `--execute` | off (dry run) | Perform the upload. Without it, nothing is sent to Jira |
| `--config` | `agent-qa/config.yml` | Path to config, if not the default |
| `--credentials` | `agent-qa/.xray-credentials` | Path to the credentials file, if not the default |

## Exit Codes

- **`0`** — dry run printed successfully; or Xray is not configured (`xray_platform` empty, see
  `agent-qa/framework/xray/config/validate-xray.md`); or an executed run completed with no
  failures.
- **`1`** — configuration or credentials error (for example, `xray_project_key` unset, or the
  credentials file missing, unreadable, or tracked by git); or an executed run with one or more
  failed test cases. Whatever succeeded before a failure is not rolled back.

There is no other exit code.

## Usage Example

```markdown
## Step 3: Upload to Xray

Follow the instructions in: `agent-qa/framework/xray/operations/upload-tests.md`

Parameters:
- selected_folder: [the output folder chosen in phase 1]

Run the dry-run invocation first and present its plan. Only add --execute once the engineer
approves.
```

## Error Handling

Errors are printed to stderr with an explanation naming the misconfiguration; no credential
value ever appears in an error message, a report, or this output. See
`agent-qa/framework/xray/config/validate-xray.md` for the preflight checks that catch most
failures before this operation runs at all.

## Important Notes

- Commands should **never** construct an Xray or Jira HTTP request directly. `scripts/xray/
  upload.py` is the only client; the endpoints it calls are pinned in
  `agent-qa/framework/xray/api-contract.md`.
- Platform dispatch (Cloud vs. Server/DC) happens inside the script, driven by `xray_platform`.
  A command phase does not need to know which flavour is configured to invoke this operation.
- `--execute` is the only path that writes to Jira, and the only path that writes
  `xray/upload-report.md`. A dry run never writes either.
