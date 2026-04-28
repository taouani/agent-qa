# How to Use Agent-QA Commands

Agent-QA commands are markdown files that can be used in different ways depending on your IDE and setup.

## Command Location

All Agent-QA commands are located in `agent-qa/commands/` directory:
- `agent-qa/commands/analyze-requirements/analyze-requirements.md`
- `agent-qa/commands/generate-test-cases/generate-test-cases.md`
- `agent-qa/commands/generate-gherkin/generate-gherkin.md`
- `agent-qa/commands/generate-playwright-tests/generate-playwright-tests.md`
- `agent-qa/commands/publish-to-confluence/publish-to-confluence.md`
- etc.

## Using Commands in Different IDEs

### Claude Code

If you're using **Claude Code**, commands are automatically recognized as slash commands.

**What Gets Installed:**
- `.claude/commands/agent-qa/` — Slash command entry points
- `.claude/rules/` — QA conventions, MCP usage, output standards, language handling
- `.claude/agents/agent-qa/` — Specialized subagents (requirements analyst, test case generator, etc.)
- `.claude/hooks.json` — Pre/post command hooks (config validation, output logging)

**Usage:**
```
/analyze-requirements PROJ-123
/generate-test-cases
/generate-gherkin
/generate-playwright-tests
/publish-to-confluence
```

**Manual Setup (if needed):**
```bash
mkdir -p .claude/commands/agent-qa
cp agent-qa/commands/*/*.md .claude/commands/agent-qa/
```

### Cursor IDE

If you're using **Cursor IDE**, commands are recognized as slash commands.

**What Gets Installed:**
- `.claude/commands/agent-qa/` — Slash command entry points (shared with Claude Code)
- `.cursor/rules/` — QA conventions and usage guide adapted for Cursor

**Usage:**
```
/analyze-requirements PROJ-123
/generate-test-cases
```

### Visual Studio Code with GitHub Copilot

If you're using **VS Code with GitHub Copilot**, instructions are loaded from `.github/copilot-instructions.md`.

**What Gets Installed:**
- `.github/copilot-instructions.md` — Agent-QA purpose, commands, MCP requirements

**Option 1: Direct File Reference**
```
@agent-qa/commands/analyze-requirements/analyze-requirements.md
Please help me analyze requirements for Jira ticket PROJ-123 following the instructions in this file.
```

**Option 2: Use as Documentation**
- Reference the command files as documentation
- Ask Copilot to help you execute the workflow described in the command file

### Other IDEs / AI Assistants

For other IDEs or AI assistants:

1. **Read the command file** directly:
   ```bash
   cat agent-qa/commands/analyze-requirements/analyze-requirements.md
   ```

2. **Reference the file** in your AI assistant:
   - Provide the file path: `agent-qa/commands/analyze-requirements/analyze-requirements.md`
   - Ask the assistant to follow the instructions in the file

3. **Use the command structure**:
   - Each command file contains phase-by-phase instructions
   - Follow the phases sequentially as documented

## Available Commands

### Core Workflow

| Command | Description |
|---------|-------------|
| `analyze-requirements` | Analyze Jira issues, generate requirement docs |
| `generate-test-cases` | Generate test cases from requirements |
| `generate-test-strategy` | Generate test strategy document |
| `generate-test-charter` | Generate exploratory test charter |
| `generate-test-plan` | Generate comprehensive test plan |
| `generate-risk-register` | Generate risk register |
| `analyze-commits` | Analyze git commits, correlate with tickets |
| `generate-release-notes` | Generate technical release notes |

### New Commands

| Command | Description |
|---------|-------------|
| `generate-gherkin` | Generate Gherkin .feature files from test cases |
| `generate-playwright-tests` | Generate Playwright .spec.ts from test cases |
| `publish-to-confluence` | Convert and publish deliverables to Confluence |

## Command Structure

Each command follows this structure:

```
agent-qa/commands/{command-name}/
  {command-name}.md          # Main command file
  1-phase-name.md            # Phase 1 instructions
  2-phase-name.md            # Phase 2 instructions
  ...
```

The main command file (`{command-name}.md`) references phase files using:
```
{{PHASE X: @agent-qa/commands/{command-name}/{phase-file}.md}}
```

## Command Dependency Chain

```
analyze-requirements ──┬── generate-test-cases ──┬── generate-gherkin
                       │                         └── generate-playwright-tests
                       ├── generate-test-charter
                       ├── generate-test-strategy
                       ├── generate-test-plan
                       ├── generate-risk-register
                       └── publish-to-confluence (any deliverable)

analyze-commits ─── generate-release-notes ─── publish-to-confluence
```

## Troubleshooting

### Commands not recognized in Claude Code/Cursor

1. **Check if `.claude/commands/agent-qa/` exists:**
   ```bash
   ls -la .claude/commands/agent-qa/
   ```

2. **Re-run project installation:**
   ```bash
   ~/agent-qa/scripts/project-install.sh
   ```

3. **Manually copy command files:**
   ```bash
   mkdir -p .claude/commands/agent-qa
   cp agent-qa/commands/analyze-requirements/analyze-requirements.md .claude/commands/agent-qa/analyze-requirements.md
   cp agent-qa/commands/generate-test-cases/generate-test-cases.md .claude/commands/agent-qa/generate-test-cases.md
   # ... repeat for other commands
   ```

### Rules not loading in Claude Code

1. **Check if `.claude/rules/` exists:**
   ```bash
   ls -la .claude/rules/
   ```

2. **Re-run project installation** to copy rules files.

### Using in VS Code / Other IDEs

Commands work in any IDE by:
- Reading the markdown files directly
- Following the phase-by-phase instructions
- Using the command files as workflow documentation

The `.claude/commands/` and `.claude/rules/` directories are optional and IDE-specific.
