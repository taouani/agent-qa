# Xray Upload Report Format

Standardized format for `{output_folder}/xray/upload-report.md`, written by
`scripts/xray/upload.py`'s `write_report()`. This file describes exactly what that function
emits — if the two ever disagree, `write_report()` is right and this file is wrong; fix this
file, not a claim about the code.

## Purpose

This document defines the shape of the Xray upload report so that commands, `validate-outputs`,
and engineers reading it by hand share one description of its fields and sections.

## When It Is Written

**Only on an executed run (`--execute`).** A dry run never writes this file — it only prints its
plan to the console (see `agent-qa/framework/xray/operations/upload-tests.md`). It is written
whatever the executed run's outcome: a run where some tests failed still has every success worth
recording, and the failures are the reason the file gets opened.

## Path

`{output_folder}/xray/upload-report.md` — a new `xray/` subfolder inside the Agent-QA output
folder that was uploaded, created if it does not already exist.

## Front Matter

```yaml
---
type: xray-upload-report
generated: 2026-09-14
platform: cloud
project: PROJ
account: john***
created: 12
updated: 3
failed: 1
---
```

### Field Definitions

| Field | Type | Always present | Meaning |
|---|---|---|---|
| `type` | string | yes | Always the literal `xray-upload-report` |
| `generated` | string (ISO date) | yes | The date the run completed, `YYYY-MM-DD` |
| `platform` | string | yes | `cloud` or `server`; empty string if platform was not passed |
| `project` | string | yes | The Xray/Jira project key the tests were uploaded to |
| `account` | string | only when an account identifier exists | A **redacted** prefix of the acting account — see below. Omitted entirely when there is no account identifier (a Server/DC personal access token names no account) |
| `created` | integer | yes | Count of tests created |
| `updated` | integer | yes | Count of tests updated |
| `failed` | integer | yes | Count of tests that failed |

### The `account` Field Is Redacted, Never a Secret

`account` never carries a credential. It is built from `client_id` (Cloud) or `jira_email`
(Cloud, if configured) — never from `client_secret`, `personal_access_token`, or
`jira_api_token` — and even that value is truncated: the first four characters plus `***`, or
just `***` if the value is four characters or fewer. Server/DC's personal access token names no
account at all, so the field is left out of the front matter entirely rather than printed empty.
No secret value reaches this report under any field name.

## Body

Sections appear in this fixed order. Every section is always present except "Read this", which
appears only when there are notices.

### 1. Title

```markdown
# Xray upload report
```

### 2. "Read this" (only when there are notices)

Printed **before** the counts, because a caveat about work that succeeded is exactly the kind of
thing that gets missed at the bottom of a report:

```markdown
## Read this

> Xray Server/DC: 3 existing test(s) were updated IN FIELDS ONLY (summary and labels). Their
> STEPS were NOT modified. ...

> Gherkin: 2 feature file(s) were re-imported in full. Agent-QA sends every .feature file on
> every run and relies on Xray's own scenario matching to update the existing Cucumber tests
> rather than duplicate them; that matching is not documented by the vendor. ...
```

Each notice is one blockquote paragraph. Notices describe things that **succeeded** but did less
than a reader might assume — they never indicate failure and never change `failed`'s count. The
two notices this file currently emits are described in
`agent-qa/framework/xray/operations/upload-tests.md`, Step 6.

### 3. Created

```markdown
## Created (12)

- PROJ-101
- PROJ-102
```

One Jira issue key per line, as a bullet list. If nothing was created:

```markdown
## Created (0)

_None._
```

### 4. Updated

Same shape as Created, heading `## Updated (N)`.

### 5. Failed

```markdown
## Failed (1)

| Test case | Reason |
|-----------|--------|
| TC-PROJ-123-004 | Xray bulk test import returned HTTP 400 |
```

A Markdown table with columns `Test case` and `Reason`. `Test case` is the TC-ID (or, for a
Gherkin feature file failure, the `.feature` file's basename); a literal `|` inside a reason is
escaped as `\|` so it cannot break the table. If nothing failed:

```markdown
## Failed (0)

_None._
```

## Full Example

```markdown
---
type: xray-upload-report
generated: 2026-09-14
platform: server
project: PROJ
created: 2
updated: 1
failed: 1
---

# Xray upload report

## Read this

> Xray Server/DC: 1 existing test(s) were updated IN FIELDS ONLY (summary and labels). Their
> STEPS were NOT modified. Xray Server/DC's pinned v1.0 step API documents creation only, so
> re-sending steps would append a duplicate set on every run, and the v2.0 delete-and-recreate
> alternative can leave a test with no steps at all if it fails partway. If you changed the
> steps of a test case that was updated above, apply that change by hand in Jira.

## Created (2)

- PROJ-201
- PROJ-202

## Updated (1)

- PROJ-150

## Failed (1)

| Test case | Reason |
|-----------|--------|
| TC-PROJ-123-009 | created in Jira as PROJ-203, but writing step 2 of 4 returned HTTP 500 -- the test exists with incomplete steps and needs fixing in Jira |
```

## Usage Example

```markdown
## Step 4: Read the Upload Report

After an executed run, read {output_folder}/xray/upload-report.md using
`agent-qa/framework/xray/formats/upload-report.md` to interpret its fields. Surface the "Read
this" section to the engineer verbatim if present — it is not optional context.
```

## Important Notes

- This is the only report `scripts/xray/upload.py` writes; there is no separate machine-readable
  (JSON) sibling.
- `validate-outputs` and any command reading this report back should treat `created`, `updated`,
  and `failed` in the front matter as the authoritative counts — do not recompute them by
  counting bullets, since the "Failed" table's rows are the same data in a different shape.
- Never write to this file directly from a command phase. It is produced only by
  `scripts/xray/upload.py --execute`.
