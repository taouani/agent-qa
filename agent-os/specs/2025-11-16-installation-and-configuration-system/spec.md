# Specification: Installation and Configuration System

## Goal

Create installation scripts (bash and PowerShell) and configuration management system that enables QA analysts and managers to easily install and configure agent-qa with their preferred repository platform (GitLab, GitHub, or Azure DevOps), following agent-os installation patterns for consistency and familiarity.

## User Stories

- As a QA Analyst, I want to run a simple installation script that prompts me to select my repository platform (GitLab/GitHub/Azure DevOps) so that agent-qa is automatically configured to work with my team's git repository without manual configuration
- As a QA Manager, I want agent-qa commands to follow the same structure as agent-os commands so that my team can easily understand and use the agent with familiar patterns
- As a Release Manager, I want installation scripts to handle both configuration and file installation so that I can quickly set up agent-qa across multiple projects with consistent settings

## Specific Requirements

**Installation Scripts (Bash and PowerShell)**
- Create `scripts/install.sh` (bash) for Unix/Linux/macOS installation following agent-os patterns
- Create `scripts/install.ps1` (PowerShell) for Windows installation with equivalent functionality
- Scripts should prompt user for repository platform selection (GitLab, GitHub, or Azure DevOps)
- Scripts should prompt for repository project ID (required for all platforms)
- Scripts should prompt for Azure DevOps cloud ID (only if Azure DevOps is selected)
- Scripts should create/update `agent-qa/config.yml` with user selections
- Scripts should install agent-qa command files, workflows, and standards into the project
- Scripts should NOT validate MCP server availability (handled by IDE/Cursor)

**Common Functions Scripts**
- Create `scripts/common-functions.sh` with shared utilities (YAML parsing, colored output, file operations) similar to agent-os
- Create `scripts/common-functions.ps1` with equivalent PowerShell utilities for cross-platform support
- Common functions should handle YAML reading/writing, colored terminal output, directory creation, and file copying operations
- Functions should follow agent-os naming conventions and patterns for consistency

**Configuration File Structure**
- Create `agent-qa/config.yml` following the same structure and format as agent-os `config.yml`
- Configuration file should store `repository_platform` setting (gitlab, github, or azure-devops)
- Configuration file should store `repository_project_id` for the selected platform
- Configuration file should store `azure_devops_cloud_id` (only if Azure DevOps is selected, optional otherwise)
- Configuration file should include version number and installation metadata similar to agent-os format

**Agent Command Structure Alignment**
- Restructure existing agent-qa commands to follow agent-os patterns with `multi-agent/` and `single-agent/` folder structure
- Main command files should use `{{PHASE X: @agent-qa/commands/...}}` syntax to reference phase files instead of current text-based references
- Phase files should be numbered (e.g., `1-initialize.md`, `2-process.md`) and placed in `single-agent/` folder within each command directory
- Commands that currently have phase files directly in command folders need to be moved to `single-agent/` subfolder
- Main command files should be placed in both `multi-agent/` and `single-agent/` folders following agent-os structure

**Installation Flow**
- Installation should check if agent-qa is already installed and handle updates appropriately
- Installation should create necessary directory structure (`agent-qa/commands/`, `agent-qa/workflows/`, `agent-qa/standards/`)
- Installation should copy command files, workflow files, and standards from source to project directories
- Installation should provide clear success messages and next steps guidance to users
- Installation should handle errors gracefully with informative error messages

**Repository Platform Selection**
- Prompt user with clear options: "Select repository platform: [1] GitLab [2] GitHub [3] Azure DevOps"
- Validate user input and re-prompt if invalid selection is provided
- Store selected platform in configuration file using lowercase values (gitlab, github, azure-devops)
- Platform selection should be required and cannot be skipped during installation

**Repository Configuration Prompts**
- Prompt for repository project ID after platform selection (required for all platforms)
- Prompt for Azure DevOps cloud ID only when Azure DevOps is selected (required for Azure DevOps)
- Validate project ID format based on selected platform (if applicable)
- Store configuration values in `agent-qa/config.yml` with appropriate keys

## Visual Design

No visual assets provided.

## Existing Code to Leverage

**agent-os Installation Scripts**
- Reference `agent-os/scripts/base-install.sh` and `agent-os/scripts/project-install.sh` for installation script patterns, user prompts, and file installation logic
- Reuse installation flow patterns including directory creation, file copying, and configuration file generation
- Follow agent-os error handling and user feedback patterns (colored output, success messages, error messages)

**agent-os Common Functions**
- Reference `agent-os/scripts/common-functions.sh` for YAML parsing functions (`get_yaml_value`, `get_yaml_array`), colored output functions (`print_status`, `print_success`, `print_error`), and file operation utilities
- Adapt common functions for agent-qa needs while maintaining consistency with agent-os patterns
- Create PowerShell equivalents following similar function naming and behavior patterns

**agent-os Configuration File Structure**
- Reference `agent-os/config.yml` for configuration file format, key naming conventions, and comment structure
- Follow agent-os pattern of including version number, configuration comments, and clear section headers
- Use similar YAML structure with consistent indentation and formatting

**agent-os Command Structure**
- Reference `agent-os/profiles/default/commands/` structure showing `multi-agent/` and `single-agent/` folder organization
- Study how agent-os main command files use `{{PHASE X: @agent-os/commands/...}}` syntax to reference phase files
- Understand agent-os phase file naming convention (numbered files in `single-agent/` folder) for restructuring agent-qa commands

**Git Repository Framework Configuration Patterns**
- Reference `agent-qa/framework/git-repository/config/read-platform-config.md` for how repository platform configuration is currently read
- Understand existing patterns for platform detection and configuration access that installation scripts will populate

## Out of Scope

- MCP server configuration or validation (MCP servers are configured and managed by IDE/Cursor, not installation scripts)
- MCP server availability checks during installation (handled by IDE/Cursor, not agent-qa installation)
- Installation of agent-os itself (agent-qa is a separate agent, though it follows agent-os patterns)
- Uninstallation scripts or removal functionality (focus on installation only)
- Configuration migration or upgrade scripts for existing installations (handled separately if needed)
- Interactive MCP server setup or authentication (handled by IDE/Cursor configuration)
- Platform-specific installation optimizations beyond basic bash/PowerShell scripts
- Installation verification or health checks beyond basic file existence checks
- Multi-user or system-wide installation support (focus on per-project installation)
- Installation rollback or backup functionality (handled by version control)

