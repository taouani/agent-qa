# Installation and Configuration Guide

This guide will walk you through installing and configuring Agent-QA for your project.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Base Installation](#base-installation)
3. [Project Installation](#project-installation)
4. [Configuration](#configuration)
5. [Updating Agent-QA](#updating-agent-qa)
6. [Troubleshooting](#troubleshooting)

## Prerequisites

Before installing Agent-QA, ensure you have:

### Required

- **Bash** (macOS/Linux, or Git Bash on Windows) or **PowerShell 5.1+** (Windows)
- **curl** command-line tool (bash installers) or **PowerShell** with network access (Windows installers)
- **tar** (optional on Windows; used by `base-install.sh` for fast archive extraction in Git Bash)
- **Access to your IDE** with MCP server support
- **MCP Servers configured**:
  - Atlassian MCP server (for Jira and Confluence)
  - Git repository MCP server (GitLab, GitHub, or Azure DevOps)

### MCP Server Setup

Agent-QA requires MCP servers to be configured in your IDE. The installation scripts do **not** configure MCP servers - they only configure Agent-QA to use them.

**Important**: Ensure your MCP servers are working before proceeding with Agent-QA installation.

## Base Installation

The base installation downloads Agent-QA to your home directory (`~/agent-qa`). This is a one-time setup.

### Option 1: Install from GitHub (When repository is available)

**Note**: This requires the repository to be available on GitHub. If you get a 404 error, the repository is not yet on GitHub - use Option 2 instead.

#### macOS/Linux / Git Bash (Windows)

```bash
curl -sSL https://raw.githubusercontent.com/taouani/agent-qa/master/scripts/base-install.sh | bash
```

#### Windows (PowerShell) — Recommended

```powershell
irm https://raw.githubusercontent.com/taouani/agent-qa/master/scripts/base-install.ps1 | iex
```

Or run locally after download:

```powershell
& "$env:USERPROFILE\agent-qa\scripts\base-install.ps1"
```

**Note**: On Windows, prefer `base-install.ps1` in PowerShell. Use `base-install.sh` in Git Bash or WSL if you prefer bash scripts.

### Option 2: Install from Local Repository (Use this if GitHub installation fails)

If you get a 404 error or the repository is not yet on GitHub, install from your local repository:

1. **Navigate to the agent-qa repository directory**:
   ```bash
   cd /path/to/agent-qa
   ```

2. **Run the local installation script**:
   ```bash
   ./scripts/install-from-local.sh
   ```

This will copy Agent-QA files from your local repository to `~/agent-qa`.

**Note**: Make sure you have the agent-qa repository cloned or available locally before running this script.

### What Happens During Base Installation

1. **Downloads Agent-QA** from GitHub to `~/agent-qa` (or `%USERPROFILE%\agent-qa` on Windows)
2. **Uses a single repository archive** for fast installation (instead of downloading each file individually)
3. **Creates directory structure**:
   ```
   ~/agent-qa/
     agent-qa/
       commands/        # Command files
       workflows/       # Workflow definitions
       standards/       # Quality standards
       framework/       # Framework utilities
       config.yml.template
     scripts/           # Installation scripts (base-install, project-install, etc.)
   ```

3. **Handles existing installations**:
   - If `~/agent-qa` already exists, you'll be prompted to:
     - **Full update**: Updates all files, preserves config
     - **Delete & reinstall**: Fresh installation with backup

### Verification

After base installation, verify it worked:

**macOS/Linux / Git Bash:**
```bash
ls ~/agent-qa/agent-qa/commands
```

**Windows (PowerShell):**
```powershell
Get-ChildItem "$env:USERPROFILE\agent-qa\agent-qa\commands"
```

You should see command directories like `analyze-requirements`, `generate-test-cases`, etc.

**Note**: The `.claude/commands/agent-qa/` directory is optional and only needed for Claude Code/Cursor IDE command recognition. Other IDEs can use commands directly from `agent-qa/commands/`.

## Project Installation

Project installation sets up Agent-QA in your specific project directory. Run this in each project where you want to use Agent-QA.

### Step 1: Navigate to Your Project

```bash
cd /path/to/your/project
```

### Step 2: Run Project Installation

**macOS/Linux / Git Bash** (full IDE selection support):

```bash
~/agent-qa/scripts/project-install.sh
```

**Windows (PowerShell):**

```powershell
cd C:\path\to\your\project
& "$env:USERPROFILE\agent-qa\scripts\project-install.ps1"
```

Optional IDE selection (default installs all IDEs):

```powershell
& "$env:USERPROFILE\agent-qa\scripts\project-install.ps1" -Ide claude,cursor
```

### Step 3: Follow the Prompts

The installation script will prompt you for:

#### 1. Repository Platform Selection

```
Please select your Git repository platform:
  1) GitLab
  2) GitHub
  3) Azure DevOps

Enter your choice (1-3):
```

**Choose the platform** that matches your git repository.

#### 2. Repository Project ID

```
Please enter your repository project ID (e.g., 'my-group/my-project' for GitLab, 'owner/repo' for GitHub, 'MyProject/MyRepo' for Azure DevOps):
Repository Project ID: 
```

**Format depends on platform**:
- **GitLab**: Numeric project ID (e.g., `12345`) or full path (e.g., `my-group/my-project`)
- **GitHub**: Repository owner/name (e.g., `octocat/Spoon-Knife`)
- **Azure DevOps**: Project name/ID and repository ID/name (e.g., `MyProject/MyRepo`)

#### 3. Azure DevOps Cloud ID (if applicable)

If you selected Azure DevOps, you'll be prompted:

```
Please enter your Azure DevOps Cloud ID (organization/account name, e.g., 'myorganization'):
Azure DevOps Cloud ID: 
```

This is your Azure DevOps organization name (the part after `dev.azure.com/`).

### What Happens During Project Installation

1. **Creates project structure**:
   ```
   your-project/
     agent-qa/
       commands/        # Command files (copied from base)
       workflows/       # Workflow files
       standards/       # Standards files
       framework/       # Framework files
       formats/         # Output format templates (Confluence, Gherkin, Playwright)
       config.yml       # Your project configuration
       config.yml.template
     .claude/
       commands/
         agent-qa/      # IDE command entry points (Claude Code/Cursor)
       rules/           # QA rules (Claude Code)
       agents/
         agent-qa/      # Subagent definitions (Claude Code)
       hooks.json       # Pre/post command hooks (Claude Code)
     .cursor/
       rules/           # QA rules (Cursor IDE)
     .github/
       copilot-instructions.md  # GitHub Copilot instructions
   ```

2. **Creates/updates `agent-qa/config.yml`** with your selections

3. **Copies command files** from base installation to your project

4. **Optionally installs `.claude/commands/agent-qa/`** files (only if available, for Claude Code/Cursor IDE)

### Non-Interactive Installation

You can provide configuration via command-line flags:

```bash
~/agent-qa/scripts/project-install.sh \
  --repository-platform gitlab \
  --repository-project-id "my-group/my-project"
```

For Azure DevOps:

```bash
~/agent-qa/scripts/project-install.sh \
  --repository-platform azure-devops \
  --repository-project-id "MyProject/MyRepo" \
  --azure-devops-cloud-id "myorganization"
```

### Verification

After project installation, verify:

```bash
cat agent-qa/config.yml
```

You should see your configuration:

```yaml
version: 1.0.0
last_installed: 2025-01-16 10:30:00

repository_platform: gitlab
repository_project_id: "my-group/my-project"
```

## Configuration

### Configuration File Location

Configuration is stored in `agent-qa/config.yml` in your project directory.

### Configuration Options

#### `repository_platform`

**Required**: `gitlab`, `github`, or `azure-devops`

Determines which MCP server tools Agent-QA will use for git repository operations.

#### `repository_project_id`

**Required**: String

The project identifier for your git repository. Format depends on platform:
- **GitLab**: `"12345"` or `"my-group/my-project"`
- **GitHub**: `"owner/repository"`
- **Azure DevOps**: `"ProjectName/RepositoryName"`

#### `azure_devops_cloud_id`

**Optional**: String (required only if `repository_platform` is `azure-devops`)

Your Azure DevOps organization/account name.

#### `output_formats`

**Optional**: Object with boolean flags

```yaml
output_formats:
  confluence: false   # Enable Confluence format generation
  gherkin: false      # Enable Gherkin feature file generation
```

#### `confluence_space_key`

**Optional**: String

The Confluence space key for publishing deliverables (e.g., `"QA"`, `"TESTING"`). Required only for direct Confluence publishing.

#### `confluence_parent_page_id`

**Optional**: String

The parent page ID under which to create Confluence pages. Required only for direct Confluence publishing.

#### `playwright_base_url`

**Optional**: String (default: `"http://localhost:3000"`)

The base URL used in generated Playwright test navigation methods.

### Manual Configuration

You can manually edit `agent-qa/config.yml`:

```yaml
version: 1.0.0
last_installed: 2025-01-16 10:30:00

repository_platform: gitlab
repository_project_id: "my-group/my-project"
azure_devops_cloud_id: ""  # Leave empty if not using Azure DevOps

output_formats:
  confluence: false
  gherkin: false

confluence_space_key: ""
confluence_parent_page_id: ""

playwright_base_url: "http://localhost:3000"
```

### Updating Configuration

To update configuration, you can:

1. **Re-run project installation** (it will update existing config)
2. **Manually edit** `agent-qa/config.yml`
3. **Use project-update script**:

```bash
~/agent-qa/scripts/project-update.sh \
  --repository-platform github \
  --repository-project-id "new-owner/new-repo"
```

## Updating Agent-QA

### Update Base Installation

To update the base installation, re-run the base install script. It detects existing installations and prompts for an update option.

**macOS/Linux / Git Bash:**
```bash
curl -sSL https://raw.githubusercontent.com/taouani/agent-qa/master/scripts/base-install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/taouani/agent-qa/master/scripts/base-install.ps1 | iex
```

### Update Project Installation

To update Agent-QA files in your project:

```bash
cd /path/to/your/project
~/agent-qa/scripts/project-update.sh
```

This will:
- Update command files from base installation
- Preserve your `config.yml` settings
- Show what files were updated

### Selective Updates

You can selectively update specific components:

```bash
# Update only commands
~/agent-qa/scripts/project-update.sh --overwrite-commands

# Update commands and workflows
~/agent-qa/scripts/project-update.sh --overwrite-commands --overwrite-workflows

# Update everything
~/agent-qa/scripts/project-update.sh --overwrite-all
```

### Re-installation

To completely reinstall Agent-QA in a project:

```bash
~/agent-qa/scripts/project-install.sh --re-install
```

**Warning**: This will delete your existing `agent-qa/` folder and reinstall from scratch. Your generated outputs will be preserved (they're outside the `agent-qa/` folder).

## Troubleshooting

### Base Installation Issues

#### "404: Not Found" or "bash: line 1: 404:: command not found" Error

**This means the repository is not yet available on GitHub.**

**Solution**: Use Option 2 (Install from Local Repository):

```bash
cd /path/to/agent-qa
./scripts/install-from-local.sh
```

#### "Repository structure not found"

If using local installation and you get this error:

1. **Verify you're in the repository root**: The script should be run from the agent-qa repository directory
2. **Check directory structure**: Ensure `agent-qa/` and `scripts/` directories exist
3. **Use absolute path**: Try using the full path to the script:
   ```bash
   /full/path/to/agent-qa/scripts/install-from-local.sh
   ```

#### "curl: command not found"

**Solution**: Install curl:
- macOS: `brew install curl`
- Linux: `sudo apt-get install curl` (Debian/Ubuntu) or `sudo yum install curl` (RHEL/CentOS)

#### "Permission denied"

**Solution**: Make scripts executable:
```bash
chmod +x ~/agent-qa/scripts/*.sh
```

#### "No files were downloaded" (Git Bash on Windows)

**Cause**: Usually a JSON parsing or Python stub issue when falling back to per-file downloads.

**Solution**:
1. Prefer PowerShell: `irm https://raw.githubusercontent.com/taouani/agent-qa/master/scripts/base-install.ps1 | iex`
2. Or install real Python/`jq` in Git Bash so archive fallback is not needed
3. Or use local installation: `./scripts/install-from-local.sh`

#### "Failed to download common-functions.sh"

**Solution**: Check your internet connection and GitHub access. The script downloads files from GitHub. If the repository is not on GitHub, use local installation instead.

#### PowerShell: "Print-Section is not recognized" or script parse errors

**Cause**: Outdated `common-functions.ps1` or `base-install.ps1` from an earlier install.

**Solution**: Re-run the latest base installation from GitHub to refresh scripts in `%USERPROFILE%\agent-qa\scripts\`.

### Project Installation Issues

#### "Agent QA base installation not found"

**Solution**: Run base installation first:

**macOS/Linux / Git Bash:**
```bash
curl -sSL https://raw.githubusercontent.com/taouani/agent-qa/master/scripts/base-install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/taouani/agent-qa/master/scripts/base-install.ps1 | iex
```

#### "MCP server not available"

**Solution**: Agent-QA doesn't validate MCP servers during installation. If you get MCP errors when running commands:
1. Verify MCP servers are configured in your IDE
2. Test MCP server connectivity manually
3. Check MCP server logs for errors

#### "Invalid repository project ID"

**Solution**: Verify the format matches your platform:
- GitLab: Check project ID in project settings or use full path
- GitHub: Format is `owner/repository-name`
- Azure DevOps: Format is `ProjectName/RepositoryName`

### Configuration Issues

#### "Configuration file not found"

**Solution**: Run project installation:

```bash
~/agent-qa/scripts/project-install.sh
```

Or on Windows (PowerShell):

```powershell
& "$env:USERPROFILE\agent-qa\scripts\project-install.ps1"
```

#### "Invalid repository platform"

**Solution**: Valid values are: `gitlab`, `github`, `azure-devops` (lowercase)

### Command Execution Issues

#### "Command not found"

**Solution**: Ensure Agent-QA is installed in your project:
```bash
ls agent-qa/commands
```

If missing, run project installation.

#### "MCP tool not available"

**Solution**: 
1. Verify MCP servers are running in your IDE
2. Check that the correct MCP server is configured for the operation
3. Test MCP connectivity manually

## Next Steps

After installation:

1. **Verify MCP Servers** - Ensure Atlassian and Git repository MCP servers are working
2. **Test Configuration** - Run a simple command to verify setup:
   ```
   /analyze-requirements PROJ-123
   ```
3. **Read User Guide** - See [USER_GUIDE.md](USER_GUIDE.md) for detailed usage instructions

## Support

For additional help:
- Check the [User Guide](USER_GUIDE.md)
- Review [Commands Reference](agent-qa/commands/README.md)
- Open an issue on GitHub

---

**Installation complete?** Head to the [User Guide](USER_GUIDE.md) to start using Agent-QA!

