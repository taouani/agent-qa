# Specification: Test Plan Generation

## Goal

Generate comprehensive test plans from analyzed requirements, generated test cases, test strategies, and test charters, including executive summary, test objectives (derived from test cases/test strategies), scope (based on requirements analyzed and test cases generated), test strategy (reference/link to generated test strategy files), environment requirements (high-level guidance), schedules (time estimates/ranges with milestones and phases), entry criteria (prerequisites for starting testing), exit criteria (completion conditions), and deliverables (all deliverables with references to generated deliverables). Test plans are generated from both in-memory structures and files from folders, with context-aware output (one plan per requirement OR per release/filter) stored as markdown files.

## User Stories

- As a QA Manager, I want comprehensive test plans automatically generated from requirements, test cases, test strategies, and test charters so that I can quickly establish testing plans without manual plan creation
- As a Release Manager, I want test plans with clear scope, schedules, and deliverables so that I can plan testing activities and track progress effectively
- As a QA Manager, I want test plans that reference generated test strategies so that I can link planning to strategy execution
- As a Project Manager, I want test plans with entry and exit criteria so that I can ensure proper testing gates and completion conditions
- As a QA Analyst, I want test plans with test objectives derived from test cases and test strategies so that I can understand what needs to be tested
- As a Release Manager, I want test plans with schedules including milestones and phases so that I can track testing progress and plan releases

## Specific Requirements

**Workflow Integration**
- Integrate as additional phases into existing `agent-qa/commands/atlassian-integration/` workflow
- Extend the Atlassian integration command with new test plan generation phases following existing phase numbering (phases 21+)
- Process in-memory structures from Requirements Analysis Engine (phases 5-8), Test Case Generation (phases 9-11), Test Strategy Generation (phases 15-17), and Test Charter Generation (phases 12-14)
- Read files from `agent-qa/requirement/` or `agent-qa/release/` folders to reference generated deliverables
- Store generated test plans in context folders (`agent-qa/requirement/` or `agent-qa/release/`)
- Follow agent-os multi-phase command patterns with numbered instruction files

**Input Processing**
- Work with in-memory requirement structures from phases 5-8
- Work with in-memory test case structures from phases 9-11
- Work with in-memory test strategy structures from phases 15-17
- Work with in-memory test charter structures from phases 12-14
- Read files from `agent-qa/requirement/` or `agent-qa/release/` folders to reference generated deliverables
- Process both single requirements and multiple requirements (from filters/releases)
- Combine in-memory structures and file references for comprehensive test plan generation

**Executive Summary**
- Generate executive summary for the test plan
- Include high-level overview of testing scope and objectives
- Summarize key testing activities and deliverables
- Provide context for stakeholders
- Keep summary concise and informative

**Test Objectives**
- Derive test objectives from test cases and test strategies
- Analyze test cases to identify testing goals
- Analyze test strategies to identify testing objectives
- Generate clear, actionable test objectives
- Ensure objectives align with test cases and test strategies
- Structure objectives clearly and logically

**Scope Definition**
- Define scope based on requirements analyzed and test cases generated
- List requirements included in scope (from phases 5-8)
- List test cases included in scope (from phases 9-11)
- Explicitly define what's included in scope
- Explicitly define what's excluded from scope (if applicable)
- Ensure scope is clear and unambiguous
- Consider entire release/filter scope when generating plans

**Test Strategy Integration**
- Reference or incorporate generated test strategies (from phases 15-17)
- Link to test strategy files (not include strategy content directly)
- Identify test strategy files in context folder
- Create links to test strategy files in test plan
- Ensure test plan references test strategies appropriately
- Do not generate test strategy content independently

**Environment Requirements**
- Provide high-level guidance for environment requirements
- Include guidance on:
  - Test environment needs (high-level)
  - Test data requirements (high-level)
  - Tools and infrastructure (high-level)
  - Environment setup considerations (high-level)
- Keep guidance high-level (not detailed specifications)
- Ensure guidance is actionable but not prescriptive

**Schedules**
- Provide time estimates/ranges for testing activities
- Include milestones in schedule
- Include phases in schedule
- Base schedules on:
  - Number of requirements
  - Number of test cases generated
  - Complexity analysis
  - Test strategy and charter time estimates
- Structure schedules clearly with phases and milestones
- Ensure schedules are realistic and practical

**Entry Criteria**
- Specify prerequisites for starting testing
- Include entry criteria such as:
  - Code complete/ready for testing
  - Environment ready and available
  - Test cases prepared
  - Test data available
  - Access and permissions granted
- Ensure entry criteria are clear and actionable
- Base entry criteria on test cases and test strategies

**Exit Criteria**
- Specify completion conditions for testing
- Include exit criteria such as:
  - All test cases executed
  - Defect thresholds met
  - Test coverage achieved
  - Critical defects resolved
  - Sign-off obtained
- Ensure exit criteria are clear and measurable
- Base exit criteria on test cases and test strategies

**Deliverables**
- List all deliverables expected from testing
- Include deliverables such as:
  - Test cases (reference generated test case files)
  - Test strategies (reference generated test strategy files)
  - Test charters (reference generated test charter files)
  - Risk registers (reference generated risk register files)
  - Test reports (expected deliverables)
  - Traceability matrices (reference generated traceability files)
- Reference generated deliverables (link to files)
- List expected deliverables (test reports, etc.)
- Ensure deliverables are clearly listed and referenced

**Test Plan Structure**
- Use flexible, simple structure optimized for LLM consumption and readability
- Include essential sections: executive summary, test objectives, scope, test strategy (reference/link), environment requirements, schedules, entry criteria, exit criteria, deliverables
- Avoid rigid templates - maintain flexibility for different requirement types
- Structure test plans as simple objects/arrays for agent-qa workflows
- Ensure structure is clear and easy to follow

**Test Plan Fields**
- **Executive Summary**: High-level overview of testing scope and objectives
- **Test Objectives**: Derived from test cases and test strategies
- **Scope**: Based on requirements analyzed and test cases generated (in/out)
- **Test Strategy**: Reference/link to generated test strategy files
- **Environment Requirements**: High-level guidance
- **Schedules**: Time estimates/ranges with milestones and phases
- **Entry Criteria**: Prerequisites for starting testing
- **Exit Criteria**: Completion conditions for testing
- **Deliverables**: All deliverables with references to generated deliverables

**File Output Structure**
- Generate one plan per requirement OR one plan per release/filter depending on input type
- For single requirements: Use filename format `test-plan-{REQUIREMENT-KEY}.md` (e.g., `test-plan-PROJ-123.md`)
- For releases/filters: Use filename format `test-plan-release.md` or `test-plan-{CONTEXT}.md`
- Store test plan files in appropriate context folder (`agent-qa/requirement/` or `agent-qa/release/`)
- Create summary index file listing all test plan files (if multiple plans generated)
- Format index file as markdown with links to individual test plan files

**Test Plan File Format**
- Format test plan files as markdown following agent-os standards
- Include requirement reference section at top of file (for single requirement plans)
- Include release/filter reference section at top of file (for release plans)
- Structure sections clearly with markdown headings
- Use markdown lists and tables for structured data where appropriate
- Format content for readability and clarity
- Include links to referenced deliverables (test strategy files, test case files, etc.)
- Include all test plan fields in structured format

**Error Handling**
- Handle missing or incomplete data gracefully
- Continue test plan generation even when some sources have issues
- Provide informative messages when data cannot be determined
- Log warnings for test plans that may need manual review
- Handle missing referenced files gracefully (provide informative messages)
- Ensure graceful degradation for missing or incomplete data

**Data Processing and Storage**
- Process test plans in memory during generation
- Transform requirement, test case, test strategy, and test charter structures into test plan structures
- Read files from folders to reference generated deliverables
- Maintain test plan-to-source relationships (requirements, test cases, strategies, charters)
- Store generated test plans for file output
- Support data access patterns for downstream commands (if needed)

**Command Structure Integration**
- Follow agent-os command patterns with multi-phase processes
- Use numbered instruction files for workflow steps (extend existing phase numbers)
- Integrate seamlessly with existing Atlassian integration phases
- Comply with agent-os standards and conventions
- Create reusable test plan generation patterns for future extensions

## Visual Design

No visual assets provided.

## Existing Code to Leverage

**Requirements Analysis Engine**
- Leverage in-memory requirement structures from phases 5-8
- Use requirement data including summary, description, acceptance criteria, quality scores, dependencies, relationships
- Access linked issues and Confluence content for comprehensive scope understanding
- Follow data structure patterns from Requirements Analysis Engine

**Test Case Generation**
- Leverage in-memory test case structures from phases 9-11
- Use test case data for test objectives derivation
- Reference test case files from folders
- Follow data structure patterns from Test Case Generation

**Test Strategy Generation**
- Leverage in-memory test strategy structures from phases 15-17
- Reference test strategy files from folders (link, not include content)
- Use test strategy data for test objectives derivation
- Follow data structure patterns from Test Strategy Generation

**Test Charter Generation**
- Leverage in-memory test charter structures from phases 12-14
- Reference test charter files from folders
- Use charter data for schedule and resource planning
- Follow data structure patterns from Test Charter Generation

**Atlassian Integration Command**
- Extend existing `agent-qa/commands/atlassian-integration/` command with new phases
- Follow existing phase structure and numbering conventions (phases 21+)
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
- Follow markdown file generation patterns from Phase 14 (charter file generation)
- Follow markdown file generation patterns from Phase 17 (strategy file generation)
- Follow markdown file generation patterns from Phase 20 (risk register file generation)
- Use similar file naming and organization patterns
- Apply markdown formatting standards from agent-os
- Follow index file generation patterns

**File Reading Patterns**
- Read files from `agent-qa/requirement/` or `agent-qa/release/` folders
- Identify generated deliverable files (test cases, test strategies, test charters, risk registers)
- Create links to referenced files in test plan
- Handle missing files gracefully

**Error Handling Standards**
- Follow error handling patterns from `agent-os/standards/global/error-handling.md`
- Use consistent error message formatting from Atlassian integration
- Apply validation patterns from `agent-os/standards/global/validation.md`
- Follow graceful degradation patterns for missing data

## Out of Scope

- Reading risk registers (not mentioned in input sources)
- Detailed environment requirements (high-level guidance only)
- Detailed schedule implementation (time estimates/ranges only)
- Test plan execution or tracking
- Test plan versioning or change tracking
- Test plan approval workflows
- Integration with test execution tools
- Test plan assignment or scheduling
- Generating test strategy content independently (must reference/link to generated strategies)
- Reading files from disk for in-memory data (use in-memory structures for data, files for references only)
- Detailed test plan templates (must use flexible, simple structure)
- Separate command (must integrate into existing Atlassian integration workflow)
- Test plan automation or execution
- Test plan reporting or analytics

