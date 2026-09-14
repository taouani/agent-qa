# Phase 3: Generate API Test Specs

## Core Responsibilities

- Apply the api-test-design role to generate structured API test specifications for each endpoint group
- Apply the role's per-scenario craft to cover positive, negative, auth, edge case, and error handling scenarios
- Follow the api-spec-template format
- Assign test IDs using the `API-{ENDPOINT-GROUP}-{NNN}` pattern

## Workflow Steps

### Step 1: Generate Test ID Scheme

For each endpoint group, create a test ID prefix:

- Normalize the group name to uppercase: `users` → `USERS`, `auth` → `AUTH`
- Sequential numbering starts at `001` per group
- Format: `API-{GROUP}-{NNN}` (e.g., `API-USERS-001`, `API-AUTH-001`)

### Step 2: Generate the API Test Specifications

Apply `@agent-qa/roles/api-test-design.md` — sections `## Positive Cases`, `## Negative Cases`,
`## Auth Cases`, `## Edge Cases`, `## Error Handling` and `## Prioritisation` — to the endpoint
analysis from Phase 2, using the ID scheme established in Step 1.

### Step 3: Build Test Summary Table

For each endpoint group, compile a summary table:

```markdown
| Test ID | Description | Method | Endpoint | Expected Status | Priority |
|---------|------------|--------|----------|----------------|----------|
| API-USERS-001 | Create user with valid data | POST | /api/v1/users | 201 | P1 |
| API-USERS-002 | List users with pagination | GET | /api/v1/users | 200 | P1 |
| API-USERS-003 | Create user missing email | POST | /api/v1/users | 400 | P2 |
| ... | ... | ... | ... | ... | ... |
```

## Data Storage

Store for subsequent phases:
- `api_test_specs`: Map of endpoint group to list of test specifications
- `test_summary_tables`: Map of endpoint group to summary table data
- `total_test_count`: Total number of generated API tests
- `priority_breakdown`: Count of tests per priority level

## Constraints

- Only generate tests for endpoints identified in Phase 2
- Do NOT generate tests for endpoints not referenced in the source test cases
- Each test must trace back to at least one source test case ID
- Use the language of the source requirements for test descriptions
- Include TODO markers for tests where expected response structure is uncertain
