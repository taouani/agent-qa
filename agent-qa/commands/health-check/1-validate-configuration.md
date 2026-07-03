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

### Step 3: Check core directory structure

Verify the following directories exist under `agent-qa/`:

1. `agent-qa/commands/` — Command definitions
2. `agent-qa/rules/` — QA rules
3. `agent-qa/agents/` — Subagent definitions
4. `agent-qa/framework/` — Git repository framework
5. `agent-qa/formats/` — Output format templates

For each directory:
- **PASS** if exists and contains files
- **FAIL** if missing
- **WARN** if exists but empty

### Step 4: Check IDE integration

Based on `installed_ides` in config.yml, verify the corresponding IDE directories exist:

- **claude**: Check `.claude/commands/agent-qa/`, `.claude/rules/`, `.claude/agents/agent-qa/`, `.claude/hooks.json`
- **cursor**: Check `.cursor/rules/`
- **vscode**: Check `.vscode/settings.json`, `.vscode/extensions.json`
- **copilot**: Check `.github/copilot-instructions.md`

For each configured IDE:
- **PASS** if all expected files exist
- **WARN** if some files missing

### Step 5: Display configuration summary

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
```

## Data Storage

Store the validation results in memory for Phase 2 to reference.

## Constraints

- Do NOT modify any files during health check
- Report ALL issues found, don't stop at the first failure
- Use clear PASS/FAIL/WARN labels for each check
