# Phase 1: Validate Configuration

## Core Responsibilities

Validate that Agent-QA is properly configured in the current project.

## Workflow

### Step 1: Check config.yml exists

1. Look for `agent-qa/config.yml` in the project root
2. If NOT found:
   - Report: "**FAIL** — `agent-qa/config.yml` not found. Run the project install script first."
   - Stop the health check

### Step 2: Validate config.yml contents

Read `agent-qa/config.yml` and validate each field:

1. **version** — Must be present and non-empty
2. **repository_platform** — Must be one of: `gitlab`, `github`, `azure-devops`
3. **repository_project_id** — Must be non-empty
4. **azure_devops_cloud_id** — Must be non-empty if `repository_platform` is `azure-devops`

For each field, report:
- **PASS** if valid
- **FAIL** if missing or invalid
- **WARN** if empty but optional

### Step 3: Validate live automation configuration

These fields are optional. Skip the whole step with **SKIP — live automation not configured**
when `playwright_project_root` is empty AND `agent-qa/framework-profile.md` does not exist.

1. **playwright_project_root** — if non-empty, the directory must exist and contain
   `playwright.config.ts` or `playwright.config.js`. **FAIL** otherwise.
2. **browser_cli_command** — must be non-empty. Default is `playwright-cli`.
3. **automation.allow_source_edits** — must be `true` or `false`. Report which, because `true`
   means commands may modify source outside `agent-qa/`.
4. **automation.auth_state_ttl_minutes** and **automation.stability_runs** — must be positive
   integers.
5. **agent-qa/framework-profile.md** — if present, report its `generated` date and `reviewed`
   flag. **WARN** when `reviewed: false`, because commands will refuse to proceed.
6. **Auth state hygiene** — if the profile records an `auth_state_path`, check that its
   directory is matched by `.gitignore`. **WARN** if not: browser auth state must never be
   committed. Check the path only; never read the file.

### Step 4: Check core directory structure

Verify the following directories exist under `agent-qa/`:

1. `agent-qa/commands/` — Command definitions
2. `agent-qa/rules/` — QA rules
3. `agent-qa/roles/` — Specialist craft definitions
4. `agent-qa/framework/` — Git repository framework
5. `agent-qa/formats/` — Output format templates

For each directory:
- **PASS** if exists and contains files
- **FAIL** if missing
- **WARN** if exists but empty

### Step 5: Check IDE integration

Based on `installed_ides` in config.yml, verify the corresponding IDE directories exist:

- **claude**: Check `.claude/commands/agent-qa/`, `.claude/rules/`, `.claude/agents/agent-qa/`, `.claude/hooks.json`
- **cursor**: Check `.cursor/rules/`
- **vscode**: Check `.vscode/settings.json`, `.vscode/extensions.json`
- **copilot**: Check `.github/copilot-instructions.md`

For each configured IDE:
- **PASS** if all expected files exist
- **WARN** if some files missing

### Step 6: Validate Xray configuration (read-only probe)

This step never writes to Jira. It never invokes `scripts/xray/upload.py` at all, with or without
`--execute`, and it makes no network or MCP call of any kind — it is local inspection of
`agent-qa/config.yml` and the metadata (not the contents) of `agent-qa/.xray-credentials`. Because
this step issues no call to Jira or Xray, there is no instruction path from health-check into
`import_tests`, `import_feature`, or the Jira issue-update endpoint — those only exist behind
`upload.py --execute`, which this step never runs.

**SKIP the whole step** — report **SKIP — Xray not configured** — when `xray_platform` is empty in
`agent-qa/config.yml`. Xray is opt-in; a project that hasn't configured it is healthy, not broken.
Do not run any of the checks below, and do not report a FAIL or WARN for any of them.

Otherwise, reuse `agent-qa/framework/xray/config/validate-xray.md` for what SKIP/STOP mean and for
the credentials-file contract — do not restate its reasoning here, only its outcome as a health
check line:

1. **`xray_platform`** — must be `cloud` or `server`. **FAIL** otherwise.
2. **`xray_project_key`** — must be non-empty. **FAIL** otherwise.
3. **`xray_base_url`** — used by both flavours: on Server/DC it is the only Jira host there is; on
   Cloud it is the customer's own Jira site, because JQL search runs against Jira Cloud, not the
   Xray API host (see `agent-qa/framework/xray/api-contract.md`). **FAIL** if empty and
   `xray_platform` is `server` (`validate-xray.md` STOPs here too). **WARN** if empty and
   `xray_platform` is `cloud` — upload will fail at the search step without it, but this preflight
   does not hard-block it.
4. **`agent-qa/.xray-credentials` exists** — **FAIL** if not found. Do not create it, do not
   prompt for values, and do not accept them if offered: if an engineer pastes a token, secret, or
   password into chat, refuse and point them at `agent-qa/.xray-credentials` — see
   `agent-qa/framework/xray/config/validate-xray.md`. Agent-QA never types, accepts, or stores
   these credentials.
5. **Permissions are not world-readable** — read the file's mode, e.g.
   `stat -f %A agent-qa/.xray-credentials 2>/dev/null || stat -c %a agent-qa/.xray-credentials`.
   **FAIL** if the "other" permission digit grants read access (any of `4`, `5`, `6`, `7`).
6. **The path is gitignored** — run `git check-ignore agent-qa/.xray-credentials`. **FAIL** if it
   is not ignored.
7. **Git does not track it** — run `git ls-files --error-unmatch agent-qa/.xray-credentials`. If
   this exits `0`, the file IS tracked: **FAIL**, never WARN. This is exactly the condition
   `scripts/xray/upload.py`'s `read_credentials()` refuses to read — report it as "credentials
   file is tracked by git — this is a security incident, not a config warning" and stop describing
   this file further.

**Never**, at any point in this step, print, echo, log, or report a value read from
`agent-qa/.xray-credentials` — not the whole file, not one line, not a masked or truncated
fragment. Report only presence/absence, tracked/not-tracked, and the permission digit itself
(e.g. "640") — never a key or secret value. If checks 1–3 fail, still run checks 4–7 and report
everything found; do not stop at the first failure.

### Step 7: Display configuration summary

Display a summary table:

```
Configuration Summary
=====================
Version:             {version}
Platform:            {repository_platform}
Project ID:          {repository_project_id}
Installed IDEs:      {installed_ides}
Output Formats:      confluence={true/false}, gherkin={true/false}, playwright={true/false}
Default Language:    {default_language or "auto-detect"}
Xray:                {not configured | configured (cloud|server)}
```

## Data Storage

Store the validation results in memory for Phase 2 to reference.

## Constraints

- Do NOT modify any files during health check
- Report ALL issues found, don't stop at the first failure
- Use clear PASS/FAIL/WARN labels for each check
