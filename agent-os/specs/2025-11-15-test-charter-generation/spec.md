# Specification: Test Charter Generation

## Goal

Generate comprehensive exploratory test charters from analyzed requirements, including mission/goal, scope (in/out), areas to explore, test approach (exploratory testing techniques and session-based testing), risks, resource requirements (tester roles, skills, tools), and time estimates. Test charters are generated directly from in-memory requirement structures, with context-aware output (one charter per requirement OR per release/filter) stored as markdown files.

## User Stories

- As a QA Analyst, I want exploratory test charters automatically generated from analyzed requirements so that I can quickly plan exploratory testing sessions without manual charter creation
- As a QA Manager, I want test charters with clear scope, areas to explore, and resource requirements so that I can allocate testing resources effectively and ensure comprehensive exploratory coverage
- As a QA Analyst, I want test charters that identify complex areas, edge cases, and integration points so that I can focus exploratory testing on high-risk areas
- As a Release Manager, I want test charters with time estimates based on requirements count and complexity so that I can plan testing schedules and resource allocation

## Specific Requirements

**Workflow Integration**
- Integrate as additional phases into existing `agent-qa/commands/atlassian-integration/` workflow
- Extend the Atlassian integration command with new test charter generation phases following existing phase numbering (phases 12+)
- Process in-memory requirement structures from Requirements Analysis Engine (phases 5-8 only)
- Store generated test charters in context folders (`agent-qa/requirement/` or `agent-qa/release/`)
- Follow agent-os multi-phase command patterns with numbered instruction files

**Input Processing**
- Work directly with in-memory requirement structures from phases 5-8 only
- Access requirement data including summary, description, acceptance criteria, linked issues, and Confluence content
- Process both single requirements and multiple requirements (from filters/releases)
- Do not read requirement files from disk - use in-memory data structures
- Do not use test cases as input - requirements analysis only

**Mission/Goal Generation**
- Generate mission/goal based on the overall scope being tested
- Analyze all requirements in scope to derive comprehensive mission statement
- For single requirements: Generate mission/goal specific to that requirement
- For releases/filters: Generate mission/goal covering the entire release/filter scope
- Ensure mission/goal clearly articulates what will be explored and tested

**Scope Definition**
- Base scope definition on requirements analyzed only
- Define "in scope" based on requirements included in the analysis
- Define "out of scope" based on requirements explicitly excluded or not part of the current analysis
- Explicitly list what's included in scope
- Explicitly list what's excluded from scope (if applicable)
- Ensure scope is clear and unambiguous

**Areas to Explore Identification**
- Analyze requirements for complex areas that need exploratory testing
- Identify edge cases and boundary conditions from requirement analysis
- Identify integration points between requirements and systems
- Consider requirement dependencies and relationships when identifying exploration areas
- Prioritize areas based on complexity, risk, and integration points
- Generate specific, actionable exploration areas

**Test Approach Description**
- Describe exploratory testing techniques appropriate for the scope
- Include session-based testing approach and methodology
- Provide guidance on how to conduct exploratory testing sessions
- Include techniques such as:
  - Time-boxed exploratory sessions
  - Charter-based exploration
  - Session debriefing and reporting
  - Note-taking and bug reporting during exploration
- Ensure approach is practical and actionable

**Risk Generation**
- Generate risks independently based on requirements being analyzed
- Do not integrate with Risk Register Generation feature (roadmap item #7)
- Analyze requirements to identify potential risks
- Consider risks related to:
  - Requirement complexity
  - Missing or unclear acceptance criteria
  - Integration points and dependencies
  - Edge cases and boundary conditions
- Structure risks with clear descriptions and potential impact

**Resource Requirements Specification**
- Specify tester roles needed for exploratory testing
- Identify skills required for effective exploratory testing
- List tools required for testing (browsers, testing tools, monitoring tools, etc.)
- Consider requirement complexity when determining resource needs
- Ensure resource requirements are realistic and actionable

**Time Estimates Calculation**
- Calculate time estimates based on number of requirements
- Factor in complexity analysis when calculating time
- Provide time estimates in appropriate units (hours, days, sessions)
- Consider:
  - Number of requirements to explore
  - Complexity of each requirement
  - Number of exploration areas identified
  - Integration points and dependencies
- Ensure time estimates are realistic and practical

**Charter Structure**
- Use flexible, simple structure optimized for LLM consumption and readability
- Include essential sections: mission/goal, scope (in/out), areas to explore, test approach, risks, resource requirements, time estimates
- Avoid rigid templates - maintain flexibility for different requirement types
- Structure charters as simple objects/arrays for agent-qa workflows
- Ensure structure is clear and easy to follow

**Charter Fields**
- **Mission/Goal**: Clear statement of what will be explored and tested
- **Scope (In)**: List of requirements/features included in scope
- **Scope (Out)**: List of requirements/features explicitly excluded (if applicable)
- **Areas to Explore**: Specific areas identified for exploratory testing (complex areas, edge cases, integration points)
- **Test Approach**: Description of exploratory testing techniques and session-based testing methodology
- **Risks**: List of risks identified from requirement analysis
- **Resource Requirements**: Tester roles, skills needed, and tools required
- **Time Estimates**: Estimated time needed based on requirements count and complexity

**File Output Structure**
- Generate one charter per requirement OR one charter per release/filter depending on input type
- For single requirements: Use filename format `test-charter-{REQUIREMENT-KEY}.md` (e.g., `test-charter-PROJ-123.md`)
- For releases/filters: Use filename format `test-charter-release.md` or `test-charter-{CONTEXT}.md`
- Store charter files in appropriate context folder (`agent-qa/requirement/` or `agent-qa/release/`)
- Create summary index file listing all charter files (if multiple charters generated)
- Format index file as markdown with links to individual charter files

**Charter File Format**
- Format charter files as markdown following agent-os standards
- Include requirement reference section at top of file (for single requirement charters)
- Include release/filter reference section at top of file (for release charters)
- Structure sections clearly with markdown headings
- Use markdown lists and tables for structured data where appropriate
- Format content for readability and clarity
- Include all charter fields in structured format

**Error Handling**
- Handle requirements without sufficient information gracefully
- Continue charter generation even when some requirements have issues
- Provide informative messages when data cannot be determined
- Log warnings for requirements that may need manual charter review
- Ensure graceful degradation for missing or incomplete data

**Data Processing and Storage**
- Process charters in memory during generation
- Transform requirement structures into charter structures
- Maintain requirement-to-charter relationships
- Store generated charters for file output
- Support data access patterns for downstream commands (if needed)

**Command Structure Integration**
- Follow agent-os command patterns with multi-phase processes
- Use numbered instruction files for workflow steps (extend existing phase numbers)
- Integrate seamlessly with existing Atlassian integration phases
- Comply with agent-os standards and conventions
- Create reusable charter generation patterns for future extensions

## Visual Design

No visual assets provided.

## Existing Code to Leverage

**Requirements Analysis Engine**
- Leverage in-memory requirement structures from phases 5-8
- Use requirement data including summary, description, acceptance criteria, quality scores
- Access linked issues and Confluence content for comprehensive scope understanding
- Follow data structure patterns from Requirements Analysis Engine

**Atlassian Integration Command**
- Extend existing `agent-qa/commands/atlassian-integration/` command with new phases
- Follow existing phase structure and numbering conventions (phases 12+)
- Use existing context folder creation logic
- Reuse workflow integration patterns

**Agent-OS Command Structure Patterns**
- Reference `/Users/taouani/Projects/ai-agents/agent-os` for multi-phase command implementation patterns
- Follow numbered instruction file structure (extend existing phases)
- Use workflow integration patterns from existing agent-os commands
- Adopt error handling patterns from agent-os standards
- Follow data processing patterns from agent-os workflows

**File Generation Patterns**
- Follow markdown file generation patterns from Phase 8 (requirement file generation)
- Follow markdown file generation patterns from Phase 10 (test case file generation)
- Use similar file naming and organization patterns
- Apply markdown formatting standards from agent-os
- Follow index file generation patterns

**Error Handling Standards**
- Follow error handling patterns from `agent-os/standards/global/error-handling.md`
- Use consistent error message formatting from Atlassian integration
- Apply validation patterns from `agent-os/standards/global/validation.md`
- Follow graceful degradation patterns for missing data

## Out of Scope

- Reading requirement files from disk (must use in-memory structures)
- Using test cases as input (requirements only)
- Integration with Risk Register Generation feature (independent risk generation)
- Rigid charter templates (must use flexible, simple structure)
- Separate command (must integrate into existing Atlassian integration workflow)
- Test case generation integration (requirements analysis only)
- Automated charter execution or tracking
- Charter versioning or change tracking
- Charter approval workflows
- Integration with test execution tools
- Charter assignment or scheduling

