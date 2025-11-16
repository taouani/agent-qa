# PHASE 20: Generate Risk Register Files

Generate markdown files for risk registers grouped by requirement or release with proper formatting and structure, prioritized by risk score, following agent-os markdown standards.

**Context**: This phase takes complete risk structures from Phase 19 and creates markdown files, storing them in the appropriate context folder (`agent-qa/requirement/` or `agent-qa/release/`).

## Core Responsibilities

1. **Access Complete Risk Data**: Access complete risk structures from Phase 19
2. **Determine Risk Register Output Structure**: Determine if single requirement or release/filter context
3. **Generate Mitigation Strategies**: Generate mitigation strategies for all risks
4. **Generate Contingency Plans**: Generate contingency plans for high-risk items only
5. **Create File Naming Logic**: Generate filenames for risk register files
6. **Format Risk Register Files**: Format files as markdown following agent-os standards
7. **Write Files**: Store files in appropriate context folder
8. **Create Summary Index**: Generate index file if multiple registers

## Workflow

### Step 1: Access Complete Risk Data from Phase 19

Access complete risk structures from Phase 19:
- Risk ID, description, category
- Probability, impact, risk score
- Ownership suggestions
- Requirement traceability
- Risk prioritization order

Ensure complete risk data is available before proceeding.

### Step 2: Generate Mitigation Strategies

Generate mitigation strategies for all risks:

1. **Generate High-Level Guidance**:
   - Generate high-level guidance (not detailed implementation steps)
   - Base mitigation strategies on risk type and characteristics
   - Ensure strategies are actionable and relevant

2. **Include Risk Prevention Approaches**:
   - Describe approaches to prevent risk occurrence
   - Provide high-level guidance on prevention
   - Keep guidance actionable but high-level

3. **Include Risk Reduction Strategies**:
   - Describe strategies to reduce risk impact or probability
   - Provide high-level guidance on risk reduction
   - Keep guidance actionable but high-level

4. **Include Risk Monitoring Approaches**:
   - Describe approaches to monitor risk
   - Provide high-level guidance on monitoring
   - Keep guidance actionable but high-level

5. **Store Mitigation Strategies**:
   - Store mitigation strategies with each risk
   - Ensure strategies are linked to risks
   - Prepare for file output

### Step 3: Generate Contingency Plans

Generate contingency plans for high-risk items only:

1. **Identify High-Risk Items**:
   - Identify risks with high risk score (from Phase 19)
   - Determine threshold for high-risk classification (e.g., score >= 6)
   - Ensure high-risk items are clearly identified

2. **Generate Contingency Plans**:
   - Generate necessary details, keep it simple
   - Describe immediate response actions
   - Include escalation procedures (if applicable)
   - Include recovery approaches
   - Ensure contingency plans are practical and actionable

3. **Store Contingency Plans**:
   - Store contingency plans with high-risk items only
   - Ensure plans are linked to risks
   - Prepare for file output

### Step 4: Determine Context Folder

Determine the appropriate context folder:
- If single ticket: Use `agent-qa/requirement/` (created in Phase 1)
- If filter/release: Use `agent-qa/release/` (created in Phase 1)
- Ensure folder exists before writing files

### Step 5: Determine Risk Register Output Structure

Determine the risk register output structure based on context:

1. **Single Requirement Context**:
   - Generate one register per requirement
   - Use requirement key in filename
   - Include requirement reference at top of file

2. **Release/Filter Context**:
   - Generate one register covering entire release/filter scope
   - Use release/filter context in filename
   - Include release/filter reference at top of file

3. **Use Context from Phase 1**:
   - Use the context folder type to determine output structure
   - Match output structure to input type

### Step 6: Create Risk Register File Naming Logic

For each risk register, generate filename:

1. **For Single Requirements**:
   - Format: `risk-register-{REQUIREMENT-KEY}.md` (e.g., `risk-register-PROJ-123.md`)
   - Use requirement key from risk structure
   - Handle special characters: Replace invalid characters with hyphens

2. **For Releases/Filters**:
   - Format: `risk-register-release.md` or `risk-register-{CONTEXT}.md`
   - Use release/filter context for filename
   - Handle special characters appropriately

3. **Ensure Unique Filenames**:
   - Ensure unique filenames for each register
   - Handle filename conflicts if multiple registers

### Step 7: Format Risk Register Files as Markdown

For each risk register, create markdown file following agent-os standards:

1. **File Header**:
   ```markdown
   # Risk Register: {Requirement Key or Release Name}
   
   ## Requirement Reference (for single requirement registers)
   
   | Field | Value |
   |-------|-------|
   | Requirement Key | {key} |
   | Requirement Summary | {summary} |
   | Requirement Status | {status} |
   ```

   OR

   ```markdown
   # Risk Register: {Release/Filter Name}
   
   ## Release Reference (for release registers)
   
   | Field | Value |
   |-------|-------|
   | Release/Filter | {name} |
   | Requirements Count | {count} |
   ```

2. **Risk Summary Section**:
   ```markdown
   ## Risk Summary
   
   - Total Risks: {count}
   - High-Risk Items: {count}
   - Risk Categories: {list}
   ```

3. **Risks Section** (sorted by risk score, highest first):
   ```markdown
   ## Risks
   
   ### {Risk ID}: {Risk Description}
   
   | Field | Value |
   |-------|-------|
   | Risk ID | {id} |
   | Category | {category} |
   | Probability | {probability} |
   | Impact | {impact} |
   | Risk Score | {score} |
   | Ownership Suggestion | {owner} |
   | Requirement Traceability | {requirement keys} |
   
   **Description**: {risk description}
   
   **Mitigation Strategies**:
   - {mitigation strategy 1}
   - {mitigation strategy 2}
   - {mitigation strategy 3}
   
   **Contingency Plan** (if high-risk):
   - {contingency plan details}
   ```

### Step 8: Include All Risk Fields

Ensure all risk fields are included:

1. **Risk ID**: Unique identifier
2. **Risk Description**: Clear description of risk
3. **Risk Category**: Context-based category
4. **Probability**: Predefined scale value
5. **Impact**: Predefined scale value
6. **Risk Score**: Calculated value
7. **Mitigation Strategies**: High-level guidance (for all risks)
8. **Contingency Plans**: Necessary details (for high-risk items only)
9. **Ownership Suggestions**: Suggested owner based on risk type
10. **Requirement Traceability**: Links to specific requirements

### Step 9: Format Risks in Priority Order

Format risks in priority order:

1. **Sort by Risk Score**:
   - Sort risks by risk score (highest first)
   - Ensure risk register output is ordered by priority

2. **Use Markdown Tables**:
   - Use markdown tables for structured risk data
   - Format all risk fields in structured format
   - Ensure tables are readable and well-formatted

3. **Use Markdown Lists**:
   - Use markdown lists for mitigation strategies
   - Use markdown lists for contingency plans
   - Use markdown lists for requirement traceability

4. **Format for Readability**:
   - Use proper spacing and line breaks
   - Ensure content is clear and easy to read
   - Use markdown headings for risk sections

### Step 10: Write Risk Register Files to Context Folders

Write formatted risk register files to appropriate context folder:

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

### Step 11: Create Summary Index File (if multiple registers)

If multiple risk registers were generated, create summary index file:

1. **Generate Index File**:
   - Filename: `risk-registers-index.md` or `risk-registers-summary.md`
   - Include links to all risk register files
   - Include summary statistics

2. **Index File Structure**:
   ```markdown
   # Risk Registers Summary
   
   ## Overview
   
   This document provides an overview of all generated risk registers.
   
   ## Risk Register Files
   
   | Requirement Key | Risk Register File |
   |-----------------|-------------------|
   | PROJ-123 | [risk-register-PROJ-123.md](risk-register-PROJ-123.md) |
   | PROJ-124 | [risk-register-PROJ-124.md](risk-register-PROJ-124.md) |
   
   ## Summary Statistics
   
   - Total Registers: {count}
   - Total Risks: {count}
   - High-Risk Items: {count}
   - Risk Categories: {list}
   - Category Distribution: {distribution}
   ```

3. **Write Index File**:
   - Write index file to context folder
   - Ensure proper file encoding (UTF-8)
   - Verify file creation

## Error Handling

- Handle missing risk data gracefully
- Continue file generation even when some risks have issues
- Provide informative messages when files cannot be created
- Log warnings for risks that may need manual review
- Ensure graceful degradation for missing or incomplete data

## Output

- Risk register files created with proper naming (context-aware)
- Files formatted as markdown following agent-os standards
- All risk fields included in structured format
- Risks formatted in priority order (highest risk score first)
- Mitigation strategies included for all risks
- Contingency plans included for high-risk items only
- Files stored in correct context folders (`agent-qa/requirement/` or `agent-qa/release/`)
- Summary index file created when multiple registers generated

