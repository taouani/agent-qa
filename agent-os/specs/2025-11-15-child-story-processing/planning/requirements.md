# Spec Requirements: Child Story Processing

## Initial Description

Automatically detect and process all child stories when analyzing epics, ensuring complete requirement coverage across hierarchical ticket structures.

## Requirements Discussion

### First Round Questions

**Q1:** Integration Approach: I see that Phase 4 of the Atlassian integration already processes epics and retrieves child stories. Should this feature enhance/extend Phase 4, or should it be a separate capability that can process child stories independently? Or both?

**Answer:** Enhance/extend Phase 4.

**Q2:** Detection Method: How should child stories be detected? Should it:
- Use JQL queries with "Epic Link" field?
- Use parent-child relationships (parent field)?
- Use both methods?
- Support custom epic link fields?
- Handle different Jira configurations (classic vs. next-gen projects)?

**Answer:** Use both methods.

**Q3:** Hierarchy Depth: What level of hierarchy should be processed? Should it:
- Process epic → story only?
- Process epic → story → sub-task (nested structures)?
- Support deeper nesting (if applicable)?
- Handle multiple levels automatically?

**Answer:** Handle multiple levels automatically. Search recursively if possible.

**Q4:** Processing Scope: When should child story processing be triggered? Should it:
- Automatically process child stories when an epic is detected?
- Process child stories when analyzing filters that contain epics?
- Process child stories for single epic tickets?
- Process child stories for all epics in a release/filter?
- Support manual triggering for specific epics?

**Answer:** Automatically process child stories when an epic is detected.

**Q5:** Child Story Analysis: What level of analysis should be performed on child stories? Should it:
- Retrieve child story details (summary, description, acceptance criteria)?
- Analyze child stories through the full requirements analysis workflow (phases 5-8)?
- Generate test cases for child stories (phases 9-11)?
- Generate all deliverables (test plans, strategies, charters, risk registers) for child stories?
- Or just retrieve and include child stories in the epic structure?

**Answer:** Analyze child stories through the full requirements analysis workflow (phases 5-8).

**Q6:** Relationship Preservation: How should parent-child relationships be maintained? Should it:
- Preserve epic → story → sub-task hierarchy in data structures?
- Include relationship metadata (hierarchy level, relationship type)?
- Maintain links between parent and child tickets?
- Support both epic-link and parent-child relationship types?

**Answer:** Support both epic-link and parent-child relationship types.

**Q7:** Output Structure: How should child stories be included in the output? Should it:
- Create nested structures (epic contains stories, stories contain sub-tasks)?
- Create flat structures with relationship references?
- Create separate files for each child story?
- Include child stories in the epic's requirement structure?
- Generate deliverables grouped by epic or individually for each child story?

**Answer:** Support both nested structures (epic contains stories, stories contain sub-tasks) and include child stories in the epic's requirement structure. Generate deliverables for child stories through the full workflow (phases 5-8).

**Q8:** Error Handling: How should the feature handle:
- Epics with no child stories?
- Child stories that cannot be retrieved (permissions, deleted)?
- Circular references in hierarchies?
- Missing or invalid epic links?
- Large hierarchies with many child stories?

**Answer:** Epic with no linked stories should not be considered as an error. For other errors, log the errors for debugging purpose and do not fail the process.

**Q9:** Integration Points: Should child story processing:
- Enhance the existing Phase 4 workflow?
- Add new phases to the Atlassian integration command?
- Be integrated into the requirements analysis workflow (phases 5-8)?
- Support both integrated and standalone usage?

**Answer:** Enhance the existing Phase 4 workflow.

**Q10:** Context-Aware Behavior: Should child story processing respect the context-aware folder creation? Should it:
- Store child story data in `agent-qa/requirement/` when processing a single epic?
- Store child story data in `agent-qa/release/` when processing epics in a filter?
- Use context-aware terminology ("requirement" vs "release") for child stories?

**Answer:** Yes. Yes. Yes.

### Visual Assets

**Files Provided:**
No visual assets provided.

**Visual Insights:**
No visual assets provided.

### Existing Code to Reference

**Similar Features Identified:**
- Feature: Phase 4 - Process Epic and Child Stories - Path: `agent-qa/commands/atlassian-integration/4-process-epic.md` - Already processes epics and retrieves child stories
- Feature: Requirements Analysis Engine - Path: `agent-qa/commands/atlassian-integration/` (phases 5-8) - Analyzes requirements from tickets
- Feature: Test Case Generation - Path: `agent-qa/commands/atlassian-integration/` (phases 9-11) - Generates test cases from requirements
- Command structure patterns: Reference agent-os under `/Users/taouani/Projects/ai-agents/agent-os` for multi-phase command implementation patterns
- Data processing patterns: Follow agent-os patterns for data transformation and storage
- Workflow integration: Integrate into existing Atlassian integration workflow following agent-os command patterns

## Requirements Summary

### Functional Requirements

- **Integration Approach**: Enhance/extend Phase 4 workflow
- **Detection Method**: Use both JQL queries with "Epic Link" field and parent-child relationships (parent field)
- **Hierarchy Depth**: Handle multiple levels automatically, search recursively if possible (epic → story → sub-task → deeper nesting)
- **Processing Scope**: Automatically process child stories when an epic is detected
- **Child Story Analysis**: Analyze child stories through the full requirements analysis workflow (phases 5-8)
- **Relationship Preservation**: Support both epic-link and parent-child relationship types, preserve hierarchy in data structures
- **Output Structure**: Support both nested structures and include child stories in epic's requirement structure, generate deliverables for child stories
- **Error Handling**: Epic with no linked stories is not an error; for other errors, log for debugging and do not fail the process
- **Integration Points**: Enhance existing Phase 4 workflow
- **Context-Aware Behavior**: Store child story data in `agent-qa/requirement/` for single epics, `agent-qa/release/` for filters, use context-aware terminology

### Reusability Opportunities

- **Command Structure**: Enhance existing Phase 4 workflow in `agent-qa/commands/atlassian-integration/4-process-epic.md`
- **MCP Integration**: Use existing Atlassian MCP tools (`searchJiraIssuesUsingJql`, `getJiraIssue`)
- **Requirements Analysis**: Leverage existing phases 5-8 for analyzing child stories
- **Data Processing**: Leverage existing requirement structure patterns
- **Workflow Integration**: Integrate seamlessly into existing Phase 4 workflow
- **Error Handling**: Follow existing error handling patterns from Phase 4

### Scope Boundaries

**In Scope:**
- Enhance Phase 4 to automatically process child stories when epic is detected
- Use both detection methods (Epic Link JQL and parent-child relationships)
- Handle multiple hierarchy levels automatically with recursive search
- Analyze child stories through full requirements analysis workflow (phases 5-8)
- Support both epic-link and parent-child relationship types
- Preserve hierarchy in data structures
- Include child stories in epic's requirement structure
- Generate deliverables for child stories through phases 5-8
- Context-aware folder creation and terminology
- Error handling for debugging without failing process

**Out of Scope:**
- Generating test cases for child stories (phases 9-11) - only phases 5-8 mentioned
- Generating all deliverables (test plans, strategies, charters, risk registers) for child stories - only requirements analysis workflow
- Standalone child story processing capability (enhance Phase 4 only)
- Manual triggering for specific epics (automatic only)
- Custom epic link fields (use standard methods)
- Different Jira configurations handling (use both standard methods)
- Circular reference detection (mentioned but not explicitly handled)

### Technical Considerations

- **MCP Tools**: Use `mcp_Atlassian_searchJiraIssuesUsingJql` for Epic Link queries and parent queries
- **MCP Tools**: Use `mcp_Atlassian_getJiraIssue` for retrieving child story details
- **Integration Point**: Enhance Phase 4 (`4-process-epic.md`) workflow
- **Recursive Processing**: Implement recursive search for multiple hierarchy levels
- **Data Storage**: Store child stories in requirement structures, respect context folders
- **Error Handling**: Log errors for debugging, continue processing despite errors
- **Pattern Reference**: Follow agent-os patterns from `/Users/taouani/Projects/ai-agents/agent-os`

