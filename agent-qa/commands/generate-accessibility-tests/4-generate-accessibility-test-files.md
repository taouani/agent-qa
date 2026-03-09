# PHASE 4: Generate Accessibility Test Files

Write accessibility test case files, WCAG compliance matrix, summary index, and optional Playwright accessibility specs to the output folder.

## Core Responsibilities

1. **Group Test Cases by Page**: Organize accessibility test cases per page
2. **Generate Per-Page Markdown Files**: Create accessibility test case files per page
3. **Generate WCAG Compliance Matrix**: Create criteria x pages pass/fail/untested matrix
4. **Generate Summary Index**: Create accessibility-tests-index.md
5. **Generate Playwright A11y Specs (Optional)**: Create @axe-core/playwright spec files if enabled
6. **Write Files**: Write all files to the accessibility-tests output folder
7. **Generate Output Index**: Update or create README.md in the output folder

## Workflow

### Step 1: Group Test Cases by Page

Organize all generated accessibility test cases by page name, maintaining WCAG criterion order within each page:
1. Perceivable (1.x.x)
2. Operable (2.x.x)
3. Understandable (3.x.x)
4. Robust (4.x.x)

### Step 2: Generate Per-Page Accessibility Test Files

For each page, create file: `{page-name}-accessibility-tests.md`

**YAML Front Matter**:
```yaml
---
type: accessibility-test
generated: YYYY-MM-DD HH:MM
source_requirements:
  - {REQUIREMENT-KEY-1}
  - {REQUIREMENT-KEY-2}
source_test_cases:
  - {TC-ID-1}
  - {TC-ID-2}
page: {page-name}
wcag_version: "2.1"
conformance_level: "AA"
language: {detected-language-code}
version: "1.0"
---
```

**Markdown Structure**:
```markdown
# Accessibility Tests: {Page Name}

## Page Overview
- **Page**: {Page Name}
- **Source Requirements**: {REQUIREMENT-KEY-1}, {REQUIREMENT-KEY-2}
- **Applicable WCAG Criteria**: {count} criteria
- **Test Count**: {total} ({automated} automated, {manual} manual, {semi-automated} semi-automated)

## Perceivable

### 1.1.1 Non-text Content (Level A) — P1

#### A11Y-{PAGE}-1.1.1-001: {Test Description}

**WCAG Criterion**: 1.1.1 Non-text Content (Level A)
**Test Method**: Automated | Manual | Semi-automated
**Recommended Tool**: axe-core / WAVE / Screen reader (NVDA/VoiceOver)

**Prerequisites**:
- {prerequisite 1}
- {prerequisite 2}

**Test Steps**:
1. {Step description}
   - **Expected**: {Expected result with specific pass/fail criteria}
2. {Step description}
   - **Expected**: {Expected result}

**Traceability**:
- Source Test Cases: {TC-ID-1}, {TC-ID-2}
- Requirements: {REQUIREMENT-KEY}

---

### 1.4.3 Contrast (Minimum) (Level AA) — P2

#### A11Y-{PAGE}-1.4.3-001: {Test Description}
...

## Operable
...

## Understandable
...

## Robust
...
```

### Step 3: Generate WCAG Compliance Matrix

Create `wcag-compliance-matrix.md`:

**YAML Front Matter**:
```yaml
---
type: accessibility-test
generated: YYYY-MM-DD HH:MM
source_requirements:
  - {all requirement keys}
wcag_version: "2.1"
conformance_level: "AA"
language: {majority-language-code}
version: "1.0"
---
```

**Matrix Structure**:
```markdown
# WCAG 2.1 AA Compliance Matrix

## Summary
- **Pages Analyzed**: {count}
- **Total Criteria Applicable**: {count}
- **Total Test Cases**: {count}
- **Automated**: {count} ({percentage}%)
- **Manual**: {count} ({percentage}%)
- **Semi-automated**: {count} ({percentage}%)

## Compliance Matrix

| WCAG Criterion | Level | {Page 1} | {Page 2} | {Page 3} | ... |
|---------------|-------|----------|----------|----------|-----|
| 1.1.1 Non-text Content | A | Untested | Untested | N/A | ... |
| 1.3.1 Info and Relationships | A | Untested | Untested | Untested | ... |
| 1.4.3 Contrast (Minimum) | AA | Untested | Untested | Untested | ... |
| 2.1.1 Keyboard | A | Untested | Untested | Untested | ... |
| 2.4.7 Focus Visible | AA | Untested | Untested | N/A | ... |
| ... | ... | ... | ... | ... | ... |

### Legend
- **Untested**: Test case exists, not yet executed
- **N/A**: Criterion not applicable to this page
- **(empty)**: No test case generated (criterion not relevant)

## Per-Page Summary

| Page | Applicable Criteria | Test Cases | Automated | Manual | Semi-automated |
|------|-------------------|------------|-----------|--------|----------------|
| {Page 1} | {count} | {count} | {count} | {count} | {count} |
| {Page 2} | {count} | {count} | {count} | {count} | {count} |
```

### Step 4: Generate Summary Index

Create `accessibility-tests-index.md`:

**YAML Front Matter**:
```yaml
---
type: accessibility-test
generated: YYYY-MM-DD HH:MM
source_requirements:
  - {all requirement keys}
wcag_version: "2.1"
conformance_level: "AA"
language: {majority-language-code}
version: "1.0"
---
```

**Index Structure**:
```markdown
# Accessibility Test Suite Index

## Overview
- **Generated**: YYYY-MM-DD HH:MM
- **Source**: Test cases from `{selected-folder-path}`
- **WCAG Version**: 2.1
- **Conformance Level**: AA
- **Total Pages Analyzed**: {count}
- **Total Accessibility Test Cases**: {count}

## Test Distribution

### By Priority
| Priority | Count | Percentage |
|----------|-------|------------|
| P1 (Critical — Level A) | {count} | {%} |
| P2 (High — Level AA) | {count} | {%} |

### By Test Method
| Method | Count | Percentage |
|--------|-------|------------|
| Automated | {count} | {%} |
| Manual | {count} | {%} |
| Semi-automated | {count} | {%} |

### By WCAG Principle
| Principle | Count | Percentage |
|-----------|-------|------------|
| Perceivable | {count} | {%} |
| Operable | {count} | {%} |
| Understandable | {count} | {%} |
| Robust | {count} | {%} |

## Files Generated

| File | Page | Test Cases | Description |
|------|------|------------|-------------|
| [{page-name}-accessibility-tests.md](./{page-name}-accessibility-tests.md) | {Page Name} | {count} | Accessibility tests for {Page Name} |
| ... | ... | ... | ... |
| [wcag-compliance-matrix.md](./wcag-compliance-matrix.md) | All | — | WCAG 2.1 AA compliance matrix |

## Traceability

| Requirement Key | Pages | Accessibility Test Cases |
|----------------|-------|------------------------|
| {REQUIREMENT-KEY} | {page list} | {A11Y test ID list} |

## Recommended Tools
- **axe-core**: Automated WCAG rule checking (integrated with Playwright, Cypress, Jest)
- **WAVE**: Browser extension for visual accessibility evaluation
- **Lighthouse**: Chrome DevTools accessibility audit
- **NVDA**: Free screen reader for Windows
- **VoiceOver**: Built-in screen reader for macOS/iOS
- **Color Contrast Analyzer**: Desktop tool for contrast ratio checking
```

### Step 5: Generate Playwright Accessibility Specs (Optional)

Check `agent-qa/config.yml` for Playwright configuration. If Playwright tests are enabled (e.g., `output_formats.playwright: true` or Playwright base URL is configured):

For each page, generate `{page-name}.a11y.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('{Page Name} - Accessibility Tests', () => {

  test('A11Y-{PAGE}-FULL-001: Full page axe-core scan', async ({ page }) => {
    await page.goto('{page-url}');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('A11Y-{PAGE}-1.1.1-001: Images have alt text', async ({ page }) => {
    await page.goto('{page-url}');

    const images = page.locator('img');
    const count = await images.count();

    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      const role = await img.getAttribute('role');

      // Decorative images should have empty alt or role="presentation"
      // Informative images should have non-empty alt text
      if (role !== 'presentation') {
        expect(alt, `Image ${i} missing alt text`).toBeTruthy();
      }
    }
  });

  test('A11Y-{PAGE}-1.4.3-001: Color contrast meets minimum ratios', async ({ page }) => {
    await page.goto('{page-url}');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withRules(['color-contrast'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('A11Y-{PAGE}-2.1.1-001: All interactive elements are keyboard accessible', async ({ page }) => {
    await page.goto('{page-url}');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withRules(['keyboard'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('A11Y-{PAGE}-2.4.7-001: Focus indicators are visible', async ({ page }) => {
    await page.goto('{page-url}');

    // Tab through interactive elements and verify focus visibility
    const interactiveElements = page.locator(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const count = await interactiveElements.count();

    for (let i = 0; i < count; i++) {
      await page.keyboard.press('Tab');
      const focused = page.locator(':focus');
      await expect(focused).toBeVisible();
    }
  });

  test('A11Y-{PAGE}-1.3.1-001: Heading hierarchy is logical', async ({ page }) => {
    await page.goto('{page-url}');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withRules(['heading-order', 'page-has-heading-one'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

});
```

Output Playwright files to: `agent-qa/YYYY-MM-DD-{context}/accessibility-tests/playwright/`

### Step 6: Write Files

Write all files to: `agent-qa/YYYY-MM-DD-{context}/accessibility-tests/`

- Per-page test files: `{page-name}-accessibility-tests.md`
- WCAG compliance matrix: `wcag-compliance-matrix.md`
- Summary index: `accessibility-tests-index.md`
- Playwright specs (if enabled): `playwright/{page-name}.a11y.spec.ts`

### Step 7: Generate Output Index

Follow the instructions in `@agent-qa/commands/common/generate-output-index.md` to generate or update the `README.md` index file in the output folder.

### Step 8: Execute Post-Generation Hooks

Follow the instructions in `@agent-qa/commands/common/execute-post-hooks.md` to run any configured post-generation hooks.

## Important Constraints

- Include YAML front matter with `type: accessibility-test` in all markdown files
- Group test cases by WCAG principle and criterion within each page file
- Use the test ID format `A11Y-{PAGE}-{WCAG-CRITERION}-{NNN}` consistently
- WCAG compliance matrix must list all applicable criteria across all pages
- Mark all tests as "Untested" in the compliance matrix (they are generated, not yet executed)
- Playwright specs use `@axe-core/playwright` for automated checks
- Match language of original requirements for test case content
- Follow markdown formatting standards from `.claude/rules/output-standards.md`
