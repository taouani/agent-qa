# Task Breakdown: Test Plan Generation

## Overview
Total Tasks: 7 task groups

## Task List

### Workflow Integration Layer

#### Task Group 1: Extend Atlassian Integration Command Structure
**Dependencies:** None

- [x] 1.0 Extend existing Atlassian integration command with test plan generation phases
  - [x] 1.1 Update main command file `agent-qa/commands/atlassian-integration/atlassian-integration.md`
    - Add new phases (21-23) for test plan generation
    - Document phase sequence and dependencies
    - Reference numbered instruction files for new phases
  - [x] 1.2 Create phase 21 instruction file `21-generate-test-plan-foundation.md`
    - Test plan foundation generation workflow (executive summary, test objectives, scope)
    - Integration with in-memory structures (phases 5-8, 9-11, 15-17, 12-14)
    - File reading for deliverable references
    - Follow agent-os numbered instruction file pattern
  - [x] 1.3 Create phase 22 instruction file `22-generate-test-plan-details.md`
    - Test strategy integration (reference/link)
    - Environment requirements generation
    - Schedules generation (time estimates/ranges, milestones, phases)
    - Entry/exit criteria generation
  - [x] 1.4 Create phase 23 instruction file `23-generate-test-plan-files.md`
    - Deliverables listing and referencing
    - Test plan file generation grouped by requirement or release
    - Markdown file formatting
    - Summary index generation (if multiple plans)

**Acceptance Criteria:**
- Command structure extended with phases 21-23
- All numbered instruction files created following agent-os patterns
- Phase sequence documented and integrated with existing workflow
- Command maintains backward compatibility with existing phases

### Input Processing Layer

#### Task Group 2: Multi-Source Input Processing
**Dependencies:** Task Group 1

- [x] 2.0 Implement input processing from all sources
  - [x] 2.1 Access in-memory requirement structures
    - Access requirement data from phases 5-8
    - Process both single requirements and multiple requirements (from filters/releases)
    - Access requirement characteristics, dependencies, relationships
    - Ensure requirement data is available before proceeding
  - [x] 2.2 Access in-memory test case structures
    - Access test case data from phases 9-11
    - Access test case details, types, coverage
    - Consider test cases for test objectives and scope
    - Ensure test case data is available before proceeding
  - [x] 2.3 Access in-memory test strategy structures
    - Access test strategy data from phases 15-17
    - Access strategy test levels, test types, automation approach, metrics
    - Consider test strategies for test objectives
    - Ensure strategy data is available before proceeding
  - [x] 2.4 Access in-memory test charter structures
    - Access test charter data from phases 12-14
    - Access charter scope, areas to explore, resource requirements, time estimates
    - Consider charters for schedules and resource planning
    - Ensure charter data is available before proceeding
  - [x] 2.5 Read files from context folders
    - Read files from `agent-qa/requirement/` or `agent-qa/release/` folders
    - Identify generated deliverable files (test cases, test strategies, test charters, risk registers)
    - Extract file references for linking in test plan
    - Handle missing files gracefully

**Acceptance Criteria:**
- In-memory structures accessed from all required phases
- Files read from context folders for deliverable references
- All sources combined for comprehensive test plan generation
- Missing files handled gracefully

### Test Plan Foundation Layer

#### Task Group 3: Executive Summary and Test Objectives
**Dependencies:** Task Group 2

- [x] 3.0 Implement executive summary and test objectives generation
  - [x] 3.1 Generate executive summary
    - Generate high-level overview of testing scope and objectives
    - Summarize key testing activities and deliverables
    - Provide context for stakeholders
    - Keep summary concise and informative
  - [x] 3.2 Derive test objectives from test cases
    - Analyze test cases to identify testing goals
    - Extract objectives from test case descriptions and purposes
    - Ensure objectives align with test cases
  - [x] 3.3 Derive test objectives from test strategies
    - Analyze test strategies to identify testing objectives
    - Extract objectives from test strategy test levels and test types
    - Ensure objectives align with test strategies
  - [x] 3.4 Combine and structure test objectives
    - Combine test objectives from test cases and test strategies
    - Deduplicate similar objectives
    - Structure objectives clearly and logically
    - Ensure objectives are clear and actionable

**Acceptance Criteria:**
- Executive summary generated with high-level overview
- Test objectives derived from test cases
- Test objectives derived from test strategies
- Objectives combined, structured, and deduplicated
- Objectives are clear, actionable, and aligned with test cases/strategies

#### Task Group 4: Scope Definition
**Dependencies:** Task Group 2

- [x] 4.0 Implement scope definition based on requirements and test cases
  - [x] 4.1 Define scope from requirements analyzed
    - List requirements included in scope (from phases 5-8)
    - Include requirement keys and summaries
    - Consider entire release/filter scope
  - [x] 4.2 Define scope from test cases generated
    - List test cases included in scope (from phases 9-11)
    - Include test case coverage information
    - Consider test case types and coverage
  - [x] 4.3 Define in-scope items
    - Explicitly list what's included in scope
    - Combine requirements and test cases in scope
    - Ensure scope is clear and unambiguous
  - [x] 4.4 Define out-of-scope items
    - Explicitly list what's excluded from scope (if applicable)
    - Identify items not part of current testing scope
    - Ensure out-of-scope is clear and unambiguous

**Acceptance Criteria:**
- Scope defined based on requirements analyzed
- Scope defined based on test cases generated
- In-scope items explicitly listed
- Out-of-scope items explicitly listed (if applicable)
- Scope is clear and unambiguous

### Test Plan Details Layer

#### Task Group 5: Test Strategy Integration and Environment Requirements
**Dependencies:** Task Group 2

- [x] 5.0 Implement test strategy integration and environment requirements
  - [x] 5.1 Identify test strategy files
    - Identify test strategy files in context folder
    - Locate test strategy files (from phases 15-17)
    - Handle missing test strategy files gracefully
  - [x] 5.2 Create links to test strategy files
    - Create markdown links to test strategy files in test plan
    - Ensure links are correct and accessible
    - Reference test strategies appropriately
  - [x] 5.3 Generate environment requirements guidance
    - Provide high-level guidance for test environment needs
    - Provide high-level guidance for test data requirements
    - Provide high-level guidance for tools and infrastructure
    - Provide high-level guidance for environment setup considerations
    - Keep guidance high-level (not detailed specifications)
    - Ensure guidance is actionable but not prescriptive

**Acceptance Criteria:**
- Test strategy files identified in context folder
- Links created to test strategy files in test plan
- Environment requirements guidance generated (high-level)
- Guidance is actionable but not prescriptive

#### Task Group 6: Schedules and Entry/Exit Criteria
**Dependencies:** Task Group 2

- [x] 6.0 Implement schedules and entry/exit criteria generation
  - [x] 6.1 Generate time estimates/ranges
    - Base estimates on number of requirements
    - Base estimates on number of test cases generated
    - Consider complexity analysis
    - Consider test strategy and charter time estimates
    - Provide time estimates/ranges
  - [x] 6.2 Generate milestones
    - Identify key milestones in testing schedule
    - Base milestones on test phases and activities
    - Structure milestones clearly
  - [x] 6.3 Generate phases
    - Identify testing phases in schedule
    - Base phases on test levels and test types
    - Structure phases clearly
  - [x] 6.4 Structure schedules with milestones and phases
    - Combine time estimates, milestones, and phases
    - Structure schedules clearly
    - Ensure schedules are realistic and practical
  - [x] 6.5 Generate entry criteria
    - Specify prerequisites for starting testing
    - Include entry criteria (code complete, environment ready, test cases prepared, test data available, access granted)
    - Base entry criteria on test cases and test strategies
    - Ensure entry criteria are clear and actionable
  - [x] 6.6 Generate exit criteria
    - Specify completion conditions for testing
    - Include exit criteria (all test cases executed, defect thresholds met, test coverage achieved, critical defects resolved, sign-off obtained)
    - Base exit criteria on test cases and test strategies
    - Ensure exit criteria are clear and measurable

**Acceptance Criteria:**
- Time estimates/ranges generated
- Milestones generated and included in schedule
- Phases generated and included in schedule
- Schedules structured with milestones and phases
- Entry criteria generated (prerequisites for starting testing)
- Exit criteria generated (completion conditions)
- Criteria are clear, actionable, and measurable

### Deliverables Layer

#### Task Group 7: Deliverables Listing and File Generation
**Dependencies:** Task Groups 2, 3, 4, 5, 6

- [x] 7.0 Implement deliverables listing and test plan file generation
  - [x] 7.1 Identify generated deliverables
    - Identify test case files (from phases 9-11)
    - Identify test strategy files (from phases 15-17)
    - Identify test charter files (from phases 12-14)
    - Identify risk register files (from phases 18-20)
    - Identify traceability matrix files (from phase 11)
  - [x] 7.2 Create links to generated deliverables
    - Create markdown links to test case files
    - Create markdown links to test strategy files
    - Create markdown links to test charter files
    - Create markdown links to risk register files
    - Create markdown links to traceability matrix files
    - Handle missing files gracefully
  - [x] 7.3 List expected deliverables
    - List test reports as expected deliverables
    - List other expected deliverables
    - Ensure deliverables are clearly listed
  - [x] 7.4 Determine test plan output structure
    - Determine if single requirement or release/filter context
    - Generate one plan per requirement OR one plan per release/filter
    - Use context-aware output based on input type
  - [x] 7.5 Create test plan file naming logic
    - For single requirements: Generate filename `test-plan-{REQUIREMENT-KEY}.md`
    - For releases/filters: Generate filename `test-plan-release.md` or `test-plan-{CONTEXT}.md`
    - Handle special characters in filenames
  - [x] 7.6 Format test plan files as markdown
    - Follow agent-os markdown standards
    - Include requirement reference section at top (for single requirement plans)
    - Include release/filter reference section at top (for release plans)
    - Structure sections clearly with markdown headings
  - [x] 7.7 Include all test plan fields
    - Executive summary section
    - Test objectives section
    - Scope section (in/out)
    - Test strategy section (reference/link)
    - Environment requirements section
    - Schedules section (time estimates/ranges, milestones, phases)
    - Entry criteria section
    - Exit criteria section
    - Deliverables section (with links)
  - [x] 7.8 Use markdown formatting appropriately
    - Use markdown lists and tables for structured data where appropriate
    - Format content for readability and clarity
    - Include links to referenced deliverables
    - Ensure all test plan fields in structured format
  - [x] 7.9 Write test plan files to context folders
    - Store files in `agent-qa/requirement/` for single tickets
    - Store files in `agent-qa/release/` for filters
    - Ensure folder exists before writing
  - [x] 7.10 Create summary index file (if multiple plans)
    - Generate index file listing all test plan files with links
    - Format index file as markdown following agent-os standards
    - Include summary statistics if applicable

**Acceptance Criteria:**
- Generated deliverables identified and linked
- Expected deliverables listed
- Test plan files created with proper naming (context-aware)
- Files formatted as markdown following agent-os standards
- All test plan fields included in structured format
- Links to referenced deliverables included
- Files stored in correct context folders
- Summary index file created when multiple plans generated

## Execution Order

Recommended implementation sequence:
1. Workflow Integration Layer (Task Group 1)
2. Input Processing Layer (Task Group 2)
3. Test Plan Foundation Layer (Task Groups 3, 4 - can be parallel after Task Group 2)
4. Test Plan Details Layer (Task Groups 5, 6 - can be parallel after Task Group 2)
5. Deliverables Layer (Task Group 7 - sequential after all previous groups)

## Important Notes

- All phases extend existing `agent-qa/commands/atlassian-integration/` command
- Follow agent-os patterns from `/Users/taouani/Projects/ai-agents/agent-os`
- Work with in-memory structures from phases 5-8 (requirements), phases 9-11 (test cases), phases 15-17 (test strategies), phases 12-14 (test charters) AND read files from `agent-qa/requirement/` or `agent-qa/release/` folders
- Test objectives derived from test cases/test strategies
- Scope based on requirements analyzed and test cases generated
- Test strategy integration: Reference/link to test strategy files (not independent generation)
- Environment requirements: High-level guidance only
- Schedules: Time estimates/ranges with milestones and phases
- Entry criteria: Prerequisites for starting testing
- Exit criteria: Completion conditions
- Deliverables: List all deliverables, reference generated deliverables
- Generate one plan per requirement OR per release/filter depending on input type
- Generate based on overall scope being tested (entire release/filter scope)

