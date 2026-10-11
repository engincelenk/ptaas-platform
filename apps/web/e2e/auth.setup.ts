import { test as setup, expect } from '@playwright/test';
import { TEST_USER } from './fixtures/test';

const AUTH_FILE = 'e2e/.auth/user.json';

setup('authenticate', async ({ page, context }) => {
  await page.goto('/login');

  // Fill login form
  await page.getByLabel(/email/i).fill(TEST_USER.email);
  await page.getByLabel(/password/i).fill(TEST_USER.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();

  // Wait for redirect to dashboard (or MFA step)
  await page.waitForURL(/dashboard|mfa/, { timeout: 10_000 });

  // If MFA step is shown, handle it via env var
  if (page.url().includes('mfa') || await page.getByPlaceholder(/000000/).isVisible({ timeout: 2_000 }).catch(() => false)) {
    const totpCode = process.env.E2E_TOTP_CODE;
    if (!totpCode) throw new Error('MFA required but E2E_TOTP_CODE not set');
    await page.getByPlaceholder(/000000/).fill(totpCode);
    await page.getByRole('button', { name: /verify|continue/i }).click();
    await page.waitForURL('**/dashboard', { timeout: 10_000 });
  }

  // Confirm we're authenticated
  await expect(page).toHaveURL(/dashboard/);

  // Save auth state (cookies + localStorage)
  await context.storageState({ path: AUTH_FILE });
});
