# Task Breakdown: Test Case Generation

## Overview
Total Tasks: 7 task groups

## Task List

### Workflow Integration Layer

#### Task Group 1: Extend Atlassian Integration Command Structure
**Dependencies:** None

- [x] 1.0 Extend existing Atlassian integration command with test case generation phases
  - [x] 1.1 Update main command file `agent-qa/commands/atlassian-integration/atlassian-integration.md`
    - Add new phases (9-11) for test case generation
    - Document phase sequence and dependencies
    - Reference numbered instruction files for new phases
  - [x] 1.2 Create phase 9 instruction file `9-generate-test-cases.md`
    - Test case generation workflow from requirements
    - Integration with in-memory requirement structures
    - Follow agent-os numbered instruction file pattern
  - [x] 1.3 Create phase 10 instruction file `10-generate-test-case-files.md`
    - Markdown file generation grouped by requirement
    - Test case file formatting
    - File output structure
  - [x] 1.4 Create phase 11 instruction file `11-generate-traceability-matrix.md`
    - Traceability matrix generation
    - CSV export for Xray import
    - Summary index generation

**Acceptance Criteria:**
- Command structure extended with phases 9-11
- All numbered instruction files created following agent-os patterns
- Phase sequence documented and integrated with existing workflow
- Command maintains backward compatibility with existing phases

### Test Case Generation Layer

#### Task Group 2: Test Case Generation Logic
**Dependencies:** Task Group 1

- [x] 2.0 Implement test case generation from requirement structures
  - [x] 2.1 Access in-memory requirement structures
    - Access requirement data from phases 5-8
    - Process both single requirements and multiple requirements
    - Ensure requirement data is available before proceeding
  - [x] 2.2 Determine test case source (acceptance criteria vs description)
    - Check for acceptance criteria in requirement structure
    - Determine if acceptance criteria are relevant and usable
    - Fall back to requirement description if acceptance criteria missing or not relevant
  - [x] 2.3 Generate test cases from acceptance criteria
    - Process each acceptance criterion individually
    - Generate test cases for each criterion
    - Handle multiple acceptance criteria per requirement
  - [x] 2.4 Generate test cases from requirement description
    - Parse requirement description for test scenarios
    - Generate test cases when acceptance criteria unavailable
    - Analyze description for functional requirements and workflows
  - [x] 2.5 Analyze requirement context for additional scenarios
    - Consider linked issues for test scenario context
    - Consider Confluence content for additional test scenarios
    - Include context from requirement relationships

**Acceptance Criteria:**
- Test cases generated from acceptance criteria when available
- Test cases generated from description when acceptance criteria missing
- Requirement context analyzed for comprehensive coverage
- Both single and multiple requirements processed successfully

#### Task Group 3: Test Case Type Generation
**Dependencies:** Task Group 2

- [x] 3.0 Implement generation of all three test case types
  - [x] 3.1 Generate positive test cases
    - Create happy path scenarios
    - Verify expected behavior
    - Cover normal operation flows
  - [x] 3.2 Generate negative test cases
    - Create error condition scenarios
    - Test invalid inputs
    - Test failure scenarios
  - [x] 3.3 Generate edge case test cases
    - Create boundary condition scenarios
    - Test limits and edge values
    - Test edge scenarios
  - [x] 3.4 Determine test case count per type
    - Generate multiple test cases per type when complexity warrants
    - Ensure comprehensive coverage across all types
    - Balance coverage with practicality

**Acceptance Criteria:**
- All three test case types generated for each requirement
- Positive test cases cover happy path scenarios
- Negative test cases cover error conditions
- Edge cases cover boundary conditions
- Multiple test cases generated when appropriate

#### Task Group 4: Test Case Structure and Fields
**Dependencies:** Task Group 2

- [x] 4.0 Implement flexible test case structure
  - [x] 4.1 Create test case ID generation logic
    - Generate unique identifiers (e.g., TC-001, TC-002)
    - Ensure uniqueness across all test cases
    - Use sequential numbering or requirement-based prefixes
  - [x] 4.2 Structure test case fields
    - Title: Clear, descriptive test case title
    - Description: Brief description of what test verifies
    - Type: Positive, Negative, or Edge Case
    - Preconditions: Prerequisites or setup required
    - Test Steps: Sequential steps to execute
    - Expected Results: Expected outcomes for each step
    - Test Data: Specific test data values
    - Requirement Reference: Link to source requirement
    - Priority: Test case priority (from requirement if available)
  - [x] 4.3 Create flexible, simple data structure
    - Use simple objects/arrays for agent-qa workflows
    - Avoid rigid templates
    - Optimize for LLM consumption and readability
  - [x] 4.4 Format test steps and expected results
    - Structure test steps as sequential actions
    - Align expected results with test steps
    - Ensure clarity and completeness

**Acceptance Criteria:**
- Test case structure is flexible and simple
- All essential fields included
- Test case IDs are unique
- Test steps and expected results are clear and aligned

### Test Data Generation Layer

#### Task Group 5: Test Data Value Generation
**Dependencies:** Task Group 2

- [x] 5.0 Implement specific test data value generation
  - [x] 5.1 Analyze requirement context for test data
    - Parse requirement description for data types and values
    - Analyze acceptance criteria for data requirements
    - Consider linked issues and Confluence content
  - [x] 5.2 Generate specific test data values
    - Generate realistic, contextually relevant values
    - Include test data for inputs, expected outputs, boundary values
    - Use requirement context to infer appropriate data
  - [x] 5.3 Handle cases where test data cannot be inferred
    - Provide examples or guidance when specific values cannot be determined
    - Include placeholder guidance for manual completion
    - Log informative messages about test data generation
  - [x] 5.4 Include test data in test case structure
    - Add test data section to test cases
    - Format test data clearly
    - Include data for all relevant test steps

**Acceptance Criteria:**
- Specific test data values generated when possible
- Test data is realistic and contextually relevant
- Graceful handling when test data cannot be inferred
- Test data included in test case structure

### File Output Layer

#### Task Group 6: Test Case File Generation
**Dependencies:** Task Groups 2, 3, 4, 5

- [x] 6.0 Implement test case file generation grouped by requirement
  - [x] 6.1 Create test case file naming logic
    - Generate filenames: `test-cases-{REQUIREMENT-KEY}.md`
    - Handle special characters in filenames
    - Ensure unique filenames for each requirement
  - [x] 6.2 Format test case files as markdown
    - Follow agent-os markdown standards
    - Include requirement reference section at top
    - Group test cases by type (Positive, Negative, Edge Cases)
    - Use markdown tables for structured data where appropriate
  - [x] 6.3 Include test case details in files
    - Test case ID, title, description
    - Preconditions, test steps, expected results
    - Test data section
    - Requirement reference
  - [x] 6.4 Format test steps and expected results
    - Format test steps as numbered lists
    - Format expected results clearly aligned with steps
    - Ensure readability and clarity
  - [x] 6.5 Write test case files to context folders
    - Store files in `agent-qa/requirement/` for single tickets
    - Store files in `agent-qa/release/` for filters
    - Ensure folder exists before writing

**Acceptance Criteria:**
- Test case files created with proper naming
- Files formatted as markdown following agent-os standards
- Test cases grouped by requirement and type
- All test case details included in structured format
- Files stored in correct context folders

#### Task Group 7: CSV Export and Traceability
**Dependencies:** Task Group 6

- [x] 7.0 Implement CSV export and traceability matrix
  - [x] 7.1 Generate CSV file for Xray import
    - Format CSV compatible with Xray import specifications
    - Include columns: Test Case Key/ID, Test Summary/Title, Test Type, Preconditions, Test Steps, Expected Results, Requirement Key
    - Use filename format: `test-cases-xray-import.csv` or `test-cases-xray-import-{CONTEXT}.csv`
  - [x] 7.2 Format test steps for Xray CSV
    - Format test steps according to Xray CSV requirements
    - Ensure proper CSV escaping and formatting
    - Handle special characters in CSV format
  - [x] 7.3 Create traceability matrix
    - Generate requirement-to-test-case mapping
    - Format as markdown table
    - Include requirement key, summary, test case IDs, test case types
  - [x] 7.4 Calculate coverage metrics
    - Test cases per requirement count
    - Test case types per requirement breakdown
    - Overall coverage statistics
  - [x] 7.5 Create summary index file
    - List all test case files with links
    - Include traceability matrix
    - Include coverage metrics
    - Format as markdown following agent-os standards
  - [x] 7.6 Write CSV and index files to context folder
    - Store CSV file in same context folder as markdown files
    - Store index file in context folder
    - Ensure folder exists before writing

**Acceptance Criteria:**
- CSV file generated in Xray-compatible format
- Traceability matrix created showing requirement-to-test-case mapping
- Coverage metrics calculated and included
- Summary index file created with links and traceability
- All files stored in correct context folders

## Execution Order

Recommended implementation sequence:
1. Workflow Integration Layer (Task Group 1)
2. Test Case Generation Layer (Task Groups 2, 3, 4 - can be parallel)
3. Test Data Generation Layer (Task Group 5)
4. File Output Layer (Task Groups 6, 7 - sequential)

## Important Notes

- All phases extend existing `agent-qa/commands/atlassian-integration/` command
- Follow agent-os patterns from `/Users/taouani/Projects/ai-agents/agent-os`
- Work directly with in-memory requirement structures (do not read files from disk)
- Generate all three test case types automatically
- Use flexible, simple test case structure (not rigid templates)
- Generate specific test data values when possible
- Group test cases by requirement in markdown files
- Generate CSV for manual Xray import
- Include requirement traceability in all outputs

