# Phase 2: Analyze API Endpoints

## Core Responsibilities

- Extract API endpoint information from filtered test cases and their source requirements
- Identify HTTP methods, URL paths, request/response structures
- Handle both REST and GraphQL patterns
- Group endpoints by resource or domain
- Identify shared authentication patterns

## Workflow Steps

### Step 1: Load Templates and Configuration

Check for custom templates first, then fall back to defaults:

1. Check `agent-qa/custom-templates/api-tests/api-spec-template.md`, else use `agent-qa/formats/api-tests/api-spec-template.md`
2. Read `agent-qa/config.yml` for `api_test_base_url` setting

If neither custom nor default templates are found, use the default patterns described in this phase.

### Step 2: Load Source Requirements

For each requirement key referenced by the API test cases:

1. Check for requirement files in `{selected_folder}/requirements/{REQUIREMENT-KEY}.md`
2. Read requirement content for additional API context:
   - API endpoint URLs mentioned in descriptions or acceptance criteria
   - Request/response examples in code blocks
   - Authentication requirements
   - Rate limiting or quota mentions

### Step 3: Extract REST Endpoint Information

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

### Step 4: Extract GraphQL Information

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

### Step 5: Group Endpoints by Resource

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

### Step 6: Identify Authentication Patterns

Across all endpoints, identify shared authentication requirements:

- **Bearer token**: `Authorization: Bearer {token}` header pattern
- **API key**: `X-API-Key` or similar header patterns
- **Basic auth**: `Authorization: Basic {credentials}` pattern
- **OAuth**: Token refresh, scope-based access patterns
- **No auth**: Public endpoints that do not require authentication

Record which endpoints require which authentication type.

### Step 7: Extract Data Structures

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

## Data Storage

Store for subsequent phases:
- `endpoint_groups`: Map of group name to list of endpoints with full details
- `auth_patterns`: Map of auth type to list of endpoints using it
- `data_structures`: Map of structure name to field definitions
- `graphql_operations`: List of GraphQL queries/mutations with variables
- `api_base_url`: Base URL from config (or placeholder)
- `template_content`: Loaded API spec template

## Constraints

- Do NOT write any files in this phase
- Do NOT invent endpoints not referenced in test cases or requirements
- Add TODO markers for endpoints where method or path is ambiguous
- If no clear URL path is found, use a placeholder like `/api/{resource}` with a TODO comment
