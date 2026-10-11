import { type Page, type Locator } from '@playwright/test';

/** Represents the shared dashboard layout (header nav, sidebar) */
export class AppPage {
  readonly page: Page;
  readonly nav: Locator;
  readonly signOutButton: Locator;
  readonly hamburgerButton: Locator;

  constructor(page: Page) {
    this.page           = page;
    this.nav            = page.getByRole('navigation');
    this.signOutButton  = page.getByRole('button', { name: /sign out/i });
    this.hamburgerButton = page.getByLabel('Toggle menu');
  }

  async navigateTo(label: string) {
    await this.page.getByRole('link', { name: label }).first().click();
  }

  /** Wait for page to be ready (no loading skeletons) */
  async waitForReady(timeout = 8_000) {
    await this.page.waitForLoadState('networkidle', { timeout });
  }

  async openMobileMenu() {
    await this.hamburgerButton.click();
  }

  async signOut() {
    await this.signOutButton.click();
    await this.page.waitForURL('**/login');
  }
}
