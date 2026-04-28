# Execute Post-Generation Hooks

Run configured post-generation hooks after deliverable files have been written.

## Core Responsibility

Execute custom shell commands defined in `agent-qa/config.yml` under `hooks.post_generate` after deliverable generation completes successfully.

## Workflow

### Step 1: Read Hook Configuration

Read `agent-qa/config.yml` and check the `hooks.post_generate` array.

- If `hooks` is not defined, skip silently
- If `hooks.post_generate` is empty or not configured, skip silently
- If hooks exist, proceed to execution

### Step 2: Validate Execution Conditions

Do NOT execute hooks if:
- The parent command itself failed (no deliverables were generated)
- The `hooks.post_generate` array is empty or missing

### Step 3: Execute Hooks Sequentially

For each hook command in the `hooks.post_generate` array, in order:

1. **Replace variables** in the command string:
   - `{output_folder}` — Replace with the actual output folder path (e.g., `agent-qa/2025-01-16-PROJ-123/test-cases/`)
   - `{command_name}` — Replace with the current command name (e.g., `generate-test-cases`, `generate-gherkin`)
   - `{context}` — Replace with the Jira issue key (e.g., `PROJ-123`) or `release` for multi-ticket analysis

2. **Execute the command** using Bash from the project root directory

3. **Log the result**:
   - On success: Log the hook command and its output
   - On failure: Log the hook command, error message, and exit code

4. **Continue to the next hook** regardless of success or failure

### Step 4: Report Hook Execution Summary

After all hooks have been executed, report:

```
Post-generation hooks: X/Y succeeded
```

- If all hooks succeeded, no additional detail is needed
- If any hook failed, list the failed hooks with their error messages

## Constraints

- **Never fail the overall command if a hook fails** — log the error and continue with the next hook
- Hooks run **sequentially** in the order defined in the configuration
- Hooks run in the **project root directory** (not the output folder)
- Do **NOT** execute hooks if the parent command itself failed to generate deliverables
- Do **NOT** modify hook commands beyond variable replacement
- Variable names are case-sensitive and use curly braces: `{output_folder}`, `{command_name}`, `{context}`
