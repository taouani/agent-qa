# Playwright Authentication Fixture Template

## Purpose

Defines patterns for generating authentication fixtures in Playwright tests. Use these patterns when test cases require authenticated sessions.

## Authentication Fixture Pattern

### Global Auth Setup

Generate a `auth.setup.ts` file when multiple specs require authentication:

```typescript
import { test as setup, expect } from '@playwright/test';

const authFile = '.auth/user.json';

setup('authenticate as standard user', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('SecurePass123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/dashboard');
  await page.context().storageState({ path: authFile });
});
```

### Per-Role Auth Fixtures

When tests require different user roles, generate separate auth files:

```typescript
// auth/admin.setup.ts
setup('authenticate as admin', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('AdminPass123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/admin/dashboard');
  await page.context().storageState({ path: '.auth/admin.json' });
});
```

### Using Auth State in Tests

```typescript
test.use({ storageState: '.auth/user.json' });

test('authenticated test', async ({ page }) => {
  await page.goto('/dashboard');
  // User is already logged in
});
```

## Config Integration

Reference `playwright_base_url` from `agent-qa/config.yml` for the goto URL.

### Playwright Config with Auth Projects

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
});
```

## When to Generate Auth Fixtures

Generate auth fixtures when:
1. Test cases have login/authentication prerequisites
2. Multiple test cases share the same auth state
3. Test steps reference "logged in as" or "authenticated" preconditions

Do NOT generate auth fixtures when:
1. Tests are for the login flow itself
2. Tests explicitly test unauthenticated access
3. No authentication is mentioned in requirements

## Output

- Auth fixture files go to `{selected_folder}/playwright/auth/`
- File naming: `{role}.setup.ts` (e.g., `admin.setup.ts`, `user.setup.ts`)
- Storage state files are referenced as `.auth/{role}.json`
