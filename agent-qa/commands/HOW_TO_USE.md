# How to Use Agent-QA Commands

Agent-QA commands are markdown files that can be used in different ways depending on your IDE and setup.

## Command Location

All Agent-QA commands are located in `agent-qa/commands/` directory:
- `agent-qa/commands/analyze-requirements/analyze-requirements.md`
- `agent-qa/commands/generate-test-cases/generate-test-cases.md`
- etc.

## Using Commands in Different IDEs

### Claude Code / Cursor IDE

If you're using **Claude Code** or **Cursor IDE**, commands are automatically recognized when placed in `.claude/commands/agent-qa/` directory.

**Setup:**
1. Commands are automatically installed to `.claude/commands/agent-qa/` during project installation
2. Type `/analyze-requirements` in the chat to use the command
3. The IDE will automatically reference the command file

**Manual Setup (if needed):**
```bash
mkdir -p .claude/commands/agent-qa
cp agent-qa/commands/*/*.md .claude/commands/agent-qa/
# Rename files to match command names (e.g., analyze-requirements/analyze-requirements.md -> analyze-requirements.md)
```

### Visual Studio Code with GitHub Copilot

If you're using **VS Code with GitHub Copilot**, you can use commands by:

**Option 1: Direct File Reference**
- Open the command file: `agent-qa/commands/analyze-requirements/analyze-requirements.md`
- Copy the content or reference it in your chat with Copilot
- Ask Copilot to execute the instructions in the file

**Option 2: Use as Documentation**
- Reference the command files as documentation
- Ask Copilot to help you execute the workflow described in the command file

**Example:**
```
@agent-qa/commands/analyze-requirements/analyze-requirements.md
Please help me analyze requirements for Jira ticket PROJ-123 following the instructions in this file.
```

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

## Direct Usage

You can also use commands directly by:

1. **Reading the main command file** and following its instructions
2. **Executing phases sequentially** as documented
3. **Using the command as a workflow guide** for manual execution

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
   # Copy each command's main file
   cp agent-qa/commands/analyze-requirements/analyze-requirements.md .claude/commands/agent-qa/analyze-requirements.md
   cp agent-qa/commands/generate-test-cases/generate-test-cases.md .claude/commands/agent-qa/generate-test-cases.md
   # ... repeat for other commands
   ```

### Using in VS Code / Other IDEs

Commands work in any IDE by:
- Reading the markdown files directly
- Following the phase-by-phase instructions
- Using the command files as workflow documentation

The `.claude/commands/` directory is **optional** and only needed for Claude Code/Cursor IDE command recognition.

