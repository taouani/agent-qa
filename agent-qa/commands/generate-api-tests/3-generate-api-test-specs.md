# Phase 3: Generate API Test Specs

## Core Responsibilities

- Generate structured API test specifications for each endpoint group
- Cover positive, negative, auth, edge case, and error handling scenarios
- Follow the api-spec-template format
- Assign test IDs using the `API-{ENDPOINT-GROUP}-{NNN}` pattern

## Workflow Steps

### Step 1: Generate Test ID Scheme

For each endpoint group, create a test ID prefix:

- Normalize the group name to uppercase: `users` → `USERS`, `auth` → `AUTH`
- Sequential numbering starts at `001` per group
- Format: `API-{GROUP}-{NNN}` (e.g., `API-USERS-001`, `API-AUTH-001`)

### Step 2: Generate Positive Tests

For each endpoint in each group, generate positive test cases:

**REST endpoints:**

| Scenario | Description |
|----------|------------|
| Valid request | Send a well-formed request with all required fields, expect success status |
| Valid with optional fields | Include optional fields, verify they are accepted and returned |
| Valid path parameters | Use valid IDs/slugs in path parameters |
| Valid query parameters | Use supported filters, sorting, pagination |
| List endpoint | Verify collection response structure and pagination |
| Detail endpoint | Verify single resource response structure |

**GraphQL operations:**

| Scenario | Description |
|----------|------------|
| Valid query | Execute query with valid variables, verify response fields |
| Valid mutation | Execute mutation with valid input, verify created/updated resource |
| Query with arguments | Pass valid filters/pagination to queries |

Each positive test spec includes:

```markdown
#### API-{GROUP}-{NNN}: {Test Description}

- **Method**: {HTTP_METHOD}
- **URL**: {base_url}{path}
- **Headers**:
  - Content-Type: application/json
  - Authorization: Bearer {token}
- **Request Body**:
  ```json
  {
    "field": "value"
  }
  ```
- **Expected Status**: {status_code}
- **Expected Response**:
  ```json
  {
    "field": "value"
  }
  ```
- **Assertions**:
  - Response status is {status_code}
  - Response body contains {expected_fields}
  - Response Content-Type is application/json
- **Priority**: {P1-P4}
- **Source**: {TC-ID from original test case}
```

### Step 3: Generate Negative Tests

For each endpoint, generate negative test cases covering:

| Scenario | Expected Status | Description |
|----------|----------------|------------|
| Missing required field | 400 | Omit each required field one at a time |
| Invalid field type | 400 | Send wrong data type (string instead of number, etc.) |
| Invalid field value | 400/422 | Send out-of-range or malformed values |
| Invalid path parameter | 400/404 | Use non-existent ID, wrong format |
| Invalid query parameter | 400 | Use unsupported filter keys or invalid values |
| Duplicate resource | 409 | Create a resource that already exists (if applicable) |
| Invalid JSON | 400 | Send malformed JSON body |
| Wrong Content-Type | 415 | Send request with unsupported Content-Type |

**GraphQL negative tests:**

| Scenario | Description |
|----------|------------|
| Missing required variable | Omit required input variable |
| Invalid variable type | Send wrong type for a variable |
| Non-existent field in selection | Request a field that does not exist |
| Invalid operation name | Use a non-existent query/mutation name |

### Step 4: Generate Auth Tests

For each authentication pattern identified in Phase 2, generate:

| Scenario | Expected Status | Description |
|----------|----------------|------------|
| Missing auth header | 401 | Send request without Authorization header |
| Invalid token format | 401 | Send malformed token (not a valid JWT, etc.) |
| Expired token | 401 | Send expired authentication token |
| Wrong permissions | 403 | Send valid token without required scope/role |
| Invalid API key | 401 | Send incorrect API key (if API key auth) |
| Revoked token | 401 | Send a previously valid but revoked token |

For public endpoints (no auth required), generate:
- Verify endpoint is accessible without authentication

### Step 5: Generate Edge Case Tests

For each endpoint, generate edge case tests:

| Scenario | Description |
|----------|------------|
| Empty request body | Send `{}` to POST/PUT endpoints |
| Empty string values | Send `""` for string fields |
| Maximum length values | Send values at max allowed length |
| Exceeding max length | Send values exceeding max length |
| Special characters | Send unicode, emoji, HTML entities, SQL injection patterns in string fields |
| Boundary numeric values | Send 0, negative numbers, MAX_INT for numeric fields |
| Empty array | Send `[]` for array fields |
| Large payload | Send request with unusually large body |
| Null values | Send `null` for optional and required fields |
| Extra unknown fields | Send fields not defined in the schema |

**GraphQL edge cases:**

| Scenario | Description |
|----------|------------|
| Deeply nested query | Query with excessive nesting depth |
| Large variable payload | Send oversized variable input |
| Empty variables object | Send `{}` as variables |

### Step 6: Generate Error Handling Tests

For each endpoint group, generate error handling tests:

| Scenario | Expected Status | Description |
|----------|----------------|------------|
| Resource not found | 404 | Request a non-existent resource by ID |
| Method not allowed | 405 | Use an unsupported HTTP method on the endpoint |
| Rate limiting | 429 | Verify rate limit headers and response when exceeded |
| Server error simulation | 500 | Document expected behavior for internal errors |
| Timeout behavior | — | Document expected timeout and retry behavior |
| Concurrent requests | — | Document behavior under concurrent modifications |

### Step 7: Assign Priorities

Apply priority levels to each generated test:

| Priority | Criteria |
|----------|---------|
| P1 - Critical | Positive tests for core endpoints, authentication validation |
| P2 - High | Negative tests for required fields, authorization checks |
| P3 - Medium | Edge cases, optional field validation, error handling |
| P4 - Low | Special characters, large payloads, rare error conditions |

### Step 8: Build Test Summary Table

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
