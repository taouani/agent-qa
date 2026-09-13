# Phase 4: Generate Test Specs

## Core Responsibilities

- Generate `.spec.ts` files grouped by requirement key
- Map test case steps to Playwright API calls
- Handle data-driven tests with parameterization
- Generate a README with setup instructions

## Workflow Steps

### Step 1: Generate Test Spec Files

For each requirement key, generate a `.spec.ts` file:

```typescript
import { test, expect } from '@playwright/test';
import { {PageName}Page } from '../pages/{page-name}.page';

test.describe('{REQUIREMENT-KEY}: {Requirement Summary}', () => {

  test('{TC-ID}: {Test Case Summary}', async ({ page }) => {
    // Page Object instantiation
    // Test steps
    // Assertions
  });

});
```

### Step 2: Map Test Steps to Playwright Code

For each test case within the spec:

#### Prerequisites → beforeEach or inline setup

If multiple test cases share the same prerequisites, use `test.beforeEach`:

```typescript
test.beforeEach(async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('test@example.com', 'Password123!');
});
```

Otherwise, include setup steps at the beginning of each test.

#### Navigation steps → Page Object goto()

```typescript
const loginPage = new LoginPage(page);
await loginPage.goto();
```

#### Input steps → fill() / selectOption() / check()

```typescript
await loginPage.emailInput.fill('test@example.com');
await settingsPage.countrySelect.selectOption('France');
await formPage.agreeCheckbox.check();
```

#### Click steps → click()

```typescript
await loginPage.submitButton.click();
```

#### Verification steps → expect() assertions

```typescript
await expect(page).toHaveURL(/dashboard/);
await expect(dashboardPage.welcomeMessage).toBeVisible();
await expect(loginPage.errorMessage).toHaveText('Invalid credentials');
await expect(page.getByRole('row')).toHaveCount(6);
```

### Step 3: Handle Data-Driven Tests

For test cases with multiple data sets, use parameterization:

```typescript
const testData = [
  { email: 'admin@example.com', password: 'AdminPass1!', expectedRole: 'Admin' },
  { email: 'user@example.com', password: 'UserPass1!', expectedRole: 'Standard' },
];

for (const data of testData) {
  test(`TC-PROJ-123-005: Login as ${data.expectedRole}`, async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(data.email, data.password);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(data.expectedRole);
  });
}
```

### Step 4: Write Spec Files

Write each spec file to:

```
{selected_folder}/playwright/tests/{REQUIREMENT-KEY}.spec.ts
```

File naming: `{REQUIREMENT-KEY}.spec.ts` (e.g., `PROJ-123.spec.ts`)

### Step 5: Generate README

Create `{selected_folder}/playwright/README.md`:

```markdown
---
type: playwright-index
generated: YYYY-MM-DD HH:MM
source_folder: {selected_folder}
---

# Playwright Test Files

## Setup

### Prerequisites

- Node.js 18+
- Playwright installed: `npm init playwright@latest`

### Dependencies

```bash
npm install -D @playwright/test
npx playwright install
```

### Configuration

Create or update `playwright.config.ts` in your project root:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './agent-qa/{folder}/playwright/tests',
  use: {
    baseURL: '{playwright_base_url}',
  },
});
```

### Running Tests

```bash
# Run all generated tests
npx playwright test --config playwright.config.ts

# Run tests for a specific requirement
npx playwright test {REQUIREMENT-KEY}.spec.ts

# Run in headed mode for debugging
npx playwright test --headed
```

## Generated Files

### Page Objects (`pages/`)

| File | Class | Elements |
|------|-------|----------|
| {page-name}.page.ts | {PageName}Page | {element_count} elements |

### Test Specs (`tests/`)

| File | Requirement | Tests |
|------|-------------|-------|
| {REQUIREMENT-KEY}.spec.ts | {REQUIREMENT-KEY} | {test_count} tests |

## Important Notes

- All locators are generated from test case descriptions and may need adjustment
- Look for `TODO` comments in generated files for items needing verification
- Run tests against the actual application and fix locators as needed
- Page Object `goto()` URLs may need correction based on actual routing
```

### Step 6: Present Results

Present a summary to the user:

```
Playwright test generation complete!

Output: {selected_folder}/playwright/
  pages/
    - {page_count} page object files
  tests/
    - {spec_count} spec files
    - {test_count} total test cases

Files generated:
  pages/login.page.ts (4 elements)
  pages/dashboard.page.ts (3 elements)
  tests/PROJ-123.spec.ts (5 tests)
  tests/PROJ-124.spec.ts (3 tests)
  README.md

Next steps:
  1. Review generated files and fix TODO items
  2. Install Playwright: npm init playwright@latest
  3. Run tests: npx playwright test
```

### Step 7: Offer to Place Files in the Host Repository

Skip this step entirely when `automation.allow_source_edits` is `false`.

Otherwise list the generated files with their proposed destinations under `spec_dir` and
`page_object_dir`, and ask which to place. For each accepted file that already exists, show a diff
and ask again. Never place a file the user did not name.

### Step 8: Generate Output Index

Follow the instructions in `@agent-qa/commands/common/generate-output-index.md` to generate or update the `README.md` index file in the output folder.

### Step 9: Execute Post-Generation Hooks

Follow the instructions in `@agent-qa/commands/common/execute-post-hooks.md` to run any configured post-generation hooks.

## Constraints

- Only generate `.spec.ts` files (not full project scaffold)
- Do NOT create `package.json`, `playwright.config.ts`, or other project files (only the README mentions them)
- Do NOT generate step definition files or cucumber integration
- Write files to the `playwright/` subdirectory of the selected output folder by default
- Writing into the host repository's `spec_dir` or `page_object_dir` is permitted ONLY when all
  of the following hold: `automation.allow_source_edits` is `true`, the framework profile has
  `reviewed: true`, the resolved path is under `playwright_project_root`, and the user approved
  this run when asked. When any condition fails, write to the output folder and say why
- Never overwrite an existing host-repository file without showing the user a diff first
- Do NOT modify existing test case files
- Include TODO comments for all uncertain elements
