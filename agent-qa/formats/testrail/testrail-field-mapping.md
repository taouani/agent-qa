# TestRail Field Mapping

## Purpose

Detailed field mapping reference between Agent-QA test case fields and TestRail fields, covering CSV import, API import, and custom field handling.

## Complete Field Mapping

### Agent-QA to TestRail Field Map

| Agent-QA Field | TestRail Field | CSV Column | API Field | Notes |
|---------------|----------------|------------|-----------|-------|
| Test Case ID | Title (prefix) | `Title` | `title` | Prefixed to summary: `TC-PROJ-123-001: {summary}` |
| Summary | Title | `Title` | `title` | One-line test case description |
| Requirement Key | Section | `Section` | `section_id` | Maps to TestRail section hierarchy |
| Test Type | Type | `Type` | `type_id` | Mapped from Agent-QA type (see type mapping) |
| Priority (P1-P4) | Priority | `Priority` | `priority_id` | See priority mapping table |
| `estimatedDuration` | Estimate | `Estimate` | `estimate` | Shorthand format: `5m`, `1h` |
| Prerequisites | Preconditions | `Preconditions` | `custom_preconds` | Plain text with line breaks |
| Test Steps | Steps | `Steps` | `custom_steps` | Numbered text format |
| Expected Results | Expected Result | `Expected Result` | `custom_expected` | Numbered text, matches steps |
| Tags | N/A (custom field) | N/A | `custom_tags` | Requires custom field in TestRail |
| `regressionSuite` | N/A (custom field) | N/A | `custom_regression` | Requires custom checkbox field |
| `riskLevel` | N/A (custom field) | N/A | `custom_risk_level` | Requires custom dropdown field |
| `businessRules` | References | N/A | `refs` | Comma-separated reference IDs |
| Language | N/A (custom field) | N/A | `custom_language` | Requires custom field if needed |

### Priority Mapping

| Agent-QA Priority | Agent-QA Label | TestRail Priority | TestRail `priority_id` |
|-------------------|---------------|-------------------|----------------------|
| P1 | Critical | Critical | 4 |
| P2 | High | High | 3 |
| P3 | Medium | Medium | 2 |
| P4 | Low | Low | 1 |

> [!NOTE]
> TestRail `priority_id` values shown above are defaults. Your TestRail instance may have different IDs. Check your TestRail administration settings under **Customizations > Priorities** to confirm the correct IDs.

### Type Mapping

| Agent-QA Test Type | TestRail Case Type | TestRail `type_id` (default) |
|-------------------|-------------------|------------------------------|
| Happy Path | Functional | 6 |
| Negative | Functional | 6 |
| Edge Case | Functional | 6 |
| Security | Other | 7 |
| Performance | Performance | 8 |
| Accessibility | Accessibility | 9 |
| API | Automated | 3 |
| Regression | Regression | 4 |
| Smoke | Smoke & Sanity | 5 |
| Other / Default | Functional | 6 |

> [!NOTE]
> TestRail `type_id` values depend on your instance configuration. The values above are common defaults. Custom case types can be added in TestRail under **Administration > Customizations > Case Types**.

## Section and Folder Hierarchy

### How Sections Map

TestRail organizes test cases into **sections** (folders). Agent-QA maps requirement keys to TestRail sections:

```
TestRail Suite
├── PROJ-123/              ← Section created from requirement key
│   ├── TC-PROJ-123-001    ← Test case
│   ├── TC-PROJ-123-002
│   └── TC-PROJ-123-003
├── PROJ-124/
│   ├── TC-PROJ-124-001
│   └── TC-PROJ-124-002
└── PROJ-125/
    └── TC-PROJ-125-001
```

### CSV Section Field

In CSV import, the `Section` column accepts a section name or path:

- Simple: `PROJ-123` (creates or maps to a top-level section)
- Nested: `PROJ-123 > Login` (creates nested sections using ` > ` separator)

### Multi-Level Hierarchy

For releases with many requirements, consider grouping by epic or feature:

```
Epic Name > PROJ-123
Epic Name > PROJ-124
Another Epic > PROJ-125
```

## Multi-Suite vs Single-Suite Projects

### Single-Suite Projects (Default)

Most TestRail projects use a single test suite. All test cases from Agent-QA import into the default suite.

- CSV import goes directly into the project's single suite
- Sections organize test cases within the suite
- This is the recommended setup for Agent-QA integration

### Multi-Suite Projects

If your TestRail project uses multiple test suites:

- Each suite has its own section hierarchy
- During CSV import, you must select the target suite
- Consider mapping Agent-QA releases to separate suites, or use a single suite with section-based organization
- API import requires specifying `suite_id` in the request

## Custom Field Handling

### Adding Custom Fields for Agent-QA Data

TestRail supports custom fields that can capture additional Agent-QA metadata not covered by standard fields.

**Recommended custom fields:**

| Custom Field Name | Field Type | System Name | Purpose |
|------------------|------------|-------------|---------|
| Tags | Multi-select or String | `custom_tags` | Store test case tags/labels |
| Regression Suite | Checkbox | `custom_regression` | Flag regression suite inclusion |
| Risk Level | Dropdown | `custom_risk_level` | High/Medium/Low risk classification |
| Language | Dropdown | `custom_language` | Detected language of the test case |
| Business Rules | String | `custom_business_rules` | Referenced business rule IDs |
| Requirement Key | String | `custom_requirement_key` | Source Jira requirement key |

### Custom Field CSV Import

Custom fields can be included in CSV import by adding columns with the format `Custom {Field Label}`:

```csv
Title,Section,Type,Priority,...,Custom Tags,Custom Risk Level
"TC-PROJ-123-001: ...","PROJ-123","Functional","Critical",...,"login,auth,security","High"
```

> [!IMPORTANT]
> Custom field column headers in CSV must exactly match the field label as configured in TestRail, prefixed with `Custom `. For example, a field labeled "Risk Level" becomes the column header `Custom Risk Level`.

## TestRail API Import

### Overview

For richer imports (Steps Separated format, attachments, custom fields), use the TestRail API instead of CSV.

### Key API Endpoints

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Add test case | POST | `/api/v2/add_case/{section_id}` |
| Add section | POST | `/api/v2/add_section/{project_id}` |
| Get sections | GET | `/api/v2/get_sections/{project_id}` |
| Get case types | GET | `/api/v2/get_case_types` |
| Get priorities | GET | `/api/v2/get_priorities` |

### Steps (Separated) Format via API

When using the API, steps can be imported in the **Steps (Separated)** format, where each step is an individual entity:

```json
{
  "title": "TC-PROJ-123-001: Verify successful login",
  "type_id": 6,
  "priority_id": 4,
  "estimate": "5m",
  "custom_preconds": "- User account exists\n- Application is accessible",
  "custom_steps_separated": [
    {
      "content": "Navigate to the login page",
      "expected": "Login page is displayed"
    },
    {
      "content": "Enter valid email address",
      "expected": "Email field is populated"
    },
    {
      "content": "Click the Sign In button",
      "expected": "User is redirected to dashboard"
    }
  ]
}
```

### API Authentication

TestRail API uses HTTP Basic Auth with email and API key:

```
Authorization: Basic base64(email:api_key)
```

> [!NOTE]
> API integration is not currently implemented in Agent-QA. The CSV import is the supported method. API support may be added in a future version.

## Limitations and Workarounds

### CSV Import Limitations

| Limitation | Workaround |
|-----------|------------|
| No Steps (Separated) support | Use Steps (Text) format; switch to API for separated steps |
| No attachment import | Manually attach files after import, or use API |
| No test run creation | Create test runs manually after importing cases |
| Custom field names must match exactly | Verify field labels in TestRail admin before import |
| No bulk section creation | Sections are created automatically during import if they do not exist |
| No link to Jira requirements | Use the `refs` field or a custom field to store requirement keys |
| Maximum row limits | TestRail may limit CSV imports to ~10,000 rows; split large imports |

### Data Not Mapped via CSV

The following Agent-QA fields have no direct CSV mapping and require custom fields or API import:

- `regressionSuite` flag
- `riskLevel` classification
- `tags` / labels array
- `businessRules` references
- `dependencies` list
- `effort` estimate category
- Traceability links to requirements

### Character Encoding

- Export CSV as UTF-8 with BOM for best TestRail compatibility
- TestRail may misinterpret non-ASCII characters without BOM
- Verify special characters (accents, Arabic text) display correctly after import
