---
type: test-charter
generated: 2025-06-15 11:35
source_requirements:
  - DEMO-42
language: en
version: "1.0"
---

# Exploratory Test Charter — DEMO-42: User Login

## Charter 1: Login Form Behavior

**Mission**: Explore the login form to discover issues with input handling, validation, and user feedback.

**Areas to Explore**:
- Special characters in email and password fields
- Copy-paste behavior in password field
- Browser autofill interaction
- Tab order between fields
- Form submission via Enter key
- Error message clarity and timing

**Duration**: 30 minutes

**Notes / Heuristics**:
- Apply CRUDS heuristic (Create, Read, Update, Delete, Search) to form fields
- Test boundary values for email length and password length
- Try SQL injection and XSS payloads in both fields

## Charter 2: Authentication Edge Cases

**Mission**: Explore authentication behavior under unusual conditions.

**Areas to Explore**:
- Concurrent login from multiple browser tabs
- Login during account lockout countdown
- Login immediately after password change
- Session behavior when backend is slow (>5s response)
- Browser back button after successful login

**Duration**: 30 minutes

## Charter 3: Error Recovery

**Mission**: Explore how users recover from failed login attempts.

**Areas to Explore**:
- Error message persistence after field correction
- Form state after failed submission (are fields preserved?)
- Lockout timer visibility and accuracy
- Link to password reset from error state

**Duration**: 20 minutes
