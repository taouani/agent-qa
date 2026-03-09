# API Test Specification Template

Patterns for generating API test specification files from test cases.

## File Structure

```markdown
---
type: api-test-spec
generated: YYYY-MM-DD HH:MM
source_requirements:
  - {REQUIREMENT-KEY}
endpoint_group: {group-name}
language: {detected-language-code}
version: "1.0"
---

# API Tests: {Group Name}

## Base URL

`{api_test_base_url}`

## Authentication

{Auth pattern description}

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| {METHOD} | {path} | {description} |

## Test Cases

### {Category}

#### {Test ID}: {Test Description}

- **Method**: {HTTP_METHOD}
- **URL**: {full_url}
- **Headers**: ...
- **Request Body**: ...
- **Expected Status**: {status_code}
- **Expected Response**: ...
- **Assertions**: ...
- **Priority**: {P1-P4}
- **Source**: {TC-ID}
```

## YAML Front Matter

All API test specification files MUST include YAML front matter:

```yaml
---
type: api-test-spec
generated: YYYY-MM-DD HH:MM
source_requirements:
  - PROJ-123
  - PROJ-124
endpoint_group: users
language: en
version: "1.0"
---
```

## Endpoint Information Section

Document each endpoint covered by the test group:

```markdown
## Endpoints

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | /api/v1/users | List all users | Yes (Bearer) |
| GET | /api/v1/users/{id} | Get user by ID | Yes (Bearer) |
| POST | /api/v1/users | Create a new user | Yes (Bearer + Admin) |
| PUT | /api/v1/users/{id} | Update user | Yes (Bearer) |
| DELETE | /api/v1/users/{id} | Delete user | Yes (Bearer + Admin) |
```

## Authentication Section

Describe the authentication pattern used by the endpoint group:

```markdown
## Authentication

**Type**: Bearer Token (JWT)

**Header**: `Authorization: Bearer {token}`

**How to obtain**:
1. POST `/api/v1/auth/login` with valid credentials
2. Extract `token` from response body

**Token format**: JWT with `exp`, `sub`, `roles` claims

**Required roles**: Admin role required for create/delete operations
```

## Request Section

Document request structure with JSON examples:

```markdown
### Request

**Headers**:
| Header | Value | Required |
|--------|-------|----------|
| Content-Type | application/json | Yes |
| Authorization | Bearer {token} | Yes |
| Accept | application/json | No |

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | User ID |

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | integer | 1 | Page number |
| limit | integer | 20 | Items per page |
| sort | string | createdAt | Sort field |
| order | string | desc | Sort order (asc/desc) |

**Request Body** (POST/PUT):
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "role": "standard"
}
```

**Field Definitions**:
| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| name | string | Yes | 1-100 characters |
| email | string | Yes | Valid email format |
| role | string | No | Enum: standard, admin, viewer |
```

## Test Case Detail Format

Each individual test case follows this structure:

```markdown
#### API-USERS-001: Create user with valid data

- **Method**: POST
- **URL**: `{base_url}/api/v1/users`
- **Headers**:
  - Content-Type: application/json
  - Authorization: Bearer {valid_token}
- **Request Body**:
  ```json
  {
    "name": "Jane Smith",
    "email": "jane@example.com",
    "role": "standard"
  }
  ```
- **Expected Status**: 201 Created
- **Expected Response**:
  ```json
  {
    "id": "{auto-generated}",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "role": "standard",
    "createdAt": "{ISO 8601 timestamp}"
  }
  ```
- **Assertions**:
  - Response status is 201
  - Response body contains `id` field (non-null)
  - Response `name` matches request `name`
  - Response `email` matches request `email`
  - Response `createdAt` is a valid ISO 8601 timestamp
  - Response Content-Type is application/json
- **Priority**: P1
- **Source**: TC-PROJ-123-003
```

## Test Summary Table

Each file includes a summary table at the end:

```markdown
## Test Summary

| Test ID | Description | Method | Endpoint | Expected Status | Priority |
|---------|------------|--------|----------|----------------|----------|
| API-USERS-001 | Create user with valid data | POST | /api/v1/users | 201 | P1 |
| API-USERS-002 | Get user by ID | GET | /api/v1/users/{id} | 200 | P1 |
| API-USERS-003 | Create user missing name | POST | /api/v1/users | 400 | P2 |
| API-USERS-004 | Access without auth token | GET | /api/v1/users | 401 | P1 |
| API-USERS-005 | Send empty request body | POST | /api/v1/users | 400 | P3 |
| API-USERS-006 | Get non-existent user | GET | /api/v1/users/99999 | 404 | P2 |
```

## Test Categories

Organize tests into the following categories within each file:

1. **Positive Tests** — Valid requests with expected success responses
2. **Negative Tests** — Invalid inputs, missing fields, wrong types
3. **Authentication Tests** — Missing/invalid/expired tokens, wrong permissions
4. **Edge Cases** — Empty payloads, max lengths, special characters, null values
5. **Error Handling Tests** — Not found, method not allowed, rate limiting

## GraphQL Test Format

For GraphQL endpoints, adapt the format:

```markdown
#### API-ORDERS-001: Query orders with valid filter

- **Operation**: query
- **Name**: getOrders
- **URL**: `{base_url}/graphql`
- **Headers**:
  - Content-Type: application/json
  - Authorization: Bearer {valid_token}
- **Query**:
  ```graphql
  query getOrders($status: String, $limit: Int) {
    orders(status: $status, limit: $limit) {
      id
      status
      total
      createdAt
    }
  }
  ```
- **Variables**:
  ```json
  {
    "status": "pending",
    "limit": 10
  }
  ```
- **Expected Response**:
  ```json
  {
    "data": {
      "orders": [
        {
          "id": "...",
          "status": "pending",
          "total": 99.99,
          "createdAt": "..."
        }
      ]
    }
  }
  ```
- **Assertions**:
  - Response contains `data.orders` array
  - All returned orders have `status` equal to "pending"
  - Response does not contain `errors` field
- **Priority**: P1
- **Source**: TC-PROJ-456-002
```

## Playwright API Test Format

When generating optional Playwright API test files, use the `request` fixture:

```typescript
import { test, expect } from '@playwright/test';

const BASE_URL = '{api_test_base_url}';

test.describe('API Tests: {Group Name}', () => {

  let authToken: string;

  test.beforeAll(async ({ request }) => {
    // TODO: Implement auth token retrieval
    // const loginResponse = await request.post(`${BASE_URL}/api/v1/auth/login`, {
    //   data: { email: 'admin@example.com', password: 'password' }
    // });
    // const loginBody = await loginResponse.json();
    // authToken = loginBody.token;
  });

  test('API-USERS-001: Create user with valid data', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/v1/users`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        name: 'Jane Smith',
        email: 'jane@example.com',
        role: 'standard',
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty('id');
    expect(body.name).toBe('Jane Smith');
    expect(body.email).toBe('jane@example.com');
  });

  test('API-USERS-003: Create user missing name', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/v1/users`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        email: 'jane@example.com',
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('API-USERS-004: Access without auth token', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/v1/users`);

    expect(response.status()).toBe(401);
  });

});
```

## File Naming

- Markdown specs: `{endpoint-group}-api-tests.md` (e.g., `users-api-tests.md`)
- Index file: `api-tests-index.md`
- Playwright specs: `{endpoint-group}.api.spec.ts` (e.g., `users.api.spec.ts`)
- Output directory: `agent-qa/YYYY-MM-DD-{context}/api-tests/`

## Notes on Playwright API Tests vs Documentation-Only Specs

**Documentation-only specs** (markdown files) are always generated:
- Serve as comprehensive API test documentation
- Can be used by manual testers as a reference
- Include full request/response examples
- Suitable for review and import into test management tools

**Playwright API specs** (`.api.spec.ts` files) are optionally generated:
- Executable tests using Playwright's `request` fixture
- Require a running API server to execute
- Include TODO markers for auth setup and environment configuration
- Use `test.describe` blocks grouped by endpoint group
- Do NOT use Page Objects (API tests use `request` context, not `page` context)
- Suitable for CI/CD pipeline integration
