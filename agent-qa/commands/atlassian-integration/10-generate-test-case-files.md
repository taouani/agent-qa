# PHASE 10: Generate Test Case Files

Generate markdown files for test cases grouped by requirement with proper formatting and structure, following agent-os markdown standards.

**Context**: This phase takes test cases generated in Phase 9 and creates markdown files grouped by requirement, storing them in the appropriate context folder (`agent-qa/requirement/` or `agent-qa/release/`).

## Core Responsibilities

1. **Access Test Case Data**: Access test cases generated in Phase 9
2. **Create File Naming Logic**: Generate filenames for test case files
3. **Format Test Case Files**: Format files as markdown following agent-os standards
4. **Group by Requirement**: Group test cases by requirement in files
5. **Write Files**: Store files in appropriate context folder

## Workflow

### Step 1: Access Test Case Data from Phase 9

Access test cases generated in Phase 9:
- Test cases grouped by requirement
- All three types (Positive, Negative, Edge Cases) available
- Test data included
- Requirement references included

Ensure test case data is available before proceeding.

### Step 2: Determine Context Folder

Determine the appropriate context folder:
- If single ticket: Use `agent-qa/requirement/` (created in Phase 1)
- If filter/release: Use `agent-qa/release/` (created in Phase 1)
- Ensure folder exists before writing files

### Step 3: Create Test Case File Naming Logic

For each requirement, generate filename:

1. **Generate Filename**:
   - Format: `test-cases-{REQUIREMENT-KEY}.md` (e.g., `test-cases-PROJ-123.md`)
   - Use requirement key from requirement structure
   - Handle special characters: Replace invalid characters with hyphens
   - Ensure unique filenames for each requirement

2. **Handle Special Characters**:
   - Replace spaces with hyphens
   - Remove or replace invalid filename characters
   - Preserve requirement key format

### Step 4: Format Test Case Files as Markdown

For each requirement, create markdown file following agent-os standards:

1. **File Header**:
   ```markdown
   # Test Cases: {REQUIREMENT-KEY} - {Requirement Summary}
   
   ## Requirement Reference
   
   | Field | Value |
   |-------|-------|
   | Requirement Key | {key} |
   | Requirement Summary | {summary} |
   | Requirement Status | {status} |
   ```

2. **Group Test Cases by Type**:
   - **Positive Test Cases** section
   - **Negative Test Cases** section
   - **Edge Case Test Cases** section

3. **Format Each Test Case**:
   ```markdown
   ### {Test Case ID}: {Test Case Title}
   
   **Type**: {Positive|Negative|Edge Case}
   
   **Description**: {Test case description}
   
   **Preconditions**:
   - {Precondition 1}
   - {Precondition 2}
   
   **Test Steps**:
   1. {Step 1 action}
   2. {Step 2 action}
   3. {Step 3 action}
   
   **Expected Results**:
   1. {Expected result for step 1}
   2. {Expected result for step 2}
   3. {Expected result for step 3}
   
   **Test Data**:
   - Input: {input value}
   - Expected Output: {expected output value}
   - Boundary Values: {boundary values if applicable}
   
   **Priority**: {High|Medium|Low}
   ```

### Step 5: Include Test Case Details in Files

For each test case, include all essential details:

1. **Test Case Identification**:
   - Test Case ID (e.g., TC-001)
   - Title
   - Description
   - Type (Positive, Negative, Edge Case)

2. **Test Execution Details**:
   - Preconditions (as bullet list)
   - Test Steps (as numbered list)
   - Expected Results (aligned with test steps)

3. **Test Data Section**:
   - Input values
   - Expected output values
   - Boundary values (if applicable)

4. **Requirement Reference**:
   - Requirement key
   - Requirement summary

5. **Priority**:
   - Test case priority (from requirement if available)

### Step 6: Format Test Steps and Expected Results

Format test steps and expected results clearly:

1. **Test Steps**:
   - Format as numbered list (1., 2., 3.)
   - Each step as clear action statement
   - Ensure sequential flow

2. **Expected Results**:
   - Format as numbered list aligned with steps
   - Each result corresponds to test step
   - Ensure clarity and completeness

3. **Alignment**:
   - Ensure expected results align with test steps
   - Use consistent formatting
   - Maintain readability

### Step 7: Use Markdown Tables Where Appropriate

For structured test case data, use markdown tables:

1. **Test Case Summary Table** (optional):
   ```markdown
   | Test Case ID | Title | Type | Priority |
   |-------------|-------|------|----------|
   | TC-001 | Test case title | Positive | High |
   ```

2. **Test Data Table** (if complex):
   ```markdown
   | Input Field | Value | Expected Output |
   |-------------|-------|----------------|
   | Field 1 | Value 1 | Output 1 |
   ```

### Step 8: Write Test Case Files to Context Folders

Write formatted test case files to appropriate context folder:

1. **Ensure Folder Exists**:
   - Check if context folder exists
   - Create folder if it doesn't exist
   - Verify write permissions

2. **Write File**:
   - Write markdown content to file
   - Use generated filename
   - Ensure proper file encoding (UTF-8)

3. **Verify File Creation**:
   - Confirm file written successfully
   - Verify file content
   - Log file path

### Step 9: Confirm File Generation

After generating files for all requirements:

1. **Verify Generation**:
   - Confirm files created for all requirements
   - Verify file formatting
   - Check file content completeness

2. **Log Summary**:
   - Log total files created
   - Log files per requirement
   - Log file paths

3. **Proceed to Next Phase**:
   - Files ready for traceability matrix generation in Phase 11
   - Test cases ready for CSV export

## Output

After this phase, you should have:
- Markdown files for test cases grouped by requirement
- Files formatted following agent-os standards
- Test cases grouped by type (Positive, Negative, Edge Cases)
- All test case details included
- Files stored in correct context folders (`agent-qa/requirement/` or `agent-qa/release/`)

## File Structure

```
agent-qa/requirement/  (or agent-qa/release/)
├── test-cases-PROJ-123.md
├── test-cases-PROJ-124.md
└── ...
```

## Error Handling

- **Missing Test Cases**: Skip requirement if no test cases generated
- **Invalid Filenames**: Handle special characters gracefully
- **Write Errors**: Log errors and continue with other files
- **Missing Data**: Include available data, skip missing fields

