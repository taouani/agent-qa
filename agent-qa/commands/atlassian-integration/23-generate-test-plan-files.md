# PHASE 23: Generate Test Plan Files

Generate markdown files for test plans grouped by requirement or release with proper formatting and structure, including deliverables listing and referencing.

**Context**: This phase takes complete test plan structures from Phases 21-22 and creates markdown files, storing them in the appropriate context folder (`agent-qa/requirement/` or `agent-qa/release/`).

## Core Responsibilities

1. **Access Complete Test Plan Data**: Access complete test plan structures from Phases 21-22
2. **Identify Generated Deliverables**: Identify all generated deliverable files
3. **Create Links to Deliverables**: Create markdown links to generated deliverables
4. **List Expected Deliverables**: List expected deliverables (test reports, etc.)
5. **Determine Test Plan Output Structure**: Determine if single requirement or release/filter context
6. **Create File Naming Logic**: Generate filenames for test plan files
7. **Format Test Plan Files**: Format files as markdown following agent-os standards
8. **Write Files**: Store files in appropriate context folder
9. **Create Summary Index**: Generate index file if multiple plans

## Workflow

### Step 1: Access Complete Test Plan Data from Phases 21-22

Access complete test plan structures from Phases 21-22:
- Executive summary
- Test objectives (derived from test cases and test strategies)
- Scope definition (requirements and test cases, in-scope and out-of-scope)
- Test strategy links
- Environment requirements guidance
- Schedules (time estimates, milestones, phases)
- Entry criteria
- Exit criteria
- File references from folders

Ensure complete test plan data is available before proceeding.

### Step 2: Identify Generated Deliverables

Identify generated deliverable files in context folder:

1. **Determine Context Folder**:
   - If single ticket: Use `agent-qa/requirement/` (created in Phase 1)
   - If filter/release: Use `agent-qa/release/` (created in Phase 1)
   - Use context folder from Phase 1

2. **Identify Test Case Files**:
   - Identify test case files (from phases 9-11)
   - Look for files matching pattern `test-cases-*.md` or `test-case-*.md`
   - Store file paths and names

3. **Identify Test Strategy Files**:
   - Identify test strategy files (from phases 15-17)
   - Look for files matching pattern `test-strategy-*.md`
   - Store file paths and names

4. **Identify Test Charter Files**:
   - Identify test charter files (from phases 12-14)
   - Look for files matching pattern `test-charter-*.md`
   - Store file paths and names

5. **Identify Risk Register Files**:
   - Identify risk register files (from phases 18-20)
   - Look for files matching pattern `risk-register-*.md`
   - Store file paths and names

6. **Identify Traceability Matrix Files**:
   - Identify traceability matrix files (from phase 11)
   - Look for files matching pattern `traceability-matrix*.csv` or `traceability*.csv`
   - Store file paths and names

7. **Handle Missing Files**:
   - Handle missing files gracefully
   - Provide informative messages when files are not found
   - Continue test plan generation even if some files are missing

### Step 3: Create Links to Generated Deliverables

Create markdown links to generated deliverables:

1. **Create Links to Test Case Files**:
   - Create markdown links to test case files
   - Use relative paths from test plan file location
   - Format links as `[Test Cases: {Name}](./test-cases-{KEY}.md)`
   - Ensure links are correct and accessible

2. **Create Links to Test Strategy Files**:
   - Create markdown links to test strategy files
   - Use relative paths from test plan file location
   - Format links as `[Test Strategy: {Name}](./test-strategy-{KEY}.md)`
   - Ensure links are correct and accessible

3. **Create Links to Test Charter Files**:
   - Create markdown links to test charter files
   - Use relative paths from test plan file location
   - Format links as `[Test Charter: {Name}](./test-charter-{KEY}.md)`
   - Ensure links are correct and accessible

4. **Create Links to Risk Register Files**:
   - Create markdown links to risk register files
   - Use relative paths from test plan file location
   - Format links as `[Risk Register: {Name}](./risk-register-{KEY}.md)`
   - Ensure links are correct and accessible

5. **Create Links to Traceability Matrix Files**:
   - Create markdown links to traceability matrix files
   - Use relative paths from test plan file location
   - Format links as `[Traceability Matrix](./traceability-matrix.csv)`
   - Ensure links are correct and accessible

6. **Store Deliverable Links**:
   - Store all deliverable links
   - Prepare for inclusion in test plan files

### Step 4: List Expected Deliverables

List expected deliverables (not yet generated):

1. **List Test Reports**:
   - List test reports as expected deliverables
   - Include test execution reports
   - Include test summary reports
   - Include defect reports

2. **List Other Expected Deliverables**:
   - List other expected deliverables
   - Include test completion reports
   - Include sign-off documents
   - Include any other expected deliverables

3. **Structure Expected Deliverables**:
   - Structure expected deliverables clearly
   - Format deliverables for readability
   - Ensure deliverables are clearly listed

4. **Store Expected Deliverables**:
   - Store expected deliverables list
   - Prepare for inclusion in test plan files

### Step 5: Determine Test Plan Output Structure

Determine the test plan output structure based on context:

1. **Single Requirement Context**:
   - Generate one plan per requirement
   - Use requirement key in filename
   - Include requirement reference at top of file

2. **Release/Filter Context**:
   - Generate one plan covering entire release/filter scope
   - Use release/filter context in filename
   - Include release/filter reference at top of file

3. **Use Context from Phase 1**:
   - Use the context folder type to determine output structure
   - Match output structure to input type

### Step 6: Create Test Plan File Naming Logic

For each test plan, generate filename:

1. **For Single Requirements**:
   - Format: `test-plan-{REQUIREMENT-KEY}.md` (e.g., `test-plan-PROJ-123.md`)
   - Use requirement key from test plan structure
   - Handle special characters: Replace invalid characters with hyphens

2. **For Releases/Filters**:
   - Format: `test-plan-release.md` or `test-plan-{CONTEXT}.md`
   - Use release/filter context for filename
   - Handle special characters appropriately

3. **Ensure Unique Filenames**:
   - Ensure unique filenames for each test plan
   - Handle filename conflicts if multiple plans

### Step 7: Format Test Plan Files as Markdown

For each test plan, create markdown file following agent-os standards:

1. **File Header**:
   ```markdown
   # Test Plan: {Requirement Key or Release Name}
   
   ## Requirement Reference (for single requirement plans)
   
   | Field | Value |
   |-------|-------|
   | Requirement Key | {REQUIREMENT-KEY} |
   | Requirement Summary | {Summary} |
   | Requirement Status | {Status} |
   
   ## Release/Filter Reference (for release plans)
   
   | Field | Value |
   |-------|-------|
   | Release/Filter | {Release/Filter Name} |
   | Scope | {Scope Description} |
   ```

2. **Executive Summary Section**:
   ```markdown
   ## Executive Summary
   
   {Executive summary from Phase 21}
   ```

3. **Test Objectives Section**:
   ```markdown
   ## Test Objectives
   
   {Test objectives from Phase 21, derived from test cases and test strategies}
   ```

4. **Scope Section**:
   ```markdown
   ## Scope
   
   ### In Scope
   
   {In-scope items from Phase 21}
   
   ### Out of Scope
   
   {Out-of-scope items from Phase 21, if applicable}
   ```

5. **Test Strategy Section**:
   ```markdown
   ## Test Strategy
   
   {Test strategy links from Phase 22}
   
   Refer to the following test strategy documents:
   - {Test strategy link 1}
   - {Test strategy link 2}
   ```

6. **Environment Requirements Section**:
   ```markdown
   ## Environment Requirements
   
   {Environment requirements guidance from Phase 22}
   ```

7. **Schedules Section**:
   ```markdown
   ## Schedules
   
   ### Time Estimates
   
   {Time estimates/ranges from Phase 22}
   
   ### Milestones
   
   {Milestones from Phase 22}
   
   ### Phases
   
   {Phases from Phase 22}
   ```

8. **Entry Criteria Section**:
   ```markdown
   ## Entry Criteria
   
   {Entry criteria from Phase 22}
   ```

9. **Exit Criteria Section**:
   ```markdown
   ## Exit Criteria
   
   {Exit criteria from Phase 22}
   ```

10. **Deliverables Section**:
    ```markdown
    ## Deliverables
    
    ### Generated Deliverables
    
    {Deliverable links from Step 3}
    
    ### Expected Deliverables
    
    {Expected deliverables from Step 4}
    ```

### Step 8: Include All Test Plan Fields

Ensure all test plan fields are included:

1. **Verify All Sections**:
   - Executive summary section
   - Test objectives section
   - Scope section (in/out)
   - Test strategy section (reference/link)
   - Environment requirements section
   - Schedules section (time estimates/ranges, milestones, phases)
   - Entry criteria section
   - Exit criteria section
   - Deliverables section (with links)

2. **Use Markdown Formatting Appropriately**:
   - Use markdown lists and tables for structured data where appropriate
   - Format content for readability and clarity
   - Include links to referenced deliverables
   - Ensure all test plan fields in structured format

### Step 9: Write Test Plan Files to Context Folders

Write test plan files to appropriate context folders:

1. **Determine Context Folder**:
   - If single ticket: Use `agent-qa/requirement/` (created in Phase 1)
   - If filter/release: Use `agent-qa/release/` (created in Phase 1)
   - Ensure folder exists before writing

2. **Write Files**:
   - Write test plan files to context folder
   - Use filenames from Step 6
   - Ensure files are written successfully

3. **Verify Files Written**:
   - Verify test plan files are written
   - Ensure files are accessible
   - Check file formatting

### Step 10: Create Summary Index File (if multiple plans)

If multiple test plans are generated, create summary index file:

1. **Generate Index File**:
   - Generate index file listing all test plan files with links
   - Format index file as markdown following agent-os standards
   - Include summary statistics if applicable

2. **Index File Format**:
   ```markdown
   # Test Plans Index
   
   ## Summary
   
   - Total Test Plans: {count}
   - Requirements Covered: {count}
   - Test Cases Covered: {count}
   
   ## Test Plans
   
   - [Test Plan: {Name}](./test-plan-{KEY}.md)
   - [Test Plan: {Name}](./test-plan-{KEY}.md)
   ```

3. **Write Index File**:
   - Write index file to context folder
   - Use filename `test-plans-index.md`
   - Ensure file is written successfully

## Output Confirmation

After completing this phase, you should have:

- ✅ Generated deliverables identified and linked
- ✅ Expected deliverables listed
- ✅ Test plan files created with proper naming (context-aware)
- ✅ Files formatted as markdown following agent-os standards
- ✅ All test plan fields included in structured format
- ✅ Links to referenced deliverables included
- ✅ Files stored in correct context folders
- ✅ Summary index file created when multiple plans generated

## Error Handling

- Handle missing or incomplete data gracefully
- Continue test plan generation even when some sources have issues
- Provide informative messages when data cannot be determined
- Log warnings for test plans that may need manual review
- Handle missing referenced files gracefully (provide informative messages)
- Ensure graceful degradation for missing or incomplete data

