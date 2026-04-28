# Xray JSON Import Template

## Purpose

Defines the JSON structure for importing test cases into Jira Xray. This format is richer than CSV and supports preconditions as separate entities, test sets, and test plan references.

## JSON Structure

### Single Test Case

```json
{
  "testtype": "Manual",
  "fields": {
    "summary": "TC-PROJ-123-001: Verify successful login with valid credentials",
    "priority": { "name": "Critical" },
    "labels": ["regression", "smoke"],
    "description": "Test case for verifying login functionality"
  },
  "steps": [
    {
      "action": "Navigate to the login page",
      "data": "",
      "result": "Login page is displayed"
    },
    {
      "action": "Enter valid email address",
      "data": "user@example.com",
      "result": "Email field is populated"
    },
    {
      "action": "Enter valid password",
      "data": "SecurePass123!",
      "result": "Password field is populated"
    },
    {
      "action": "Click the Sign In button",
      "data": "",
      "result": "User is redirected to dashboard"
    }
  ],
  "precondition": {
    "fields": {
      "summary": "User has a valid account",
      "description": "A registered user account exists with email user@example.com"
    }
  },
  "xray_test_sets": ["TS-Login"],
  "xray_test_plans": ["TP-Sprint-42"],
  "folder": "/PROJ-123"
}
```

### Bulk Import Array

```json
{
  "tests": [
    { /* test case 1 */ },
    { /* test case 2 */ }
  ]
}
```

## Field Mapping

### From Agent-QA Test Cases to Xray JSON

| Agent-QA Field | Xray JSON Field | Notes |
|---------------|-----------------|-------|
| Test Case ID | `fields.summary` prefix | `TC-PROJ-123-001: {summary}` |
| Summary | `fields.summary` | One-line description |
| Priority (P1-P4) | `fields.priority.name` | P1→Critical, P2→High, P3→Medium, P4→Low |
| Labels | `fields.labels` | Array of strings |
| Precondition | `precondition.fields` | Separate entity in Xray |
| Test Steps (Action) | `steps[].action` | Individual step actions |
| Test Steps (Data) | `steps[].data` | Test data for each step |
| Test Steps (Expected) | `steps[].result` | Expected result per step |
| Requirement Key | `folder` | `/PROJ-123` format |
| Custom Labels | `fields.labels` | Appended from `custom_labels` config |

### Priority Mapping

| Agent-QA Priority | Xray Priority Name |
|-------------------|-------------------|
| P1 | Critical |
| P2 | High |
| P3 | Medium |
| P4 | Low |

## Precondition Handling

Unlike CSV format, Xray JSON supports preconditions as **separate entities**:

```json
{
  "precondition": {
    "fields": {
      "summary": "User is logged in as admin",
      "description": "1. Navigate to login page\n2. Login with admin credentials\n3. Verify dashboard is displayed"
    }
  }
}
```

**Deduplication**: If multiple test cases share the same precondition text, generate the precondition once and reference it by summary.

## Test Sets and Test Plans

If test cases are grouped by feature or sprint:

```json
{
  "xray_test_sets": ["TS-{feature-name}"],
  "xray_test_plans": ["TP-{sprint-or-release}"]
}
```

## Output File

- File name: `xray-import.json`
- Location: `{selected_folder}/test-cases/xray-import.json`
- Encoding: UTF-8
- The file contains a single JSON object with a `tests` array
