---
type: test-data
generated: 2025-06-15 12:15
source_requirements:
  - DEMO-42
language: en
version: "1.0"
---

# Test Data — User Login

## Entity: User Credentials

### Field Definitions

| Field | Type | Constraints | Required |
|-------|------|-------------|----------|
| email | string | Valid email format, max 255 chars | Yes |
| password | string | Min 8 chars, 1 uppercase, 1 lowercase, 1 number | Yes |

### VD: Valid Data Sets

| ID | Email | Password | Notes |
|----|-------|----------|-------|
| VD-001 | test@example.com | SecurePass1 | Standard valid user |
| VD-002 | user.name@company.co.uk | MyPassword2 | Multi-part domain |
| VD-003 | a@b.co | Abcdefg1 | Minimum valid email |

### ID: Invalid Data Sets

| ID | Email | Password | Expected Error | Notes |
|----|-------|----------|----------------|-------|
| ID-001 | not-an-email | SecurePass1 | Invalid email format | Missing @ and domain |
| ID-002 | @example.com | SecurePass1 | Invalid email format | Missing local part |
| ID-003 | test@example.com | short1A | Password too short | 7 chars (min 8) |
| ID-004 | test@example.com | alllowercase1 | Missing uppercase | No uppercase letter |
| ID-005 | test@example.com | ALLUPPERCASE1 | Missing lowercase | No lowercase letter |
| ID-006 | test@example.com | NoNumbers | Missing number | No digit |

### BD: Boundary Data Sets

| ID | Email | Password | Notes |
|----|-------|----------|-------|
| BD-001 | a@b.co | Abcdefg1 | Shortest valid email (6 chars) |
| BD-002 | {255-char-email}@x.com | SecurePass1 | Maximum email length |
| BD-003 | test@example.com | Abcdefg1 | Exactly 8 chars (minimum) |
| BD-004 | test@example.com | {128-char-password} | Maximum password length |

### NE: Null/Empty Data Sets

| ID | Email | Password | Expected Error |
|----|-------|----------|----------------|
| NE-001 | _(empty)_ | SecurePass1 | Email is required |
| NE-002 | test@example.com | _(empty)_ | Password is required |
| NE-003 | _(empty)_ | _(empty)_ | Email is required |
| NE-004 | _(null)_ | _(null)_ | Email is required |

### SD: Security Data Sets

| ID | Email | Password | Attack Type |
|----|-------|----------|-------------|
| SD-001 | `' OR 1=1--` | anything | SQL injection |
| SD-002 | `<script>alert(1)</script>` | anything | XSS |
| SD-003 | test@example.com | `' OR 1=1--` | SQL injection in password |
| SD-004 | `test@example.com\r\nBcc:spam@evil.com` | SecurePass1 | Header injection |
