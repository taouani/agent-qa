# WCAG 2.1 AA Mapping Template

Template for structuring accessibility test cases mapped to WCAG 2.1 AA success criteria.

## YAML Front Matter

All accessibility test files use the following front matter:

```yaml
---
type: accessibility-test
generated: YYYY-MM-DD HH:MM
source_requirements:
  - {REQUIREMENT-KEY}
source_test_cases:
  - {TC-ID}
page: {page-name}
wcag_version: "2.1"
conformance_level: "AA"
language: {detected-language-code}
version: "1.0"
---
```

## WCAG 2.1 AA Success Criteria Reference

### Perceivable

| Criterion | Name | Level | Description |
|-----------|------|-------|-------------|
| 1.1.1 | Non-text Content | A | All non-text content has a text alternative that serves the equivalent purpose |
| 1.2.1 | Audio-only and Video-only (Prerecorded) | A | Alternatives provided for prerecorded audio-only and video-only content |
| 1.2.2 | Captions (Prerecorded) | A | Captions provided for prerecorded audio content in synchronized media |
| 1.2.3 | Audio Description or Media Alternative (Prerecorded) | A | Alternative or audio description provided for prerecorded video |
| 1.2.5 | Audio Description (Prerecorded) | AA | Audio description provided for prerecorded video content |
| 1.3.1 | Info and Relationships | A | Information, structure, and relationships can be programmatically determined |
| 1.3.2 | Meaningful Sequence | A | Correct reading sequence can be programmatically determined |
| 1.3.3 | Sensory Characteristics | A | Instructions do not rely solely on sensory characteristics |
| 1.3.4 | Orientation | AA | Content not restricted to a single display orientation |
| 1.3.5 | Identify Input Purpose | AA | Input purpose can be programmatically determined for user data fields |
| 1.4.1 | Use of Color | A | Color is not used as the only visual means of conveying information |
| 1.4.2 | Audio Control | A | Mechanism to pause, stop, or control volume of auto-playing audio |
| 1.4.3 | Contrast (Minimum) | AA | Text has a contrast ratio of at least 4.5:1 (3:1 for large text) |
| 1.4.4 | Resize Text | AA | Text can be resized up to 200% without loss of content or functionality |
| 1.4.5 | Images of Text | AA | Text is used instead of images of text where possible |
| 1.4.10 | Reflow | AA | Content reflows without loss at 320px width / 256px height |
| 1.4.11 | Non-text Contrast | AA | UI components and graphical objects have 3:1 contrast ratio |
| 1.4.12 | Text Spacing | AA | No loss of content with increased text spacing |
| 1.4.13 | Content on Hover or Focus | AA | Additional content on hover/focus is dismissible, hoverable, persistent |

### Operable

| Criterion | Name | Level | Description |
|-----------|------|-------|-------------|
| 2.1.1 | Keyboard | A | All functionality is operable through a keyboard interface |
| 2.1.2 | No Keyboard Trap | A | Keyboard focus can be moved away from any component |
| 2.1.4 | Character Key Shortcuts | A | Single character key shortcuts can be turned off or remapped |
| 2.2.1 | Timing Adjustable | A | Users can turn off, adjust, or extend time limits |
| 2.2.2 | Pause, Stop, Hide | A | Moving, blinking, scrolling, or auto-updating content can be paused |
| 2.3.1 | Three Flashes or Below Threshold | A | No content flashes more than three times per second |
| 2.4.1 | Bypass Blocks | A | Mechanism to bypass repeated blocks of content |
| 2.4.2 | Page Titled | A | Pages have descriptive titles |
| 2.4.3 | Focus Order | A | Focusable components receive focus in meaningful order |
| 2.4.4 | Link Purpose (In Context) | A | Purpose of each link is clear from link text or context |
| 2.4.5 | Multiple Ways | AA | Multiple ways to locate a page within a set of pages |
| 2.4.6 | Headings and Labels | AA | Headings and labels describe topic or purpose |
| 2.4.7 | Focus Visible | AA | Keyboard focus indicator is visible |
| 2.5.1 | Pointer Gestures | A | Multipoint/path-based gestures have single-pointer alternatives |
| 2.5.2 | Pointer Cancellation | A | Down-event not used to execute functions (use up-event) |
| 2.5.3 | Label in Name | A | Accessible name contains the visible label text |
| 2.5.4 | Motion Actuation | A | Motion-triggered functions have UI alternatives and can be disabled |

### Understandable

| Criterion | Name | Level | Description |
|-----------|------|-------|-------------|
| 3.1.1 | Language of Page | A | Default human language of each page can be programmatically determined |
| 3.1.2 | Language of Parts | AA | Language of each passage can be programmatically determined |
| 3.2.1 | On Focus | A | Receiving focus does not initiate a change of context |
| 3.2.2 | On Input | A | Changing a UI setting does not automatically cause a change of context |
| 3.2.3 | Consistent Navigation | AA | Navigation mechanisms are consistent across pages |
| 3.2.4 | Consistent Identification | AA | Components with same functionality are identified consistently |
| 3.3.1 | Error Identification | A | Input errors are automatically detected and described in text |
| 3.3.2 | Labels or Instructions | A | Labels or instructions provided for user input |
| 3.3.3 | Error Suggestion | AA | Suggestions provided for correcting input errors |
| 3.3.4 | Error Prevention (Legal, Financial, Data) | AA | Submissions are reversible, checked, or confirmed |

### Robust

| Criterion | Name | Level | Description |
|-----------|------|-------|-------------|
| 4.1.1 | Parsing | A | No duplicate attributes, elements nested per spec |
| 4.1.2 | Name, Role, Value | A | UI components have accessible name, role, and state |
| 4.1.3 | Status Messages | AA | Status messages are programmatically determinable without focus |

## Accessibility Test Case Structure

Each test case follows this structure:

```markdown
#### A11Y-{PAGE}-{CRITERION}-{NNN}: {Test Description}

**WCAG Criterion**: {number} {name} (Level {A|AA})
**Test Method**: Automated | Manual | Semi-automated
**Recommended Tool**: {tool name}

**Prerequisites**:
- {prerequisite}

**Test Steps**:
1. {Action step}
   - **Expected**: {Specific, measurable expected result}
2. {Action step}
   - **Expected**: {Specific, measurable expected result}

**Traceability**:
- Source Test Cases: {TC-ID list}
- Requirements: {REQUIREMENT-KEY list}
```

### Field Definitions

| Field | Description |
|-------|-------------|
| Test ID | Format: `A11Y-{PAGE}-{WCAG-CRITERION}-{NNN}` |
| WCAG Criterion | Full criterion reference with number, name, and level |
| Test Method | `Automated` (tool-verifiable), `Manual` (human judgment), `Semi-automated` (tool + human) |
| Recommended Tool | Suggested tool: axe-core, WAVE, Lighthouse, NVDA, VoiceOver, Color Contrast Analyzer |
| Prerequisites | Setup requirements for the test |
| Test Steps | Numbered, imperative-verb steps with specific expected results |
| Traceability | Links to source test cases and requirement keys |

## Example: Login Form Accessibility Tests

```markdown
---
type: accessibility-test
generated: 2026-03-09 14:30
source_requirements:
  - PROJ-123
source_test_cases:
  - TC-PROJ-123-001
  - TC-PROJ-123-002
page: login
wcag_version: "2.1"
conformance_level: "AA"
language: en
version: "1.0"
---

# Accessibility Tests: Login Page

## Page Overview
- **Page**: Login
- **Source Requirements**: PROJ-123
- **Applicable WCAG Criteria**: 18 criteria
- **Test Count**: 24 (10 automated, 11 manual, 3 semi-automated)

## Perceivable

### 1.1.1 Non-text Content (Level A) — P1

#### A11Y-LOGIN-1.1.1-001: Logo image has appropriate alt text

**WCAG Criterion**: 1.1.1 Non-text Content (Level A)
**Test Method**: Automated
**Recommended Tool**: axe-core

**Prerequisites**:
- Login page is loaded and fully rendered

**Test Steps**:
1. Inspect the logo image element on the login page
   - **Expected**: Logo `<img>` element has a non-empty `alt` attribute describing the company/application name
2. Run axe-core scan with rule `image-alt`
   - **Expected**: No violations reported for image alt text

**Traceability**:
- Source Test Cases: TC-PROJ-123-001
- Requirements: PROJ-123

---

### 1.4.3 Contrast (Minimum) (Level AA) — P2

#### A11Y-LOGIN-1.4.3-001: Form labels and input text meet minimum contrast ratio

**WCAG Criterion**: 1.4.3 Contrast (Minimum) (Level AA)
**Test Method**: Automated
**Recommended Tool**: axe-core, Color Contrast Analyzer

**Prerequisites**:
- Login page is loaded with default theme/styling

**Test Steps**:
1. Inspect the contrast ratio of form labels ("Email", "Password") against their background
   - **Expected**: Contrast ratio is at least 4.5:1 for normal-sized text
2. Inspect the contrast ratio of input field text against the input background
   - **Expected**: Contrast ratio is at least 4.5:1 for normal-sized text
3. Inspect the contrast ratio of the "Login" button text against the button background
   - **Expected**: Contrast ratio is at least 4.5:1 for normal text, or 3:1 for text 18pt+ or 14pt+ bold
4. Run axe-core scan with rule `color-contrast`
   - **Expected**: No violations reported for color contrast

**Traceability**:
- Source Test Cases: TC-PROJ-123-001
- Requirements: PROJ-123

---

## Operable

### 2.1.1 Keyboard (Level A) — P1

#### A11Y-LOGIN-2.1.1-001: Login form is fully operable via keyboard

**WCAG Criterion**: 2.1.1 Keyboard (Level A)
**Test Method**: Manual
**Recommended Tool**: Manual keyboard testing

**Prerequisites**:
- Login page is loaded
- Mouse/trackpad is not used during testing

**Test Steps**:
1. Press Tab to move focus to the Email input field
   - **Expected**: Email input receives visible focus
2. Type a valid email address using the keyboard
   - **Expected**: Email is entered in the field
3. Press Tab to move focus to the Password input field
   - **Expected**: Password input receives visible focus
4. Type a password using the keyboard
   - **Expected**: Password is entered (masked) in the field
5. Press Tab to move focus to the "Login" button
   - **Expected**: Login button receives visible focus
6. Press Enter or Space to activate the Login button
   - **Expected**: Form is submitted, login process initiates

**Traceability**:
- Source Test Cases: TC-PROJ-123-001
- Requirements: PROJ-123

---

### 2.4.7 Focus Visible (Level AA) — P2

#### A11Y-LOGIN-2.4.7-001: All focusable elements have visible focus indicators

**WCAG Criterion**: 2.4.7 Focus Visible (Level AA)
**Test Method**: Semi-automated
**Recommended Tool**: Manual observation + axe-core

**Prerequisites**:
- Login page is loaded

**Test Steps**:
1. Tab through all interactive elements on the login page (email input, password input, login button, any links)
   - **Expected**: Each element displays a clearly visible focus indicator (outline, border, or equivalent)
2. Verify the focus indicator has sufficient contrast against adjacent colors
   - **Expected**: Focus indicator has at least 3:1 contrast ratio against the adjacent background

**Traceability**:
- Source Test Cases: TC-PROJ-123-001
- Requirements: PROJ-123

---

## Understandable

### 3.3.1 Error Identification (Level A) — P1

#### A11Y-LOGIN-3.3.1-001: Login errors are identified in text

**WCAG Criterion**: 3.3.1 Error Identification (Level A)
**Test Method**: Manual
**Recommended Tool**: Screen reader (NVDA/VoiceOver)

**Prerequisites**:
- Login page is loaded

**Test Steps**:
1. Submit the login form with an empty email field
   - **Expected**: Error message is displayed in text (not only via color or icon) identifying that the email field is required
2. Submit the login form with an invalid email format
   - **Expected**: Error message describes the error in text (e.g., "Please enter a valid email address")
3. Submit the login form with incorrect credentials
   - **Expected**: Error message is displayed in text describing the authentication failure
4. Verify error messages are programmatically associated with their input fields
   - **Expected**: Error messages are linked via `aria-describedby` or `aria-errormessage` to the relevant input

**Traceability**:
- Source Test Cases: TC-PROJ-123-002
- Requirements: PROJ-123

### 3.3.2 Labels or Instructions (Level A) — P1

#### A11Y-LOGIN-3.3.2-001: Form inputs have associated labels

**WCAG Criterion**: 3.3.2 Labels or Instructions (Level A)
**Test Method**: Automated
**Recommended Tool**: axe-core

**Prerequisites**:
- Login page is loaded

**Test Steps**:
1. Inspect the email input field
   - **Expected**: Field has a visible `<label>` element programmatically associated via `for`/`id` match
2. Inspect the password input field
   - **Expected**: Field has a visible `<label>` element programmatically associated via `for`/`id` match
3. Verify labels are not replaced by placeholder text alone
   - **Expected**: Visible labels persist when fields receive focus and contain text
4. Run axe-core scan with rules `label`, `label-title-only`
   - **Expected**: No violations reported

**Traceability**:
- Source Test Cases: TC-PROJ-123-001
- Requirements: PROJ-123
```

## Playwright @axe-core/playwright Integration Pattern

For automated accessibility checks using Playwright:

```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('{Page Name} - Accessibility Tests', () => {

  // Full page scan against WCAG 2.1 AA
  test('A11Y-{PAGE}-FULL-001: Full page WCAG 2.1 AA scan', async ({ page }) => {
    await page.goto('{page-url}');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  // Targeted scan for specific rules
  test('A11Y-{PAGE}-1.4.3-001: Color contrast', async ({ page }) => {
    await page.goto('{page-url}');

    const results = await new AxeBuilder({ page })
      .withRules(['color-contrast'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  // Scan specific page region
  test('A11Y-{PAGE}-FORM-001: Form accessibility', async ({ page }) => {
    await page.goto('{page-url}');

    const results = await new AxeBuilder({ page })
      .include('form')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  // Exclude known issues (with justification)
  test('A11Y-{PAGE}-SCAN-001: Page scan excluding third-party', async ({ page }) => {
    await page.goto('{page-url}');

    const results = await new AxeBuilder({ page })
      .exclude('.third-party-widget')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

});
```

### axe-core Rule to WCAG Criterion Mapping

| axe-core Rule | WCAG Criterion | Description |
|---------------|----------------|-------------|
| `image-alt` | 1.1.1 | Images must have alt text |
| `input-image-alt` | 1.1.1 | Image buttons must have alt text |
| `color-contrast` | 1.4.3 | Text must have sufficient contrast |
| `heading-order` | 1.3.1 | Heading levels should increase by one |
| `page-has-heading-one` | 1.3.1 | Page should contain a level-one heading |
| `label` | 3.3.2 | Form elements must have labels |
| `aria-roles` | 4.1.2 | ARIA roles must be valid |
| `aria-valid-attr` | 4.1.2 | ARIA attributes must be valid |
| `keyboard` | 2.1.1 | Elements must be keyboard accessible |
| `focus-visible` | 2.4.7 | Elements must have visible focus |
| `link-name` | 2.4.4 | Links must have discernible text |
| `button-name` | 4.1.2 | Buttons must have discernible text |
| `document-title` | 2.4.2 | Documents must have title |
| `html-has-lang` | 3.1.1 | HTML must have lang attribute |
| `bypass` | 2.4.1 | Page must have skip navigation |

## WCAG Compliance Matrix Template

```markdown
| WCAG Criterion | Level | {Page 1} | {Page 2} | {Page 3} |
|---------------|-------|----------|----------|----------|
| 1.1.1 Non-text Content | A | Untested | N/A | Untested |
| 1.3.1 Info and Relationships | A | Untested | Untested | Untested |
| 1.4.3 Contrast (Minimum) | AA | Untested | Untested | Untested |
| 2.1.1 Keyboard | A | Untested | Untested | Untested |
| 2.4.7 Focus Visible | AA | Untested | Untested | N/A |

### Status Values
- **Pass**: Criterion tested and met
- **Fail**: Criterion tested and not met
- **Untested**: Test case exists, not yet executed
- **N/A**: Criterion not applicable to this page
```
