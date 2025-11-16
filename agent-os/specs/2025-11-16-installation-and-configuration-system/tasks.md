# Task Breakdown: Installation and Configuration System

## Overview
Total Tasks: 5 task groups

## Task List

### Foundation Layer

#### Task Group 1: Create Common Functions Scripts
**Dependencies:** None

- [x] 1.0 Create common functions scripts for shared utilities
  - [x] 1.1 Create `scripts/common-functions.sh` with bash utilities
    - Implement YAML parsing functions (`get_yaml_value`, `get_yaml_array`) following agent-os patterns
    - Implement colored output functions (`print_status`, `print_success`, `print_error`, `print_warning`) matching agent-os style
    - Implement file operation utilities (`ensure_dir`, `copy_file`, `write_file`) with dry-run support
    - Add version and configuration reading helpers
    - Reference `agent-os/scripts/common-functions.sh` for patterns and naming conventions
  - [x] 1.2 Create `scripts/common-functions.ps1` with PowerShell utilities
    - Implement equivalent YAML parsing functions for PowerShell
    - Implement equivalent colored output functions for PowerShell
    - Implement equivalent file operation utilities for PowerShell
    - Ensure function naming and behavior matches bash version for consistency
    - Reference PowerShell best practices for cross-platform compatibility

**Acceptance Criteria:**
- Common functions scripts created in `scripts/` directory
- YAML parsing functions work correctly for reading/writing config files
- Colored output functions provide consistent user feedback
- File operation utilities support dry-run mode
- PowerShell functions match bash functionality

### Configuration Layer

#### Task Group 2: Create Configuration File Structure
**Dependencies:** Task Group 1

- [x] 2.0 Create configuration file structure and template
  - [x] 2.1 Design `agent-qa/config.yml` structure following agent-os format
    - Include version number field
    - Include installation metadata (last_installed timestamp)
    - Add repository platform configuration section with comments
    - Add repository project ID configuration section
    - Add Azure DevOps cloud ID configuration section (optional)
    - Reference `agent-os/config.yml` for format, comment style, and structure
  - [x] 2.2 Create configuration file template
    - Create template file with all required keys and example values
    - Include helpful comments explaining each configuration option
    - Use same YAML formatting and indentation as agent-os config.yml
  - [x] 2.3 Implement configuration file creation function
    - Add function to create config.yml from template in common-functions.sh
    - Add function to create config.yml from template in common-functions.ps1
    - Function should handle existing config.yml (update vs create)
    - Function should preserve user's existing settings when updating

**Acceptance Criteria:**
- Configuration file structure matches agent-os format and style
- Template includes all required configuration keys
- Configuration creation functions work in both bash and PowerShell
- Existing configurations are preserved during updates

### Installation Scripts Layer

#### Task Group 3: Create Bash Installation Script
**Dependencies:** Task Groups 1, 2

- [x] 3.0 Create bash installation script (`scripts/install.sh`)
  - [x] 3.1 Implement installation script structure
    - Add script header with shebang and description
    - Source common-functions.sh
    - Add command-line argument parsing (--help, --verbose, --dry-run)
    - Reference `agent-os/scripts/project-install.sh` for structure patterns
  - [x] 3.2 Implement repository platform selection prompt
    - Display clear options: "[1] GitLab [2] GitHub [3] Azure DevOps"
    - Validate user input and re-prompt if invalid
    - Store selection as lowercase value (gitlab, github, azure-devops)
    - Make platform selection required (cannot skip)
  - [x] 3.3 Implement repository configuration prompts
    - Prompt for repository project ID (required for all platforms)
    - Prompt for Azure DevOps cloud ID (only if Azure DevOps selected, required)
    - Validate input format if applicable (basic validation)
    - Store values for configuration file
  - [x] 3.4 Implement configuration file creation/update
    - Check if `agent-qa/config.yml` exists
    - Create new config.yml with user selections if not exists
    - Update existing config.yml preserving other settings if exists
    - Use common-functions.sh YAML writing utilities
  - [x] 3.5 Implement file installation logic
    - Create directory structure (`agent-qa/commands/`, `agent-qa/workflows/`, `agent-qa/standards/`)
    - Copy command files from source to `agent-qa/commands/`
    - Copy workflow files from source to `agent-qa/workflows/`
    - Copy standards files from source to `agent-qa/standards/`
    - Handle existing files appropriately (skip or overwrite based on flags)
  - [x] 3.6 Implement installation completion and user feedback
    - Display success message with installation summary
    - Show next steps guidance to user
    - Handle errors gracefully with informative error messages
    - Reference agent-os installation script patterns for user feedback

**Acceptance Criteria:**
- Installation script prompts for all required configuration
- Configuration file is created/updated correctly
- Command files, workflows, and standards are installed to project
- User receives clear feedback and next steps
- Script handles errors gracefully

#### Task Group 4: Create PowerShell Installation Script
**Dependencies:** Task Groups 1, 2

- [x] 4.0 Create PowerShell installation script (`scripts/install.ps1`)
  - [x] 4.1 Implement installation script structure
    - Add script header with description and requirements
    - Source common-functions.ps1
    - Add parameter definitions (Help, Verbose, DryRun)
    - Reference PowerShell best practices for script structure
  - [x] 4.2 Implement repository platform selection prompt
    - Display clear options matching bash script: "[1] GitLab [2] GitHub [3] Azure DevOps"
    - Validate user input and re-prompt if invalid
    - Store selection as lowercase value (gitlab, github, azure-devops)
    - Make platform selection required (cannot skip)
    - Ensure behavior matches bash script exactly
  - [x] 4.3 Implement repository configuration prompts
    - Prompt for repository project ID (required for all platforms)
    - Prompt for Azure DevOps cloud ID (only if Azure DevOps selected, required)
    - Validate input format if applicable (basic validation)
    - Store values for configuration file
    - Ensure behavior matches bash script exactly
  - [x] 4.4 Implement configuration file creation/update
    - Check if `agent-qa/config.yml` exists
    - Create new config.yml with user selections if not exists
    - Update existing config.yml preserving other settings if exists
    - Use common-functions.ps1 YAML writing utilities
    - Ensure behavior matches bash script exactly
  - [x] 4.5 Implement file installation logic
    - Create directory structure (`agent-qa/commands/`, `agent-qa/workflows/`, `agent-qa/standards/`)
    - Copy command files from source to `agent-qa/commands/`
    - Copy workflow files from source to `agent-qa/workflows/`
    - Copy standards files from source to `agent-qa/standards/`
    - Handle existing files appropriately (skip or overwrite based on flags)
    - Ensure behavior matches bash script exactly
  - [x] 4.6 Implement installation completion and user feedback
    - Display success message with installation summary
    - Show next steps guidance to user
    - Handle errors gracefully with informative error messages
    - Ensure user feedback matches bash script style

**Acceptance Criteria:**
- PowerShell installation script provides equivalent functionality to bash script
- All prompts and behaviors match bash script exactly
- Configuration file creation/update works correctly
- File installation works correctly
- User receives clear feedback matching bash script style

### Command Structure Alignment Layer

#### Task Group 5: Restructure Agent-QA Commands to Follow Agent-OS Patterns
**Dependencies:** None (can be done in parallel with installation scripts)

- [x] 5.0 Restructure existing agent-qa commands to follow agent-os patterns
  - [x] 5.1 Analyze current agent-qa command structure
    - List all existing commands in `agent-qa/commands/`
    - Document current structure (phase files directly in command folders)
    - Document current phase file reference syntax (text-based references)
  - [x] 5.2 Create new folder structure for each command
    - Create `multi-agent/` folder within each command directory
    - Create `single-agent/` folder within each command directory
    - Reference `agent-os/profiles/default/commands/` structure for organization
  - [x] 5.3 Move and reorganize phase files
    - Move numbered phase files (e.g., `1-initialize.md`, `2-process.md`) to `single-agent/` folder
    - Keep main command file in command root for reference
    - Ensure all phase files are properly numbered and named
  - [x] 5.4 Update main command files to use PHASE syntax
    - Update main command files to use `{{PHASE X: @agent-qa/commands/...}}` syntax
    - Replace current text-based phase references with PHASE tag syntax
    - Create main command files in both `multi-agent/` and `single-agent/` folders
    - Reference `agent-os/profiles/default/commands/plan-product/single-agent/plan-product.md` for syntax examples
  - [x] 5.5 Verify command structure alignment
    - Verify all commands follow agent-os folder structure
    - Verify all main command files use PHASE syntax correctly
    - Verify all phase files are in `single-agent/` folders
    - Test that commands can be referenced correctly using new structure

**Acceptance Criteria:**
- All agent-qa commands follow agent-os structure (multi-agent/single-agent folders)
- Main command files use `{{PHASE X: @agent-qa/commands/...}}` syntax
- Phase files are numbered and placed in `single-agent/` folders
- Command structure matches agent-os patterns exactly

## Execution Order

Recommended implementation sequence:
1. Foundation Layer (Task Group 1) - Common functions needed by all other scripts
2. Configuration Layer (Task Group 2) - Configuration structure needed by installation scripts
3. Installation Scripts Layer (Task Groups 3, 4) - Can be done in parallel or sequentially
4. Command Structure Alignment Layer (Task Group 5) - Can be done in parallel with installation scripts

**Note:** Task Groups 3, 4, and 5 can be worked on in parallel once Task Groups 1 and 2 are complete.

