import { test, expect } from './fixtures/test';

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings/profile');
  });

  test('settings nav is visible', async ({ page }) => {
    // Desktop: sidebar nav; Mobile: tab strip
    const settingsNav = page.getByRole('link', { name: /profile/i }).first();
    await expect(settingsNav).toBeVisible();
  });

  test('Profile page shows user info', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    await expect(page.getByLabel(/name/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test('Password change section is visible', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    await expect(page.getByLabel(/current password/i)).toBeVisible();
    await expect(page.getByLabel(/new password/i)).toBeVisible();
  });

  test('2FA section is visible', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/two.factor/i)).toBeVisible();
  });

  test('API Keys page loads', async ({ page }) => {
    await page.goto('/settings/api-keys');
    await expect(page).toHaveURL(/api-keys/);
    await expect(page.getByRole('main')).toBeVisible();
    await page.waitForLoadState('networkidle');
    // Create key button should be present
    await expect(
      page.getByRole('button', { name: /create|new.*key/i }).or(page.getByText(/create.*key/i))
    ).toBeVisible({ timeout: 5_000 });
  });

  test('Audit log page loads', async ({ page }) => {
    await page.goto('/settings/audit');
    await expect(page).toHaveURL(/audit/);
    await page.waitForLoadState('networkidle');
    // Export CSV button should exist
    await expect(page.getByRole('button', { name: /export/i }).or(page.getByText(/export/i))).toBeVisible({ timeout: 5_000 });
  });

  test('Webhooks page loads', async ({ page }) => {
    await page.goto('/settings/webhooks');
    await expect(page).toHaveURL(/webhooks/);
    await page.waitForLoadState('networkidle');
  });

  test('Scan Policies page loads', async ({ page }) => {
    await page.goto('/settings/scan-policies');
    await expect(page).toHaveURL(/scan-policies/);
    await page.waitForLoadState('networkidle');
  });

  test('Email Templates page loads', async ({ page }) => {
    await page.goto('/settings/email-templates');
    await expect(page).toHaveURL(/email-templates/);
    await page.waitForLoadState('networkidle');
    // Template list should be visible
    await expect(page.getByText(/invitation/i)).toBeVisible({ timeout: 5_000 });
  });

  test('settings nav is scrollable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/settings/profile');
    await page.waitForLoadState('networkidle');
    // Profile link should be visible as a pill/tab on mobile
    await expect(page.getByRole('link', { name: /profile/i }).first()).toBeVisible();
  });
});
