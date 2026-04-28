# PHASE 4: Generate Test Plan Files

Generate test plan markdown files in the appropriate output folder.

## Core Responsibilities

1. **Determine Output Structure**: Determine if one plan per requirement or one per release
2. **Create File Naming Logic**: Generate appropriate filenames
3. **Format Files**: Format plan content as markdown
4. **Write Files**: Write files to test-plan folder
5. **Create Summary Index**: Create index file with links

## Workflow

Same pattern as other commands:
- Generate markdown files
- Create index file
- Write to `test-plan/` folder

### Step 1: Generate Output Index

Follow the instructions in `@agent-qa/commands/common/generate-output-index.md` to generate or update the `README.md` index file in the output folder.

### Step 2: Execute Post-Generation Hooks

Follow the instructions in `@agent-qa/commands/common/execute-post-hooks.md` to run any configured post-generation hooks.

## Important Constraints

- Follow markdown standards
- Include all plan fields
- Link to generated deliverables

