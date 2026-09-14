# Playwright Authoring

You turn identified pages and mapped test-case steps into Playwright Page Object classes and
`.spec.ts` files: which locator properties a page exposes, which navigation and action methods
it composes them into, and how test steps become setup, page-object calls, and assertions.

## When This Applies

Loaded by `generate-playwright-tests` phase 3 (Generate Page Objects) to shape Page Object
classes, and phase 4 (Generate Test Specs) to shape spec files, once the page inventory and
locator strategy from phase 2 are available.

`agent-qa/formats/playwright/page-object-template.md` and
`agent-qa/formats/playwright/spec-file-template.md` are authoritative for Page Object and spec
file format and layout. Any skeleton shown below is illustrative of the judgement being
described, not a specification of the file format. Where the two differ, the template wins.

## Page Object Design

For each page in `page_inventory`, generate a TypeScript Page Object class:

```typescript
import { type Locator, type Page } from '@playwright/test';

export class {PageName}Page {
  readonly page: Page;
  {locator_properties}

  constructor(page: Page) {
    this.page = page;
    {locator_initializations}
  }

  {methods}
}
```

## Locator Properties

For each UI element identified on the page:

1. Create a `readonly` property with the `Locator` type
2. Use camelCase naming derived from the element name:
   - "Email field" → `emailInput`
   - "Submit button" → `submitButton`
   - "Country dropdown" → `countrySelect`
   - "Error message" → `errorMessage`

3. Initialize in constructor using the recommended locator strategy from Phase 2.

A locator carried from the exploration report with a `Source Snapshot` is provenance-backed: emit
it with NO TODO comment. Only a locator inferred from test-step wording gets one.

```typescript
constructor(page: Page) {
  this.page = page;
  // Observed in the exploration report — no TODO
  this.emailInput = page.getByRole('textbox', { name: 'Email' });
  this.passwordInput = page.getByRole('textbox', { name: 'Password' });
  this.submitButton = page.getByRole('button', { name: 'Submit' });
  // TODO: Verify this locator — element name inferred from test steps
  this.errorMessage = page.getByText(/invalid|error/i);
}
```

## Navigation Methods

Add a `goto()` method using `playwright_base_url` from config:

```typescript
async goto() {
  await this.page.goto('{page_path}');
}
```

Where `{page_path}` is the relative path inferred from navigation flows (e.g., `/login`, `/dashboard`).

If the path is uncertain, add a TODO:

```typescript
// TODO: Confirm the correct URL path for this page
async goto() {
  await this.page.goto('/assumed-path');
}
```

## Action Methods

Create action methods that combine multiple element interactions:

**Form submission patterns:**
```typescript
async login(email: string, password: string) {
  await this.emailInput.fill(email);
  await this.passwordInput.fill(password);
  await this.loginButton.click();
}
```

**Search patterns:**
```typescript
async searchFor(query: string) {
  await this.searchInput.fill(query);
  await this.searchButton.click();
}
```

**Selection patterns:**
```typescript
async selectCountry(country: string) {
  await this.countrySelect.selectOption(country);
}
```

Only create action methods for interaction patterns that appear in the test steps. Do not generate speculative methods.

## Spec Structure

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

## Assertions

#### Verification steps → expect() assertions

```typescript
await expect(page).toHaveURL(/dashboard/);
await expect(dashboardPage.welcomeMessage).toBeVisible();
await expect(loginPage.errorMessage).toHaveText('Invalid credentials');
await expect(page.getByRole('row')).toHaveCount(6);
```

## What This Role Never Does

- Never generate a Page Object for a page not identified in phase 2's page inventory
- Never add a locator property or action method for an element that is not referenced in the test steps
- Never generate a speculative action method for an interaction pattern absent from the test steps
- Never put assertions inside a Page Object — assertions belong in the spec file
- Never declare a Locator property without `readonly`
- Never generate step-definition files, Cucumber integration, or project scaffolding — only Page Object and spec files
