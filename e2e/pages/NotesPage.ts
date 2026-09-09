import { expect, type Locator, type Page } from '@playwright/test'

export class NotesPage {
  readonly search: Locator
  readonly searchButton: Locator
  readonly count: Locator
  readonly articles: Locator
  readonly pagination: Locator

  constructor(readonly page: Page) {
    this.search = page.getByPlaceholder('Sök noteringar...')
    this.searchButton = page.getByRole('button', { name: 'Sök', exact: true })
    this.count = page.getByText(/^\d+ noteringar$|^1 notering$/)
    this.articles = page.locator('article')
    this.pagination = page.locator('nav', { hasText: /Sida \d+ av \d+/ })
  }

  async goto() {
    await this.page.goto('/notes')
    await expect(
      this.page.getByRole('heading', { name: 'Noteringar', exact: true }),
    ).toBeVisible()
  }
}
