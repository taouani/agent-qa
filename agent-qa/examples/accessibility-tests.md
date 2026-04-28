---
type: accessibility-test
generated: 2025-06-15 12:10
source_requirements:
  - DEMO-42
language: en
version: "1.0"
---

# Accessibility Tests — Login Page

## WCAG 2.1 AA Compliance

| ID | WCAG Criterion | Level | Test Description | Method | Priority |
|----|---------------|-------|------------------|--------|----------|
| A11Y-LOGIN-1.1.1-001 | 1.1.1 Non-text Content | A | Verify all images on login page have alt text | Automated (axe-core) | P1 |
| A11Y-LOGIN-1.3.1-001 | 1.3.1 Info and Relationships | A | Verify form fields have associated labels | Automated (axe-core) | P1 |
| A11Y-LOGIN-1.3.1-002 | 1.3.1 Info and Relationships | A | Verify error messages are programmatically associated with fields | Manual | P1 |
| A11Y-LOGIN-1.4.3-001 | 1.4.3 Contrast (Minimum) | AA | Verify text contrast ratio meets 4.5:1 minimum | Automated (axe-core) | P2 |
| A11Y-LOGIN-1.4.3-002 | 1.4.3 Contrast (Minimum) | AA | Verify error message text contrast ratio | Automated (axe-core) | P2 |
| A11Y-LOGIN-2.1.1-001 | 2.1.1 Keyboard | A | Verify all interactive elements are keyboard accessible | Manual | P1 |
| A11Y-LOGIN-2.1.1-002 | 2.1.1 Keyboard | A | Verify no keyboard traps exist | Manual | P1 |
| A11Y-LOGIN-2.4.3-001 | 2.4.3 Focus Order | A | Verify tab order: email → password → sign in button | Manual | P1 |
| A11Y-LOGIN-2.4.7-001 | 2.4.7 Focus Visible | AA | Verify visible focus indicator on all interactive elements | Manual | P2 |
| A11Y-LOGIN-3.3.1-001 | 3.3.1 Error Identification | A | Verify errors are identified in text (not color alone) | Manual | P1 |
| A11Y-LOGIN-3.3.2-001 | 3.3.2 Labels or Instructions | A | Verify email and password fields have visible labels | Manual | P1 |
| A11Y-LOGIN-3.3.3-001 | 3.3.3 Error Suggestion | AA | Verify error messages suggest how to fix the problem | Manual | P2 |
| A11Y-LOGIN-4.1.2-001 | 4.1.2 Name, Role, Value | A | Verify form elements have correct ARIA roles | Automated (axe-core) | P1 |

## A11Y-LOGIN-2.1.1-001: Keyboard Navigation (Detail)

**WCAG Criterion**: 2.1.1 Keyboard (Level A)
**Page**: Login Page
**Priority**: P1

### Test Steps

1. **Navigate** to the login page using keyboard only (no mouse)
   - **Expected**: Page loads and first interactive element receives focus

2. **Press** Tab to move between interactive elements
   - **Expected**: Focus moves in logical order: email field → password field → Sign In button

3. **Press** Enter while Sign In button is focused
   - **Expected**: Form submits (same as clicking the button)

4. **Press** Shift+Tab to move focus backward
   - **Expected**: Focus moves in reverse order without skipping elements

5. **Verify** no keyboard trap exists (user can tab away from all elements)
   - **Expected**: Focus can leave and return to all interactive elements

### Test Method
Manual — requires human verification of focus behavior

## A11Y-LOGIN-3.3.1-001: Error Identification (Detail)

**WCAG Criterion**: 3.3.1 Error Identification (Level A)
**Page**: Login Page
**Priority**: P1

### Test Steps

1. **Submit** the login form with empty fields
   - **Expected**: Error messages appear in text form (not color alone)

2. **Verify** the error text describes the specific error
   - **Expected**: Error says "Please enter a valid email address" (not just "Error")

3. **Verify** the error is announced to screen readers
   - **Expected**: Error container has `role="alert"` or `aria-live="polite"`

### Test Method
Semi-automated — axe-core for ARIA roles, manual for screen reader announcement
