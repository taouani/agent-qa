# Specification: Test Case Generation

## Goal

Generate comprehensive test cases from analyzed requirements, including positive, negative, and edge cases with preconditions, test steps, expected results, and specific test data values. Test cases are generated directly from in-memory requirement structures, grouped by requirement in markdown files, and exported as CSV for manual import into Jira Xray.

## User Stories

- As a QA Analyst, I want test cases automatically generated from analyzed requirements so that I can quickly create comprehensive test coverage without manual test case writing
- As a QA Manager, I want test cases generated for all requirement types (positive, negative, edge cases) so that I can ensure comprehensive test coverage across all scenarios
- As a QA Analyst, I want test cases with specific test data values so that I can execute tests immediately without additional test data preparation
- As a Release Manager, I want requirement-to-test-case traceability so that I can track test coverage and ensure all requirements are tested

## Specific Requirements

**Workflow Integration**
- Integrate as additional phases into existing `agent-qa/commands/atlassian-integration/` workflow
- Extend the Atlassian integration command with new test generation phases following existing phase numbering (phases 9+)
- Process in-memory requirement structures from Requirements Analysis Engine (phases 5-8)
- Store generated test cases in context folders (`agent-qa/requirement/` or `agent-qa/release/`)
- Follow agent-os multi-phase command patterns with numbered instruction files

**Input Processing**
- Work directly with in-memory requirement structures from phases 5-8
- Access requirement data including acceptance criteria, description, linked issues, and Confluence content
- Process both single requirements and multiple requirements (from filters/releases)
- Do not read requirement files from disk - use in-memory data structures

**Test Case Generation Logic**
- Generate test cases from acceptance criteria when available (primary source)
- Fall back to requirement description if acceptance criteria not found or not relevant
- Generate test cases for each acceptance criterion when multiple criteria exist
- Generate test cases from requirement description when no acceptance criteria available
- Analyze requirement context (description, linked issues, Confluence content) for comprehensive test case generation

**Test Case Types**
- Automatically generate all three test case types for each requirement:
  - **Positive Test Cases**: Happy path scenarios that verify expected behavior
  - **Negative Test Cases**: Error conditions, invalid inputs, and failure scenarios
  - **Edge Cases**: Boundary conditions, limits, and edge scenarios
- Generate multiple test cases per type when requirement complexity warrants it
- Ensure comprehensive coverage across all test case types

**Test Case Structure**
- Use flexible, simple structure optimized for LLM consumption and readability
- Include essential fields: test case ID, title, description, preconditions, test steps, expected results, test data
- Avoid rigid templates - maintain flexibility for different requirement types
- Structure test cases as simple objects/arrays for agent-qa workflows

**Test Case Fields**
- **Test Case ID**: Unique identifier (e.g., TC-001, TC-002)
- **Title**: Clear, descriptive test case title
- **Description**: Brief description of what the test case verifies
- **Type**: Positive, Negative, or Edge Case
- **Preconditions**: Prerequisites or setup required before test execution
- **Test Steps**: Sequential steps to execute the test
- **Expected Results**: Expected outcomes for each step
- **Test Data**: Specific test data values based on requirement context
- **Requirement Reference**: Link back to source requirement (key, summary)
- **Priority**: Test case priority (derived from requirement priority if available)

**Test Data Generation**
- Generate specific test data values based on requirement context when possible
- Analyze requirement description and acceptance criteria to infer appropriate test data
- Use realistic, contextually relevant test data values
- Include test data for inputs, expected outputs, and boundary values
- Handle cases where specific test data cannot be inferred (provide examples/guidance)

**Test Case Coverage**
- Generate at least one test case per acceptance criterion when acceptance criteria available
- Generate multiple test cases per acceptance criterion if complexity warrants
- Generate test cases from requirement description when acceptance criteria missing
- Ensure coverage of all requirement aspects (functionality, data, workflows)
- Consider linked issues and Confluence content for additional test scenarios

**File Output Structure**
- Group test cases by requirement in markdown files
- Use filename format: `test-cases-{REQUIREMENT-KEY}.md` (e.g., `test-cases-PROJ-123.md`)
- Store test case files in appropriate context folder (`agent-qa/requirement/` or `agent-qa/release/`)
- Create summary index file listing all test case files
- Format index file as markdown with links to individual test case files

**Test Case File Format**
- Format test case files as markdown following agent-os standards
- Include requirement reference section at top of file
- Group test cases by type (Positive, Negative, Edge Cases)
- Use markdown tables for structured test case data where appropriate
- Include test case details: ID, title, description, preconditions, steps, expected results, test data
- Format test steps as numbered lists
- Format expected results clearly aligned with test steps

**CSV Export for Xray**
- Generate CSV file for manual import into Jira Xray
- Include columns compatible with Xray import format:
  - Test Case Key/ID
  - Test Summary/Title
  - Test Type
  - Preconditions
  - Test Steps (formatted for Xray)
  - Expected Results
  - Requirement Key (for traceability)
- Use filename format: `test-cases-xray-import.csv` or `test-cases-xray-import-{CONTEXT}.csv`
- Store CSV file in same context folder as markdown files
- Format CSV following Xray import specifications

**Requirement Traceability**
- Include explicit requirement reference in each test case
- Link test cases to source requirement key and summary
- Create traceability matrix/summary showing requirement-to-test-case mapping
- Format traceability matrix as markdown table
- Include in summary index file or separate traceability file
- Show coverage metrics (test cases per requirement, test case types per requirement)

**Error Handling**
- Handle requirements without acceptance criteria gracefully (use description fallback)
- Handle requirements with incomplete information gracefully
- Continue test case generation even when some requirements have issues
- Provide informative messages when test data cannot be generated
- Log warnings for requirements that may need manual test case review

**Data Processing and Storage**
- Process test cases in memory during generation
- Transform requirement structures into test case structures
- Maintain requirement-to-test-case relationships
- Store generated test cases for file output
- Support data access patterns for downstream commands (test plan generation, etc.)

**Command Structure Integration**
- Follow agent-os command patterns with multi-phase processes
- Use numbered instruction files for workflow steps (extend existing phase numbers)
- Integrate seamlessly with existing Atlassian integration phases
- Comply with agent-os standards and conventions
- Create reusable test generation patterns for future extensions

## Visual Design

No visual assets provided.

## Existing Code to Leverage

**Requirements Analysis Engine**
- Leverage in-memory requirement structures from phases 5-8
- Use requirement data including acceptance criteria, description, quality scores
- Access linked issues and Confluence content for test scenario context
- Follow data structure patterns from Requirements Analysis Engine

**Atlassian Integration Command**
- Extend existing `agent-qa/commands/atlassian-integration/` command with new phases
- Follow existing phase structure and numbering conventions (phases 9+)
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
- Use similar file naming and organization patterns
- Apply markdown formatting standards from agent-os
- Follow index file generation patterns

**CSV Export Patterns**
- Reference Xray CSV import format specifications
- Follow CSV formatting best practices
- Ensure compatibility with Xray import requirements

**Error Handling Standards**
- Follow error handling patterns from `agent-os/standards/global/error-handling.md`
- Use consistent error message formatting from Atlassian integration
- Apply validation patterns from `agent-os/standards/global/validation.md`
- Follow graceful degradation patterns for missing data

## Out of Scope

- Reading requirement files from disk (must use in-memory structures)
- Rigid test case templates or complex schemas (must use flexible, simple structure)
- Selective test case type generation (must generate all three types automatically)
- Placeholder test data (must generate specific values when possible)
- Separate command (must integrate into existing Atlassian integration workflow)
- Separate files per test case (must group by requirement)
- Automated Xray upload (CSV export only for manual import)
- Test case execution or automation (generation only)
- Test case editing or updating (generation only)
- Test case versioning or change tracking
- Test case approval workflows
- Test case assignment or scheduling
- Integration with test execution tools (beyond CSV export)

