# Task Breakdown: Test Charter Generation

## Overview
Total Tasks: 8 task groups

## Task List

### Workflow Integration Layer

#### Task Group 1: Extend Atlassian Integration Command Structure
**Dependencies:** None

- [x] 1.0 Extend existing Atlassian integration command with test charter generation phases
  - [x] 1.1 Update main command file `agent-qa/commands/atlassian-integration/atlassian-integration.md`
    - Add new phases (12-14) for test charter generation
    - Document phase sequence and dependencies
    - Reference numbered instruction files for new phases
  - [x] 1.2 Create phase 12 instruction file `12-generate-test-charters.md`
    - Test charter generation workflow from requirements
    - Integration with in-memory requirement structures (phases 5-8)
    - Mission/goal, scope, and areas to explore generation
    - Follow agent-os numbered instruction file pattern
  - [x] 1.3 Create phase 13 instruction file `13-generate-charter-details.md`
    - Test approach generation (exploratory testing techniques, session-based testing)
    - Risk generation from requirements
    - Resource requirements specification
    - Time estimates calculation
  - [x] 1.4 Create phase 14 instruction file `14-generate-charter-files.md`
    - Charter file generation grouped by requirement or release
    - Markdown file formatting
    - Summary index generation (if multiple charters)

**Acceptance Criteria:**
- Command structure extended with phases 12-14
- All numbered instruction files created following agent-os patterns
- Phase sequence documented and integrated with existing workflow
- Command maintains backward compatibility with existing phases

### Charter Generation Layer

#### Task Group 2: Mission/Goal and Scope Generation
**Dependencies:** Task Group 1

- [x] 2.0 Implement mission/goal and scope generation from requirement structures
  - [x] 2.1 Access in-memory requirement structures
    - Access requirement data from phases 5-8 only
    - Process both single requirements and multiple requirements (from filters/releases)
    - Ensure requirement data is available before proceeding
  - [x] 2.2 Generate mission/goal based on overall scope
    - Analyze all requirements in scope to derive comprehensive mission statement
    - For single requirements: Generate mission/goal specific to that requirement
    - For releases/filters: Generate mission/goal covering entire release/filter scope
    - Ensure mission/goal clearly articulates what will be explored and tested
  - [x] 2.3 Define scope (in scope)
    - List requirements included in the analysis
    - Base on requirements analyzed only
    - Explicitly list what's included in scope
    - Ensure scope is clear and unambiguous
  - [x] 2.4 Define scope (out of scope)
    - Identify requirements explicitly excluded or not part of current analysis
    - Explicitly list what's excluded from scope (if applicable)
    - Ensure out-of-scope items are clearly identified

**Acceptance Criteria:**
- Mission/goal generated based on overall scope being tested
- Scope (in) clearly defined based on requirements analyzed
- Scope (out) clearly defined when applicable
- Both single requirements and releases/filters processed successfully

#### Task Group 3: Areas to Explore Identification
**Dependencies:** Task Group 2

- [x] 3.0 Implement areas to explore identification from requirements
  - [x] 3.1 Analyze requirements for complex areas
    - Identify complex requirement areas that need exploratory testing
    - Consider requirement complexity scores from quality analysis
    - Prioritize complex areas for exploration
  - [x] 3.2 Identify edge cases and boundary conditions
    - Analyze requirements for edge cases from requirement analysis
    - Identify boundary conditions that need exploration
    - Consider acceptance criteria and description for edge case identification
  - [x] 3.3 Identify integration points
    - Identify integration points between requirements and systems
    - Consider requirement dependencies and relationships
    - Analyze linked issues and Confluence content for integration context
  - [x] 3.4 Prioritize and structure exploration areas
    - Prioritize areas based on complexity, risk, and integration points
    - Generate specific, actionable exploration areas
    - Structure exploration areas clearly

**Acceptance Criteria:**
- Complex areas identified from requirement analysis
- Edge cases and boundary conditions identified
- Integration points identified from requirements and relationships
- Exploration areas are specific, actionable, and prioritized

### Charter Details Generation Layer

#### Task Group 4: Test Approach Generation
**Dependencies:** Task Group 2

- [x] 4.0 Implement test approach description generation
  - [x] 4.1 Describe exploratory testing techniques
    - Generate appropriate exploratory testing techniques for the scope
    - Include techniques relevant to requirement complexity and type
    - Ensure techniques are practical and actionable
  - [x] 4.2 Include session-based testing approach
    - Describe session-based testing methodology
    - Include time-boxed exploratory sessions guidance
    - Provide charter-based exploration guidance
  - [x] 4.3 Provide session execution guidance
    - Include session debriefing and reporting guidance
    - Provide note-taking and bug reporting guidance during exploration
    - Ensure approach is practical and actionable

**Acceptance Criteria:**
- Exploratory testing techniques described appropriately for scope
- Session-based testing approach included
- Practical guidance provided for session execution

#### Task Group 5: Risk Generation
**Dependencies:** Task Group 2

- [x] 5.0 Implement independent risk generation from requirements
  - [x] 5.1 Analyze requirements for potential risks
    - Identify risks related to requirement complexity
    - Identify risks related to missing or unclear acceptance criteria
    - Consider requirement quality scores from phase 7
  - [x] 5.2 Identify integration and dependency risks
    - Analyze integration points for potential risks
    - Consider requirement dependencies for risk identification
    - Identify risks related to edge cases and boundary conditions
  - [x] 5.3 Structure risks with descriptions and impact
    - Create clear risk descriptions
    - Identify potential impact of each risk
    - Ensure risks are actionable and relevant

**Acceptance Criteria:**
- Risks generated independently based on requirements
- Risks cover complexity, acceptance criteria, integration, and edge cases
- Risks structured with clear descriptions and potential impact

#### Task Group 6: Resource Requirements Specification
**Dependencies:** Task Group 2

- [x] 6.0 Implement resource requirements specification
  - [x] 6.1 Specify tester roles needed
    - Identify tester roles required for exploratory testing
    - Consider requirement complexity when determining roles
    - Ensure roles are realistic and actionable
  - [x] 6.2 Identify skills required
    - Determine skills needed for effective exploratory testing
    - Consider requirement domain knowledge needs
    - Ensure skills are specific and relevant
  - [x] 6.3 List tools required
    - Identify browsers, testing tools, monitoring tools needed
    - Consider requirement type and complexity for tool selection
    - Ensure tools are practical and available

**Acceptance Criteria:**
- Tester roles specified appropriately
- Skills required identified clearly
- Tools required listed comprehensively
- Resource requirements are realistic and actionable

#### Task Group 7: Time Estimates Calculation
**Dependencies:** Task Groups 2, 3

- [x] 7.0 Implement time estimates calculation
  - [x] 7.1 Calculate based on requirements count
    - Count number of requirements to explore
    - Factor in requirements count for time calculation
  - [x] 7.2 Factor in complexity analysis
    - Consider complexity of each requirement
    - Use quality scores from phase 7 for complexity assessment
    - Factor complexity into time estimates
  - [x] 7.3 Consider exploration areas and integration points
    - Factor in number of exploration areas identified
    - Consider integration points and dependencies
    - Adjust time estimates based on exploration scope
  - [x] 7.4 Format time estimates appropriately
    - Provide time estimates in appropriate units (hours, days, sessions)
    - Ensure time estimates are realistic and practical
    - Format clearly for readability

**Acceptance Criteria:**
- Time estimates calculated based on requirements count
- Complexity analysis factored into time estimates
- Exploration areas and integration points considered
- Time estimates formatted appropriately and realistically

### File Output Layer

#### Task Group 8: Charter File Generation
**Dependencies:** Task Groups 2, 3, 4, 5, 6, 7

- [x] 8.0 Implement charter file generation
  - [x] 8.1 Determine charter output structure
    - Determine if single requirement or release/filter context
    - Generate one charter per requirement OR one charter per release/filter
    - Use context-aware output based on input type
  - [x] 8.2 Create charter file naming logic
    - For single requirements: Generate filename `test-charter-{REQUIREMENT-KEY}.md`
    - For releases/filters: Generate filename `test-charter-release.md` or `test-charter-{CONTEXT}.md`
    - Handle special characters in filenames
  - [x] 8.3 Format charter files as markdown
    - Follow agent-os markdown standards
    - Include requirement reference section at top (for single requirement charters)
    - Include release/filter reference section at top (for release charters)
    - Structure sections clearly with markdown headings
  - [x] 8.4 Include all charter fields
    - Mission/Goal section
    - Scope (In) section
    - Scope (Out) section (if applicable)
    - Areas to Explore section
    - Test Approach section
    - Risks section
    - Resource Requirements section
    - Time Estimates section
  - [x] 8.5 Use markdown formatting appropriately
    - Use markdown lists and tables for structured data where appropriate
    - Format content for readability and clarity
    - Ensure all charter fields in structured format
  - [x] 8.6 Write charter files to context folders
    - Store files in `agent-qa/requirement/` for single tickets
    - Store files in `agent-qa/release/` for filters
    - Ensure folder exists before writing
  - [x] 8.7 Create summary index file (if multiple charters)
    - Generate index file listing all charter files with links
    - Format index file as markdown following agent-os standards
    - Include summary statistics if applicable

**Acceptance Criteria:**
- Charter files created with proper naming (context-aware)
- Files formatted as markdown following agent-os standards
- All charter fields included in structured format
- Files stored in correct context folders
- Summary index file created when multiple charters generated

## Execution Order

Recommended implementation sequence:
1. Workflow Integration Layer (Task Group 1)
2. Charter Generation Layer (Task Groups 2, 3 - can be parallel)
3. Charter Details Generation Layer (Task Groups 4, 5, 6, 7 - can be parallel after Task Group 2)
4. File Output Layer (Task Group 8 - sequential after all previous groups)

## Important Notes

- All phases extend existing `agent-qa/commands/atlassian-integration/` command
- Follow agent-os patterns from `/Users/taouani/Projects/ai-agents/agent-os`
- Work directly with in-memory requirement structures from phases 5-8 only (do not read files from disk)
- Do not use test cases as input (requirements only)
- Generate risks independently (do not integrate with Risk Register Generation feature)
- Use flexible, simple charter structure (not rigid templates)
- Generate one charter per requirement OR per release/filter depending on input type
- Mission/goal generated based on overall scope being tested
- Scope based on requirements analyzed only
- Areas to explore identified from requirement analysis (complex areas, edge cases, integration points)

