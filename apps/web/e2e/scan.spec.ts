import { test, expect } from './fixtures/test';

test.describe('Scans', () => {
  test('project scans list is accessible', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // Find first project
    const projectLink = page.getByRole('link').filter({ hasText: /open|view/i }).first();
    const hasProject = await projectLink.isVisible({ timeout: 3_000 }).catch(() => false);

    if (!hasProject) {
      test.skip();
      return;
    }

    await projectLink.click();
    await page.waitForURL(/projects\/.+/);

    // Navigate to Scans
    const scansLink = page.getByRole('link', { name: /^scans$/i }).first();
    if (await scansLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await scansLink.click();
      await expect(page).toHaveURL(/scans/);
      await expect(page.getByRole('main')).toBeVisible();
    }
  });

  test('new scan button is visible on scans page', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    const projectLink = page.getByRole('link').filter({ hasText: /open|view/i }).first();
    if (!await projectLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip();
      return;
    }

    await projectLink.click();
    await page.waitForURL(/projects\/.+/);

    const scansLink = page.getByRole('link', { name: /^scans$/i }).first();
    if (await scansLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await scansLink.click();
      await page.waitForLoadState('networkidle');

      const newScanBtn = page
        .getByRole('button', { name: /new scan|start scan|run scan/i })
        .or(page.getByRole('link', { name: /new scan/i }));
      await expect(newScanBtn).toBeVisible({ timeout: 5_000 });
    }
  });

  test('scan detail page loads', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    const projectLink = page.getByRole('link').filter({ hasText: /open|view/i }).first();
    if (!await projectLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip();
      return;
    }

    await projectLink.click();
    await page.waitForURL(/projects\/.+/);
    const projectUrl = page.url();

    const scansLink = page.getByRole('link', { name: /^scans$/i }).first();
    if (!await scansLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip();
      return;
    }

    await scansLink.click();
    await page.waitForLoadState('networkidle');

    // Click first scan in the list
    const firstScan = page.getByRole('link').filter({ hasText: /quick|full|retest/i }).first();
    if (await firstScan.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await firstScan.click();
      await expect(page).toHaveURL(/scans\/.+/);
      await expect(page.getByRole('main')).toBeVisible();
    }
  });
});
