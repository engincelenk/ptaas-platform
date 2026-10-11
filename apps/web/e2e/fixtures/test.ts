import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { AppPage } from '../pages/app.page';

type Fixtures = {
  loginPage: LoginPage;
  appPage: AppPage;
};

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  appPage: async ({ page }, use) => {
    await use(new AppPage(page));
  },
});

export { expect } from '@playwright/test';

// Shared test data — override with env vars for real environments
export const TEST_USER = {
  email:    process.env.E2E_USER_EMAIL    ?? 'admin@ptaas.local',
  password: process.env.E2E_USER_PASSWORD ?? 'Test1234!secure',
};
