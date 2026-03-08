# Phase 3: Generate Page Objects

## Core Responsibilities

- Generate Page Object classes for each identified page
- Use the locator strategy from Phase 2
- Include action methods for common interactions
- Add TODO comments for uncertain locators

## Workflow Steps

### Step 1: Generate Page Object Classes

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

### Step 2: Define Locator Properties

For each UI element identified on the page:

1. Create a `readonly` property with the `Locator` type
2. Use camelCase naming derived from the element name:
   - "Email field" → `emailInput`
   - "Submit button" → `submitButton`
   - "Country dropdown" → `countrySelect`
   - "Error message" → `errorMessage`

3. Initialize in constructor using the recommended locator strategy from Phase 2:

```typescript
constructor(page: Page) {
  this.page = page;
  this.emailInput = page.getByRole('textbox', { name: 'Email' });
  this.passwordInput = page.getByRole('textbox', { name: 'Password' });
  this.submitButton = page.getByRole('button', { name: 'Submit' });
  // TODO: Verify this locator — element name inferred from test steps
  this.errorMessage = page.getByText(/invalid|error/i);
}
```

### Step 3: Generate Navigation Methods

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

### Step 4: Generate Action Methods

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

### Step 5: Add TODO Comments

Add TODO comments throughout the generated code:

- For every locator: "TODO: Verify this locator matches the actual UI element"
- For uncertain paths: "TODO: Confirm the correct URL path"
- For inferred element names: "TODO: Element name inferred from test steps — verify"
- At the file level: "TODO: This is a generated scaffold — review and adjust locators after running against the actual application"

### Step 6: Write Page Object Files

Write each Page Object class to:

```
{selected_folder}/playwright/pages/{page-name}.page.ts
```

File naming:
- Use kebab-case for file names: `login.page.ts`, `user-profile.page.ts`
- Class uses PascalCase: `LoginPage`, `UserProfilePage`

## Data Storage

Store for Phase 4:
- `page_object_files`: Map of page name → file path
- `page_object_imports`: Map of page name → import statement for use in specs

## Constraints

- Only generate Page Objects for pages identified in Phase 2
- Only include elements that are referenced in the test steps
- Always add TODO comments for locator verification
- Do NOT include assertion methods in Page Objects (assertions belong in specs)
- Use `readonly` for all Locator properties
