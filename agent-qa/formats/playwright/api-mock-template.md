# Playwright API Mocking Template

## Purpose

Defines patterns for mocking API responses in Playwright tests. Use these patterns when tests need to control backend responses for deterministic testing.

## Route Handler Pattern

### Basic API Mock

```typescript
test('displays data from API', async ({ page }) => {
  await page.route('**/api/users', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 1, name: 'John Doe', email: 'john@example.com' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
      ]),
    });
  });

  await page.goto('/users');
  await expect(page.getByRole('row')).toHaveCount(3); // header + 2 data rows
});
```

### Error Response Mock

```typescript
test('handles API error gracefully', async ({ page }) => {
  await page.route('**/api/users', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Internal Server Error' }),
    });
  });

  await page.goto('/users');
  await expect(page.getByText('Something went wrong')).toBeVisible();
});
```

### Delayed Response Mock

```typescript
test('shows loading state', async ({ page }) => {
  await page.route('**/api/users', async (route) => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.goto('/users');
  await expect(page.getByText('Loading...')).toBeVisible();
});
```

## Fixture-Based Mock Pattern

For reusable mocks, generate a fixture file:

```typescript
// fixtures/api-mocks.ts
import { test as base } from '@playwright/test';

type MockOptions = {
  mockUsers: { id: number; name: string; email: string }[];
};

export const test = base.extend<MockOptions>({
  mockUsers: [[], { option: true }],
  page: async ({ page, mockUsers }, use) => {
    if (mockUsers.length > 0) {
      await page.route('**/api/users', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockUsers),
        });
      });
    }
    await use(page);
  },
});
```

## When to Generate API Mocks

Generate API mocks when:
1. Test cases verify UI behavior for specific API responses (success, error, empty)
2. Test cases need deterministic data that can't rely on backend state
3. Test steps reference "when the API returns..." or "given the following data..."
4. Test cases test error handling or edge cases

Do NOT generate API mocks when:
1. Tests are for end-to-end integration (testing the real API)
2. Requirements don't mention specific API interactions
3. Test cases only involve static content

## Output

- Mock fixture files go to `{selected_folder}/playwright/fixtures/`
- File naming: `{feature}-mocks.ts` (e.g., `users-mocks.ts`)
- Import mocks in spec files that need them
