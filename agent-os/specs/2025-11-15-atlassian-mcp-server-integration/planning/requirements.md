# Spec Requirements: Atlassian MCP Server Integration

## Initial Description

Integrate with Atlassian MCP server to authenticate and access Jira tickets, including support for reading epics, stories, filters, and retrieving ticket details, acceptance criteria, and metadata.

## Requirements Discussion

### First Round Questions

**Q1:** Authentication: I assume the Atlassian MCP server is already configured in the IDE (as you mentioned earlier) and authentication is handled by the MCP server itself. Should the agent just use the MCP server tools directly, or do we need to handle authentication/configuration separately in the agent?

**Answer:** Yes - MCP server handles authentication, agent just uses tools directly.

**Q2:** Jira Operations Scope: I'm thinking we need to support reading individual tickets (by key/ID), reading Jira filters (to get multiple tickets), retrieving ticket details (summary, description, acceptance criteria, status, assignee, etc.), and reading epics with their child stories. Should we also support writing/updating tickets, or is this integration read-only for now?

**Answer:** Read-only for now.

**Q3:** Ticket Types: Should we support all Jira issue types (Epic, Story, Task, Bug, etc.) or focus on specific types? I'm assuming we need at minimum: Epic, Story, and the ability to process filters that return any issue type.

**Answer:** All issue types please.

**Q4:** Filter Processing: When processing a Jira filter, should we retrieve all tickets matching the filter, or should there be pagination/limits? I'm assuming we retrieve all tickets but want to confirm.

**Answer:** All the tickets please.

**Q5:** Metadata Fields: For ticket details, I'm assuming we need: summary, description, acceptance criteria, status, issue type, assignee, reporter, created/updated dates, labels, components, fix versions, and custom fields. Are there other specific fields we must capture?

**Answer:** For the moment it is enough, but be careful sometimes acceptance criteria is not a field but it is part of the description.

**Q6:** Error Handling: Should the agent handle cases where tickets don't exist, filters return no results, or MCP server is unavailable? I'm assuming we need graceful error handling with informative messages, but want to confirm the approach.

**Answer:** Yes please.

**Q7:** Configuration: Should MCP server connection details (if any) be stored in `agent-os/config.yml`, or is the MCP server configuration handled entirely by the IDE/Cursor setup? I'm assuming the latter since you mentioned the servers are already configured.

**Answer:** Yes the configuration is handled by the IDE.

**Q8:** Output Format: Should retrieved ticket data be stored in memory for processing by other agent commands, or should we also save raw ticket data to markdown files for reference? I'm assuming in-memory processing with optional markdown export for debugging.

**Answer:** Exactly, in-memory processing with optional markdown export for debugging.

### Existing Code to Reference

**Similar Features Identified:**
- Agent command structure patterns: Reference `../agent-os` for comparable agent command structures
- Commands follow agent-os patterns with multi-phase processes, numbered instruction files, and workflow integration
- Configuration handling: YAML-based configuration in `agent-os/config.yml` following agent-os conventions

### Follow-up Questions

No follow-up questions needed.

## Visual Assets

### Files Provided:

No visual files found.

### Visual Insights:

No visual assets provided.

## Requirements Summary

### Functional Requirements

- **MCP Server Integration**: Use Atlassian MCP server tools directly (authentication handled by IDE/MCP server)
- **Read-Only Operations**: Support reading Jira tickets, filters, epics, and stories (no write/update operations)
- **Ticket Reading**: Read individual tickets by key/ID with full details
- **Filter Processing**: Process Jira filters to retrieve all matching tickets
- **Issue Type Support**: Support all Jira issue types (Epic, Story, Task, Bug, etc.)
- **Ticket Details Retrieval**: Extract ticket metadata including:
  - Summary, description, status, issue type
  - Assignee, reporter
  - Created/updated dates
  - Labels, components, fix versions
  - Custom fields
  - Acceptance criteria (may be in description field, not always a separate field)
- **Epic Processing**: Read epics and their child stories
- **Error Handling**: Gracefully handle missing tickets, empty filters, MCP server unavailability with informative error messages
- **Data Processing**: In-memory processing of ticket data for use by other agent commands
- **Debug Export**: Optional markdown export of raw ticket data for debugging purposes

### Reusability Opportunities

- **Command Structure**: Follow agent-os command patterns from `../agent-os`
  - Multi-phase processes
  - Numbered instruction files
  - Workflow integration
  - Standards compliance
- **Configuration**: Use YAML-based configuration following agent-os conventions
- **Error Handling**: Follow agent-os error handling patterns

### Scope Boundaries

**In Scope:**
- Reading Jira tickets (all issue types)
- Reading Jira filters (retrieve all matching tickets)
- Reading epics and child stories
- Extracting ticket metadata and details
- Handling acceptance criteria from description field when not a separate field
- Error handling for common failure scenarios
- In-memory data processing
- Optional markdown export for debugging

**Out of Scope:**
- Writing or updating Jira tickets
- Authentication/configuration management (handled by IDE/MCP server)
- Pagination or limits on filter results (retrieve all tickets)
- Real-time synchronization or webhooks
- Batch operations beyond filter processing

### Technical Considerations

- **MCP Server Integration**: Use Atlassian MCP server tools directly - no custom authentication needed
- **Configuration**: MCP server configuration handled entirely by IDE/Cursor setup
- **Data Structure**: Ticket data stored in memory for processing by subsequent agent commands
- **Acceptance Criteria Extraction**: Must handle cases where acceptance criteria is embedded in description field, not a separate field
- **Error Handling**: Implement comprehensive error handling for:
  - Non-existent tickets
  - Empty filter results
  - MCP server unavailability
  - Network/timeout errors
  - Invalid ticket keys/IDs
- **Command Structure**: Follow agent-os patterns from `../agent-os` for consistency
- **Output Format**: Markdown export for debugging should follow agent-os markdown standards
- **Integration Points**: This is a foundational feature that enables other features (requirements analysis, test generation, etc.)
