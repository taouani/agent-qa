# Spec Requirements: Installation and Configuration System

## Initial Description
Roadmap Items #15, #16, and #17 (tied together):

**Item #15: Multi-Repository Support** — Implement user-selectable repository MCP integration (GitLab, GitHub, or Azure DevOps) with installation-time configuration prompt to choose the appropriate repository platform.

**Item #16: Installation and Configuration System** — Create installation scripts (bash and PowerShell) that prompt users for MCP server configuration, repository platform selection, and set up agent-qa with proper MCP server connections and authentication.

**Item #17: Agent Command Structure** — Implement agent-os compatible command structure for agent-qa workflows, including commands for requirements analysis, test generation, and deliverable creation following agent-os patterns.

## Requirements Discussion

### First Round Questions

**Q1:** Installation script structure: Should installation scripts be placed in root directory or `scripts/` subdirectory like agent-os?
**Answer:** In `scripts/` subdirectory like agent-os.

**Q2:** Configuration prompts: What information should we prompt for during installation?
**Answer:** Assumptions are correct, except for MCP servers - they are handled by IDE. Prompt for:
- Repository platform selection (GitLab/GitHub/Azure DevOps)
- Repository project ID (if applicable)
- Azure DevOps cloud ID (if Azure DevOps is selected)

**Q3:** Configuration file location: Should we create `agent-qa/config.yml` following same structure as agent-os's `config.yml`?
**Answer:** Yes, create `agent-qa/config.yml` and it should follow the same structure as agent-os's `config.yml`.

**Q4:** MCP server configuration: Should installation scripts only prompt for repository platform selection and project IDs, or also validate/configure MCP server connections?
**Answer:** Assumption is correct - only prompt for platform selection and project IDs. Do not validate or configure MCP servers (handled by IDE).

**Q5:** Installation flow: Should the flow include prompting for repository platform, repository-specific details, creating/updating config.yml, and validating MCP server availability?
**Answer:** Yes for all except MCP server availability check - please do not perform this check.

**Q6:** Agent command structure (Item #17): Should item #17 focus on ensuring commands follow agent-os patterns, or create additional command structure?
**Answer:** Yes, it is mostly complete, but it is not in line with what is done for agent-os. Need to check agent-os structure and align agent-qa commands accordingly. Agent-os uses:
- `multi-agent/` and `single-agent/` folder structure
- Main command files use `{{PHASE X: @agent-os/commands/...}}` syntax to reference phase files
- Phase files are numbered and placed in `single-agent/` folder
- Agent-qa currently has commands directly in command folders with different reference syntax

**Q7:** Common functions: Should we create `common-functions.sh` and `common-functions.ps1` similar to agent-os?
**Answer:** Yes, please create `common-functions.sh` and `common-functions.ps1` similar to agent-os for shared utilities.

**Q8:** Installation scope: Should installation scripts handle only config.yml creation/update, or also install agent-qa command files, workflows, and standards?
**Answer:** Both please. Agent-qa is an agent that will be installed/used by many QA analysts/managers, so installation should handle:
- Creating/updating `config.yml` with repository platform selection
- Installing agent-qa command files, workflows, and standards into the project

### Existing Code to Reference
No similar existing features identified for reference.

### Visual Assets
No visual assets provided.

## Requirements Summary

### Functional Requirements

#### Installation Scripts (Item #16)
- **Script Location**: Create installation scripts in `scripts/` subdirectory (similar to agent-os)
- **Scripts Required**: 
  - `scripts/install.sh` (bash) for Unix/Linux/macOS
  - `scripts/install.ps1` (PowerShell) for Windows
- **Common Functions**: Create `scripts/common-functions.sh` and `scripts/common-functions.ps1` similar to agent-os for shared utilities (YAML parsing, colored output, etc.)
- **Installation Flow**:
  1. User runs `install.sh` or `install.ps1`
  2. Script prompts for repository platform selection (GitLab/GitHub/Azure DevOps)
  3. Script prompts for repository-specific details:
     - Repository project ID (if applicable)
     - Azure DevOps cloud ID (if Azure DevOps is selected)
  4. Script creates/updates `agent-qa/config.yml` with selections
  5. Script installs agent-qa command files, workflows, and standards into the project
  6. **Do NOT** validate MCP server availability (handled by IDE)

#### Configuration Management (Item #15, #16)
- **Configuration File**: Create `agent-qa/config.yml` following same structure as agent-os's `config.yml`
- **Configuration Keys**: Store repository platform selection and repository-specific settings
- **MCP Server Configuration**: MCP servers are handled by IDE/Cursor - installation scripts do not configure or validate MCP server connections

#### Agent Command Structure (Item #17)
- **Command Structure Alignment**: Restructure agent-qa commands to follow agent-os patterns:
  - Use `multi-agent/` and `single-agent/` folder structure
  - Main command files should use `{{PHASE X: @agent-qa/commands/...}}` syntax to reference phase files
  - Phase files should be numbered and placed in `single-agent/` folder
  - Current agent-qa commands are directly in command folders with different reference syntax - need to restructure

#### Installation Scope
- **Configuration**: Create/update `agent-qa/config.yml` with repository platform selection
- **File Installation**: Install agent-qa command files, workflows, and standards into the project
- **Target Users**: Agent-qa will be installed/used by many QA analysts/managers

### Reusability Opportunities
- Patterns from agent-os installation scripts (`scripts/base-install.sh`, `scripts/project-install.sh`)
- Configuration structure from agent-os `config.yml`
- Common functions patterns from agent-os `scripts/common-functions.sh`
- Command structure patterns from agent-os `profiles/default/commands/` structure

### Scope Boundaries
**In Scope:**
- Installation scripts (bash and PowerShell) in `scripts/` directory
- Configuration file (`agent-qa/config.yml`) following agent-os structure
- Repository platform selection prompts (GitLab/GitHub/Azure DevOps)
- Repository project ID and Azure DevOps cloud ID prompts
- Installation of agent-qa command files, workflows, and standards
- Common functions scripts for shared utilities
- Restructuring agent-qa commands to follow agent-os patterns (multi-agent/single-agent structure, PHASE syntax)

**Out of Scope:**
- MCP server configuration or validation (handled by IDE/Cursor)
- MCP server availability checks during installation
- Installation of agent-os itself (agent-qa is separate)

### Technical Considerations
- Follow agent-os installation script patterns for consistency
- Use YAML for configuration files (same format as agent-os)
- Support cross-platform installation (bash for Unix/Linux/macOS, PowerShell for Windows)
- Common functions should handle YAML parsing, colored output, file operations similar to agent-os
- Command structure must match agent-os patterns for compatibility and consistency

