# Validate Xray Configuration

Preflight every phase runs first, before any Xray operation. Confirms Xray is configured, its
credentials file exists and is safe to read, and STOPs or SKIPs rather than letting a later step
fail on a missing or unsafe input.

## Purpose

This instruction file provides a standardized way to validate that Xray upload is usable before
a phase attempts it. Commands should use this framework file instead of checking `config.yml` or
`agent-qa/.xray-credentials` directly.

## Core Responsibilities

1. **Read Platform Configuration**: Read `xray_platform` from `agent-qa/config.yml`
2. **Skip if Not Configured**: Report SKIP, not an error, when Xray is simply unused
3. **Validate Required Keys**: Confirm `xray_project_key`, and `xray_base_url` on Server/DC
4. **Validate the Credentials File**: Confirm it exists and is not tracked by git
5. **Never Print Credential Contents**: The file's contents never appear in output, a report, or a log

## Workflow

### Step 1: Read Platform Configuration

Read `xray_platform` from `agent-qa/config.yml`:

- Valid values: `cloud`, `server`
- **If empty or missing**: this is not an error. Report:

  ```
  SKIP — Xray not configured

  xray_platform is empty in agent-qa/config.yml. Set it to "cloud" or "server" to enable
  Xray upload.
  ```

  Stop here. Do not proceed to Step 2. This mirrors `scripts/xray/upload.py`'s own behavior:
  the CLI prints the same condition and exits 0, because an unconfigured Xray integration is a
  normal, unused state, not a failure.

### Step 2: Validate Required Keys

With a platform value in hand:

1. **`xray_project_key`** — required on both flavours. If empty, STOP:

   ```
   ❌ Xray upload is not configured: xray_project_key is empty in agent-qa/config.yml
   ```

2. **`xray_base_url`** — required only when `xray_platform` is `server`. Server/DC has no fixed
   host; it is the customer's own Jira installation. If `xray_platform` is `server` and
   `xray_base_url` is empty, STOP:

   ```
   ❌ Xray upload is not configured: xray_base_url is required when xray_platform is "server"
   ```

   Cloud does not require `xray_base_url` for Xray's own endpoints (see
   `agent-qa/framework/xray/api-contract.md`, "Flavour differences at a glance") but does need a
   Jira site URL for label search. Where that value comes from is outside this preflight's scope;
   record only that the platform value is `cloud` or `server`.

### Step 3: Validate the Credentials File

1. **Confirm the file exists** at `agent-qa/.xray-credentials`. If it does not, STOP:

   ```
   ❌ agent-qa/.xray-credentials not found

   Xray upload reads credentials only from this file. Agent-QA never asks for, accepts, or
   stores Xray/Jira credentials in chat or in agent-qa/config.yml — create the file by hand.
   See INSTALLATION.md for the keys each flavour needs.
   ```

2. **Confirm git does not track it.** Run:

   ```bash
   git ls-files --error-unmatch agent-qa/.xray-credentials
   ```

   **If this command succeeds (exit 0), the file is tracked.** STOP immediately, before reading
   the file at all:

   ```
   ❌ agent-qa/.xray-credentials is tracked by git

   A tracked credentials file must never be read or used. Remove it from version control
   (untrack it and add it to .gitignore) before retrying. A credential must never be committed.
   ```

   This is the same guard `scripts/xray/upload.py`'s `read_credentials()` enforces at the code
   level — this preflight exists so a phase catches it before invoking the script, with the same
   consequence either way: refuse, do not read.

### Step 4: Never Print Credential Contents

Whatever the outcome of Steps 1–3, this preflight reports only *whether* the file exists, is
tracked, and (implicitly, via the CLI) is readable. It never opens the file to display its
contents, never echoes a line from it, and never repeats a value the user pastes in chat. If a
user offers Xray or Jira credentials directly in conversation, refuse and point them at
`agent-qa/.xray-credentials` instead — Agent-QA does not type, accept, or store credentials.

## Output

If successful:
- **Status**: `configured`
- **Platform**: `cloud` | `server`
- **Project Key**: value of `xray_project_key`

If skipped:
- **Status**: `skipped`
- **Reason**: `xray_platform not set`

If stopped:
- **Status**: `stopped`
- **Reason**: one of the STOP messages above

## Usage Example

```markdown
## Step 1: Validate Xray Configuration

Follow the instructions in: `agent-qa/framework/xray/config/validate-xray.md`

SKIP the remainder of this command if Xray is not configured. STOP if the credentials file is
missing or tracked by git.
```

## Important Notes

- SKIP (not configured) and STOP (misconfigured or unsafe) are different outcomes — do not
  collapse them into one message. SKIP means "this command has nothing to do here"; STOP means
  "this command cannot proceed safely."
- This preflight never reads `agent-qa/.xray-credentials`'s contents itself; it checks existence
  and git tracking only. Reading and parsing the file is `scripts/xray/upload.py`'s job.
- Credentials never belong in `agent-qa/config.yml`. If a value that looks like a secret appears
  there, treat it as a misconfiguration to flag, not something to relocate automatically.
