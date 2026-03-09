---
type: api-test-spec
generated: 2025-06-15 12:00
source_requirements:
  - DEMO-42
language: en
version: "1.0"
---

# API Test Specifications — Authentication

## Endpoint: POST /api/auth/login

**Description**: Authenticates a user with email and password, returns a JWT token.

### Request

```json
{
  "email": "test@example.com",
  "password": "SecurePass1"
}
```

**Headers**: `Content-Type: application/json`

### Test Cases

| ID | Description | Request Body | Expected Status | Expected Response | Priority |
|----|-------------|-------------|-----------------|-------------------|----------|
| API-AUTH-001 | Valid login | `{"email":"test@example.com","password":"SecurePass1"}` | 200 | `{"token":"...","user":{"email":"..."}}` | P1 |
| API-AUTH-002 | Invalid password | `{"email":"test@example.com","password":"Wrong"}` | 401 | `{"error":"Invalid email or password"}` | P1 |
| API-AUTH-003 | Unregistered email | `{"email":"unknown@test.com","password":"Any1"}` | 401 | `{"error":"Invalid email or password"}` | P1 |
| API-AUTH-004 | Missing email field | `{"password":"SecurePass1"}` | 400 | `{"error":"Email is required"}` | P2 |
| API-AUTH-005 | Missing password field | `{"email":"test@example.com"}` | 400 | `{"error":"Password is required"}` | P2 |
| API-AUTH-006 | Empty request body | `{}` | 400 | `{"error":"Email is required"}` | P2 |
| API-AUTH-007 | Invalid email format | `{"email":"not-email","password":"SecurePass1"}` | 400 | `{"error":"Invalid email format"}` | P2 |
| API-AUTH-008 | Locked account | `{"email":"locked@example.com","password":"SecurePass1"}` | 403 | `{"error":"Account temporarily locked"}` | P1 |
| API-AUTH-009 | Rate limit exceeded | 11 requests in 1 minute | 429 | `{"error":"Too many requests"}` | P2 |
| API-AUTH-010 | SQL injection in email | `{"email":"' OR 1=1--","password":"x"}` | 400/401 | No data leak, error response | P1 |

### API-AUTH-001: Valid Login (Detail)

**Method**: POST
**URL**: `/api/auth/login`
**Headers**:
```
Content-Type: application/json
```

**Request Body**:
```json
{
  "email": "test@example.com",
  "password": "SecurePass1"
}
```

**Expected Status**: 200 OK

**Expected Response**:
```json
{
  "token": "<jwt-token>",
  "user": {
    "id": 1,
    "email": "test@example.com",
    "name": "Test User"
  }
}
```

**Assertions**:
- Response status is 200
- Response body contains `token` field (non-empty string)
- Response body contains `user.email` matching request email
- Response header includes `Set-Cookie` with httpOnly flag
- Token is a valid JWT (3 dot-separated base64 segments)
