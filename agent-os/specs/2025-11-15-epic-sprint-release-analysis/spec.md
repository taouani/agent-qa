# Specification: Epic, Sprint, and Release Analysis

## Goal

Enhance Phase 3 of the Atlassian integration workflow to automatically detect filter types (epic, sprint, or release) from input parameters (JQL query or Jira issue keys), process all related tickets with comprehensive scope analysis including recursive child story processing, linked content analysis, and full requirements analysis workflow, and generate comprehensive scope analysis reports with summary files for the entire filter scope.

## User Stories

- As a QA Analyst, I want filters automatically analyzed with comprehensive scope coverage so that I have complete requirement visibility for epics, sprints, and releases without manual investigation
- As a QA Manager, I want all tickets in filters processed through the full requirements analysis workflow so that I can ensure comprehensive test coverage for entire scopes
- As a Release Manager, I want comprehensive scope analysis reports generated for filters so that I have full visibility into release/sprint/epic scope with all dependencies and relationships
- As a QA Analyst, I want child stories and linked content automatically processed when epics are detected so that I capture complete requirement context automatically

## Specific Requirements

**Workflow Integration**
- Enhance existing Phase 3 (`3-process-filter.md`) workflow in the Atlassian integration command
- Detect filter types (epic, sprint, release) from input and route accordingly
- Integrate seamlessly into existing Phase 3 workflow without breaking changes
- Automatically trigger Phase 4 (child story processing), Phase 6 (linked content), and phases 5-8 (requirements analysis)
- Store all outputs in `agent-qa/release/` folder for all filter types
- Use context-aware terminology ("release" for all filters)

**Input Parameter Processing**
- Accept string input representing JQL query (Jira filter) or Jira issue key
- Support single Jira issue key (e.g., "PROJ-123")
- Support multiple Jira issue keys (e.g., "PROJ-123, PROJ-124, PROJ-125" or array format)
- Support JQL query strings (e.g., "project = PROJ AND sprint = 123")
- Validate input format before proceeding
- Handle both filter ID and JQL query input types

**Filter Type Detection**
- Analyze input to detect filter type (epic, sprint, release)
- Detect epic filters: Identify epics in results and process accordingly
- Detect sprint filters: Identify sprint context and process all tickets
- Detect release filters: Identify release context (fixVersion or similar) and process all tickets
- Route processing based on detected filter type
- Support generic filter processing when type cannot be determined

**Epic Filter Processing**
- Process all epics found in filter results
- Automatically process child stories recursively for each epic (using Phase 4 logic)
- Process linked content for all tickets including epics and child stories (using Phase 6 logic)
- Process all tickets through requirements analysis workflow (phases 5-8)
- Generate deliverables for entire filter scope
- Create summary files for entire epic filter scope

**Sprint Filter Processing**
- Process all tickets in the sprint
- Identify epics within the sprint and process their child stories recursively
- Process linked content for all tickets (using Phase 6 logic)
- Process all tickets through requirements analysis workflow (phases 5-8)
- Generate deliverables for entire sprint scope
- Create summary files for entire sprint filter scope

**Release Filter Processing**
- Process all tickets in the release (via fixVersion or similar fields)
- Identify epics within the release and process their child stories recursively
- Process linked content for all tickets (using Phase 6 logic)
- Process all tickets through requirements analysis workflow (phases 5-8)
- Generate deliverables for entire release scope
- Create summary files for entire release filter scope

**Automatic Child Story Processing**
- Automatically detect epics in filter results
- Trigger Phase 4 processing for each detected epic
- Process child stories recursively using enhanced Phase 4 logic
- Include child stories in analysis scope
- Process child stories through phases 5-8 automatically
- Maintain hierarchy and relationships in data structures

**Automatic Linked Content Processing**
- Automatically process linked issues for all tickets (using Phase 6 logic)
- Automatically process linked Confluence pages for all tickets (using Phase 6 logic)
- Process linked content for epics, stories, and child stories
- Integrate linked content into requirement structures
- Maintain links between tickets and linked content

**Automatic Requirements Analysis**
- Process all tickets through Phase 5 (Analyze Requirements)
- Process all tickets through Phase 6 (Analyze Linked Content)
- Process all tickets through Phase 7 (Perform Quality Analysis)
- Process all tickets through Phase 8 (Generate Requirement Files)
- Generate deliverables for entire filter scope
- Include all tickets (epics, stories, child stories) in requirements analysis

**Comprehensive Scope Analysis Reports**
- Generate comprehensive scope analysis reports for entire filter scope
- Include ticket statistics (total tickets, epics, stories, child stories)
- Include relationship analysis (dependencies, hierarchies)
- Include coverage analysis (requirements completeness, acceptance criteria coverage)
- Include quality metrics (completeness scores, quality scores)
- Include summary of all deliverables generated

**Summary File Generation**
- Create summary files for entire filter scope
- Include overview of filter scope and context
- Include statistics and metrics
- Include links to individual requirement files
- Include links to generated deliverables (test cases, test plans, strategies, charters, risk registers)
- Format summary files according to agent-os markdown standards

**Data Processing and Storage**
- Process all tickets in memory during Phase 3
- Store all outputs in `agent-qa/release/` folder for all filter types
- Maintain ticket relationships and hierarchies in data structures
- Support data access patterns for downstream phases
- Store comprehensive scope analysis data

**Command Structure Integration**
- Enhance existing Phase 3 instruction file (`3-process-filter.md`)
- Follow agent-os command patterns and workflow structure
- Comply with agent-os standards and conventions
- Maintain backward compatibility with existing Phase 3 functionality
- Integrate seamlessly with phases 4, 5-8 for comprehensive processing

**Error Handling**
- Handle invalid input format gracefully
- Handle filter type detection failures (fallback to generic processing)
- Handle empty filter results gracefully (not an error)
- Log errors for debugging purpose without failing entire process
- Continue processing accessible tickets despite errors
- Provide informative error messages for debugging

**MCP Tool Integration**
- Use `mcp_Atlassian_searchJiraIssuesUsingJql` for JQL queries
- Use `mcp_Atlassian_getJiraIssue` for retrieving individual ticket details
- Handle pagination for large result sets
- Process queries efficiently to minimize MCP server calls
- Support both filter ID and JQL query input types

## Visual Design

No visual assets provided.

## Existing Code to Leverage

**Phase 3 - Process Jira Filter (Release)**
- Enhance existing `agent-qa/commands/atlassian-integration/3-process-filter.md` workflow
- Leverage existing filter processing logic (Steps 1-3)
- Enhance existing ticket processing logic (Step 5) to detect epics and trigger Phase 4
- Enhance existing workflow to automatically trigger Phase 6 and phases 5-8
- Follow existing error handling patterns from Phase 3

**Phase 4 - Process Epic and Child Stories**
- Leverage existing Phase 4 for recursive child story processing
- Use existing epic identification logic
- Use existing dual detection method (Epic Link JQL and parent-child relationships)
- Use existing recursive hierarchy processing
- Use existing relationship preservation logic

**Phase 6 - Analyze Linked Content**
- Leverage existing Phase 6 for linked content processing
- Use existing linked issue analysis logic
- Use existing Confluence page analysis logic
- Use existing content integration patterns

**Requirements Analysis Engine**
- Leverage phases 5-8 for analyzing all tickets through full requirements analysis workflow
- Use existing requirement structure patterns from phases 5-8
- Follow existing data structure patterns for storing requirements
- Use existing quality analysis patterns (Phase 7)
- Use existing requirement file generation patterns (Phase 8)

**Atlassian MCP Server Integration**
- Use existing MCP connection from Phase 1
- Use `cloudId` from Phase 1 for MCP tool calls
- Follow existing MCP tool usage patterns (`searchJiraIssuesUsingJql`, `getJiraIssue`)
- Leverage existing JQL query patterns for ticket retrieval
- Use existing pagination handling patterns

**Agent-OS Command Structure Patterns**
- Reference `/Users/taouani/Projects/ai-agents/agent-os` for workflow enhancement patterns
- Follow numbered instruction file structure (enhance existing Phase 3)
- Use workflow integration patterns from existing agent-os commands
- Adopt error handling patterns from agent-os standards
- Follow data processing patterns from agent-os workflows

**Error Handling Standards**
- Follow error handling patterns from `agent-os/standards/global/error-handling.md`
- Use consistent error message formatting from Phase 3
- Apply validation patterns from `agent-os/standards/global/validation.md`
- Follow graceful degradation patterns for missing data
- Log errors for debugging without failing process

## Out of Scope

- Separate folders per filter type (epic/, sprint/) - use "release" for all filters
- Standalone epic/sprint/release processing capability (enhance Phase 3 only)
- Manual filter type specification (automatic detection from input)
- Different processing logic per filter type (same comprehensive processing for all)
- Individual ticket/requirement files only (summary files required in addition)
- Generating test cases, test plans, strategies, charters, risk registers for filter scope (only requirements analysis workflow phases 5-8)
- Custom filter type detection methods beyond input analysis
- Processing filters without comprehensive scope analysis

