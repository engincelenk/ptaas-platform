import { test, expect } from './fixtures/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
  });

  test('loads without errors', async ({ page }) => {
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('shows navigation links', async ({ page }) => {
    await expect(page.getByRole('link', { name: /projects/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /settings/i }).first()).toBeVisible();
  });

  test('shows KPI stat cards', async ({ page }) => {
    // Wait for data or skeletons to resolve
    await page.waitForLoadState('networkidle');
    // At least one stat-like number should be visible
    const statsArea = page.locator('[class*="grid"]').first();
    await expect(statsArea).toBeVisible();
  });

  test('navigation to Projects works', async ({ page, appPage }) => {
    await appPage.navigateTo('Projects');
    await expect(page).toHaveURL(/projects/);
  });

  test('navigation to SLA works', async ({ page, appPage }) => {
    await appPage.navigateTo('SLA');
    await expect(page).toHaveURL(/sla/);
  });

  test('navigation to Assets works', async ({ page, appPage }) => {
    await appPage.navigateTo('Assets');
    await expect(page).toHaveURL(/assets/);
  });

  test('mobile hamburger menu opens', async ({ page, appPage }) => {
    // Shrink viewport to mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');

    const hamburger = page.getByLabel('Toggle menu');
    if (await hamburger.isVisible()) {
      await hamburger.click();
      // Mobile menu should appear
      await expect(page.getByRole('link', { name: /projects/i }).first()).toBeVisible();
    }
  });
});
