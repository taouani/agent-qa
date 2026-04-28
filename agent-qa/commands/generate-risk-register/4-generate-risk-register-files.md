# PHASE 4: Generate Risk Register Files

Generate risk register markdown files in the appropriate output folder.

## Core Responsibilities

1. **Determine Output Structure**: Determine if one register per requirement or one per release
2. **Create File Naming Logic**: Generate appropriate filenames
3. **Format Files**: Format risks in priority order (highest risk score first)
4. **Write Files**: Write files to risk-register folder
5. **Create Summary Index**: Create index file with links

## Workflow

Same pattern as other commands:
- Generate markdown files with risks in priority order
- Create index file
- Write to `risk-register/` folder

### Step 1: Generate Output Index

Follow the instructions in `@agent-qa/commands/common/generate-output-index.md` to generate or update the `README.md` index file in the output folder.

### Step 2: Execute Post-Generation Hooks

Follow the instructions in `@agent-qa/commands/common/execute-post-hooks.md` to run any configured post-generation hooks.

## Important Constraints

- Format risks in priority order (highest first)
- Include all risk fields
- Link risks to requirements
- Follow markdown standards

