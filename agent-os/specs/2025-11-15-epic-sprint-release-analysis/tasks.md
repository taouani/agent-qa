# Task Breakdown: Epic, Sprint, and Release Analysis

## Overview
Total Tasks: 8 task groups

## Task List

### Workflow Enhancement Layer

#### Task Group 1: Enhance Phase 3 Instruction File
**Dependencies:** None

- [x] 1.0 Enhance existing Phase 3 instruction file for epic/sprint/release analysis
  - [x] 1.1 Review current Phase 3 implementation (`3-process-filter.md`)
    - Understand existing filter processing logic (Steps 1-3)
    - Understand existing ticket processing logic (Step 5)
    - Understand existing error handling patterns
    - Identify areas for enhancement
  - [x] 1.2 Update Step 1: Determine Input Type
    - Enhance to support JQL query or Jira issue key (single or multiple)
    - Document input parameter format (string: JQL query or issue key(s))
    - Add validation for single issue key format
    - Add validation for multiple issue keys format (comma-separated or array)
    - Add validation for JQL query format
    - Handle both filter ID and JQL query input types
  - [x] 1.3 Add Step: Detect Filter Type
    - Add new step to detect filter type (epic, sprint, release) from input
    - Analyze input to identify filter type
    - Detect epic filters: Identify epics in results
    - Detect sprint filters: Identify sprint context
    - Detect release filters: Identify release context (fixVersion or similar)
    - Support generic filter processing when type cannot be determined
    - Route processing based on detected filter type
  - [x] 1.4 Enhance Step 5: Process Each Ticket
    - Update to detect epics in filter results
    - Add logic to trigger Phase 4 for each detected epic
    - Document automatic child story processing integration
    - Document automatic linked content processing integration
    - Document automatic requirements analysis integration
  - [x] 1.5 Add Step: Process Child Stories Recursively
    - Add step to automatically process child stories when epics detected
    - Trigger Phase 4 processing for each detected epic
    - Process child stories recursively using enhanced Phase 4 logic
    - Include child stories in analysis scope
    - Maintain hierarchy and relationships in data structures
  - [x] 1.6 Add Step: Process Linked Content
    - Add step to automatically process linked content for all tickets
    - Trigger Phase 6 processing for all tickets (epics, stories, child stories)
    - Process linked issues for all tickets
    - Process linked Confluence pages for all tickets
    - Integrate linked content into requirement structures
  - [x] 1.7 Add Step: Process Requirements Analysis
    - Add step to automatically process all tickets through phases 5-8
    - Trigger Phase 5 (Analyze Requirements) for all tickets
    - Trigger Phase 6 (Analyze Linked Content) for all tickets
    - Trigger Phase 7 (Perform Quality Analysis) for all tickets
    - Trigger Phase 8 (Generate Requirement Files) for all tickets
    - Generate deliverables for entire filter scope
  - [x] 1.8 Add Step: Generate Scope Analysis Reports
    - Add step to generate comprehensive scope analysis reports
    - Include ticket statistics (total tickets, epics, stories, child stories)
    - Include relationship analysis (dependencies, hierarchies)
    - Include coverage analysis (requirements completeness, acceptance criteria coverage)
    - Include quality metrics (completeness scores, quality scores)
    - Include summary of all deliverables generated
  - [x] 1.9 Add Step: Generate Summary Files
    - Add step to create summary files for entire filter scope
    - Include overview of filter scope and context
    - Include statistics and metrics
    - Include links to individual requirement files
    - Include links to generated deliverables
    - Format summary files according to agent-os markdown standards
  - [x] 1.10 Enhance Error Handling
    - Update to handle invalid input format gracefully
    - Update to handle filter type detection failures (fallback to generic processing)
    - Update to handle empty filter results gracefully (not an error)
    - Add error logging for debugging purposes
    - Ensure errors do not fail entire process
    - Provide informative error messages for debugging

**Acceptance Criteria:**
- Phase 3 instruction file enhanced with input parameter processing
- Filter type detection documented and implemented
- Automatic child story processing integration documented
- Automatic linked content processing integration documented
- Automatic requirements analysis integration documented
- Scope analysis report generation documented
- Summary file generation documented
- Error handling enhanced for debugging without failing process
- Backward compatibility maintained with existing Phase 3 functionality

### Input Processing Layer

#### Task Group 2: Implement Input Parameter Processing
**Dependencies:** Task Group 1

- [x] 2.0 Implement input parameter processing for JQL queries and issue keys
  - [x] 2.1 Support JQL Query Input
    - Accept string input representing JQL query
    - Validate JQL query format
    - Handle JQL query strings (e.g., "project = PROJ AND sprint = 123")
    - Process JQL queries using existing MCP tool patterns
  - [x] 2.2 Support Single Issue Key Input
    - Accept string input representing single Jira issue key
    - Validate issue key format (e.g., "PROJ-123")
    - Convert single issue key to JQL query: `key = PROJ-123`
    - Process single issue key using MCP tools
  - [x] 2.3 Support Multiple Issue Keys Input
    - Accept string input representing multiple Jira issue keys
    - Support comma-separated format (e.g., "PROJ-123, PROJ-124, PROJ-125")
    - Support array format if applicable
    - Parse multiple issue keys from input string
    - Convert multiple issue keys to JQL query: `key IN (PROJ-123, PROJ-124, PROJ-125)`
    - Process multiple issue keys using MCP tools
  - [x] 2.4 Validate Input Format
    - Validate input format before proceeding
    - Detect if input is JQL query or issue key(s)
    - Provide informative error messages for invalid input
    - Handle edge cases (empty input, malformed keys, invalid JQL)

**Acceptance Criteria:**
- JQL query input supported and validated
- Single issue key input supported and validated
- Multiple issue keys input supported and validated
- Input format validation implemented correctly
- Error handling for invalid input implemented

### Filter Type Detection Layer

#### Task Group 3: Implement Filter Type Detection
**Dependencies:** Task Group 2

- [x] 3.0 Implement filter type detection from input
  - [x] 3.1 Analyze Input for Filter Type
    - Analyze input to detect filter type (epic, sprint, release)
    - Detect epic filters: Identify epics in results
    - Detect sprint filters: Identify sprint context from JQL or ticket fields
    - Detect release filters: Identify release context (fixVersion or similar fields)
    - Support generic filter processing when type cannot be determined
  - [x] 3.2 Detect Epic Filters
    - Identify epics in filter results (issue type = "Epic")
    - Analyze JQL query for epic-related patterns
    - Detect epic context from ticket fields
    - Route to epic filter processing logic
  - [x] 3.3 Detect Sprint Filters
    - Identify sprint context from JQL query (sprint field)
    - Identify sprint context from ticket fields (Sprint field)
    - Detect sprint-related patterns in input
    - Route to sprint filter processing logic
  - [x] 3.4 Detect Release Filters
    - Identify release context from JQL query (fixVersion field)
    - Identify release context from ticket fields (fixVersion field)
    - Detect release-related patterns in input
    - Route to release filter processing logic
  - [x] 3.5 Route Processing Based on Filter Type
    - Route to epic filter processing when epics detected
    - Route to sprint filter processing when sprint detected
    - Route to release filter processing when release detected
    - Fallback to generic filter processing when type cannot be determined
    - Ensure all filter types use same comprehensive processing

**Acceptance Criteria:**
- Filter type detection implemented correctly
- Epic filters detected and routed correctly
- Sprint filters detected and routed correctly
- Release filters detected and routed correctly
- Generic filter processing fallback implemented
- Routing logic works correctly for all filter types

### Child Story Processing Integration Layer

#### Task Group 4: Integrate Automatic Child Story Processing
**Dependencies:** Task Group 3

- [x] 4.0 Integrate automatic child story processing when epics detected
  - [x] 4.1 Detect Epics in Filter Results
    - Identify epic tickets in filter results (issue type = "Epic")
    - Track all detected epics for processing
    - Maintain epic context in data structures
  - [x] 4.2 Trigger Phase 4 for Each Epic
    - Automatically trigger Phase 4 processing for each detected epic
    - Use existing Phase 4 logic for recursive child story processing
    - Process child stories recursively using enhanced Phase 4 logic
    - Include child stories in analysis scope
  - [x] 4.3 Process Child Stories Recursively
    - Process child stories recursively for each epic
    - Use dual detection method (Epic Link JQL and parent-child relationships)
    - Handle multiple hierarchy levels automatically
    - Maintain hierarchy and relationships in data structures
  - [x] 4.4 Include Child Stories in Analysis Scope
    - Add child stories to filter results for comprehensive analysis
    - Maintain parent-child relationships
    - Preserve hierarchy in data structures
    - Ensure child stories are processed through all phases

**Acceptance Criteria:**
- Epics detected in filter results correctly
- Phase 4 triggered automatically for each epic
- Child stories processed recursively using Phase 4 logic
- Child stories included in analysis scope
- Hierarchy and relationships maintained correctly

### Linked Content Processing Integration Layer

#### Task Group 5: Integrate Automatic Linked Content Processing
**Dependencies:** Task Group 3

- [x] 5.0 Integrate automatic linked content processing for all tickets
  - [x] 5.1 Trigger Phase 6 for All Tickets
    - Automatically trigger Phase 6 processing for all tickets
    - Process linked content for epics, stories, and child stories
    - Use existing Phase 6 logic for linked content processing
  - [x] 5.2 Process Linked Issues
    - Process linked issues for all tickets using Phase 6 logic
    - Retrieve and analyze linked issues referenced in tickets
    - Integrate linked issues into requirement structures
    - Maintain links between tickets and linked issues
  - [x] 5.3 Process Linked Confluence Pages
    - Process linked Confluence pages for all tickets using Phase 6 logic
    - Retrieve and analyze linked Confluence pages referenced in tickets
    - Integrate Confluence content into requirement structures
    - Maintain links between tickets and Confluence pages
  - [x] 5.4 Integrate Linked Content into Requirement Structures
    - Add linked content to requirement structures for all tickets
    - Maintain requirement-to-linked-content relationships
    - Ensure linked content is accessible for downstream phases

**Acceptance Criteria:**
- Phase 6 triggered automatically for all tickets
- Linked issues processed for all tickets correctly
- Linked Confluence pages processed for all tickets correctly
- Linked content integrated into requirement structures
- Links maintained between tickets and linked content

### Requirements Analysis Integration Layer

#### Task Group 6: Integrate Automatic Requirements Analysis
**Dependencies:** Task Groups 4, 5

- [x] 6.0 Integrate automatic requirements analysis for all tickets
  - [x] 6.1 Process All Tickets Through Phase 5 (Analyze Requirements)
    - Automatically trigger Phase 5 for all tickets (epics, stories, child stories)
    - Extract requirements from all tickets
    - Structure requirements for all tickets
    - Store requirement structures in memory
  - [x] 6.2 Process All Tickets Through Phase 6 (Analyze Linked Content)
    - Automatically trigger Phase 6 for all tickets (already integrated in Task Group 5)
    - Ensure linked content is analyzed for all tickets
    - Integrate linked content into requirement structures
  - [x] 6.3 Process All Tickets Through Phase 7 (Perform Quality Analysis)
    - Automatically trigger Phase 7 for all tickets
    - Perform requirement completeness checks for all tickets
    - Generate completeness scores for all tickets
    - Perform requirement quality scoring for all tickets
  - [x] 6.4 Process All Tickets Through Phase 8 (Generate Requirement Files)
    - Automatically trigger Phase 8 for all tickets
    - Generate individual requirement markdown files for all tickets
    - Create summary index file including all tickets
    - Format requirement files according to agent-os standards
    - Write requirement files to `agent-qa/release/` folder
  - [x] 6.5 Generate Deliverables for Entire Filter Scope
    - Generate deliverables for entire filter scope (not just individual tickets)
    - Include all tickets (epics, stories, child stories) in deliverables
    - Ensure deliverables reflect comprehensive filter scope

**Acceptance Criteria:**
- All tickets processed through Phase 5 correctly
- All tickets processed through Phase 6 correctly
- All tickets processed through Phase 7 correctly
- All tickets processed through Phase 8 correctly
- Deliverables generated for entire filter scope
- All tickets included in requirements analysis

### Scope Analysis Report Generation Layer

#### Task Group 7: Implement Comprehensive Scope Analysis Reports
**Dependencies:** Task Group 6

- [x] 7.0 Implement comprehensive scope analysis report generation
  - [x] 7.1 Generate Ticket Statistics
    - Calculate total tickets in filter scope
    - Count epics, stories, child stories separately
    - Calculate statistics by ticket type
    - Include statistics in scope analysis report
  - [x] 7.2 Generate Relationship Analysis
    - Analyze dependencies between tickets
    - Analyze hierarchies (epic → story → sub-task)
    - Identify relationship patterns
    - Include relationship analysis in scope analysis report
  - [x] 7.3 Generate Coverage Analysis
    - Analyze requirements completeness across filter scope
    - Calculate acceptance criteria coverage
    - Identify gaps in requirements
    - Include coverage analysis in scope analysis report
  - [x] 7.4 Generate Quality Metrics
    - Aggregate completeness scores across filter scope
    - Aggregate quality scores across filter scope
    - Calculate average and distribution metrics
    - Include quality metrics in scope analysis report
  - [x] 7.5 Include Deliverables Summary
    - List all deliverables generated for filter scope
    - Include links to generated deliverables
    - Summarize deliverable contents
    - Include deliverables summary in scope analysis report
  - [x] 7.6 Format Scope Analysis Report
    - Format report according to agent-os markdown standards
    - Include all sections (statistics, relationships, coverage, quality, deliverables)
    - Write report to `agent-qa/release/` folder
    - Use descriptive filename (e.g., `scope-analysis-report.md`)

**Acceptance Criteria:**
- Ticket statistics generated correctly
- Relationship analysis generated correctly
- Coverage analysis generated correctly
- Quality metrics generated correctly
- Deliverables summary included correctly
- Scope analysis report formatted and written correctly

### Summary File Generation Layer

#### Task Group 8: Implement Summary File Generation
**Dependencies:** Task Group 7

- [x] 8.0 Implement summary file generation for entire filter scope
  - [x] 8.1 Create Summary File Structure
    - Define summary file structure and sections
    - Include overview of filter scope and context
    - Include filter type information (epic, sprint, release)
    - Include input parameter information
  - [x] 8.2 Include Statistics and Metrics
    - Include ticket statistics from scope analysis report
    - Include quality metrics from scope analysis report
    - Include coverage metrics from scope analysis report
    - Format statistics and metrics clearly
  - [x] 8.3 Include Links to Individual Requirement Files
    - Generate links to individual requirement files for all tickets
    - Organize links by ticket type (epics, stories, child stories)
    - Format links according to markdown standards
    - Include links in summary file
  - [x] 8.4 Include Links to Generated Deliverables
    - Generate links to all generated deliverables
    - Include links to requirement files (Phase 8)
    - Include links to scope analysis report (Task Group 7)
    - Include links to any other generated deliverables
    - Format links according to markdown standards
  - [x] 8.5 Format and Write Summary File
    - Format summary file according to agent-os markdown standards
    - Write summary file to `agent-qa/release/` folder
    - Use descriptive filename (e.g., `filter-summary.md` or `scope-summary.md`)
    - Ensure summary file is comprehensive and well-organized

**Acceptance Criteria:**
- Summary file structure created correctly
- Statistics and metrics included correctly
- Links to individual requirement files included correctly
- Links to generated deliverables included correctly
- Summary file formatted and written correctly

## Execution Order

Recommended implementation sequence:
1. Workflow Enhancement Layer (Task Group 1)
2. Input Processing Layer (Task Group 2)
3. Filter Type Detection Layer (Task Group 3)
4. Child Story Processing Integration Layer (Task Group 4) - can be parallel with Task Group 5 after Task Group 3
5. Linked Content Processing Integration Layer (Task Group 5) - can be parallel with Task Group 4 after Task Group 3
6. Requirements Analysis Integration Layer (Task Group 6) - depends on Task Groups 4 and 5
7. Scope Analysis Report Generation Layer (Task Group 7) - depends on Task Group 6
8. Summary File Generation Layer (Task Group 8) - depends on Task Group 7

## Important Notes

- This is an enhancement to existing Phase 3 (`3-process-filter.md`), not a new phase
- Support input parameter: JQL query or Jira issue key (single or multiple keys)
- Detect filter types (epic, sprint, release) from input and route accordingly
- Automatically process child stories recursively when epics detected (using Phase 4)
- Automatically process linked content for all tickets (using Phase 6)
- Automatically process all tickets through requirements analysis workflow (phases 5-8)
- Generate comprehensive scope analysis reports for entire filter scope
- Create summary files for entire filter scope
- Use "release" folder for all filters (`agent-qa/release/`)
- Generate deliverables for entire filter scope
- Maintain backward compatibility with existing Phase 3 functionality
- Follow agent-os patterns from `/Users/taouani/Projects/ai-agents/agent-os`

