# PHASE 3: Process Jira Filter (Release) - Epic, Sprint, and Release Analysis

Process Jira filters, JQL queries, or Jira issue keys to retrieve all matching tickets with comprehensive scope analysis including recursive child story processing, linked content analysis, and full requirements analysis workflow. All outputs are stored in `agent-qa/release/` folder.

**Context**: This phase processes a release (Jira filter, sprint filter, epic filter, or issue keys) and stores outputs in `agent-qa/release/` folder. Use context-aware terminology: "release" for all filters.

## Core Responsibilities

1. **Process Input Parameter**: Accept JQL query, filter ID, or Jira issue key(s) (single or multiple)
2. **Detect Filter Type**: Automatically detect filter type (epic, sprint, release) from input
3. **Retrieve All Tickets**: Get complete result set without pagination limits
4. **Process Child Stories**: Automatically process child stories recursively when epics detected (using Phase 4)
5. **Process Linked Content**: Automatically process linked content for all tickets (using Phase 6)
6. **Process Requirements Analysis**: Automatically process all tickets through requirements analysis workflow (phases 5-8)
7. **Generate Scope Analysis Reports**: Generate comprehensive scope analysis reports for entire filter scope
8. **Generate Summary Files**: Create summary files for entire filter scope
9. **Store in Release Folder**: Save all extracted data and outputs to `agent-qa/release/` folder
10. **Handle Empty Results**: Gracefully handle filters with no matching tickets

## Workflow

### Step 1: Determine Input Type and Process Input Parameter

Accept input as string representing:
- **JQL Query**: JQL query string (e.g., "project = PROJ AND status = Open")
- **Filter ID**: Numeric Jira filter ID (convert to JQL query)
- **Single Jira Issue Key**: Single issue key (e.g., "PROJ-123")
- **Multiple Jira Issue Keys**: Multiple issue keys (e.g., "PROJ-123, PROJ-124, PROJ-125" or array format)

**Input Processing Logic:**

1. **Detect Input Type**:
   - If input is numeric only → Treat as Filter ID
   - If input contains "=", "AND", "OR", "IN", "NOT" → Treat as JQL Query
   - If input matches issue key pattern (e.g., "PROJ-123") → Treat as Single Issue Key
   - If input contains commas and issue key patterns → Treat as Multiple Issue Keys

2. **Process Single Issue Key**:
   - Validate format: `[PROJECT-KEY]-[NUMBER]` (e.g., "PROJ-123")
   - Convert to JQL query: `key = PROJ-123`
   - Use converted JQL for ticket retrieval

3. **Process Multiple Issue Keys**:
   - Parse comma-separated string: "PROJ-123, PROJ-124, PROJ-125"
   - Validate each issue key format
   - Convert to JQL query: `key IN (PROJ-123, PROJ-124, PROJ-125)`
   - Use converted JQL for ticket retrieval

4. **Process JQL Query**:
   - Use JQL query as-is
   - Validate JQL syntax if possible
   - Use JQL for ticket retrieval

5. **Process Filter ID**:
   - If filter ID provided, retrieve filter definition to get JQL (if MCP tool available)
   - Otherwise, construct JQL from filter ID if possible
   - Use JQL for ticket retrieval

6. **Validate Input Format**:
   - Ensure input is not empty
   - Provide informative error messages for invalid input
   - Handle edge cases (empty input, malformed keys, invalid JQL)

**Error Handling:**
- Invalid input format → Log error: "Invalid input format: [input]. Expected JQL query, filter ID, or issue key(s)"
- Malformed issue keys → Log error: "Invalid issue key format: [key]. Expected format: PROJECT-NUMBER"
- Invalid JQL syntax → Log error: "Invalid JQL syntax: [jql]. [guidance]"
- Continue processing with valid inputs if multiple keys provided

### Step 2: Call MCP Server Tool

Use `mcp_Atlassian_searchJiraIssuesUsingJql` to retrieve tickets:

**Parameters:**
- `cloudId`: Atlassian cloud ID (obtained from Phase 1 - getAccessibleAtlassianResources)
- `jql`: JQL query string (from Step 1 processing)
  - If filter ID provided, first retrieve filter definition to get JQL (if MCP tool available)
  - If JQL provided directly, use it as-is
  - If issue key(s) provided, use converted JQL from Step 1
- `maxResults`: Set to maximum (typically 100) and handle pagination if needed
- `fields`: Request all required fields (summary, description, status, issuetype, assignee, reporter, created, updated, labels, components, fixVersions, custom fields, sprint, epicLink, parent)

### Step 3: Handle Pagination

If result set exceeds maxResults:

- Use `nextPageToken` or pagination parameters to retrieve all pages
- Continue fetching until all tickets retrieved
- Combine all results into single list
- Track total tickets retrieved for statistics

### Step 3.5: Detect Filter Type

After retrieving initial ticket results, analyze input and results to detect filter type:

1. **Analyze Input for Filter Type Indicators**:
   - Check JQL query for filter type patterns:
     - Epic filter: JQL contains `issuetype = Epic` or epic-related patterns
     - Sprint filter: JQL contains `sprint =` or `Sprint =` patterns
     - Release filter: JQL contains `fixVersion =` or `version =` patterns
   - Check input string for keywords: "epic", "sprint", "release"

2. **Analyze Ticket Results for Filter Type**:
   - **Detect Epic Filters**: Identify epics in results
     - Check issue types: If any ticket has `issueType = "Epic"`, likely epic filter
     - Count epics in results
     - Route to epic filter processing if epics detected
   - **Detect Sprint Filters**: Identify sprint context
     - Check ticket fields for Sprint field values
     - Check JQL for sprint-related patterns
     - Route to sprint filter processing if sprint context detected
   - **Detect Release Filters**: Identify release context
     - Check ticket fields for fixVersion or version field values
     - Check JQL for fixVersion-related patterns
     - Route to release filter processing if release context detected

3. **Route Processing Based on Detected Filter Type**:
   - **Epic Filter**: Process all epics, trigger Phase 4 for each epic
   - **Sprint Filter**: Process all tickets, identify epics and trigger Phase 4
   - **Release Filter**: Process all tickets, identify epics and trigger Phase 4
   - **Generic Filter**: If type cannot be determined, use generic processing (same comprehensive processing)

4. **Store Filter Type Information**:
   - Store detected filter type in data structures
   - Include filter type in scope analysis reports
   - Use filter type for routing and processing decisions

**Note**: All filter types use the same comprehensive processing (child stories, linked content, requirements analysis). Filter type detection is primarily for reporting and context.

### Step 4: Ensure Release Folder Exists

Before processing tickets, ensure `agent-qa/release/` folder exists (created in Phase 1).

All outputs for this release should be stored in `agent-qa/release/`:
- All ticket data
- Extracted acceptance criteria
- Transformed data structures
- Any generated deliverables

### Step 5: Process Each Ticket and Detect Epics

For each ticket in the results:

1. Use ticket reading logic from `2-read-ticket.md` to extract full details
2. Transform ticket to agent-qa format
3. Extract acceptance criteria
4. **Detect Epic Tickets**: Check if ticket is an epic
   - Check issue type: `issueType = "Epic"`
   - Check custom fields for epic indicators
   - Track epic tickets for child story processing
5. Store in `agent-qa/release/` folder
6. Add to results array

**Epic Detection Logic:**
- Identify all epic tickets in filter results
- Maintain list of epic tickets for Phase 4 processing
- Store epic context in data structures
- Track epic count for statistics

### Step 6: Process Child Stories Recursively (Automatic Phase 4 Integration)

After processing all tickets and detecting epics, automatically process child stories recursively:

1. **For Each Detected Epic**:
   - Trigger Phase 4 processing for each epic ticket
   - Follow Phase 4 instructions: `4-process-epic.md`
   - Use dual detection method (Epic Link JQL and parent-child relationships)
   - Process child stories recursively using enhanced Phase 4 logic
   - Include child stories in analysis scope

2. **Recursive Child Story Processing**:
   - Process epic → story relationships (level 1)
   - Process story → sub-task relationships (level 2)
   - Support deeper nesting levels automatically (level 3, 4, etc.)
   - Track hierarchy depth during recursion
   - Maintain hierarchy and relationships in data structures

3. **Include Child Stories in Filter Results**:
   - Add child stories to filter results array
   - Maintain parent-child relationships
   - Preserve hierarchy in data structures
   - Ensure child stories are processed through all subsequent phases

4. **Store Child Story Data**:
   - Store child stories in `agent-qa/release/` folder
   - Maintain epic → story → sub-task hierarchy
   - Include child stories in comprehensive scope analysis

**Note**: Child story processing is automatic when epics are detected. No manual triggering required.

### Step 7: Process Linked Content (Automatic Phase 6 Integration)

After processing tickets and child stories, automatically process linked content for all tickets:

1. **For All Tickets** (epics, stories, child stories):
   - Trigger Phase 6 processing for all tickets
   - Follow Phase 6 instructions: `6-analyze-linked-content.md`
   - Process linked issues for all tickets
   - Process linked Confluence pages for all tickets

2. **Process Linked Issues**:
   - Retrieve and analyze linked issues referenced in tickets
   - Integrate linked issues into requirement structures
   - Maintain links between tickets and linked issues

3. **Process Linked Confluence Pages**:
   - Retrieve and analyze linked Confluence pages referenced in tickets
   - Use `mcp_Atlassian_getConfluencePage` tool for retrieval
   - Extract all raw content from Confluence pages
   - Integrate Confluence content into requirement structures
   - Maintain links between tickets and Confluence pages

4. **Integrate Linked Content**:
   - Add linked content to requirement structures for all tickets
   - Maintain requirement-to-linked-content relationships
   - Ensure linked content is accessible for downstream phases

**Note**: Linked content processing is automatic for all tickets. No manual triggering required.

### Step 8: Process Requirements Analysis (Automatic Phases 5-8 Integration)

After processing tickets, child stories, and linked content, automatically process all tickets through requirements analysis workflow:

1. **Process All Tickets Through Phase 5 (Analyze Requirements)**:
   - Trigger Phase 5 for all tickets (epics, stories, child stories)
   - Follow Phase 5 instructions: `5-analyze-requirements.md`
   - Extract requirements from all tickets
   - Structure requirements for all tickets
   - Store requirement structures in memory

2. **Process All Tickets Through Phase 6 (Analyze Linked Content)**:
   - Already completed in Step 7 (linked content processing)
   - Ensure linked content is integrated into requirement structures

3. **Process All Tickets Through Phase 7 (Perform Quality Analysis)**:
   - Trigger Phase 7 for all tickets
   - Follow Phase 7 instructions: `7-perform-quality-analysis.md`
   - Perform requirement completeness checks for all tickets
   - Generate completeness scores for all tickets
   - Perform requirement quality scoring for all tickets

4. **Process All Tickets Through Phase 8 (Generate Requirement Files)**:
   - Trigger Phase 8 for all tickets
   - Follow Phase 8 instructions: `8-generate-requirement-files.md`
   - Generate individual requirement markdown files for all tickets
   - Create summary index file including all tickets
   - Format requirement files according to agent-os standards
   - Write requirement files to `agent-qa/release/` folder

5. **Generate Deliverables for Entire Filter Scope**:
   - Generate deliverables for entire filter scope (not just individual tickets)
   - Include all tickets (epics, stories, child stories) in deliverables
   - Ensure deliverables reflect comprehensive filter scope

**Note**: Requirements analysis is automatic for all tickets. All tickets are processed through phases 5-8.

### Step 9: Generate Comprehensive Scope Analysis Reports

After processing all tickets through requirements analysis, generate comprehensive scope analysis reports:

1. **Generate Ticket Statistics**:
   - Calculate total tickets in filter scope
   - Count epics, stories, child stories separately
   - Count tickets by issue type
   - Count tickets by status
   - Calculate statistics by ticket type
   - Include statistics in scope analysis report

2. **Generate Relationship Analysis**:
   - Analyze dependencies between tickets
   - Analyze hierarchies (epic → story → sub-task)
   - Identify relationship patterns
   - Count relationships by type (epic-link, parent-child)
   - Include relationship analysis in scope analysis report

3. **Generate Coverage Analysis**:
   - Analyze requirements completeness across filter scope
   - Calculate acceptance criteria coverage (tickets with AC vs. without AC)
   - Identify gaps in requirements
   - Calculate coverage percentages
   - Include coverage analysis in scope analysis report

4. **Generate Quality Metrics**:
   - Aggregate completeness scores across filter scope
   - Aggregate quality scores across filter scope
   - Calculate average completeness score
   - Calculate average quality score
   - Calculate distribution metrics (min, max, median)
   - Include quality metrics in scope analysis report

5. **Include Deliverables Summary**:
   - List all deliverables generated for filter scope
   - Include links to generated deliverables:
     - Requirement files (Phase 8)
     - Test cases (if generated in phases 9-11)
     - Test plans (if generated in phases 21-23)
     - Test strategies (if generated in phases 15-17)
     - Test charters (if generated in phases 12-14)
     - Risk registers (if generated in phases 18-20)
   - Summarize deliverable contents
   - Include deliverables summary in scope analysis report

6. **Format Scope Analysis Report**:
   - Format report according to agent-os markdown standards
   - Include all sections (statistics, relationships, coverage, quality, deliverables)
   - Include filter type information (epic, sprint, release)
   - Include input parameter information
   - Write report to `agent-qa/release/` folder
   - Use descriptive filename: `scope-analysis-report.md`

### Step 10: Generate Summary Files

After generating scope analysis reports, create summary files for entire filter scope:

1. **Create Summary File Structure**:
   - Define summary file structure and sections
   - Include overview of filter scope and context
   - Include filter type information (epic, sprint, release)
   - Include input parameter information (JQL query or issue keys)
   - Include processing date/time

2. **Include Statistics and Metrics**:
   - Include ticket statistics from scope analysis report
   - Include quality metrics from scope analysis report
   - Include coverage metrics from scope analysis report
   - Format statistics and metrics clearly using markdown tables

3. **Include Links to Individual Requirement Files**:
   - Generate links to individual requirement files for all tickets
   - Organize links by ticket type (epics, stories, child stories)
   - Group links by epic (if applicable)
   - Format links according to markdown standards
   - Include links in summary file

4. **Include Links to Generated Deliverables**:
   - Generate links to all generated deliverables
   - Include links to requirement files (Phase 8)
   - Include links to scope analysis report (Step 9)
   - Include links to test cases (if generated in phases 9-11)
   - Include links to test plans (if generated in phases 21-23)
   - Include links to test strategies (if generated in phases 15-17)
   - Include links to test charters (if generated in phases 12-14)
   - Include links to risk registers (if generated in phases 18-20)
   - Format links according to markdown standards

5. **Format and Write Summary File**:
   - Format summary file according to agent-os markdown standards
   - Write summary file to `agent-qa/release/` folder
   - Use descriptive filename: `filter-summary.md` or `scope-summary.md`
   - Ensure summary file is comprehensive and well-organized

### Step 11: Handle Empty Results

If filter returns no matching tickets:

- Return empty array (not error)
- Log informative message: "Filter returned 0 matching tickets"
- Allow downstream processing to handle empty list gracefully
- Still create summary file with empty results information

### Step 12: Transform Results and Store in Memory

Transform all tickets (including child stories) to structured format:

```javascript
[
  {
    key: "PROJ-123",
    issueType: "Epic",
    // ... full ticket data as per 2-read-ticket.md format
    children: [
      {
        key: "PROJ-124",
        issueType: "Story",
        hierarchyLevel: 1,
        relationshipTypes: ["epic-link", "parent-child"],
        // ... full ticket data
        children: [
          {
            key: "PROJ-125",
            issueType: "Sub-task",
            hierarchyLevel: 2,
            relationshipTypes: ["parent-child"],
            // ... full ticket data
          }
        ]
      }
    ]
  },
  {
    key: "PROJ-126",
    issueType: "Story",
    // ... full ticket data
  }
]
```

Store the complete list of tickets (including child stories) in memory:

- Use array structure for multiple tickets
- Maintain hierarchy in data structures
- Maintain list for downstream processing
- Support filtering and querying by other commands
- Include all tickets (epics, stories, child stories) in memory structures

### Step 13: Handle Errors

Handle the following error scenarios with **enhanced error handling for debugging**:

- **Invalid Input Format**: 
  - Detect invalid input format (not JQL, not issue key, not filter ID)
  - Log detailed error: "Invalid input format: [input]. Expected JQL query, filter ID, or issue key(s)"
  - Provide guidance on valid input formats
  - Continue processing if possible (e.g., skip invalid issue keys in multiple keys input)

- **Invalid JQL Syntax**: 
  - Return syntax error with guidance
  - Log detailed error: "Invalid JQL syntax: [jql]. [guidance]"
  - Include context: input, cloudId, error type

- **Filter Not Found**: 
  - Return error if filter ID doesn't exist
  - Log detailed error: "Filter [filterId] not found: [error details]"
  - Include context: filterId, cloudId, error type

- **Filter Type Detection Failures**: 
  - Handle filter type detection failures gracefully
  - Fallback to generic filter processing when type cannot be determined
  - Log informative message: "Could not determine filter type, using generic processing"
  - Continue processing with comprehensive analysis

- **Empty Filter Results** (NOT an error):
  - Do not consider this as an error
  - Log informative message: "Filter returned 0 matching tickets"
  - Return empty array
  - Still create summary file with empty results information

- **Epic Processing Errors**:
  - Handle errors when processing epics (Phase 4)
  - Log detailed error: "Error processing epic [key]: [error]"
  - Continue processing other epics despite errors
  - Mark failed epics in data structures with error information

- **Linked Content Processing Errors**:
  - Handle errors when processing linked content (Phase 6)
  - Log detailed error: "Error processing linked content for [key]: [error]"
  - Continue processing other tickets despite errors
  - Mark failed linked content in data structures with error information

- **Requirements Analysis Errors**:
  - Handle errors when processing requirements analysis (phases 5-8)
  - Log detailed error: "Error in requirements analysis for [key]: [error]"
  - Continue processing other tickets despite errors
  - Mark failed tickets in data structures with error information

- **MCP Server Error**: 
  - Return connection error
  - Log detailed error: "MCP server error: [error details]"
  - Include context: cloudId, tool name, error type

- **Network/Timeout**: 
  - Return timeout error with retry guidance
  - Log detailed error: "Network/timeout error: [error details]"
  - Include context: operation, retry guidance

- **Process Continuation**:
  - Verify process continues when individual tickets fail
  - Verify process continues when epics fail
  - Verify process continues when linked content fails
  - Verify all accessible tickets are processed
  - Ensure filter structures are updated even with partial failures

### Step 14: Optional Debug Export

If debug mode is enabled:

- Export filter results to markdown file
- Use filename format: `filter-{filterId}.md` or `jql-{hash}.md` or `keys-{hash}.md`
- Include all tickets (including child stories) in export
- Include filter type information
- Include statistics and metrics
- Follow agent-os markdown standards

## Important Constraints

- **Input Parameter**: Support JQL query, filter ID, or Jira issue key(s) (single or multiple)
- **Filter Type Detection**: Automatically detect filter type (epic, sprint, release) from input and route accordingly
- **Child Story Processing**: Automatically process child stories recursively when epics detected (using Phase 4)
- **Linked Content Processing**: Automatically process linked content for all tickets (using Phase 6)
- **Requirements Analysis**: Automatically process all tickets through requirements analysis workflow (phases 5-8)
- **Scope Analysis**: Generate comprehensive scope analysis reports for entire filter scope
- **Summary Files**: Create summary files for entire filter scope
- **Context-Aware**: Use "release" folder for all filters (`agent-qa/release/`)
- **Retrieve ALL matching tickets**: No pagination limits, include child stories
- **Empty results**: Return empty array, not error
- **Each ticket fully processed**: All metadata, child stories, linked content, requirements analysis
- **Large result sets**: Handle efficiently with pagination and batching
- **Error Handling**: Log errors for debugging without failing entire process
- **Process Continuation**: Continue processing accessible tickets despite errors
- **Backward Compatibility**: Maintain backward compatibility with existing Phase 3 functionality

## Output Format

On success, output:

```
✅ Filter processed successfully
✅ Filter type detected: [epic/sprint/release/generic]
✅ Retrieved 25 tickets matching filter
✅ Detected 3 epics in filter results
✅ Processed 12 child stories recursively (max depth: 3)
✅ Processed linked content for all tickets
✅ Processed all tickets through requirements analysis workflow (phases 5-8)
✅ Generated comprehensive scope analysis report
✅ Generated summary file for entire filter scope
✅ All tickets transformed and stored in memory

[Optional: Debug export created at filter-12345.md]
```

On empty results, output:

```
ℹ️ Filter returned 0 matching tickets (not an error)
✅ Empty result set stored (ready for downstream processing)
✅ Generated summary file with empty results information
```

On partial success (some tickets/epics failed), output:

```
✅ Filter processed with partial success
✅ Retrieved 20 tickets successfully
⚠️ 2 epics failed processing: EPIC-123, EPIC-124 (errors logged for debugging)
✅ Retrieved 10 child stories successfully
✅ Processed accessible tickets through requirements analysis workflow
✅ Generated scope analysis report (partial results)
✅ Process continued despite errors

[Error details logged for debugging: epic EPIC-123 - permissions error, epic EPIC-124 - deleted]
```

On error, output:

```
❌ Error processing filter: [error message]

[Error details and troubleshooting guidance]
[Context: input, filter type, cloudId, error type, processing step]
```

