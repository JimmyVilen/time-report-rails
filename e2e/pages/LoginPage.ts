import type { Locator, Page } from '@playwright/test'

export class LoginPage {
  readonly email: Locator
  readonly password: Locator
  readonly submitButton: Locator
  readonly error: Locator

  constructor(private readonly page: Page) {
    this.email = page.getByLabel('E-post')
    this.password = page.getByLabel('Lösenord')
    this.submitButton = page.getByRole('button', { name: 'Logga in' })
    this.error = page.getByRole('alert')
  }

  async goto() {
    await this.page.goto('/login')
  }

  async submit(email: string, password: string) {
    await this.email.fill(email)
    await this.password.fill(password)
    await this.submitButton.click()
  }
}
