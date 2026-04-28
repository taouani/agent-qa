# Playwright Page Object Template

Patterns for generating Page Object Model classes from test case UI element analysis.

## Class Structure

```typescript
import { type Locator, type Page } from '@playwright/test';

export class {PageName}Page {
  readonly page: Page;
  // Locator properties — one per UI element
  readonly {elementName}: Locator;

  constructor(page: Page) {
    this.page = page;
    // Initialize locators
    this.{elementName} = page.{locatorStrategy};
  }

  // Navigation method
  async goto() {
    await this.page.goto('{page_path}');
  }

  // Action methods — one per user interaction pattern
  async {actionName}({parameters}: {types}) {
    // Implementation
  }
}
```

## Locator Strategy Priority

Choose locators in this order (most preferred first):

### 1. getByRole (preferred)

```typescript
// Buttons
this.submitButton = page.getByRole('button', { name: 'Submit' });
this.cancelLink = page.getByRole('link', { name: 'Cancel' });

// Form fields
this.emailInput = page.getByRole('textbox', { name: 'Email' });
this.passwordInput = page.getByRole('textbox', { name: 'Password' });
this.countrySelect = page.getByRole('combobox', { name: 'Country' });
this.agreeCheckbox = page.getByRole('checkbox', { name: 'I agree' });

// Navigation
this.settingsMenu = page.getByRole('menuitem', { name: 'Settings' });
this.mainNav = page.getByRole('navigation', { name: 'Main' });

// Headings
this.pageTitle = page.getByRole('heading', { name: 'Dashboard', level: 1 });
```

### 2. getByTestId

```typescript
// When role-based selection isn't possible
this.userAvatar = page.getByTestId('user-avatar');
this.notificationBadge = page.getByTestId('notification-count');
```

### 3. getByLabel

```typescript
// Form fields with labels
this.emailField = page.getByLabel('Email address');
this.dateField = page.getByLabel('Start date');
```

### 4. getByText

```typescript
// Text content matching
this.welcomeMessage = page.getByText('Welcome back');
this.errorAlert = page.getByText(/invalid credentials/i);
```

### 5. getByPlaceholder

```typescript
// Placeholder-based (when no label available)
this.searchInput = page.getByPlaceholder('Search...');
```

### 6. CSS Selector (last resort)

```typescript
// Add TODO comment when using CSS selectors
// TODO: Replace with getByRole or getByTestId when test IDs are added
this.customWidget = page.locator('.custom-widget-container');
```

## Action Method Patterns

### Navigation

```typescript
async goto() {
  await this.page.goto('{base_url}{path}');
}

async navigateTo{Section}() {
  await this.{sectionLink}.click();
}
```

### Form Interactions

```typescript
async fillForm({field1}: string, {field2}: string) {
  await this.{field1Input}.fill({field1});
  await this.{field2Input}.fill({field2});
}

async submit() {
  await this.submitButton.click();
}

async selectOption(option: string) {
  await this.{dropdown}.selectOption(option);
}
```

### Combined Actions

```typescript
async login(email: string, password: string) {
  await this.emailInput.fill(email);
  await this.passwordInput.fill(password);
  await this.loginButton.click();
}

async searchFor(query: string) {
  await this.searchInput.fill(query);
  await this.searchButton.click();
}
```

## File Naming

- File name: `{page-name}.page.ts` (kebab-case)
- Class name: `{PageName}Page` (PascalCase)
- Output directory: `agent-qa/YYYY-MM-DD-{context}/playwright/pages/`

## Examples

| Page Name | File | Class |
|-----------|------|-------|
| Login | `login.page.ts` | `LoginPage` |
| Dashboard | `dashboard.page.ts` | `DashboardPage` |
| User Profile | `user-profile.page.ts` | `UserProfilePage` |
| Settings | `settings.page.ts` | `SettingsPage` |

## TODO Comments

Add TODO comments where locators need user refinement:

```typescript
// TODO: Verify this locator matches the actual UI element
this.submitButton = page.getByRole('button', { name: 'Submit' });

// TODO: Replace with getByTestId when test IDs are available
this.customComponent = page.locator('.custom-component');

// TODO: Confirm the page URL path
async goto() {
  await this.page.goto('/assumed-path');
}
```
