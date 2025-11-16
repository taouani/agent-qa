# Specification: Child Story Processing

## Goal

Enhance Phase 4 of the Atlassian integration workflow to automatically detect and process all child stories when analyzing epics, ensuring complete requirement coverage across hierarchical ticket structures. The feature will recursively search for child stories at multiple hierarchy levels, analyze them through the full requirements analysis workflow (phases 5-8), and integrate them into the epic's requirement structure while maintaining hierarchy and relationships.

## User Stories

- As a QA Analyst, I want child stories automatically detected and processed when analyzing epics so that I have complete requirement coverage without manual investigation
- As a QA Manager, I want child stories analyzed through the full requirements analysis workflow so that I can ensure comprehensive test coverage for all hierarchical requirements
- As a Release Manager, I want child stories included in epic requirement structures so that I have full traceability from epics to stories to sub-tasks
- As a QA Analyst, I want child stories processed recursively at multiple levels so that I capture all nested requirements automatically

## Specific Requirements

**Workflow Integration**
- Enhance existing Phase 4 (`4-process-epic.md`) workflow in the Atlassian integration command
- Automatically trigger child story processing when an epic is detected
- Integrate seamlessly into existing Phase 4 workflow without breaking changes
- Process child stories through the full requirements analysis workflow (phases 5-8)
- Store child story data in context-aware folders (`agent-qa/requirement/` or `agent-qa/release/`)
- Use context-aware terminology ("requirement" vs "release") for child stories

**Dual Detection Method**
- Use both JQL queries with "Epic Link" field to find stories linked to epics
- Use parent-child relationships (parent field) to find child tickets
- Support both epic-link and parent-child relationship types simultaneously
- Handle different Jira configurations (classic vs. next-gen projects) through both methods
- Combine results from both detection methods to ensure complete coverage

**Recursive Hierarchy Processing**
- Handle multiple hierarchy levels automatically (epic → story → sub-task → deeper nesting)
- Search recursively if possible to discover all nested child tickets
- Process epic → story relationships
- Process story → sub-task relationships
- Support deeper nesting levels automatically
- Build complete hierarchical data structures preserving all levels

**Automatic Processing Trigger**
- Automatically process child stories when an epic is detected
- Process child stories for single epic tickets
- Process child stories for all epics in a filter/release
- Process child stories when analyzing filters that contain epics
- No manual triggering required - fully automatic

**Child Story Analysis**
- Analyze child stories through the full requirements analysis workflow (phases 5-8)
- Extract child story details (summary, description, acceptance criteria)
- Perform requirements extraction and structuring (Phase 5)
- Analyze linked content for child stories (Phase 6)
- Perform quality analysis for child stories (Phase 7)
- Generate requirement files for child stories (Phase 8)
- Include child stories in epic's requirement structure

**Relationship Preservation**
- Preserve epic → story → sub-task hierarchy in data structures
- Support both epic-link and parent-child relationship types
- Include relationship metadata (hierarchy level, relationship type)
- Maintain links between parent and child tickets
- Store relationship information in requirement structures
- Track hierarchy depth (epic=0, story=1, sub-task=2, etc.)

**Output Structure**
- Support both nested structures (epic contains stories, stories contain sub-tasks)
- Include child stories in the epic's requirement structure
- Generate deliverables for child stories through phases 5-8
- Create requirement files for each child story
- Maintain hierarchical relationships in output files
- Group deliverables by epic while preserving child story individual files

**Error Handling**
- Epic with no linked stories should not be considered as an error
- Log errors for debugging purpose when child stories cannot be retrieved (permissions, deleted)
- Log errors for debugging purpose when missing or invalid epic links are encountered
- Log errors for debugging purpose when large hierarchies encounter processing issues
- Do not fail the entire process when errors occur - continue processing
- Provide informative error messages for debugging
- Mark inaccessible child stories in data structures with error information

**MCP Tool Integration**
- Use `mcp_Atlassian_searchJiraIssuesUsingJql` for Epic Link queries (`"Epic Link" = EPIC-123`)
- Use `mcp_Atlassian_searchJiraIssuesUsingJql` for parent-child queries (`parent = EPIC-123`)
- Use `mcp_Atlassian_getJiraIssue` for retrieving child story details
- Handle pagination for large result sets
- Process queries efficiently to minimize MCP server calls

**Data Processing and Storage**
- Process child stories in memory during Phase 4
- Store child stories in epic's requirement structure
- Maintain parent-child relationships in data structures
- Support recursive processing for nested hierarchies
- Store child story data in context-aware folders
- Maintain data access patterns for downstream phases (5-8)

**Command Structure Integration**
- Enhance existing Phase 4 instruction file (`4-process-epic.md`)
- Follow agent-os command patterns and workflow structure
- Comply with agent-os standards and conventions
- Maintain backward compatibility with existing Phase 4 functionality
- Integrate seamlessly with phases 5-8 for child story analysis

## Visual Design

No visual assets provided.

## Existing Code to Leverage

**Phase 4 - Process Epic and Child Stories**
- Enhance existing `agent-qa/commands/atlassian-integration/4-process-epic.md` workflow
- Leverage existing epic identification logic (Step 1)
- Enhance existing child story retrieval logic (Step 2) to use both detection methods
- Enhance existing nested structure processing logic (Step 3) to support recursive search
- Enhance existing relationship preservation logic (Step 6) to support both relationship types
- Follow existing error handling patterns from Phase 4

**Requirements Analysis Engine**
- Leverage phases 5-8 for analyzing child stories through full requirements analysis workflow
- Use existing requirement structure patterns from phases 5-8
- Follow existing data structure patterns for storing child story requirements
- Use existing linked content analysis patterns (Phase 6) for child stories
- Use existing quality analysis patterns (Phase 7) for child stories
- Use existing requirement file generation patterns (Phase 8) for child stories

**Atlassian MCP Server Integration**
- Use existing MCP connection from Phase 1
- Use `cloudId` from Phase 1 for MCP tool calls
- Follow existing MCP tool usage patterns (`searchJiraIssuesUsingJql`, `getJiraIssue`)
- Leverage existing JQL query patterns for ticket retrieval
- Use existing pagination handling patterns

**Agent-OS Command Structure Patterns**
- Reference `/Users/taouani/Projects/ai-agents/agent-os` for workflow enhancement patterns
- Follow numbered instruction file structure (enhance existing Phase 4)
- Use workflow integration patterns from existing agent-os commands
- Adopt error handling patterns from agent-os standards
- Follow data processing patterns from agent-os workflows

**Error Handling Standards**
- Follow error handling patterns from `agent-os/standards/global/error-handling.md`
- Use consistent error message formatting from Phase 4
- Apply validation patterns from `agent-os/standards/global/validation.md`
- Follow graceful degradation patterns for missing data
- Log errors for debugging without failing process

## Out of Scope

- Generating test cases for child stories (phases 9-11) - only phases 5-8 (requirements analysis workflow)
- Generating all deliverables (test plans, strategies, charters, risk registers) for child stories - only requirements analysis workflow (phases 5-8)
- Standalone child story processing capability (enhance Phase 4 only, not separate command)
- Manual triggering for specific epics (automatic only)
- Custom epic link fields (use standard Epic Link field and parent field)
- Different Jira configurations handling beyond using both standard methods
- Circular reference detection and handling (mentioned but not explicitly handled)
- Processing child stories independently without epic context
- Analyzing child stories without going through full requirements analysis workflow
- Creating separate child story processing phases (enhance Phase 4 only)

