# PHASE 3: Generate Test Cases Content

Generate comprehensive test cases (positive, negative, edge cases) based on requirements and related deliverables, following senior QA architect best practices.

## Core Responsibilities

1. **Determine Test Case Source**: Use acceptance criteria if available, otherwise use requirement description
2. **Generate Positive Test Cases**: Apply the test-case-design role's positive-cases craft to derive positive/happy path test cases with proper structure
3. **Generate Negative Test Cases**: Apply the role's negative-cases craft to derive test cases covering failure scenarios
4. **Generate Edge Cases**: Apply the role's edge-cases craft to derive test cases with boundary conditions
5. **Generate Test Data**: Apply the role's craft to generate specific test data values based on requirement context
6. **Assign Priority**: Apply the role's priority-and-risk-classification craft to assign priority based on business impact and risk (P1-P4)
7. **Include Traceability**: Apply the role's traceability craft to include explicit requirement references in test cases
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

### Step 3: Generate the Test Cases

Apply `@agent-qa/roles/test-case-design.md` to the requirements loaded in Phase 2. Supply: the
requirement set with its acceptance criteria, the language detected in Step 1, the `test_types`
configured in `agent-qa/config.yml`, and any test charter or test strategy present in the selected
output folder.

The role owns how cases are derived, prioritised and validated. This phase owns only what is
supplied to it and what happens next.

## Important Constraints

- The applied role generates all three types automatically (positive, negative, edge cases)
- The applied role generates specific test data values when possible
- The applied role includes requirement traceability with explicit references
- Use in-memory requirement structures
- Match language of original requirements (automatic detection)
- The applied role follows senior QA architect best practices
- The applied role assigns priorities based on business impact and risk
- The applied role includes regression suite recommendations
- The applied role validates against quality criteria before finalizing

