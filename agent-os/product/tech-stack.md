# Product Tech Stack

This document defines the technical stack for Agent-QA. The product is designed to be lightweight and focused on markdown-based documentation generation with shell-based installation and configuration.

## Documentation & Content Format

- **Documentation Format:** Markdown (.md)
  - All generated deliverables (test cases, test plans, test strategies, test charters, risk registers) are output as markdown files
  - Agent commands and workflows are documented in markdown
  - Product documentation and specifications use markdown format

## Installation & Configuration

- **Installation Scripts:** 
  - **Bash:** Shell scripts for Unix/Linux/macOS installation (`install.sh`, `configure.sh`)
  - **PowerShell:** PowerShell scripts for Windows installation (`install.ps1`, `configure.ps1`)
  - Installation scripts handle MCP server configuration, repository platform selection, and agent setup

- **Configuration Files:**
  - YAML files (`.yml` or `.yaml`) for agent settings and configuration
  - Shell/PowerShell scripts for runtime configuration

## External Integrations (via MCP Servers)

Agent-QA leverages Model Context Protocol (MCP) servers for external integrations. These are not part of the core tech stack but are required dependencies:

- **Atlassian MCP Server:** For Jira and Confluence access
- **Playwright MCP Server:** For test automation script generation
- **Repository MCP Servers:** User-selectable from:
  - GitLab MCP Server
  - GitHub MCP Server
  - Azure DevOps MCP Server

## Agent Framework

- **Agent-OS Framework:** Built on agent-os patterns and structure
  - Commands follow agent-os command structure
  - Workflows follow agent-os workflow patterns
  - Standards and conventions follow agent-os guidelines

## Output & Deliverables

- **Test Cases:** Markdown format with structured test steps, preconditions, and expected results
- **Test Plans:** Markdown documents with sections for objectives, scope, strategy, schedules
- **Test Strategies:** Markdown documents covering test levels, types, and approaches
- **Test Charters:** Markdown documents for exploratory testing
- **Risk Registers:** Markdown tables/documents with risk assessments
- **Technical Release Notes:** Markdown documents with requirement traceability

## File Structure

- **Agent-QA Commands:** `agent-qa/commands/` (markdown files for agent-qa specific commands)
- **Agent Workflows:** `agent-qa/workflows/` (markdown files)
- **Product Documentation:** `agent-os/product/` (markdown files - kept under agent-os)
- **Standards:** `agent-qa/standards/` (markdown files)
- **Agent Configuration:** `agent-qa/config.yml` (YAML file for agent settings)
- **Installation Scripts:** Root directory (`install.sh`, `install.ps1`)

## Development & Maintenance

- **Version Control:** Git (standard git workflow)
- **Documentation:** Markdown files in repository
- **Scripts:** Shell (bash) and PowerShell for cross-platform support

## Constraints

- **No Application Framework:** Agent-QA does not require a traditional application framework (Rails, Django, Next.js, etc.)
- **No Database:** No database storage required; all data is retrieved via MCP servers and outputs are markdown files
- **No Frontend Framework:** No web UI; operates as a command-line agent through Claude/Cursor
- **No Backend Runtime:** No server-side runtime required; operates within the AI agent environment
- **Minimal Dependencies:** Only shell scripts, markdown files, and YAML configuration files for core functionality

## Platform Support

- **Unix/Linux/macOS:** Bash shell scripts
- **Windows:** PowerShell scripts
- **Cross-platform:** Both installation methods available for maximum compatibility

