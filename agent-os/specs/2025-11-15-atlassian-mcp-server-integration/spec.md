# Specification: Atlassian MCP Server Integration

## Goal

Integrate with Atlassian MCP server to enable read-only access to Jira tickets, filters, and related data, providing foundational capabilities for requirements analysis and test deliverable generation.

## User Stories

- As a QA Analyst, I want to retrieve Jira ticket details and acceptance criteria so that I can analyze requirements for test case generation
- As a QA Manager, I want to process Jira filters representing epics or releases so that I can analyze complete scopes for test planning
- As a Release Manager, I want to access ticket metadata and relationships so that I can track requirement traceability

## Specific Requirements

**MCP Server Tool Integration**
- Use Atlassian MCP server tools directly without custom authentication logic
- Leverage existing MCP server configuration managed by IDE/Cursor
- Call MCP server functions for Jira operations (getJiraIssue, searchJiraIssuesUsingJql, etc.)
- Handle MCP server responses and transform data for agent-qa use

**Individual Ticket Reading**
- Support reading tickets by issue key (e.g., "PROJ-123") or issue ID
- Retrieve complete ticket details including all standard fields
- Extract summary, description, status, issue type, assignee, reporter
- Capture created/updated dates, labels, components, fix versions
- Support all Jira issue types (Epic, Story, Task, Bug, Sub-task, etc.)

**Acceptance Criteria Extraction**
- Check for acceptance criteria in dedicated custom field when available
- Parse acceptance criteria from description field when not a separate field
- Handle various formats (bullet points, numbered lists, plain text)
- Extract acceptance criteria reliably regardless of field location

**Jira Filter Processing**
- Process Jira filters to retrieve all matching tickets
- Support filter IDs and JQL queries as input
- Retrieve complete result sets without pagination limits
- Return structured list of tickets for downstream processing

**Epic and Child Story Processing**
- Identify epic tickets and retrieve all linked child stories
- Process hierarchical ticket relationships automatically
- Support nested structures (epic → story → sub-task)
- Maintain relationship context in data structures

**Ticket Metadata Extraction**
- Extract standard fields: summary, description, status, type, assignee, reporter
- Capture temporal data: created date, updated date, resolution date
- Collect organizational data: labels, components, fix versions, project
- Retrieve custom fields when present
- Preserve field names and values for flexible downstream use

**Error Handling**
- Handle non-existent tickets with clear error messages
- Gracefully handle empty filter results (return empty list, not error)
- Detect and report MCP server unavailability
- Handle network/timeout errors with retry guidance
- Validate ticket keys/IDs format before MCP calls
- Provide informative error context for debugging

**Data Processing and Storage**
- Store retrieved ticket data in memory for processing by other commands
- Structure data in accessible format (objects/arrays) for agent-qa workflows
- Support data transformation for different use cases (requirements analysis, test generation)
- Maintain ticket relationships and hierarchies in data structures

**Optional Debug Export**
- Provide optional markdown export of raw ticket data for debugging
- Export individual tickets or filter results to markdown files
- Format exported data following agent-os markdown standards
- Include metadata and relationships in export format
- Enable debug mode via configuration or command flag

**Command Structure Integration**
- Follow agent-os command patterns with multi-phase processes
- Use numbered instruction files for workflow steps
- Integrate with agent-os workflow system
- Comply with agent-os standards and conventions
- Create reusable command structure for Jira operations

## Visual Design

No visual assets provided.

## Existing Code to Leverage

**Agent-OS Command Structure Patterns**
- Reference `../agent-os` for multi-phase command implementation patterns
- Follow numbered instruction file structure (1-initialize.md, 2-process.md, etc.)
- Use workflow integration patterns from existing agent-os commands
- Adopt error handling patterns from agent-os standards

**YAML Configuration Handling**
- Use `agent-os/config.yml` structure for any configuration needs
- Follow YAML configuration patterns from existing agent-os setup
- Leverage configuration loading patterns if needed for future extensions

**Markdown Export Patterns**
- Follow agent-os markdown formatting standards for debug exports
- Use consistent markdown structure patterns from existing documentation
- Apply markdown table formatting for structured data export

**Error Handling Standards**
- Follow error handling patterns from `agent-os/standards/global/error-handling.md`
- Use consistent error message formatting
- Apply validation patterns from `agent-os/standards/global/validation.md`

**MCP Server Tool Usage**
- Reference existing MCP server tool usage patterns in the codebase
- Follow MCP server response handling patterns
- Use MCP server error handling approaches

## Out of Scope

- Writing or updating Jira tickets (read-only operations only)
- Authentication or credential management (handled by IDE/MCP server)
- Pagination or result limiting for filters (retrieve all tickets)
- Real-time synchronization or webhook subscriptions
- Batch write operations or bulk updates
- Custom field creation or modification
- Jira workflow transitions or status changes
- Comment creation or modification
- Attachment uploads or downloads
- User management or permission handling
- Jira project creation or configuration

