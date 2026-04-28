# PHASE 4: Generate Test Case Files

Generate test case markdown files and CSV export in the appropriate output folder, following Xray import standards.

## Core Responsibilities

1. **Group Test Cases**: Group test cases by requirement
2. **Generate Markdown Files**: Create markdown files with YAML front matter
3. **Generate CSV Export**: Create CSV file for Xray bulk import with proper format
4. **Create Traceability Matrix**: Create traceability matrix/summary
5. **Write Files**: Write files to test-cases folder

## Workflow

### Step 1: Group Test Cases by Requirement

Organize test cases by requirement key, maintaining priority order (P1 first, then P2, P3, P4).

### Step 2: Generate Markdown Files

For each requirement, create file: `test-cases-{KEY}.md`

**YAML Front Matter** (for each test case):
```yaml
---
id: TC-PROJ-123-001
summary: Verify successful user login with valid credentials
requirementKey: PROJ-123
testType: Manual
priority: P1
type: Happy Path
regressionSuite: true
riskLevel: High
effort: Medium
tags: [login, auth, security, regression]
businessRules: [BR-001, BR-002]
dependencies: [User account exists, System accessible]
estimatedDuration: 5 minutes
language: en
---
```

**Markdown Structure**:
```markdown
# TC-PROJ-123-001: Verify successful user login with valid credentials

## Test Objective
[Brief test objective - NO preconditions here]

## User Story Reference
**Story**: PROJ-123 - [Summary]
**Requirement Key**: PROJ-123
**Business Value**: [Business value if available]

## Business Rules Covered
- BR-001: [Business rule description]
- BR-002: [Business rule description]

## Prerequisites
- User account exists in the system
- Application is accessible
- Test user credentials are available

## Test Data Requirements
| Data Element | Value | Notes |
|--------------|-------|-------|
| Email | test.user@company.com | Valid registered user |
| Password | TestPass123! | Meets password policy |

## Test Steps

### Setup
1. Ensure application is running and accessible
2. Clear browser cache and cookies
3. Navigate to login page

### Execution
1. **Navigate** to the application login page
   - **Expected**: Login form is displayed with email and password fields

2. **Enter** valid email address `<VALID_EMAIL>` in the email field
   - **Expected**: Email is accepted and field validation passes

3. **Enter** valid password `<VALID_PASSWORD>` in the password field
   - **Expected**: Password is masked and field validation passes

4. **Click** the "Login" button
   - **Expected**: Authentication process initiates

5. **Verify** user is redirected to the dashboard page
   - **Expected**: Dashboard loads with user-specific content

## Expected Results
- User successfully authenticates and accesses the system
- Dashboard displays personalized content
- Session is properly established with correct permissions
- No error messages or unexpected behavior

## Postconditions
- User is logged into the system
- User session is active
- Dashboard is displayed

## Risk Mitigation
- **High Risk**: Authentication failure could prevent all user access
- **Security Risk**: Improper session handling could lead to unauthorized access
- **Business Impact**: Login issues directly affect user experience and revenue

## Notes and Assumptions
- Test assumes standard browser behavior
- Network connectivity is stable
- Backend authentication service is operational

## Traceability
- **Requirement**: PROJ-123
- **Acceptance Criteria**: AC-001, AC-002
- **Business Rules**: BR-001, BR-002, BR-003
- **Related Tests**: TC-PROJ-123-002 (Invalid login), TC-PROJ-123-010 (Session timeout)
```

### Step 3: Generate Xray JSON Export (if enabled)

Check `agent-qa/config.yml` → `output_formats.xray_json`. If `true`:

1. Read `agent-qa/formats/xray/xray-json-template.md` for the JSON structure and field mapping
2. Check for custom template at `agent-qa/custom-templates/xray/xray-json-template.md` first
3. Generate `xray-import.json` containing a `tests` array with all test cases

**Key mapping rules** (see template for full details):
- Priority: P1→Critical, P2→High, P3→Medium, P4→Low
- Preconditions become separate entities with their own `fields.summary` and `fields.description`
- Deduplicate shared preconditions across test cases
- Steps map to `action`, `data`, `result` objects
- Folder path: `/{REQUIREMENT-KEY}`
- Labels from test case tags + `custom_labels` from config
- `xray_test_sets` and `xray_test_plans` if grouping info is available

**Output file**: `xray-import.json` in the test-cases folder.

### Step 4: Generate TestRail CSV Export (if enabled)

Check `agent-qa/config.yml` → `output_formats.testrail`. If `true`:

1. Check for custom template at `agent-qa/custom-templates/testrail/testrail-csv-template.md` first
2. If no custom template exists, read `agent-qa/formats/testrail/testrail-csv-template.md` for the CSV structure and field mapping
3. Generate `testrail-import.csv` with TestRail column format

**Key mapping rules** (see template for full details):
- Title: `TC-{REQUIREMENT-KEY}-{NNN}: {summary}`
- Section: requirement key (e.g., `PROJ-123`)
- Type: mapped from test type (default: `Functional`)
- Priority: P1→Critical, P2→High, P3→Medium, P4→Low
- Estimate: converted from `estimatedDuration` (e.g., `5 minutes` → `5m`)
- Steps: numbered format with each step on a new line (`1. Step text\n2. Step text`)
- Expected Results: numbered format matching steps by position
- Preconditions: plain text with line breaks
- Custom Automation Type: `None` unless otherwise specified

**Output file**: `testrail-import.csv` in the test-cases folder.

### Step 5: Generate CSV Export for Xray

Create CSV file `xray-bulk-import.csv` with **exact Xray column headers**:

**CSV Column Headers** (exact format):
```csv
Test Key,Summary,Test Type,Priority,Labels,Preconditions,Steps,Expected Result,Requirement Keys,Folder Path
```

**Critical Field Separation**:
- **Summary**: Brief test title
- **Description**: Only the test objective (NO preconditions)
- **Preconditions**: Separate field with bulleted prerequisites using line breaks (`\n`)
- **Steps**: Pipe-separated format: `StepNumber|Action|Data|Expected Result`
- **Expected Result**: Final verification result

**Step Format for CSV**:
```
1|Navigate to the application login page||Login page is displayed
2|Enter <VALID_EMAIL> in the email field|<VALID_EMAIL>|Email is entered
3|Enter <VALID_PASSWORD> in the password field|<VALID_PASSWORD>|Password is entered
4|Click the "Login" button||Login button is clicked
5|Verify user is redirected to the dashboard||Dashboard page is loaded
```

**Preconditions Format**:
```
• User account exists in the system\n• Application is accessible\n• Test user credentials are available
```

**CSV Row Example**:
```csv
,"Verify successful user login with valid credentials",Manual,P1,"login,auth,security,regression","• User account exists\n• Application is accessible\n• Test user credentials are available","1|Navigate to login page||Login page is displayed\n2|Enter <VALID_EMAIL> in email field|<VALID_EMAIL>|Email is entered\n3|Enter <VALID_PASSWORD> in password field|<VALID_PASSWORD>|Password is entered\n4|Click Login button||Login button is clicked\n5|Verify dashboard redirect||Dashboard page is loaded","User successfully authenticates and accesses the system","PROJ-123","/"
```

**CSV Formatting Rules**:
- Empty Test Key field (allows Xray to auto-generate test IDs)
- Steps use pipe-separated format: `Number|Action|Data|Expected Result`
- Each step on new line within quoted cell
- Preconditions use bullet points with `\n` line breaks
- Labels are comma-separated without spaces
- Priority values: P1, P2, P3, P4
- Test Type: "Manual"
- Folder Path starts with forward slash
- Proper CSV escaping for quotes (double quotes: `""`)

### Step 6: Create Traceability Matrix

Create `test-cases-traceability-matrix.md`:

**Coverage Matrix**:
| Requirement Key | Total Tests | Positive | Negative | Edge Cases | Coverage % |
|----------------|-------------|----------|----------|------------|------------|
| PROJ-123 | 8 | 3 | 3 | 2 | 100% |
| PROJ-124 | 6 | 2 | 2 | 2 | 95% |

**Coverage Analysis**:
- Requirements coverage: X/Y requirements covered (Z%)
- Acceptance criteria coverage: X/Y AC items covered (Z%)
- Gap analysis: Identify missing coverage areas

### Step 7: Create Test Suite Index

Create `test-cases-index.md`:
- Summary statistics (total tests, breakdown by priority, type, regression)
- Test case inventory with links
- Coverage mapping to requirements
- Regression suite recommendations with rationale

### Step 8: Write Files

Write all files to:
- Output folder: `agent-qa/YYYY-MM-DD-{folder-name}/test-cases/`
- Individual test case files: `test-cases-{KEY}.md`
- CSV export: `xray-bulk-import.csv`
- Xray JSON export (if enabled): `xray-import.json`
- TestRail CSV export (if enabled): `testrail-import.csv`
- Traceability matrix: `test-cases-traceability-matrix.md`
- Test suite index: `test-cases-index.md`

### Step 9: Generate Output Index

Follow the instructions in `@agent-qa/commands/common/generate-output-index.md` to generate or update the `README.md` index file in the output folder.

### Step 10: Execute Post-Generation Hooks

Follow the instructions in `@agent-qa/commands/common/execute-post-hooks.md` to run any configured post-generation hooks.

## Important Constraints

- Group test cases by requirement
- Include YAML front matter with all metadata
- Generate CSV with exact Xray column headers
- **CRITICAL**: Separate Description from Preconditions in CSV
- Use pipe-separated format for steps in CSV
- Format preconditions with bullet points and line breaks
- Include traceability matrix with coverage metrics
- Follow markdown standards
- Match language of original requirements
- Include regression suite recommendations

