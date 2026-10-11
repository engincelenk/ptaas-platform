import { type Page, type Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly totpInput: Locator;
  readonly totpSubmit: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput    = page.getByLabel(/email/i);
    this.passwordInput = page.getByLabel(/password/i);
    this.submitButton  = page.getByRole('button', { name: /sign in|log in/i });
    this.errorMessage  = page.getByRole('alert');
    this.totpInput     = page.getByPlaceholder(/000000|6.digit/i);
    this.totpSubmit    = page.getByRole('button', { name: /verify|continue/i });
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async waitForDashboard() {
    await this.page.waitForURL('**/dashboard', { timeout: 10_000 });
  }
}
