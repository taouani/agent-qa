# Playwright Spec File Template

Patterns for generating Playwright test specification files from test cases.

## File Structure

```typescript
import { test, expect } from '@playwright/test';
import { {PageName}Page } from '../pages/{page-name}.page';

test.describe('{REQUIREMENT-KEY}: {Requirement Summary}', () => {

  test('{TC-ID}: {Test Case Summary}', async ({ page }) => {
    // Page Object instantiation
    const {pageName}Page = new {PageName}Page(page);

    // Test steps
    await {pageName}Page.goto();
    // ... actions and assertions
  });

});
```

## Test Organization

### Grouping by Requirement

Each requirement key maps to a `test.describe` block:

```typescript
test.describe('PROJ-123: User Authentication', () => {
  // All test cases for PROJ-123
});
```

### Individual Test Cases

Each test case becomes a `test()` block:

```typescript
test('TC-PROJ-123-001: Successful login with valid credentials', async ({ page }) => {
  // Test implementation
});
```

## Step Mapping

### Navigation Steps → Page Object goto()

```typescript
// Test step: "Navigate to the login page"
const loginPage = new LoginPage(page);
await loginPage.goto();
```

### Form Input Steps → Page Object fill methods

```typescript
// Test step: "Enter 'test@example.com' in the Email field"
await loginPage.emailInput.fill('test@example.com');

// Or via combined method:
await loginPage.login('test@example.com', 'Password123!');
```

### Click Steps → Locator click()

```typescript
// Test step: "Click the Submit button"
await loginPage.submitButton.click();
```

### Selection Steps → selectOption()

```typescript
// Test step: "Select 'France' from the Country dropdown"
await settingsPage.countrySelect.selectOption('France');
```

### Verification Steps → expect() assertions

```typescript
// Test step: "Verify the dashboard is displayed"
await expect(page).toHaveURL(/dashboard/);

// Test step: "Verify the welcome message is visible"
await expect(dashboardPage.welcomeMessage).toBeVisible();

// Test step: "Verify the field contains 'test@example.com'"
await expect(profilePage.emailField).toHaveValue('test@example.com');

// Test step: "Verify the error message 'Invalid credentials' is displayed"
await expect(loginPage.errorMessage).toHaveText('Invalid credentials');

// Test step: "Verify the table contains 5 rows"
await expect(page.getByRole('row')).toHaveCount(6); // +1 for header
```

## Assertion Patterns

### Page-Level Assertions

```typescript
await expect(page).toHaveURL('{expected_url}');
await expect(page).toHaveURL(/{url_pattern}/);
await expect(page).toHaveTitle('{expected_title}');
await expect(page).toHaveTitle(/{title_pattern}/);
```

### Element Assertions

```typescript
await expect({locator}).toBeVisible();
await expect({locator}).toBeHidden();
await expect({locator}).toBeEnabled();
await expect({locator}).toBeDisabled();
await expect({locator}).toHaveText('{text}');
await expect({locator}).toContainText('{text}');
await expect({locator}).toHaveValue('{value}');
await expect({locator}).toHaveAttribute('{attr}', '{value}');
await expect({locator}).toHaveCount({number});
await expect({locator}).toHaveClass(/{class_pattern}/);
```

## Data-Driven Tests

### Parameterized Tests

```typescript
const testData = [
  { email: 'admin@example.com', password: 'AdminPass1!', role: 'Admin' },
  { email: 'user@example.com', password: 'UserPass1!', role: 'Standard' },
  { email: 'guest@example.com', password: 'GuestPass1!', role: 'Limited' },
];

for (const data of testData) {
  test(`TC-PROJ-123-005: Login as ${data.role}`, async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(data.email, data.password);
    await expect(page).toHaveURL(new RegExp(data.role.toLowerCase()));
  });
}
```

### Test Fixtures (for shared setup)

```typescript
test.describe('PROJ-123: User Management', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('admin@example.com', 'AdminPass1!');
  });

  test('TC-PROJ-123-010: View user list', async ({ page }) => {
    // Already logged in from beforeEach
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await expect(usersPage.userTable).toBeVisible();
  });
});
```

## File Naming

- File name: `{REQUIREMENT-KEY}.spec.ts` (e.g., `PROJ-123.spec.ts`)
- Output directory: `agent-qa/YYYY-MM-DD-{context}/playwright/tests/`

## Complete Example

```typescript
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { DashboardPage } from '../pages/dashboard.page';

test.describe('PROJ-123: User Authentication', () => {

  test('TC-PROJ-123-001: Successful login with valid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('test@example.com', 'Password123!');

    const dashboardPage = new DashboardPage(page);
    await expect(page).toHaveURL(/dashboard/);
    await expect(dashboardPage.welcomeMessage).toBeVisible();
  });

  test('TC-PROJ-123-002: Login fails with invalid password', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('test@example.com', 'WrongPassword');

    await expect(loginPage.errorMessage).toHaveText('Invalid credentials');
    await expect(page).toHaveURL(/login/);
  });

  const roleData = [
    { email: 'admin@example.com', password: 'AdminPass1!', dashboard: 'Admin' },
    { email: 'user@example.com', password: 'UserPass1!', dashboard: 'Standard' },
  ];

  for (const data of roleData) {
    test(`TC-PROJ-123-005: Login as ${data.dashboard} user`, async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.login(data.email, data.password);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(data.dashboard);
    });
  }

});
```
