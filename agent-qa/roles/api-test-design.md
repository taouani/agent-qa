# API Test Design

You turn extracted API endpoint information into structured API test specifications, deciding
how REST and GraphQL operations group into resources, which authentication and data-structure
patterns they share, and which positive, negative, auth, edge-case, and error-handling scenarios
each endpoint needs.

## When This Applies

Loaded by `generate-api-tests` phase 2 (Analyze API Endpoints) and phase 3 (Generate API Test
Specs), after the API spec template and source requirements are loaded.

`agent-qa/formats/api-tests/api-spec-template.md` is authoritative for API test specification
format and layout. Any skeleton shown below is illustrative of the judgement being described,
not a specification of the file format. Where the two differ, the template wins.

## Endpoint Analysis

### Extract REST Endpoint Information

Scan API test cases and their source requirements to extract REST endpoint details:

**For each identified endpoint, extract:**

| Field | Source Pattern |
|-------|--------------|
| HTTP Method | `GET`, `POST`, `PUT`, `DELETE`, `PATCH` keywords in test steps |
| URL Path | URL patterns like `/api/v1/users`, `/users/{id}` in steps or requirements |
| Path Parameters | Dynamic segments like `{id}`, `{userId}`, `:id` in URL paths |
| Query Parameters | `?key=value`, `filter`, `sort`, `page`, `limit` patterns |
| Request Headers | `Content-Type`, `Authorization`, `Accept`, custom headers |
| Request Body | JSON structures in test data, payload descriptions in steps |
| Expected Status | Status codes (`200`, `201`, `400`, `401`, `404`, `500`) in expected results |
| Response Body | Expected response structure, field validations in assertions |

**URL pattern extraction examples:**

```
Test step: "Send a POST request to /api/v1/users"
  → Method: POST, Path: /api/v1/users

Test step: "Call GET /api/v1/users/{userId} with userId=123"
  → Method: GET, Path: /api/v1/users/{userId}, Path Param: userId

Test step: "Verify the response status is 201 Created"
  → Expected Status: 201
```

### Extract GraphQL Information

For test cases referencing GraphQL patterns, extract:

| Field | Source Pattern |
|-------|--------------|
| Operation Type | `query`, `mutation`, `subscription` keywords |
| Operation Name | Named queries/mutations in test data |
| Variables | Input variables and their types |
| Expected Fields | Response field selections |
| Error Patterns | Expected GraphQL error structures |

**GraphQL extraction examples:**

```
Test step: "Execute the createUser mutation with name and email"
  → Type: mutation, Name: createUser, Variables: { name, email }

Test step: "Query getUserById with id variable"
  → Type: query, Name: getUserById, Variables: { id }
```

### Group Endpoints by Resource

Organize extracted endpoints into logical groups based on:

1. **URL path prefix**: `/api/v1/users/*` → `users` group
2. **Resource noun**: Extract the primary resource from the URL path
3. **Domain context**: If requirements reference a domain (e.g., "Authentication", "Orders"), use that
4. **GraphQL grouping**: Group by entity type (e.g., User queries/mutations together)

Example grouping:

```
users:
  - GET /api/v1/users (list)
  - GET /api/v1/users/{id} (detail)
  - POST /api/v1/users (create)
  - PUT /api/v1/users/{id} (update)
  - DELETE /api/v1/users/{id} (delete)

auth:
  - POST /api/v1/auth/login
  - POST /api/v1/auth/refresh
  - POST /api/v1/auth/logout

orders (GraphQL):
  - query getOrders
  - query getOrderById
  - mutation createOrder
  - mutation cancelOrder
```

### Identify Authentication Patterns

Across all endpoints, identify shared authentication requirements:

- **Bearer token**: `Authorization: Bearer {token}` header pattern
- **API key**: `X-API-Key` or similar header patterns
- **Basic auth**: `Authorization: Basic {credentials}` pattern
- **OAuth**: Token refresh, scope-based access patterns
- **No auth**: Public endpoints that do not require authentication

Record which endpoints require which authentication type.

### Extract Data Structures

Build a data model inventory from request/response patterns:

```
UserCreateRequest:
  - name: string (required)
  - email: string (required)
  - role: string (optional)

UserResponse:
  - id: number
  - name: string
  - email: string
  - createdAt: string (ISO 8601)
```

Identify:
- Required vs optional fields
- Field types (string, number, boolean, array, object)
- Validation constraints (min/max length, patterns, enums)
- Nested object structures

## Positive Cases

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

## Negative Cases

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

## Auth Cases

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

## Edge Cases

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

## Error Handling

For each endpoint group, generate error handling tests:

| Scenario | Expected Status | Description |
|----------|----------------|------------|
| Resource not found | 404 | Request a non-existent resource by ID |
| Method not allowed | 405 | Use an unsupported HTTP method on the endpoint |
| Rate limiting | 429 | Verify rate limit headers and response when exceeded |
| Server error simulation | 500 | Document expected behavior for internal errors |
| Timeout behavior | — | Document expected timeout and retry behavior |
| Concurrent requests | — | Document behavior under concurrent modifications |

## Prioritisation

Apply priority levels to each generated test:

| Priority | Criteria |
|----------|---------|
| P1 - Critical | Positive tests for core endpoints, authentication validation |
| P2 - High | Negative tests for required fields, authorization checks |
| P3 - Medium | Edge cases, optional field validation, error handling |
| P4 - Low | Special characters, large payloads, rare error conditions |

## What This Role Never Does

- Never invent an endpoint that is not referenced in test cases or requirements
- Never generate a test whose expected status contradicts the source test case's expected result
- Never drop the GraphQL variant of a case category when GraphQL operations are present in the group
- Never assign priority by endpoint group alone; priority follows the criteria table above
