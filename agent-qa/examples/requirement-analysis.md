---
type: requirement
generated: 2025-06-15 10:30
source_requirements:
  - DEMO-42
language: en
version: "1.0"
---

# DEMO-42: User Login with Email and Password

## Summary

As a registered user, I want to log in to the application using my email and password so that I can access my personalized dashboard.

## Source

- **Jira Key**: DEMO-42
- **Type**: Story
- **Priority**: High
- **Status**: In Progress
- **Sprint**: Sprint 12
- **Epic**: DEMO-10 (User Authentication)

## Description

The application must provide a secure login mechanism for registered users. Users should be able to authenticate using their email address and password. Upon successful authentication, users are redirected to their personalized dashboard. Failed login attempts should display appropriate error messages.

## Acceptance Criteria

### AC-001: Successful login with valid credentials
**Given** a registered user with valid credentials
**When** the user enters their email and password and clicks "Sign In"
**Then** the user is redirected to the dashboard page

### AC-002: Error message for invalid credentials
**Given** a user enters incorrect email or password
**When** the user clicks "Sign In"
**Then** an error message "Invalid email or password" is displayed

### AC-003: Email field validation
**Given** a user enters an invalid email format
**When** the user attempts to submit the form
**Then** a validation error "Please enter a valid email address" is displayed

### AC-004: Password field masking
**Given** a user is on the login page
**When** the user types in the password field
**Then** the characters are masked (displayed as dots)

### AC-005: Account lockout after failed attempts
**Given** a user has entered incorrect credentials 5 times
**When** the user attempts a 6th login
**Then** the account is temporarily locked for 15 minutes and a lockout message is displayed

## Business Rules

- BR-001: Passwords must be at least 8 characters with one uppercase, one lowercase, and one number
- BR-002: Session timeout after 30 minutes of inactivity
- BR-003: Maximum 5 failed login attempts before temporary lockout

## Technical Notes

- Authentication via REST API: `POST /api/auth/login`
- JWT token stored in httpOnly cookie
- Rate limiting: 10 requests per minute per IP

## Linked Issues

- DEMO-43: Password Reset Flow (related)
- DEMO-44: Two-Factor Authentication (blocked by DEMO-42)
