import { expect, type Locator, type Page } from '@playwright/test'

export class ProjectsPage {
  readonly newButton: Locator
  readonly form: Locator
  readonly name: Locator
  readonly description: Locator
  readonly rows: Locator
  readonly empty: Locator

  constructor(readonly page: Page) {
    this.newButton = page.getByRole('button', { name: '+ Nytt projekt' })
    this.form = page.locator('form')
    this.name = page.getByLabel('Namn')
    this.description = page.getByLabel('Beskrivning')
    this.rows = page.getByTestId('project-row')
    this.empty = page.getByText('Inga projekt.')
  }

  async goto() {
    await this.page.goto('/projects')
    await expect(
      this.page.getByRole('heading', { name: 'Projekt', exact: true }),
    ).toBeVisible()
  }

  row(name: string): Locator {
    return this.rows.filter({
      has: this.page.locator('span.font-display', { hasText: name }),
    })
  }

  tab(name: 'Aktiva' | 'Arkiverade'): Locator {
    return this.page.getByRole('button', { name, exact: true })
  }

  async create(name: string, description?: string) {
    await this.newButton.click()
    await this.name.fill(name)
    if (description) await this.description.fill(description)
    await this.form.getByRole('button', { name: 'Skapa' }).click()
  }
}
