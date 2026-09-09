import { expect, type Locator, type Page } from '@playwright/test'

export class TasksPage {
  readonly newButton: Locator
  readonly search: Locator
  readonly form: Locator
  readonly title: Locator
  readonly description: Locator
  readonly jiraUrl: Locator
  readonly project: Locator
  readonly defaultTags: Locator
  readonly rows: Locator
  readonly empty: Locator

  constructor(readonly page: Page) {
    this.newButton = page.getByRole('button', { name: '+ Ny uppgift' })
    this.search = page.getByLabel('Sök uppgifter')
    this.form = page.locator('form')
    this.title = page.getByLabel('Titel')
    this.description = page.getByLabel('Beskrivning')
    this.jiraUrl = page.getByLabel('Jira URL')
    this.project = page.getByLabel('Projekt')
    this.defaultTags = page.getByLabel('Default-taggar')
    this.rows = page.getByTestId('task-row')
    this.empty = page.getByText('Inga uppgifter.')
  }

  async goto() {
    await this.page.goto('/tasks')
    await expect(
      this.page.getByRole('heading', { name: 'Uppgifter' }),
    ).toBeVisible()
  }

  row(title: string): Locator {
    return this.rows.filter({
      has: this.page.locator('span.font-display', { hasText: title }),
    })
  }

  tab(name: 'Aktiva' | 'Arkiverade'): Locator {
    return this.page.getByRole('button', { name, exact: true })
  }

  submitButton(mode: 'create' | 'edit'): Locator {
    return this.form.getByRole('button', {
      name: mode === 'create' ? 'Skapa' : 'Spara',
    })
  }
}
