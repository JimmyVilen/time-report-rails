import type { Locator, Page } from '@playwright/test'

/** Desktop sidebar. The same navigation is rendered again inside the mobile drawer. */
export class Sidebar {
  readonly root: Locator

  constructor(page: Page) {
    this.root = page.getByTestId('desktop-sidebar')
  }

  link(name: string): Locator {
    return this.root.getByRole('link', { name, exact: true })
  }

  get logoutButton(): Locator {
    return this.root.getByRole('button', { name: 'Logga ut' })
  }
}
