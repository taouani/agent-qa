# Task Breakdown: Atlassian MCP Server Integration

## Overview
Total Tasks: 9 task groups

## Task List

### Command Structure Layer

#### Task Group 1: Agent-OS Command Structure Setup
**Dependencies:** None

- [x] 1.0 Create agent-os command structure for agent-qa Atlassian MCP integration
  - [x] 1.1 Create command directory structure following agent-os patterns
    - Create `agent-qa/commands/atlassian-integration/` directory for agent-qa
    - Follow multi-phase command pattern with numbered instruction files
    - Reference `../agent-os` for command structure patterns
  - [x] 1.2 Create main command file `atlassian-integration.md`
    - Follow agent-os command file structure
    - Include multi-phase process documentation
    - Reference numbered instruction files
  - [x] 1.3 Create numbered instruction files for workflow phases
    - `1-initialize-mcp-connection.md` - MCP server connection setup
    - `2-read-ticket.md` - Individual ticket reading
    - `3-process-filter.md` - Filter processing
    - `4-process-epic.md` - Epic and child story processing
  - [x] 1.4 Integrate with agent-os workflow system
    - Follow workflow integration patterns from existing commands
    - Ensure compliance with agent-os standards
  - [x] 1.5 Document command usage and examples
    - Add usage examples in command documentation
    - Include error handling examples

**Acceptance Criteria:**
- Command structure follows agent-os patterns exactly
- All numbered instruction files created and documented
- Command integrates with agent-os workflow system
- Documentation matches agent-os standards

### MCP Server Integration Layer

#### Task Group 2: Atlassian MCP Server Tool Integration
**Dependencies:** Task Group 1

- [x] 2.0 Implement MCP server tool integration
  - [x] 2.1 Research and document available Atlassian MCP server tools
    - Identify `mcp_Atlassian_getJiraIssue` tool for ticket reading
    - Identify `mcp_Atlassian_searchJiraIssuesUsingJql` for filter processing
    - Document tool parameters and response formats
  - [x] 2.2 Create MCP server tool wrapper functions
    - Create wrapper for ticket reading operations
    - Create wrapper for filter/search operations
    - Handle MCP server response transformation
  - [x] 2.3 Implement MCP server connection validation
    - Check MCP server availability before operations
    - Validate MCP server tool accessibility
    - Provide clear error messages if MCP server unavailable
  - [x] 2.4 Create data transformation layer
    - Transform MCP server responses to agent-qa-friendly format
    - Structure data for downstream processing
    - Preserve all ticket metadata in transformation

**Acceptance Criteria:**
- MCP server tools can be called successfully
- Response data is transformed to usable format
- Connection validation works correctly
- Error handling provides informative messages

### Ticket Reading Operations

#### Task Group 3: Individual Ticket Reading
**Dependencies:** Task Group 2

- [x] 3.0 Implement individual ticket reading functionality
  - [x] 3.1 Implement ticket reading by issue key
    - Support format: "PROJ-123" or similar
    - Validate issue key format before MCP call
    - Handle invalid format errors gracefully
  - [x] 3.2 Implement ticket reading by issue ID
    - Support numeric issue IDs
    - Validate ID format
    - Handle non-existent ticket errors
  - [x] 3.3 Extract standard ticket fields
    - Summary, description, status, issue type
    - Assignee, reporter information
    - Created/updated dates
  - [x] 3.4 Extract organizational metadata
    - Labels array
    - Components array
    - Fix versions array
    - Project information
  - [x] 3.5 Extract custom fields
    - Retrieve all custom fields when present
    - Preserve field names and values
    - Handle missing custom fields gracefully
  - [x] 3.6 Support all Jira issue types
    - Epic, Story, Task, Bug, Sub-task
    - Handle any other issue types dynamically
    - Preserve issue type information

**Acceptance Criteria:**
- Can read tickets by key or ID
- All standard fields extracted correctly
- Custom fields preserved when present
- All issue types supported
- Error handling works for invalid tickets

### Acceptance Criteria Extraction

#### Task Group 4: Acceptance Criteria Parsing
**Dependencies:** Task Group 3

- [x] 4.0 Implement acceptance criteria extraction
  - [x] 4.1 Check for acceptance criteria in dedicated custom field
    - Identify common custom field names for acceptance criteria
    - Extract when found in custom field
    - Preserve formatting from custom field
  - [x] 4.2 Parse acceptance criteria from description field
    - Detect acceptance criteria patterns in description
    - Handle bullet point formats (•, -, *)
    - Handle numbered list formats (1., 2., etc.)
    - Handle plain text formats
  - [x] 4.3 Create acceptance criteria extraction function
    - Try custom field first, then description
    - Return structured format (array of criteria)
    - Handle cases where no acceptance criteria found
  - [x] 4.4 Test extraction with various formats
    - Test with custom field acceptance criteria
    - Test with description-based acceptance criteria
    - Test with mixed formats
    - Test with missing acceptance criteria

**Acceptance Criteria:**
- Acceptance criteria extracted from custom field when available
- Acceptance criteria parsed from description when not in custom field
- Various formats handled correctly
- Returns structured array format
- Handles missing acceptance criteria gracefully

### Filter Processing

#### Task Group 5: Jira Filter Processing
**Dependencies:** Task Group 2

- [x] 5.0 Implement Jira filter processing
  - [x] 5.1 Support filter processing by filter ID
    - Accept Jira filter ID as input
    - Retrieve filter definition via MCP server
    - Execute filter to get matching tickets
  - [x] 5.2 Support filter processing by JQL query
    - Accept JQL query string as input
    - Use `searchJiraIssuesUsingJql` MCP tool
    - Handle JQL syntax errors gracefully
  - [x] 5.3 Retrieve all matching tickets
    - Process complete result set without pagination
    - Handle large result sets efficiently
    - Return structured list of tickets
  - [x] 5.4 Handle empty filter results
    - Return empty list (not error) when no matches
    - Provide informative message about empty results
    - Allow downstream processing to handle empty lists
  - [x] 5.5 Transform filter results to structured format
    - Convert each ticket in results using ticket reading logic
    - Maintain list structure for downstream processing
    - Preserve all ticket metadata

**Acceptance Criteria:**
- Can process filters by ID or JQL query
- All matching tickets retrieved
- Empty results handled gracefully
- Results transformed to structured format
- Large result sets handled efficiently

### Epic and Child Story Processing

#### Task Group 6: Epic and Hierarchical Processing
**Dependencies:** Task Group 3, Task Group 5

- [x] 6.0 Implement epic and child story processing
  - [x] 6.1 Identify epic tickets
    - Detect issue type "Epic"
    - Check for epic link custom field
    - Handle epic identification reliably
  - [x] 6.2 Retrieve child stories for epics
    - Use JQL to find stories linked to epic
    - Retrieve all child stories using ticket reading
    - Handle epics with no child stories
  - [x] 6.3 Process nested structures
    - Support epic → story → sub-task hierarchy
    - Recursively process child relationships
    - Maintain relationship context in data structures
  - [x] 6.4 Create hierarchical data structure
    - Store epic with child stories array
    - Preserve parent-child relationships
    - Include relationship metadata
  - [x] 6.5 Handle multiple epics in filter results
    - Process each epic independently
    - Retrieve child stories for each epic
    - Maintain epic context in results

**Acceptance Criteria:**
- Epic tickets identified correctly
- Child stories retrieved for epics
- Nested structures processed correctly
- Hierarchical data structure maintained
- Multiple epics handled in filter results

### Error Handling

#### Task Group 7: Comprehensive Error Handling
**Dependencies:** Task Groups 2-6

- [x] 7.0 Implement error handling for all operations
  - [x] 7.1 Handle non-existent tickets
    - Detect 404 or "not found" errors from MCP server
    - Provide clear error message with ticket key/ID
    - Allow operation to continue with other tickets
  - [x] 7.2 Handle empty filter results
    - Return empty list instead of error
    - Log informative message about empty results
    - Allow downstream processing to handle gracefully
  - [x] 7.3 Handle MCP server unavailability
    - Detect connection failures
    - Provide clear error message about MCP server status
    - Suggest troubleshooting steps
  - [x] 7.4 Handle network/timeout errors
    - Detect timeout errors
    - Provide retry guidance in error message
    - Log error details for debugging
  - [x] 7.5 Validate inputs before MCP calls
    - Validate ticket key format (e.g., "PROJ-123")
    - Validate issue ID format (numeric)
    - Validate JQL query syntax basics
    - Provide clear validation error messages
  - [x] 7.6 Create error handling utility functions
    - Centralize error handling logic
    - Follow agent-os error handling patterns
    - Provide consistent error message format

**Acceptance Criteria:**
- All error scenarios handled gracefully
- Error messages are informative and actionable
- Input validation prevents invalid MCP calls
- Error handling follows agent-os patterns
- Errors logged appropriately for debugging

### Data Processing and Storage

#### Task Group 8: Data Processing and In-Memory Storage
**Dependencies:** Task Groups 3-6

- [x] 8.0 Implement data processing and storage
  - [x] 8.1 Create ticket data structure
    - Design object structure for ticket data
    - Include all extracted fields
    - Support hierarchical relationships
  - [x] 8.2 Implement in-memory storage
    - Store ticket data in accessible format
    - Support array structures for multiple tickets
    - Maintain data for downstream commands
  - [x] 8.3 Create data transformation functions
    - Transform for requirements analysis use case
    - Transform for test generation use case
    - Support flexible data access patterns
  - [x] 8.4 Maintain ticket relationships
    - Preserve epic-story relationships
    - Preserve parent-child relationships
    - Include relationship metadata
  - [x] 8.5 Create data access utilities
    - Functions to query ticket data
    - Functions to filter ticket data
    - Functions to extract specific fields

**Acceptance Criteria:**
- Ticket data stored in accessible format
- Data structures support downstream processing
- Relationships maintained correctly
- Data access utilities work correctly
- Data transformation functions available

### Debug Export Feature

#### Task Group 9: Optional Markdown Debug Export
**Dependencies:** Task Groups 3-8

- [x] 9.0 Implement optional markdown debug export
  - [x] 9.1 Create markdown export function
    - Export individual ticket to markdown
    - Export filter results to markdown
    - Follow agent-os markdown standards
  - [x] 9.2 Format exported data
    - Use markdown tables for structured data
    - Include all ticket metadata
    - Preserve relationships in export
  - [x] 9.3 Add debug mode configuration
    - Enable/disable via configuration flag
    - Support command-line flag for debug export
    - Default to disabled for normal operations
  - [x] 9.4 Create export file naming convention
    - Use descriptive filenames (e.g., "ticket-PROJ-123.md")
    - Include timestamp in filename if needed
    - Save to appropriate directory
  - [x] 9.5 Include metadata in export
    - Export timestamp
    - Export source (ticket key, filter ID, etc.)
    - Include relationship information

**Acceptance Criteria:**
- Markdown export works for tickets and filters
- Export format follows agent-os markdown standards
- Debug mode can be enabled/disabled
- Exported files are well-formatted and readable
- All metadata included in exports

