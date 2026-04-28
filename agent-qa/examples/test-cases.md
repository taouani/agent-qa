---
type: test-cases
generated: 2025-06-15 11:00
source_requirements:
  - DEMO-42
language: en
version: "1.0"
---

# Test Cases — DEMO-42: User Login

## TC-DEMO-42-001: Verify successful login with valid credentials

**Priority**: P1 — Critical
**Type**: Happy Path
**Regression Suite**: Yes
**Tags**: login, auth, security, regression

### Prerequisites
- User account exists with email `test@example.com` and password `SecurePass1`
- Application is accessible

### Test Data
| Data Element | Value | Notes |
|--------------|-------|-------|
| Email | test@example.com | Valid registered user |
| Password | SecurePass1 | Meets password policy |

### Test Steps

1. **Navigate** to the application login page
   - **Expected**: Login form is displayed with email and password fields

2. **Enter** `test@example.com` in the email field
   - **Expected**: Email is accepted, no validation errors

3. **Enter** `SecurePass1` in the password field
   - **Expected**: Password is masked (dots displayed)

4. **Click** the "Sign In" button
   - **Expected**: User is redirected to dashboard with personalized content

### Traceability
- **Acceptance Criteria**: AC-001

---

## TC-DEMO-42-002: Verify error message with invalid password

**Priority**: P1 — Critical
**Type**: Negative
**Regression Suite**: Yes
**Tags**: login, auth, security, negative

### Prerequisites
- User account exists with email `test@example.com`
- Application is accessible

### Test Steps

1. **Navigate** to the login page
   - **Expected**: Login form is displayed

2. **Enter** `test@example.com` in the email field
   - **Expected**: Email is accepted

3. **Enter** `WrongPassword` in the password field
   - **Expected**: Password is masked

4. **Click** the "Sign In" button
   - **Expected**: Error message "Invalid email or password" is displayed. User remains on login page.

### Traceability
- **Acceptance Criteria**: AC-002

---

## TC-DEMO-42-003: Verify error message with unregistered email

**Priority**: P1 — Critical
**Type**: Negative
**Tags**: login, auth, negative

### Prerequisites
- Application is accessible
- Email `unknown@example.com` is not registered

### Test Steps

1. **Navigate** to the login page
   - **Expected**: Login form is displayed

2. **Enter** `unknown@example.com` in the email field
   - **Expected**: Email is accepted

3. **Enter** `AnyPassword1` in the password field
   - **Expected**: Password is masked

4. **Click** the "Sign In" button
   - **Expected**: Error message "Invalid email or password" is displayed (same message as invalid password for security)

### Traceability
- **Acceptance Criteria**: AC-002

---

## TC-DEMO-42-004: Verify email format validation

**Priority**: P2 — High
**Type**: Negative
**Tags**: login, validation, negative

### Prerequisites
- Application is accessible

### Test Steps

1. **Navigate** to the login page
   - **Expected**: Login form is displayed

2. **Enter** `not-an-email` in the email field
   - **Expected**: Email field shows input

3. **Click** the "Sign In" button
   - **Expected**: Validation error "Please enter a valid email address" is displayed

### Traceability
- **Acceptance Criteria**: AC-003

---

## TC-DEMO-42-005: Verify password field masking

**Priority**: P2 — High
**Type**: Happy Path
**Tags**: login, security, ui

### Prerequisites
- Application is accessible

### Test Steps

1. **Navigate** to the login page
   - **Expected**: Login form is displayed

2. **Click** on the password field
   - **Expected**: Password field is focused

3. **Type** `SecurePass1` in the password field
   - **Expected**: Each character is immediately masked as a dot. No plaintext is visible.

### Traceability
- **Acceptance Criteria**: AC-004

---

## TC-DEMO-42-006: Verify account lockout after 5 failed attempts

**Priority**: P1 — Critical
**Type**: Security
**Regression Suite**: Yes
**Tags**: login, auth, security, lockout

### Prerequisites
- User account exists with email `test@example.com`
- Account is not currently locked

### Test Steps

1. **Attempt** login 5 times with email `test@example.com` and incorrect password `Wrong1`
   - **Expected**: Each attempt shows "Invalid email or password" error

2. **Attempt** a 6th login with email `test@example.com` and any password
   - **Expected**: Lockout message is displayed indicating the account is temporarily locked for 15 minutes

3. **Wait** 15 minutes, then attempt login with correct credentials
   - **Expected**: Login succeeds, user is redirected to dashboard

### Traceability
- **Acceptance Criteria**: AC-005

---

## TC-DEMO-42-007: Verify login with empty email field

**Priority**: P3 — Medium
**Type**: Edge Case
**Tags**: login, validation, edge

### Prerequisites
- Application is accessible

### Test Steps

1. **Navigate** to the login page
   - **Expected**: Login form is displayed

2. **Leave** the email field empty

3. **Enter** `SecurePass1` in the password field
   - **Expected**: Password is masked

4. **Click** the "Sign In" button
   - **Expected**: Validation error is displayed for the email field

### Traceability
- **Acceptance Criteria**: AC-003

---

## TC-DEMO-42-008: Verify login with empty password field

**Priority**: P3 — Medium
**Type**: Edge Case
**Tags**: login, validation, edge

### Prerequisites
- Application is accessible

### Test Steps

1. **Navigate** to the login page
   - **Expected**: Login form is displayed

2. **Enter** `test@example.com` in the email field
   - **Expected**: Email is accepted

3. **Leave** the password field empty

4. **Click** the "Sign In" button
   - **Expected**: Validation error is displayed for the password field

### Traceability
- **Acceptance Criteria**: AC-003
