# PHASE 14: Generate Charter Files

Generate markdown files for test charters grouped by requirement or release with proper formatting and structure, following agent-os markdown standards.

**Context**: This phase takes complete charter structures from Phase 13 and creates markdown files, storing them in the appropriate context folder (`agent-qa/requirement/` or `agent-qa/release/`).

## Core Responsibilities

1. **Access Complete Charter Data**: Access complete charter structures from Phase 13
2. **Determine Charter Output Structure**: Determine if single requirement or release/filter context
3. **Create File Naming Logic**: Generate filenames for charter files
4. **Format Charter Files**: Format files as markdown following agent-os standards
5. **Write Files**: Store files in appropriate context folder
6. **Create Summary Index**: Generate index file if multiple charters

## Workflow

### Step 1: Access Complete Charter Data from Phase 13

Access complete charter structures from Phase 13:
- Mission/goal, scope (in/out), areas to explore
- Test approach, risks, resource requirements, time estimates
- Requirement references

Ensure complete charter data is available before proceeding.

### Step 2: Determine Context Folder

Determine the appropriate context folder:
- If single ticket: Use `agent-qa/requirement/` (created in Phase 1)
- If filter/release: Use `agent-qa/release/` (created in Phase 1)
- Ensure folder exists before writing files

### Step 3: Determine Charter Output Structure

Determine the charter output structure based on context:

1. **Single Requirement Context**:
   - Generate one charter per requirement
   - Use requirement key in filename
   - Include requirement reference at top of file

2. **Release/Filter Context**:
   - Generate one charter covering entire release/filter scope
   - Use release/filter context in filename
   - Include release/filter reference at top of file

3. **Use Context from Phase 1**:
   - Use the context folder type to determine output structure
   - Match output structure to input type

### Step 4: Create Charter File Naming Logic

For each charter, generate filename:

1. **For Single Requirements**:
   - Format: `test-charter-{REQUIREMENT-KEY}.md` (e.g., `test-charter-PROJ-123.md`)
   - Use requirement key from charter structure
   - Handle special characters: Replace invalid characters with hyphens

2. **For Releases/Filters**:
   - Format: `test-charter-release.md` or `test-charter-{CONTEXT}.md`
   - Use release/filter context for filename
   - Handle special characters appropriately

3. **Ensure Unique Filenames**:
   - Ensure unique filenames for each charter
   - Handle filename conflicts if multiple charters

### Step 5: Format Charter Files as Markdown

For each charter, create markdown file following agent-os standards:

1. **File Header**:
   ```markdown
   # Test Charter: {Requirement Key or Release Name}
   
   ## Requirement Reference (for single requirement charters)
   
   | Field | Value |
   |-------|-------|
   | Requirement Key | {key} |
   | Requirement Summary | {summary} |
   | Requirement Status | {status} |
   ```

   OR

   ```markdown
   # Test Charter: {Release/Filter Name}
   
   ## Release Reference (for release charters)
   
   | Field | Value |
   |-------|-------|
   | Release/Filter | {name} |
   | Requirements Count | {count} |
   ```

2. **Mission/Goal Section**:
   ```markdown
   ## Mission/Goal
   
   {Mission/goal statement}
   ```

3. **Scope Section**:
   ```markdown
   ## Scope
   
   ### In Scope
   
   {List of requirements/features included in scope}
   
   ### Out of Scope
   
   {List of requirements/features excluded (if applicable)}
   ```

4. **Areas to Explore Section**:
   ```markdown
   ## Areas to Explore
   
   ### Complex Areas
   
   {List of complex areas identified}
   
   ### Edge Cases and Boundary Conditions
   
   {List of edge cases and boundary conditions}
   
   ### Integration Points
   
   {List of integration points}
   ```

5. **Test Approach Section**:
   ```markdown
   ## Test Approach
   
   ### Exploratory Testing Techniques
   
   {Description of exploratory testing techniques}
   
   ### Session-Based Testing
   
   {Description of session-based testing methodology}
   
   ### Session Execution Guidance
   
   {Guidance on session execution, debriefing, and reporting}
   ```

6. **Risks Section**:
   ```markdown
   ## Risks
   
   | Risk ID | Description | Category | Potential Impact |
   |---------|------------|----------|-----------------|
   | R-001 | {description} | {category} | {impact} |
   ```

7. **Resource Requirements Section**:
   ```markdown
   ## Resource Requirements
   
   ### Tester Roles
   
   - {Role 1}
   - {Role 2}
   
   ### Skills Required
   
   - {Skill 1}
   - {Skill 2}
   
   ### Tools Required
   
   - {Tool 1}
   - {Tool 2}
   ```

8. **Time Estimates Section**:
   ```markdown
   ## Time Estimates
   
   - **Total Time**: {total time estimate}
   - **Time Breakdown**: {breakdown by area}
   - **Session Estimate**: {number of sessions}
   ```

### Step 6: Include All Charter Fields

Ensure all charter fields are included in the markdown file:

1. **Required Sections**:
   - Mission/Goal
   - Scope (In)
   - Scope (Out) - if applicable
   - Areas to Explore
   - Test Approach
   - Risks
   - Resource Requirements
   - Time Estimates

2. **Optional Sections**:
   - Requirement Reference (for single requirement charters)
   - Release Reference (for release charters)

### Step 7: Use Markdown Formatting Appropriately

Format charter content using markdown effectively:

1. **Use Markdown Lists**:
   - Use bullet lists for requirements, exploration areas, roles, skills, tools
   - Use numbered lists for sequential information

2. **Use Markdown Tables**:
   - Use tables for structured data (risks, requirement references)
   - Ensure tables are readable and well-formatted

3. **Use Headings**:
   - Use clear heading hierarchy (##, ###)
   - Ensure consistent heading structure

4. **Format for Readability**:
   - Use proper spacing and line breaks
   - Ensure content is clear and easy to read

### Step 8: Write Charter Files to Context Folders

Write formatted charter files to appropriate context folder:

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

### Step 9: Create Summary Index File (if multiple charters)

If multiple charters were generated, create summary index file:

1. **Generate Index File**:
   - Filename: `test-charters-index.md` or `test-charters-summary.md`
   - Include links to all charter files
   - Include summary statistics

2. **Index File Structure**:
   ```markdown
   # Test Charters Summary
   
   ## Overview
   
   This document provides an overview of all generated test charters.
   
   ## Test Charter Files
   
   | Requirement Key | Charter File |
   |-----------------|--------------|
   | PROJ-123 | [test-charter-PROJ-123.md](test-charter-PROJ-123.md) |
   | PROJ-124 | [test-charter-PROJ-124.md](test-charter-PROJ-124.md) |
   
   ## Summary Statistics
   
   - Total Charters: {count}
   - Total Requirements: {count}
   - Total Exploration Areas: {count}
   - Total Risks Identified: {count}
   ```

3. **Write Index File**:
   - Write index file to context folder
   - Ensure proper formatting
   - Verify file creation

### Step 10: Confirm File Generation

After generating files for all charters:

1. **Verify Generation**:
   - Confirm files created for all charters
   - Verify file formatting
   - Check file content completeness
   - Verify index file created (if applicable)

2. **Log Summary**:
   - Log total files created
   - Log files per requirement/release
   - Log file paths

3. **Complete**:
   - All charter files generated successfully
   - Files stored in correct context folders
   - Ready for use

## Output

After this phase, you should have:
- Markdown files for test charters (one per requirement OR one per release/filter)
- Files formatted following agent-os standards
- All charter fields included in structured format
- Files stored in correct context folders (`agent-qa/requirement/` or `agent-qa/release/`)
- Summary index file (if multiple charters generated)

## File Structure

```
agent-qa/requirement/  (or agent-qa/release/)
├── test-charter-PROJ-123.md
├── test-charter-PROJ-124.md
└── test-charters-index.md  (if multiple charters)
```

OR

```
agent-qa/release/
├── test-charter-release.md
└── test-charters-index.md  (if applicable)
```

## Error Handling

- **Missing Charter Data**: Skip charter if data not available
- **Invalid Filenames**: Handle special characters gracefully
- **Write Errors**: Log errors and continue with other files
- **Missing Data**: Include available data, skip missing fields

