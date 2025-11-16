# PHASE 9: Generate Test Cases

Generate comprehensive test cases from analyzed requirement structures, including positive, negative, and edge cases with preconditions, test steps, expected results, and specific test data values.

**Context**: This phase processes in-memory requirement structures from phases 5-8 and generates test cases directly from them. Test cases are generated in memory and stored for file output in subsequent phases.

## Core Responsibilities

1. **Access Requirement Structures**: Access in-memory requirement data from phases 5-8
2. **Determine Test Case Source**: Choose between acceptance criteria and description as source
3. **Generate Test Cases**: Create test cases for each requirement
4. **Generate All Types**: Create positive, negative, and edge case test cases
5. **Generate Test Data**: Create specific test data values based on requirement context
6. **Store Test Cases**: Store generated test cases in memory for file output

## Workflow

### Step 1: Access In-Memory Requirement Structures

Access requirement data from previous phases:
- **From Phase 8**: Requirements with completeness and quality analysis
- **Requirement Data Available**: 
  - Acceptance criteria (if available)
  - Description
  - Linked issues and Confluence content
  - Quality scores and completeness indicators
- **Context**: Both single requirements and multiple requirements (from filters/releases)

**IMPORTANT**: Do not read requirement files from disk. Work directly with in-memory data structures from phases 5-8.

### Step 2: Process Each Requirement

For each requirement in the requirement structures:

1. **Access Requirement Data**:
   - Get requirement key, summary, description
   - Get acceptance criteria (if available)
   - Get linked issues and Confluence content
   - Get quality and completeness indicators

2. **Determine Test Case Source**:
   - **Primary Source**: Acceptance criteria (if available and relevant)
   - **Fallback Source**: Requirement description (if acceptance criteria missing or not relevant)
   - **Additional Context**: Linked issues and Confluence content for comprehensive scenarios

3. **Generate Test Cases**:
   - Generate test cases based on determined source
   - Generate all three types: Positive, Negative, Edge Cases
   - Include test data values based on requirement context

### Step 3: Determine Test Case Source

For each requirement, determine the best source for test case generation:

1. **Check for Acceptance Criteria**:
   - Check if acceptance criteria exist in requirement structure
   - Check if acceptance criteria are relevant and usable
   - If acceptance criteria found and relevant: Use as primary source
   - If acceptance criteria missing or not relevant: Fall back to description

2. **Fallback to Description**:
   - If no acceptance criteria or not relevant, use requirement description
   - Parse description for functional requirements and workflows
   - Extract test scenarios from description text

3. **Consider Additional Context**:
   - Analyze linked issues for test scenario context
   - Analyze Confluence content for additional test scenarios
   - Include context from requirement relationships

### Step 4: Generate Test Cases from Acceptance Criteria

If acceptance criteria are available and relevant:

1. **Process Each Acceptance Criterion**:
   - Process each acceptance criterion individually
   - Generate test cases for each criterion
   - Handle multiple acceptance criteria per requirement

2. **Generate Test Cases Per Criterion**:
   - Generate at least one test case per acceptance criterion
   - Generate multiple test cases if criterion complexity warrants
   - Ensure comprehensive coverage of each criterion

3. **Generate All Three Types**:
   - **Positive**: Happy path scenarios verifying expected behavior
   - **Negative**: Error conditions, invalid inputs, failure scenarios
   - **Edge Cases**: Boundary conditions, limits, edge scenarios

### Step 5: Generate Test Cases from Requirement Description

If acceptance criteria are missing or not relevant:

1. **Parse Requirement Description**:
   - Analyze description for functional requirements
   - Identify workflows and processes described
   - Extract test scenarios from description text

2. **Generate Test Cases**:
   - Generate test cases covering all aspects of description
   - Generate all three types (Positive, Negative, Edge Cases)
   - Ensure comprehensive coverage of requirement functionality

3. **Consider Context**:
   - Use linked issues for additional context
   - Use Confluence content for additional scenarios
   - Include relationship context for comprehensive coverage

### Step 6: Analyze Requirement Context for Additional Scenarios

For comprehensive test case generation:

1. **Consider Linked Issues**:
   - Analyze linked issues for test scenario context
   - Include scenarios that involve related requirements
   - Consider dependencies and relationships

2. **Consider Confluence Content**:
   - Analyze Confluence pages for additional test scenarios
   - Include scenarios from documentation
   - Consider user stories and use cases

3. **Include Relationship Context**:
   - Consider requirement relationships (dependencies, blocks, relates to)
   - Include scenarios involving related requirements
   - Ensure comprehensive coverage across relationships

### Step 7: Generate All Three Test Case Types

For each requirement, generate all three test case types:

1. **Generate Positive Test Cases**:
   - Create happy path scenarios
   - Verify expected behavior
   - Cover normal operation flows
   - Generate multiple positive cases if complexity warrants

2. **Generate Negative Test Cases**:
   - Create error condition scenarios
   - Test invalid inputs
   - Test failure scenarios
   - Generate multiple negative cases for different error conditions

3. **Generate Edge Case Test Cases**:
   - Create boundary condition scenarios
   - Test limits and edge values
   - Test edge scenarios
   - Generate multiple edge cases for different boundaries

4. **Determine Test Case Count**:
   - Generate multiple test cases per type when complexity warrants
   - Ensure comprehensive coverage across all types
   - Balance coverage with practicality

### Step 8: Generate Test Data Values

For each test case, generate specific test data values:

1. **Analyze Requirement Context**:
   - Parse requirement description for data types and values
   - Analyze acceptance criteria for data requirements
   - Consider linked issues and Confluence content

2. **Generate Specific Test Data Values**:
   - Generate realistic, contextually relevant values
   - Include test data for inputs, expected outputs, boundary values
   - Use requirement context to infer appropriate data

3. **Handle Cases Where Test Data Cannot Be Inferred**:
   - Provide examples or guidance when specific values cannot be determined
   - Include placeholder guidance for manual completion
   - Log informative messages about test data generation

4. **Include Test Data in Test Case Structure**:
   - Add test data section to test cases
   - Format test data clearly
   - Include data for all relevant test steps

### Step 9: Structure Test Cases

Create flexible, simple test case structure optimized for LLM consumption:

```javascript
{
  // Test case identification
  testCaseId: "TC-001",
  title: "Clear, descriptive test case title",
  description: "Brief description of what test verifies",
  type: "Positive" | "Negative" | "Edge Case",
  
  // Test execution details
  preconditions: ["Prerequisite 1", "Prerequisite 2"],
  testSteps: [
    {
      stepNumber: 1,
      action: "Action description",
      expectedResult: "Expected outcome"
    }
  ],
  
  // Test data
  testData: {
    inputs: { ... },
    expectedOutputs: { ... },
    boundaryValues: { ... }
  },
  
  // Requirement reference
  requirementReference: {
    key: "PROJ-123",
    summary: "Requirement summary"
  },
  
  // Priority
  priority: "High" | "Medium" | "Low"
}
```

### Step 10: Store Test Cases in Memory

Store generated test cases in memory for file output:
- **Group by Requirement**: Organize test cases by requirement key
- **Store All Types**: Keep positive, negative, and edge cases together
- **Maintain Relationships**: Preserve requirement-to-test-case relationships
- **Ready for File Output**: Structure data for markdown and CSV generation

### Step 11: Confirm Test Case Generation

After generating test cases for all requirements:

1. **Verify Generation**:
   - Confirm test cases generated for all requirements
   - Verify all three types generated
   - Check test data included where possible

2. **Log Summary**:
   - Log total test cases generated
   - Log test cases per requirement
   - Log test cases per type
   - Log any warnings (e.g., missing test data)

3. **Proceed to Next Phase**:
   - Test cases ready for file generation in Phase 10
   - Data structures ready for CSV export in Phase 11

## Output

After this phase, you should have:
- Test cases generated for all requirements
- All three types (Positive, Negative, Edge Cases) for each requirement
- Test data values included where possible
- Test cases stored in memory, grouped by requirement
- Ready for file output in Phase 10

## Error Handling

- **Missing Acceptance Criteria**: Gracefully fall back to description
- **Incomplete Information**: Continue generation with available data
- **Missing Test Data**: Provide guidance/examples instead of failing
- **Multiple Requirements**: Process all requirements even if some have issues
- **Log Warnings**: Inform about requirements that may need manual review

