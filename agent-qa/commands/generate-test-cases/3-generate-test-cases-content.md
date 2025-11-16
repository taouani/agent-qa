# PHASE 3: Generate Test Cases Content

Generate comprehensive test cases (positive, negative, edge cases) based on requirements and related deliverables, following senior QA architect best practices.

## Core Responsibilities

1. **Determine Test Case Source**: Use acceptance criteria if available, otherwise use requirement description
2. **Generate Positive Test Cases**: Generate positive/happy path test cases with proper structure
3. **Generate Negative Test Cases**: Generate negative test cases covering failure scenarios
4. **Generate Edge Cases**: Generate edge case test cases with boundary conditions
5. **Generate Test Data**: Generate specific test data values based on requirement context
6. **Assign Priority**: Assign priority based on business impact and risk (P1-P4)
7. **Include Traceability**: Include explicit requirement references in test cases
8. **Language Detection**: Detect and match language of original requirements

## Workflow

### Step 1: Detect Language (Automatic Language Matching)

For each requirement, detect the dominant language:
1. **Check Jira Fields**: Look for locale/language custom fields if available
2. **Heuristic Detection**: Analyze combined `summary + description + acceptance criteria` for language
   - Use character/word frequency analysis
   - Identify majority language
3. **Set Working Language**: Set working language for that requirement (e.g., `fr`, `en`)
4. **Language Consistency**: If multiple requirements have different languages, keep per-requirement language
5. **Confidence Threshold**: If detection confidence < 70%, prompt user for confirmation

**Important**: All generated test artifacts MUST be written in the same language as the original requirement content. Do NOT translate unless explicitly instructed.

### Step 2: Determine Test Case Source

For each requirement:
- If acceptance criteria found and relevant → Use acceptance criteria
- If acceptance criteria not found or not relevant → Use requirement description
- Extract business rules and implicit requirements from description

### Step 3: Generate Positive Test Cases

For each requirement, generate positive/happy path test cases:

**Test Case Structure**:
- **Test Case ID**: Format `TC-{REQUIREMENT-KEY}-{NNN}` (e.g., `TC-PROJ-123-001`)
- **Summary**: Concise test case title describing the scenario
- **Description**: Brief test objective (EXCLUDE preconditions - keep separate)
- **Priority**: Assign based on keyword analysis:
  - **P1 (Critical)**: Security, payment, authentication, data integrity, regulatory, critical
  - **P2 (High)**: Standard business flows and core functionality
  - **P3 (Medium)**: Standard features, UI validations
  - **P4 (Low)**: Cosmetic, edge cases with minimal business impact
- **Preconditions**: Separate section with bulleted prerequisites
- **Test Data Requirements**: Table with specific test data values
- **Test Steps**: Numbered list with clear imperative verbs:
  - Allowed verbs: Open, Navigate, Enter, Input, Select, Choose, Click, Press, Upload, Submit, Verify, Validate, Confirm, Observe
  - Maximum 200 characters per step
  - Each step should contain only ONE action
- **Expected Results**: Clear, measurable expected outcomes
- **Postconditions**: State after test execution

**Test Data Generation**:
- Generate specific, realistic test data values based on requirement context
- Use placeholders in format `<PLACEHOLDER_NAME>` for reusable data
- Create test data table with actual values and notes

### Step 4: Generate Negative Test Cases

For each requirement, generate negative test cases:

**Coverage Areas**:
- Invalid inputs and error conditions
- Boundary violations
- Missing required fields
- Invalid data formats
- Error handling scenarios
- Permission/authorization failures

**Structure**: Same as positive test cases, but focus on failure scenarios

### Step 5: Generate Edge Cases

For each requirement, generate edge case test cases:

**Coverage Areas**:
- Boundary conditions (min/max values)
- Extreme values
- Empty/null inputs
- Special characters and encoding
- Concurrent operations
- State transitions

**Structure**: Same as positive test cases, but focus on edge conditions

### Step 6: Assign Priority and Risk Classification

For each test case:
- **Priority Assignment**: Based on keyword analysis (P1-P4)
- **Risk Level**: Assess business risk if this area fails (High/Medium/Low)
- **Effort**: Estimate execution complexity (High/Medium/Low)
- **Regression Recommendation**: Recommend for regression suite (High/Medium/Low/None) based on:
  - Business impact
  - Change frequency
  - Integration complexity
  - Historical defects
  - User traffic

### Step 7: Include Traceability

For each test case:
- **Requirement Reference**: Explicit requirement key (e.g., `PROJ-123`)
- **Acceptance Criteria Reference**: Link to specific AC items if applicable
- **Business Rules**: Reference business rules covered
- **Related Tests**: Link to related test cases

### Step 8: Quality Validation

Validate each test case against quality criteria:
- **Clarity**: Each step is unambiguous and actionable
- **Completeness**: All necessary setup, execution, and validation steps included
- **Traceability**: Clear mapping to source requirements and business rules
- **Maintainability**: Test data and steps are easily updatable
- **Reusability**: Common patterns extracted for efficiency
- **Step Length**: Maximum 200 characters per step
- **Flow Splitting**: Break tests with >15 steps into multiple test cases

## Important Constraints

- Generate all three types automatically (positive, negative, edge cases)
- Generate specific test data values when possible
- Include requirement traceability with explicit references
- Use in-memory requirement structures
- Match language of original requirements (automatic detection)
- Follow senior QA architect best practices from templates
- Assign priorities based on business impact and risk
- Include regression suite recommendations
- Validate against quality criteria before finalizing

