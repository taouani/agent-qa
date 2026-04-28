# PHASE 4: Generate Test Strategy Files

Generate test strategy markdown files in the appropriate output folder.

## Core Responsibilities

1. **Determine Output Structure**: Determine if one strategy per requirement or one per release
2. **Create File Naming Logic**: Generate appropriate filenames
3. **Format Files**: Format strategy content as markdown
4. **Write Files**: Write files to test-strategy folder
5. **Create Summary Index**: Create index file with links

## Workflow

### Step 1: Determine Output Structure

Based on input type:
- **Single Issue**: One strategy per requirement
- **Release/Filter**: One strategy for entire release OR one per requirement

### Step 2: Create File Naming Logic

Generate filenames:
- Single strategy: `test-strategy.md`
- Multiple strategies: `test-strategy-{KEY}.md`
- Index file: `test-strategy-index.md`

### Step 3: Format Strategy Files

Format strategy content as markdown with all sections (scope, test levels, test types, design techniques, automation, metrics).

### Step 4: Write Files

Write strategy files to:
- Output folder: `agent-qa/YYYY-MM-DD-{folder-name}/test-strategy/`

### Step 5: Create Summary Index

Create `test-strategy-index.md` with links to all strategies.

### Step 6: Generate Output Index

Follow the instructions in `@agent-qa/commands/common/generate-output-index.md` to generate or update the `README.md` index file in the output folder.

### Step 7: Execute Post-Generation Hooks

Follow the instructions in `@agent-qa/commands/common/execute-post-hooks.md` to run any configured post-generation hooks.

## Important Constraints

- Follow markdown standards
- Include all strategy fields
- Create proper markdown links

