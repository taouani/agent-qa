# TestRail CSV Import Template

## Purpose

Defines the CSV structure for importing test cases into TestRail. This format serves as an alternative to Xray for teams using TestRail as their test management tool.

## CSV Column Headers

```csv
Title,Section,Type,Priority,Estimate,Preconditions,Steps,Expected Result,Custom Automation Type
```

## Column Definitions

| Column | Required | Description |
|--------|----------|-------------|
| `Title` | Yes | Test case title including the test case ID prefix |
| `Section` | Yes | TestRail section/folder path, maps to requirement key |
| `Type` | Yes | Test case type (default: `Functional`) |
| `Priority` | Yes | TestRail priority name: `Critical`, `High`, `Medium`, `Low` |
| `Estimate` | No | Time estimate from test case `estimatedDuration` (e.g., `5m`, `10m`, `1h`) |
| `Preconditions` | No | Plain text prerequisites with line breaks |
| `Steps` | Yes | Numbered steps, each on a new line |
| `Expected Result` | Yes | Numbered expected results, matching steps by position |
| `Custom Automation Type` | No | Automation status: `None`, `Automated`, `To Be Automated` |

## Field Mapping

### From Agent-QA Test Cases to TestRail CSV

| Agent-QA Field | TestRail CSV Column | Transformation |
|---------------|---------------------|----------------|
| Test Case ID + Summary | `Title` | `TC-PROJ-123-001: {summary}` |
| Requirement Key | `Section` | `{REQUIREMENT-KEY}` (e.g., `PROJ-123`) |
| Test Type | `Type` | Mapped via type mapping table (default: `Functional`) |
| Priority (P1-P4) | `Priority` | P1=Critical, P2=High, P3=Medium, P4=Low |
| `estimatedDuration` | `Estimate` | Converted to TestRail format (e.g., `5m`, `10m`) |
| Prerequisites | `Preconditions` | Plain text with `\n` line breaks |
| Test Steps (Action) | `Steps` | Numbered format: `1. Step text\n2. Step text` |
| Test Steps (Expected) | `Expected Result` | Numbered format: `1. Expected text\n2. Expected text` |
| Tags / automation status | `Custom Automation Type` | `None` unless automated flag is set |

### Priority Mapping

| Agent-QA Priority | TestRail Priority |
|-------------------|-------------------|
| P1 | Critical |
| P2 | High |
| P3 | Medium |
| P4 | Low |

### Type Mapping

| Agent-QA Test Type | TestRail Case Type |
|-------------------|-------------------|
| Happy Path | Functional |
| Negative | Functional |
| Edge Case | Functional |
| Security | Security |
| Performance | Performance |
| Accessibility | Accessibility |
| API | API |
| Other / Default | Functional |

## Steps Format

TestRail supports two step formats. This template uses **Steps (Text)** format, which stores steps as plain text.

### Steps (Text) Format

Steps are written as numbered lines, each on a new line within the CSV cell:

```
1. Navigate to the login page
2. Enter valid email address in the email field
3. Enter valid password in the password field
4. Click the Sign In button
5. Verify user is redirected to dashboard
```

### Expected Results (Text) Format

Expected results follow the same numbered format, matching steps by position:

```
1. Login page is displayed with email and password fields
2. Email field is populated and validation passes
3. Password field is masked and validation passes
4. Authentication process initiates
5. Dashboard loads with user-specific content
```

> [!NOTE]
> TestRail also supports a **Steps (Separated)** format where each step is a separate entity with its own action, expected result, and shared steps references. The Steps (Separated) format requires TestRail API import rather than CSV. If your TestRail project uses Steps (Separated), use the TestRail API import method documented in `testrail-field-mapping.md`.

## Preconditions Format

Preconditions are written as plain text with line breaks:

```
- User account exists in the system
- Application is accessible
- Test user credentials are available
```

## Estimate Format

TestRail accepts time estimates in shorthand notation:

| Duration | TestRail Format |
|----------|----------------|
| 5 minutes | `5m` |
| 10 minutes | `10m` |
| 30 minutes | `30m` |
| 1 hour | `1h` |
| 1 hour 30 minutes | `1h 30m` |

Convert the `estimatedDuration` field from the test case YAML front matter. If no estimate is available, leave the field empty.

## Full Example CSV Row

```csv
Title,Section,Type,Priority,Estimate,Preconditions,Steps,Expected Result,Custom Automation Type
"TC-PROJ-123-001: Verify successful user login with valid credentials","PROJ-123","Functional","Critical","5m","- User account exists in the system\n- Application is accessible\n- Test user credentials are available","1. Navigate to the application login page\n2. Enter valid email address in the email field\n3. Enter valid password in the password field\n4. Click the Sign In button\n5. Verify user is redirected to the dashboard","1. Login page is displayed with email and password fields\n2. Email is accepted and field validation passes\n3. Password is masked and field validation passes\n4. Authentication process initiates\n5. Dashboard loads with user-specific content","None"
```

## CSV Formatting Rules

- All fields containing commas, quotes, or newlines must be enclosed in double quotes
- Double quotes within fields are escaped as `""` (standard CSV escaping)
- Use `\n` for line breaks within cells
- Empty fields are represented as empty strings (`""`)
- File encoding: UTF-8 with BOM (recommended for TestRail compatibility)
- One header row followed by one row per test case

## Output File

- File name: `testrail-import.csv`
- Location: `{selected_folder}/test-cases/testrail-import.csv`
- Encoding: UTF-8
