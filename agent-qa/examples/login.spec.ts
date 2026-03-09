import { test, expect } from '@playwright/test';
import { LoginPage } from './login.page';

test.describe('DEMO-42: User Login', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('TC-DEMO-42-001: Successful login with valid credentials', async ({ page }) => {
    await loginPage.login('test@example.com', 'SecurePass1');
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('TC-DEMO-42-002: Error message with invalid password', async ({ page }) => {
    await loginPage.login('test@example.com', 'WrongPassword');
    await expect(loginPage.errorMessage).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('TC-DEMO-42-003: Error message with unregistered email', async ({ page }) => {
    await loginPage.login('unknown@example.com', 'AnyPassword1');
    await expect(loginPage.errorMessage).toBeVisible();
  });

  test('TC-DEMO-42-004: Email format validation', async ({ page }) => {
    await loginPage.emailField.fill('not-an-email');
    await loginPage.signInButton.click();
    await expect(loginPage.validationError).toBeVisible();
  });

  test('TC-DEMO-42-005: Password field masking', async ({ page }) => {
    await expect(loginPage.passwordField).toHaveAttribute('type', 'password');
    await loginPage.passwordField.fill('SecurePass1');
    await expect(loginPage.passwordField).toHaveAttribute('type', 'password');
  });

  test('TC-DEMO-42-007: Login with empty email field', async ({ page }) => {
    await loginPage.passwordField.fill('SecurePass1');
    await loginPage.signInButton.click();
    await expect(loginPage.emailField).toBeFocused();
  });

  test('TC-DEMO-42-008: Login with empty password field', async ({ page }) => {
    await loginPage.emailField.fill('test@example.com');
    await loginPage.signInButton.click();
    await expect(loginPage.passwordField).toBeFocused();
  });
});
