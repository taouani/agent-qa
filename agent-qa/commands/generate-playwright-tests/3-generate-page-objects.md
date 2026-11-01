# Phase 3: Generate Page Objects

## Core Responsibilities

- Generate Page Object classes for each identified page
- Use the locator strategy from Phase 2
- Include action methods for common interactions
- Add TODO comments for uncertain locators

## Workflow Steps

### Step 1: Read the Framework Profile Layout

Read `agent-qa/framework-profile.md` WITHOUT running discovery. Do NOT delegate to the shared
profile-discovery snippet under `agent-qa/commands/common/` from this command, and never stop this
command because a profile is missing or unreviewed.

If the profile exists and its front matter says `reviewed: true`, read its `## Layout` section for
`page_object_dir`, `page_object_naming` and `fixture_import`, and prefer those over the hardcoded
defaults used in the steps below. If the profile is absent, or exists with `reviewed: false`, keep
the defaults in this phase unchanged and say so once in the run summary.

### Step 2: Generate Page Object Classes

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

### Step 3: Define Locator Properties

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

### Step 4: Generate Navigation Methods

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

### Step 5: Generate Action Methods

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

### Step 6: Add TODO Comments

Add TODO comments to the generated code, but only where the item is actually uncertain:

- For every INFERRED locator: "TODO: Verify this locator matches the actual UI element". A locator
  carried from the exploration report with a `Source Snapshot` is provenance-backed and gets NO
  TODO comment
- For uncertain paths: "TODO: Confirm the correct URL path"
- For inferred element names: "TODO: Element name inferred from test steps — verify"
- At the file level, ONLY when the file contains at least one inferred locator: "TODO: This is a
  generated scaffold — review and adjust locators after running against the actual application".
  Omit this header entirely from a file whose every locator came from an exploration snapshot

### Step 7: Write Page Object Files

Write each Page Object class to:

```
{selected_folder}/playwright/pages/{page-name}.page.ts
```

File naming:
- Use kebab-case for file names: `login.page.ts`, `user-profile.page.ts`
- Class uses PascalCase: `LoginPage`, `UserProfilePage`

When Step 1 resolved a reviewed profile, prefer its `page_object_naming` over the kebab-case
default, mirror its `page_object_dir` as the subdirectory layout inside the output folder, and use
its `fixture_import` in place of the generic `@playwright/test` import. The deliverable is still
written under `{selected_folder}`; placing files into the host repository is Phase 4's Step 7 and
is gated there.

## Data Storage

Store for Phase 4:
- `page_object_files`: Map of page name → file path
- `page_object_imports`: Map of page name → import statement for use in specs

## Constraints

- Only generate Page Objects for pages identified in Phase 2
- Only include elements that are referenced in the test steps
- Add TODO comments for every INFERRED locator; locators sourced from an exploration snapshot
  are provenance-backed and must not be marked TODO
- Do NOT include assertion methods in Page Objects (assertions belong in specs)
- Use `readonly` for all Locator properties
