import { expect, type Locator, type Page } from '@playwright/test'

export class ProfilePage {
  readonly name: Locator
  readonly password: Locator
  readonly passwordConfirm: Locator
  readonly jiraUrl: Locator
  readonly jiraEmail: Locator
  readonly jiraToken: Locator
  readonly save: Locator
  readonly status: Locator
  readonly error: Locator

  constructor(readonly page: Page) {
    this.name = page.getByLabel('Namn')
    this.password = page.getByLabel('Nytt lösenord')
    this.passwordConfirm = page.getByLabel('Bekräfta lösenord')
    this.jiraUrl = page.getByLabel('Jira-URL')
    this.jiraEmail = page.getByLabel('Jira-e-post')
    this.jiraToken = page.getByLabel('API-token')
    this.save = page.getByRole('button', { name: 'Spara ändringar' })
    this.status = page.getByRole('status')
    this.error = page.getByRole('alert')
  }

  async goto() {
    await this.page.goto('/profile')
    await expect(
      this.page.getByRole('heading', { name: 'Profil' }),
    ).toBeVisible()
  }
}
