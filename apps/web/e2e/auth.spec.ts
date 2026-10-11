import { test, expect } from './fixtures/test';
import { TEST_USER } from './fixtures/test';

test.describe('Authentication', () => {
  test('redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/login/);
  });

  test('shows login form', async ({ loginPage }) => {
    await loginPage.goto();
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ loginPage, page }) => {
    await loginPage.goto();
    await loginPage.login('wrong@example.com', 'wrongpassword');

    // Error message or still on login page
    await expect(page).toHaveURL(/login/);
    const hasError = await page.getByText(/invalid|incorrect|unauthorized/i).isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasError).toBeTruthy();
  });

  test('empty password field is required', async ({ loginPage, page }) => {
    await loginPage.goto();
    await loginPage.emailInput.fill(TEST_USER.email);
    await loginPage.submitButton.click();
    // Should still be on login page
    await expect(page).toHaveURL(/login/);
  });

  test('successful login redirects to dashboard', async ({ loginPage, page }) => {
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    // May go to MFA or dashboard
    await page.waitForURL(/dashboard|mfa/, { timeout: 10_000 });
    await expect(page).not.toHaveURL(/login/);
  });
});
