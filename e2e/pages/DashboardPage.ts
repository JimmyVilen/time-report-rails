import { expect, type Locator, type Page } from '@playwright/test'

export class DashboardPage {
  readonly heading: Locator
  readonly previousDay: Locator
  readonly nextDay: Locator
  readonly datePicker: Locator
  readonly toggleFormButton: Locator
  readonly entries: Locator
  readonly emptyState: Locator
  readonly total: Locator
  readonly form: TimeEntryForm
  readonly week: Locator
  readonly noteButton: Locator

  constructor(readonly page: Page) {
    this.heading = page.locator('.date-heading h1')
    this.previousDay = page.getByRole('button', { name: 'Föregående dag' })
    this.nextDay = page.getByRole('button', { name: 'Nästa dag' })
    this.datePicker = page.getByLabel('Välj datum')
    this.toggleFormButton = page
      .getByRole('button', { name: /\+ Registrera tid|Stäng/ })
      .first()
    this.entries = page.getByTestId('time-entry')
    this.emptyState = page.locator('.dashboard-empty-state')
    this.total = page.locator('.daily-total')
    this.form = new TimeEntryForm(page)
    this.week = page.locator('section.week-overview')
    this.noteButton = page.getByRole('button', { name: 'Notering' })
  }

  async goto(date: string) {
    await this.page.goto(`/dashboard?date=${date}`)
    await expect(this.heading).toBeVisible()
  }

  async openForm() {
    await this.page.getByRole('button', { name: '+ Registrera tid' }).click()
    await expect(this.form.root).toBeVisible()
  }

  entry(title: string): Locator {
    return this.entries.filter({ hasText: title })
  }

  dayButton(dayAndMonth: string): Locator {
    return this.week.locator('button.week-day').filter({ hasText: dayAndMonth })
  }
}

export class TimeEntryForm {
  readonly root: Locator
  readonly task: Locator
  readonly options: Locator
  readonly start: Locator
  readonly end: Locator
  readonly duration: Locator
  readonly description: Locator
  readonly tags: Locator
  readonly submit: Locator
  readonly cancel: Locator
  readonly error: Locator

  constructor(readonly page: Page) {
    this.root = page
      .locator('form')
      .filter({ has: page.getByRole('combobox', { name: 'Uppgift' }) })
    this.task = this.root.getByRole('combobox', { name: 'Uppgift' })
    this.options = this.root.getByRole('option')
    this.start = this.root.getByLabel('Start', { exact: true })
    this.end = this.root.getByLabel('Slut', { exact: true })
    this.duration = this.root.getByLabel('Tid (t.ex. 1h 30m)')
    this.description = this.root.getByRole('textbox', { name: 'Beskrivning' })
    this.tags = this.root.getByLabel('Taggar', { exact: true })
    this.submit = this.root.getByRole('button', { name: /Lägg till|Spara/ })
    this.cancel = this.root.getByRole('button', { name: 'Avbryt' })
    this.error = this.root.getByRole('alert')
  }

  /**
   * Types in the task combobox and picks the option whose text matches. In
   * create mode the form fetches the task's latest description as soon as a
   * task id is set, which is the reliable signal that the selection landed.
   */
  async chooseTask(query: string, optionText: string | RegExp = query) {
    await this.task.fill(query)
    await this.pickOption(this.options.filter({ hasText: optionText }).first())
  }

  async createTask(title: string) {
    await this.task.fill(title)
    await this.pickOption(
      this.options.filter({ hasText: `+ Skapa ny uppgift "${title}"` }),
    )
    await expect(this.task).toHaveValue(title)
  }

  private async pickOption(option: Locator) {
    const selected = this.page.waitForResponse((response) =>
      response.url().includes('/api/time-entries/recent-description'),
    )
    await option.click()
    await selected
  }

  async addTag(name: string) {
    await this.focusTags()
    await this.tags.fill(name)
    await this.root
      .getByRole('button', { name: name, exact: true })
      .first()
      .click()
  }

  /**
   * The tag input closes its list 150 ms after losing focus. Picking an option
   * blurs the input, so a second interaction right after would be closed by the
   * previous timer: focus first and let that timer expire.
   */
  private async focusTags() {
    await this.tags.click()
    await this.page.waitForTimeout(200)
  }

  async createTag(name: string) {
    await this.focusTags()
    await this.tags.fill(name)
    await this.root
      .getByRole('button', { name: `+ Skapa tagg "${name}"` })
      .click()
    await expect(this.tagChip(name)).toBeVisible()
  }

  tagChip(name: string): Locator {
    return this.root.locator('.tag-chip').filter({ hasText: name })
  }
}
