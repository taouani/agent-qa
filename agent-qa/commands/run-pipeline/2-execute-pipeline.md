# Phase 2: Execute Pipeline

## Core Responsibilities

Execute each command in the pipeline sequentially, passing context between commands.

## Workflow

### Step 1: Execute Commands in Order

For each command in `pipeline_commands`:

1. **Announce**: Display which command is starting and its position in the pipeline
   ```
   [2/6] Running: generate-test-charter
   ```

2. **Execute**: Follow the command's phase files in sequence:
   - Read the command entry point: `agent-qa/commands/{command-name}/{command-name}.md`
   - Execute each phase as instructed in the command file
   - For commands after the first: auto-select the output folder from `output_folder` (skip the folder selection prompt)

3. **Track result**: Record whether the command succeeded or failed
   ```
   pipeline_results:
     - command: "analyze-requirements"
       status: "success"
       output_folder: "agent-qa/2025-01-16-PROJ-123"
       files_generated: 3
     - command: "generate-test-charter"
       status: "success"
       files_generated: 1
   ```

4. **Set output folder**: After the first command, capture the output folder path for subsequent commands

### Step 2: Handle Failures

If a command fails:

1. **Log the failure**: Record the error and which command failed
2. **Check if blocking**:
   - If the failed command is a prerequisite for subsequent commands, skip those dependent commands
   - If the failed command is not a prerequisite (e.g., `generate-test-charter` fails but `generate-test-cases` doesn't depend on it), continue with the next command
3. **Report**: Note the failure and skipped commands in the pipeline results

### Step 3: Auto-Select Output Folder

For all commands after the first:
- Use the `output_folder` from the first command's output
- Skip the "Find and Select Output Folder" phase (Phase 1 of each generate command)
- Proceed directly to Phase 2 of each generate command

## Data Storage

Update `pipeline_results` after each command execution.

## Constraints

- Execute commands strictly in the resolved order from Phase 1
- Do NOT run commands in parallel — each command must complete before the next starts
- If the first command fails, stop the entire pipeline
- For subsequent failures, apply the dependency-aware skip logic
- Announce each command clearly so the user can follow progress
