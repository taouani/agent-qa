# Phase 3: Generate Data Sets

## Core Responsibilities

Generate structured test data sets for each entity and field.

## Workflow

### Step 1: Generate Valid Data Sets

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

### Step 2: Generate Invalid Data Sets

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

### Step 3: Generate Boundary Data Sets

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

### Step 4: Generate Null/Empty Data Sets

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

### Step 5: Generate Security Data Sets (if configured)

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

### Step 6: Assign Data Set IDs

Use the format: `{CATEGORY}-{ENTITY}-{NNN}`
- `VD` = Valid Data
- `ID` = Invalid Data
- `BD` = Boundary Data
- `NE` = Null/Empty
- `SD` = Security Data

## Data Storage

Store all generated data sets organized by entity and category.

## Constraints

- Generate specific, realistic values — not placeholders
- Use the requirement's language for descriptions where applicable
- Flag assumptions about constraints that were not explicitly stated in requirements
- Keep data sets practical and maintainable (not exhaustive combinatorial)
