import { test, expect } from './fixtures/test';

test.describe('Findings', () => {
  test('SLA page loads', async ({ page }) => {
    await page.goto('/sla');
    await expect(page).toHaveURL(/sla/);
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('SLA page shows severity filters', async ({ page }) => {
    await page.goto('/sla');
    await page.waitForLoadState('networkidle');
    // Severity select or filter should be visible
    const filter = page
      .getByRole('combobox', { name: /severity/i })
      .or(page.getByPlaceholder(/severity/i))
      .or(page.getByText(/severity/i).first());
    await expect(filter).toBeVisible({ timeout: 5_000 });
  });

  test('Assets page loads', async ({ page }) => {
    await page.goto('/assets');
    await expect(page).toHaveURL(/assets/);
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('Assets page shows search field', async ({ page }) => {
    await page.goto('/assets');
    await page.waitForLoadState('networkidle');
    const search = page.getByPlaceholder(/search/i).or(page.getByRole('searchbox'));
    await expect(search).toBeVisible({ timeout: 5_000 });
  });

  test.describe('Project findings', () => {
    test('findings page within a project loads', async ({ page }) => {
      // Navigate to projects first to pick up a real project ID
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      const projectLink = page.getByRole('link').filter({ hasText: /open|view|findings/i }).first();
      const hasProject = await projectLink.isVisible({ timeout: 3_000 }).catch(() => false);

      if (!hasProject) {
        test.skip(); // No projects seeded
        return;
      }

      await projectLink.click();
      await page.waitForURL(/projects\/.+/);

      // Navigate to findings sub-page
      const findingsLink = page.getByRole('link', { name: /findings/i }).first();
      if (await findingsLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await findingsLink.click();
        await expect(page).toHaveURL(/findings/);
      }
    });
  });
});
