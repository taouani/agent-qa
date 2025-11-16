# Spec Requirements: Epic, Sprint, and Release Analysis

## Initial Description

Process Jira filters representing epics, sprints, or releases, automatically retrieving all related tickets, child stories, and linked content for comprehensive scope analysis. Use context-aware terminology: "requirement" for single tickets, "release" for release filters, and "sprint" for sprint filters.

## Requirements Discussion

### First Round Questions

**Q1:** Integration Approach: Phase 3 already processes Jira filters. Should this feature enhance/extend Phase 3, or should it be a separate capability that can process epic/sprint/release filters independently? Or both?

**Answer:** Enhance/extend Phase 3.

**Q2:** Filter Type Detection: How should the feature detect if a filter represents an epic, sprint, or release? Should it analyze filter name/keywords, analyze filter JQL content, use filter metadata/custom fields, allow explicit user specification, or support all detection methods?

**Answer:** The agent will have an input parameter, it will be a string representing a JQL query (Jira filter) or a Jira issue key. The agent should be able to process a single key or a set of keys.

**Q3:** Epic Filter Processing: When processing an epic filter, should it process all epics in the filter, automatically process child stories for each epic (using Phase 4 logic), process linked content for all tickets (using Phase 6 logic), and generate deliverables grouped by epic or for the entire filter?

**Answer:** Yes for all.

**Q4:** Sprint Filter Processing: When processing a sprint filter, should it process all tickets in the sprint, identify epics within the sprint and process their child stories, process linked content for all tickets, and generate deliverables grouped by sprint or by epic?

**Answer:** Yes for all.

**Q5:** Release Filter Processing: When processing a release filter, should it process all tickets in the release (via fixVersion or similar), identify epics within the release and process their child stories, process linked content for all tickets, and generate deliverables grouped by release or by epic?

**Answer:** Yes for all.

**Q6:** Context-Aware Behavior: How should context-aware terminology be applied? Should epic filters create `agent-qa/epic/` folder, sprint filters create `agent-qa/sprint/` folder, release filters create `agent-qa/release/` folder (already exists), or use "release" for all filter types?

**Answer:** Use "release" for all filters.

**Q7:** Child Story Processing: Should child story processing automatically trigger when epics are detected in filters (using Phase 4), process child stories recursively (using enhanced Phase 4), and include child stories in the analysis scope?

**Answer:** Process child stories recursively (using enhanced Phase 4).

**Q8:** Linked Content Processing: Should linked content processing automatically process linked issues and Confluence pages for all tickets (using Phase 6), process linked content for epic tickets only, or process linked content for all tickets including child stories?

**Answer:** Automatically process linked issues and Confluence pages for all tickets (using Phase 6).

**Q9:** Requirements Analysis: Should requirements analysis process all tickets through phases 5-8 automatically, process epics and their child stories through phases 5-8, and generate deliverables for the entire filter scope?

**Answer:** Yes for all.

**Q10:** Output Structure: How should outputs be organized? Should it create separate folders per filter type (epic/, sprint/, release/), group deliverables by epic within the filter, create summary files for the entire filter scope, or maintain individual ticket/requirement files?

**Answer:** Create summary files for the entire filter scope.

**Q11:** Integration with Existing Phases: Should this feature enhance Phase 3 to detect filter types and route accordingly, add new phases after Phase 3 for epic/sprint/release-specific processing, or leverage existing phases (4, 5-8) automatically when filter types are detected?

**Answer:** Enhance Phase 3 to detect filter types and route accordingly.

**Q12:** Filter Analysis Scope: What level of analysis should be performed? Should it just retrieve and process tickets (current Phase 3 behavior), analyze relationships between tickets in the filter, identify dependencies and impacts across the filter scope, or generate comprehensive scope analysis reports?

**Answer:** Generate comprehensive scope analysis reports.

### Visual Assets

**Files Provided:**
No visual assets provided.

**Visual Insights:**
No visual assets provided.

### Existing Code to Reference

**Similar Features Identified:**
- Feature: Phase 3 - Process Jira Filter (Release) - Path: `agent-qa/commands/atlassian-integration/3-process-filter.md` - Already processes Jira filters
- Feature: Phase 4 - Process Epic and Child Stories - Path: `agent-qa/commands/atlassian-integration/4-process-epic.md` - Processes epics and child stories recursively
- Feature: Phase 6 - Analyze Linked Content - Path: `agent-qa/commands/atlassian-integration/6-analyze-linked-content.md` - Analyzes linked issues and Confluence pages
- Feature: Requirements Analysis Engine - Path: `agent-qa/commands/atlassian-integration/` (phases 5-8) - Analyzes requirements from tickets
- Command structure patterns: Reference agent-os under `/Users/taouani/Projects/ai-agents/agent-os` for multi-phase command implementation patterns
- Data processing patterns: Follow agent-os patterns for data transformation and storage
- Workflow integration: Integrate into existing Atlassian integration workflow following agent-os command patterns

## Requirements Summary

### Functional Requirements

- **Integration Approach**: Enhance/extend Phase 3 workflow
- **Input Parameter**: String representing JQL query (Jira filter) or Jira issue key (single or multiple keys)
- **Filter Type Detection**: Detect filter types and route accordingly (epic, sprint, release)
- **Epic Filter Processing**: Process all epics, automatically process child stories recursively, process linked content, generate deliverables
- **Sprint Filter Processing**: Process all tickets, identify epics and process child stories, process linked content, generate deliverables
- **Release Filter Processing**: Process all tickets, identify epics and process child stories, process linked content, generate deliverables
- **Context-Aware Behavior**: Use "release" folder for all filters (`agent-qa/release/`)
- **Child Story Processing**: Process child stories recursively using enhanced Phase 4
- **Linked Content Processing**: Automatically process linked issues and Confluence pages for all tickets using Phase 6
- **Requirements Analysis**: Process all tickets through phases 5-8 automatically, generate deliverables for entire filter scope
- **Output Structure**: Create summary files for the entire filter scope
- **Scope Analysis**: Generate comprehensive scope analysis reports

### Reusability Opportunities

- **Command Structure**: Enhance existing Phase 3 workflow in `agent-qa/commands/atlassian-integration/3-process-filter.md`
- **Phase 4 Integration**: Leverage existing Phase 4 for recursive child story processing
- **Phase 6 Integration**: Leverage existing Phase 6 for linked content processing
- **Phases 5-8 Integration**: Leverage existing phases 5-8 for requirements analysis
- **MCP Integration**: Use existing Atlassian MCP tools (`searchJiraIssuesUsingJql`, `getJiraIssue`)
- **Data Processing**: Leverage existing requirement structure patterns
- **Workflow Integration**: Integrate seamlessly into existing Phase 3 workflow

### Scope Boundaries

**In Scope:**
- Enhance Phase 3 to detect filter types (epic, sprint, release) and route accordingly
- Support input parameter: JQL query or Jira issue key (single or multiple keys)
- Process all tickets in filters/epics/sprints/releases
- Automatically process child stories recursively when epics detected (using Phase 4)
- Automatically process linked content for all tickets (using Phase 6)
- Process all tickets through requirements analysis workflow (phases 5-8)
- Generate comprehensive scope analysis reports
- Create summary files for entire filter scope
- Use "release" folder for all filters (`agent-qa/release/`)
- Generate deliverables for entire filter scope

**Out of Scope:**
- Separate folders per filter type (epic/, sprint/) - use "release" for all
- Standalone epic/sprint/release processing capability (enhance Phase 3 only)
- Manual filter type specification (automatic detection from input)
- Different processing logic per filter type (same processing for all)
- Individual ticket/requirement files only (summary files required)

### Technical Considerations

- **MCP Tools**: Use `mcp_Atlassian_searchJiraIssuesUsingJql` for JQL queries and issue key searches
- **MCP Tools**: Use `mcp_Atlassian_getJiraIssue` for retrieving individual ticket details
- **Integration Point**: Enhance Phase 3 (`3-process-filter.md`) workflow
- **Input Processing**: Support both JQL queries and Jira issue keys (single or multiple)
- **Filter Type Detection**: Analyze input to detect filter type and route accordingly
- **Automatic Phase Integration**: Automatically trigger Phase 4 (child stories), Phase 6 (linked content), and phases 5-8 (requirements analysis)
- **Data Storage**: Store all outputs in `agent-qa/release/` folder
- **Summary Generation**: Generate comprehensive scope analysis reports and summary files
- **Pattern Reference**: Follow agent-os patterns from `/Users/taouani/Projects/ai-agents/agent-os`

