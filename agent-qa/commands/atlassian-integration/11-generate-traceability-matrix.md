# PHASE 11: Generate Traceability Matrix

Generate CSV export for manual import into Jira Xray and create traceability matrix showing requirement-to-test-case mapping with coverage metrics.

**Context**: This phase creates CSV files compatible with Xray import format and generates traceability matrices showing requirement-to-test-case relationships, storing them in the appropriate context folder (`agent-qa/requirement/` or `agent-qa/release/`).

## Core Responsibilities

1. **Access Test Case Data**: Access test cases from Phase 9 and files from Phase 10
2. **Generate CSV File**: Create CSV file compatible with Xray import format
3. **Format Test Steps for CSV**: Format test steps according to Xray CSV requirements
4. **Create Traceability Matrix**: Generate requirement-to-test-case mapping
5. **Calculate Coverage Metrics**: Calculate test cases per requirement and type breakdown
6. **Create Summary Index**: Generate index file with links, traceability, and metrics

## Workflow

### Step 1: Access Test Case Data

Access test cases from previous phases:
- **From Phase 9**: Test cases in memory grouped by requirement
- **From Phase 10**: Test case markdown files created
- **Requirement Data**: Requirement keys and summaries for traceability

Ensure test case data is available before proceeding.

### Step 2: Determine Context Folder

Determine the appropriate context folder:
- If single ticket: Use `agent-qa/requirement/` (created in Phase 1)
- If filter/release: Use `agent-qa/release/` (created in Phase 1)
- Ensure folder exists before writing files

### Step 3: Generate CSV File for Xray Import

Create CSV file compatible with Xray import format:

1. **CSV Column Structure**:
   - Test Case Key/ID (e.g., TC-001)
   - Test Summary/Title
   - Test Type (Positive, Negative, Edge Case)
   - Preconditions
   - Test Steps (formatted for Xray)
   - Expected Results
   - Requirement Key (for traceability)

2. **CSV Formatting**:
   - Use CSV format with proper escaping
   - Handle special characters (quotes, commas, newlines)
   - Use UTF-8 encoding
   - Include header row

3. **Filename**:
   - Format: `test-cases-xray-import.csv` (for single requirement)
   - Format: `test-cases-xray-import-{CONTEXT}.csv` (for releases)
   - Store in context folder

### Step 4: Format Test Steps for Xray CSV

Format test steps according to Xray CSV requirements:

1. **Xray Test Steps Format**:
   - Format steps as numbered list in single CSV cell
   - Use format: "1. Step 1\n2. Step 2\n3. Step 3"
   - Escape newlines and quotes properly

2. **Expected Results Format**:
   - Format expected results aligned with steps
   - Use format: "1. Result 1\n2. Result 2\n3. Result 3"
   - Ensure proper CSV escaping

3. **CSV Escaping**:
   - Escape quotes by doubling them ("")
   - Escape commas within quoted fields
   - Handle newlines within quoted fields
   - Ensure proper CSV structure

### Step 5: Create Traceability Matrix

Generate requirement-to-test-case mapping:

1. **Matrix Structure**:
   - Format as markdown table
   - Columns: Requirement Key, Requirement Summary, Test Case IDs, Test Case Types
   - Rows: One per requirement

2. **Matrix Content**:
   ```markdown
   | Requirement Key | Requirement Summary | Test Case IDs | Test Case Types |
   |-----------------|---------------------|---------------|-----------------|
   | PROJ-123 | Requirement summary | TC-001, TC-002, TC-003 | Positive, Negative, Edge Case |
   ```

3. **Include All Requirements**:
   - List all requirements with test cases
   - Show all test case IDs per requirement
   - Show test case type breakdown

### Step 6: Calculate Coverage Metrics

Calculate test case coverage metrics:

1. **Test Cases Per Requirement**:
   - Count total test cases per requirement
   - Count test cases by type per requirement
   - Calculate average test cases per requirement

2. **Test Case Type Breakdown**:
   - Count total positive test cases
   - Count total negative test cases
   - Count total edge case test cases
   - Calculate percentages

3. **Overall Coverage Statistics**:
   - Total requirements analyzed
   - Total test cases generated
   - Average test cases per requirement
   - Test case type distribution

### Step 7: Create Summary Index File

Generate summary index file with links and traceability:

1. **File Header**:
   ```markdown
   # Test Cases Summary
   
   ## Overview
   
   This document provides an overview of all generated test cases, traceability matrix, and coverage metrics.
   ```

2. **Test Case Files Section**:
   ```markdown
   ## Test Case Files
   
   | Requirement Key | Test Case File |
   |-----------------|----------------|
   | PROJ-123 | [test-cases-PROJ-123.md](test-cases-PROJ-123.md) |
   ```

3. **Traceability Matrix Section**:
   - Include traceability matrix from Step 5
   - Format as markdown table

4. **Coverage Metrics Section**:
   ```markdown
   ## Coverage Metrics
   
   - Total Requirements: {count}
   - Total Test Cases: {count}
   - Average Test Cases per Requirement: {average}
   - Positive Test Cases: {count} ({percentage}%)
   - Negative Test Cases: {count} ({percentage}%)
   - Edge Case Test Cases: {count} ({percentage}%)
   ```

5. **CSV Export Section**:
   ```markdown
   ## CSV Export
   
   CSV file for Xray import: [test-cases-xray-import.csv](test-cases-xray-import.csv)
   ```

### Step 8: Format Index File Following Agent-OS Standards

Format index file following agent-os markdown standards:

1. **Use Agent-OS Markdown Patterns**:
   - Follow markdown formatting from Phase 8 (requirement files)
   - Use consistent table formatting
   - Use consistent heading structure

2. **Include Links**:
   - Link to all test case files
   - Link to CSV file
   - Ensure all links are relative and correct

3. **Structure Content**:
   - Clear sections with headings
   - Tables for structured data
   - Lists for metrics

### Step 9: Write CSV and Index Files to Context Folder

Write CSV and index files to appropriate context folder:

1. **Ensure Folder Exists**:
   - Check if context folder exists
   - Create folder if it doesn't exist
   - Verify write permissions

2. **Write CSV File**:
   - Write CSV content to file
   - Use generated filename
   - Ensure proper encoding (UTF-8)
   - Verify CSV format correctness

3. **Write Index File**:
   - Write markdown content to index file
   - Filename: `test-cases-index.md` or `test-cases-summary.md`
   - Ensure proper encoding (UTF-8)

4. **Verify File Creation**:
   - Confirm files written successfully
   - Verify file content
   - Log file paths

### Step 10: Confirm Traceability Generation

After generating CSV and traceability files:

1. **Verify Generation**:
   - Confirm CSV file created
   - Confirm traceability matrix created
   - Confirm coverage metrics calculated
   - Confirm index file created

2. **Verify CSV Format**:
   - Check CSV structure
   - Verify Xray compatibility
   - Test CSV parsing if possible

3. **Log Summary**:
   - Log CSV file path
   - Log index file path
   - Log coverage metrics
   - Log traceability matrix statistics

## Output

After this phase, you should have:
- CSV file for Xray import (`test-cases-xray-import.csv`)
- Traceability matrix (in index file)
- Coverage metrics (in index file)
- Summary index file (`test-cases-index.md` or `test-cases-summary.md`)
- All files stored in correct context folders (`agent-qa/requirement/` or `agent-qa/release/`)

## File Structure

```
agent-qa/requirement/  (or agent-qa/release/)
├── test-cases-PROJ-123.md
├── test-cases-PROJ-124.md
├── test-cases-xray-import.csv
└── test-cases-index.md
```

## CSV Format Example

```csv
Test Case Key,Test Summary,Test Type,Preconditions,Test Steps,Expected Results,Requirement Key
TC-001,Verify user login with valid credentials,Positive,"User account exists
System is accessible","1. Navigate to login page
2. Enter valid username
3. Enter valid password
4. Click login button","1. Login page displayed
2. Username entered
3. Password entered
4. User logged in successfully",PROJ-123
```

## Error Handling

- **Missing Test Cases**: Skip requirement in CSV if no test cases
- **CSV Formatting Errors**: Log errors and continue
- **Missing Data**: Include available data, skip missing fields
- **Write Errors**: Log errors and continue with other files

