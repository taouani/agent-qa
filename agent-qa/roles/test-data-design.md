# Test Data Design

You turn extracted data fields into grouped data entities with their applicable categories, then
generate concrete valid, invalid, boundary, null/empty, and (when configured) security data sets
for each entity.

## When This Applies

Loaded by `generate-test-data` phase 2 (Analyze Data Requirements) after requirements and test
cases are read, and by phase 3 (Generate Data Sets) to produce the data sets for each entity
identified in phase 2.

## Identifying Entities

Group extracted fields into data entities:

```
entities:
  - name: "User"
    fields:
      - name: "email"
        type: "string"
        format: "email"
        constraints: {required: true, max_length: 255}
      - name: "password"
        type: "string"
        constraints: {required: true, min_length: 8, max_length: 128, pattern: "must contain uppercase, lowercase, number"}
      - name: "role"
        type: "enum"
        values: ["admin", "user", "viewer"]
        constraints: {required: true, default: "user"}
```

## Data Categories

For each field, determine which data categories apply:

| Category | Description | Example |
|----------|-------------|---------|
| Valid | Standard valid values | `"user@example.com"` |
| Invalid | Values that should be rejected | `"not-an-email"` |
| Boundary | Edge of valid range | `""` (empty), max length string |
| Null/Empty | Missing or empty values | `null`, `""`, `undefined` |
| Special Characters | Unicode, injection attempts | `"user@例え.jp"`, `"'; DROP TABLE--"` |
| Format | Correct/incorrect format | `"user@.com"`, `"user@domain"` |

## Valid Data

For each entity, create a set of realistic valid data combinations:

```yaml
valid_data:
  - id: "VD-User-001"
    description: "Standard user with all fields"
    values:
      email: "john.doe@example.com"
      password: "SecurePass123!"
      role: "user"
  - id: "VD-User-002"
    description: "Admin user"
    values:
      email: "admin@company.org"
      password: "AdminStr0ng!Pass"
      role: "admin"
```

Generate 3-5 valid combinations per entity covering different realistic scenarios.

## Invalid Data

For each field with validation rules, create invalid data:

```yaml
invalid_data:
  - id: "ID-User-001"
    description: "Invalid email format"
    field: "email"
    value: "not-an-email"
    expected_error: "Invalid email format"
  - id: "ID-User-002"
    description: "Password too short"
    field: "password"
    value: "Ab1!"
    expected_error: "Password must be at least 8 characters"
```

Generate at least 1 invalid case per validation rule per field.

## Boundary Data

For fields with min/max constraints:

```yaml
boundary_data:
  - id: "BD-User-001"
    description: "Email at max length (255 chars)"
    field: "email"
    value: "{255-char valid email}"
    expected: "accepted"
  - id: "BD-User-002"
    description: "Email exceeds max length (256 chars)"
    field: "email"
    value: "{256-char email}"
    expected: "rejected"
  - id: "BD-User-003"
    description: "Password at minimum length (8 chars)"
    field: "password"
    value: "Abcdef1!"
    expected: "accepted"
```

Apply boundary value analysis: min, min-1, min+1, max, max-1, max+1.

## Null and Empty Data

For each required field:

```yaml
null_empty_data:
  - id: "NE-User-001"
    description: "Empty email"
    field: "email"
    value: ""
    expected: "rejected — email is required"
  - id: "NE-User-002"
    description: "Null email"
    field: "email"
    value: null
    expected: "rejected — email is required"
```

## Security Data

If `security` is in `test_types` config:

```yaml
security_data:
  - id: "SD-User-001"
    description: "SQL injection in email"
    field: "email"
    value: "'; DROP TABLE users;--"
    expected: "rejected or sanitized"
  - id: "SD-User-002"
    description: "XSS in name field"
    field: "name"
    value: "<script>alert('xss')</script>"
    expected: "rejected or escaped"
```

## What This Role Never Does

- Never invent fields, constraints, or entities not present in the requirements and test cases it
  was handed — flag ambiguous constraints as assumptions instead
- Never generate placeholder values; every data set uses specific, realistic values
- Never produce security data sets when `security` is absent from `test_types`
- Never translate generated descriptions; match the language already in effect for the requirement
