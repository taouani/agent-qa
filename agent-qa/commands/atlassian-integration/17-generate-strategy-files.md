# PHASE 17: Generate Strategy Files

Generate markdown files for test strategies grouped by requirement or release with proper formatting and structure, following agent-os markdown standards.

**Context**: This phase takes complete strategy structures from Phase 16 and creates markdown files, storing them in the appropriate context folder (`agent-qa/requirement/` or `agent-qa/release/`).

## Core Responsibilities

1. **Access Complete Strategy Data**: Access complete strategy structures from Phase 16
2. **Determine Strategy Output Structure**: Determine if single requirement or release/filter context
3. **Create File Naming Logic**: Generate filenames for strategy files
4. **Format Strategy Files**: Format files as markdown following agent-os standards
5. **Write Files**: Store files in appropriate context folder
6. **Create Summary Index**: Generate index file if multiple strategies

## Workflow

### Step 1: Access Complete Strategy Data from Phase 16

Access complete strategy structures from Phase 16:
- Test levels (Integration, System, UAT with approaches)
- Test types (specific types with approaches)
- Test design techniques (with applications)
- Automation approach (high-level guidance with Playwright)
- Metrics (coverage, defect, test execution, progress)
- Requirement references

Ensure complete strategy data is available before proceeding.

### Step 2: Determine Context Folder

Determine the appropriate context folder:
- If single ticket: Use `agent-qa/requirement/` (created in Phase 1)
- If filter/release: Use `agent-qa/release/` (created in Phase 1)
- Ensure folder exists before writing files

### Step 3: Determine Strategy Output Structure

Determine the strategy output structure based on context:

1. **Single Requirement Context**:
   - Generate one strategy per requirement
   - Use requirement key in filename
   - Include requirement reference at top of file

2. **Release/Filter Context**:
   - Generate one strategy covering entire release/filter scope
   - Use release/filter context in filename
   - Include release/filter reference at top of file

3. **Use Context from Phase 1**:
   - Use the context folder type to determine output structure
   - Match output structure to input type

### Step 4: Create Strategy File Naming Logic

For each strategy, generate filename:

1. **For Single Requirements**:
   - Format: `test-strategy-{REQUIREMENT-KEY}.md` (e.g., `test-strategy-PROJ-123.md`)
   - Use requirement key from strategy structure
   - Handle special characters: Replace invalid characters with hyphens

2. **For Releases/Filters**:
   - Format: `test-strategy-release.md` or `test-strategy-{CONTEXT}.md`
   - Use release/filter context for filename
   - Handle special characters appropriately

3. **Ensure Unique Filenames**:
   - Ensure unique filenames for each strategy
   - Handle filename conflicts if multiple strategies

### Step 5: Format Strategy Files as Markdown

For each strategy, create markdown file following agent-os standards:

1. **File Header**:
   ```markdown
   # Test Strategy: {Requirement Key or Release Name}
   
   ## Requirement Reference (for single requirement strategies)
   
   | Field | Value |
   |-------|-------|
   | Requirement Key | {key} |
   | Requirement Summary | {summary} |
   | Requirement Status | {status} |
   ```

   OR

   ```markdown
   # Test Strategy: {Release/Filter Name}
   
   ## Release Reference (for release strategies)
   
   | Field | Value |
   |-------|-------|
   | Release/Filter | {name} |
   | Requirements Count | {count} |
   ```

2. **Test Levels Section**:
   ```markdown
   ## Test Levels
   
   ### Integration Testing
   
   {Integration testing approach description}
   
   ### System Testing
   
   {System testing approach description}
   
   ### User Acceptance Testing (UAT)
   
   {UAT approach description}
   ```

3. **Test Types Section**:
   ```markdown
   ## Test Types
   
   ### {Test Type Name}
   
   {Test type approach description}
   
   ### {Another Test Type Name}
   
   {Test type approach description}
   ```

4. **Test Design Techniques Section**:
   ```markdown
   ## Test Design Techniques
   
   ### {Technique Name}
   
   {Technique application description}
   
   ### {Another Technique Name}
   
   {Technique application description}
   ```

5. **Automation Approach Section**:
   ```markdown
   ## Automation Approach
   
   ### Automation Strategy
   
   {Automation strategy guidance}
   
   ### Framework Approach
   
   {Framework approach guidance}
   
   ### Automation Scope
   
   {Automation scope guidance}
   
   ### Automation Tool
   
   **Playwright** is specified as the automation tool for this strategy.
   
   {High-level Playwright guidance}
   ```

6. **Metrics Section**:
   ```markdown
   ## Metrics
   
   ### Coverage Metrics
   
   - **Requirement Coverage**: {definition and tracking approach}
   - **Test Case Coverage**: {definition and tracking approach}
   - **Test Level Coverage**: {definition and tracking approach}
   - **Test Type Coverage**: {definition and tracking approach}
   
   ### Defect Metrics
   
   - **Defect Density**: {definition and tracking approach}
   - **Defect Distribution**: {definition and tracking approach}
   - **Defect Severity Distribution**: {definition and tracking approach}
   
   ### Test Execution Metrics
   
   - **Test Execution Progress**: {definition and tracking approach}
   - **Pass/Fail Rates**: {definition and tracking approach}
   - **Test Execution Time**: {definition and tracking approach}
   
   ### Progress Metrics
   
   - **Test Planning Progress**: {definition and tracking approach}
   - **Test Execution Progress**: {definition and tracking approach}
   - **Test Completion Status**: {definition and tracking approach}
   ```

### Step 6: Include All Strategy Fields

Ensure all strategy fields are included:

1. **Test Levels**:
   - Integration Testing (with approach)
   - System Testing (with approach)
   - UAT (with approach)

2. **Test Types**:
   - All identified test types (with approach for each)

3. **Test Design Techniques**:
   - All selected techniques (with application for each)

4. **Automation Approach**:
   - Automation strategy guidance
   - Framework approach guidance
   - Automation scope guidance
   - Playwright specification

5. **Metrics**:
   - Coverage metrics (with tracking approach)
   - Defect metrics (with tracking approach)
   - Test execution metrics (with tracking approach)
   - Progress metrics (with tracking approach)

### Step 7: Use Markdown Formatting Appropriately

Format strategy content using markdown effectively:

1. **Use Markdown Lists**:
   - Use bullet lists for metrics, test types, techniques
   - Use numbered lists for sequential information

2. **Use Markdown Tables**:
   - Use tables for structured data (requirement references, metrics)
   - Ensure tables are readable and well-formatted

3. **Use Headings**:
   - Use clear heading hierarchy (##, ###)
   - Ensure consistent heading structure

4. **Format for Readability**:
   - Use proper spacing and line breaks
   - Ensure content is clear and easy to read

### Step 8: Write Strategy Files to Context Folders

Write formatted strategy files to appropriate context folder:

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

### Step 9: Create Summary Index File (if multiple strategies)

If multiple strategies were generated, create summary index file:

1. **Generate Index File**:
   - Filename: `test-strategies-index.md` or `test-strategies-summary.md`
   - Include links to all strategy files
   - Include summary statistics

2. **Index File Structure**:
   ```markdown
   # Test Strategies Summary
   
   ## Overview
   
   This document provides an overview of all generated test strategies.
   
   ## Test Strategy Files
   
   | Requirement Key | Strategy File |
   |-----------------|---------------|
   | PROJ-123 | [test-strategy-PROJ-123.md](test-strategy-PROJ-123.md) |
   | PROJ-124 | [test-strategy-PROJ-124.md](test-strategy-PROJ-124.md) |
   
   ## Summary Statistics
   
   - Total Strategies: {count}
   - Total Requirements: {count}
   - Test Levels Covered: Integration, System, UAT
   - Test Types Identified: {list}
   - Test Design Techniques: {list}
   ```

3. **Write Index File**:
   - Write index file to context folder
   - Ensure proper file encoding (UTF-8)
   - Verify file creation

## Error Handling

- Handle missing strategy data gracefully
- Continue file generation even when some strategy components are missing
- Provide informative messages when files cannot be created
- Log warnings for strategies that may need manual review
- Ensure graceful degradation for missing or incomplete data

## Output

- Strategy files created with proper naming (context-aware)
- Files formatted as markdown following agent-os standards
- All strategy fields included in structured format
- Files stored in correct context folders (`agent-qa/requirement/` or `agent-qa/release/`)
- Summary index file created when multiple strategies generated

