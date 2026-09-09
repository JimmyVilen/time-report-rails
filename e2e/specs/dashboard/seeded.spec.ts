import { test, expect } from '../../fixtures/test'
import { DashboardPage } from '../../pages/DashboardPage'
import { FIXED_DATE } from '../../env'

// Read-only checks against the deterministic seed (Alice). Nothing here may
// mutate seed rows, other specs run in parallel against the same database.
test.describe('Seeded data as seen by Alice', () => {
  test('shows the seeded entry, tag, note and week summary', async ({
    page,
    alice,
  }) => {
    void alice
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)

    const card = dashboard.entry('Implementation')
    await expect(card).toHaveCount(1)
    await expect(card).toContainText('Seed entry')
    await expect(card.locator('.tag-chip')).toHaveText(['Billable'])
    await expect(card.locator('.time-entry-duration')).toHaveText('1h')
    await expect(dashboard.total).toContainText('1h')

    await expect(dashboard.week).toHaveAttribute('aria-label', 'Vecka 2')
    await expect(
      dashboard.week
        .locator('.summary-instrument')
        .filter({ hasText: 'Klargrad' }),
    ).toContainText('3 %')
    await expect(page.getByTestId('daily-note-indicator')).toBeVisible()
  })

  test('picking the seeded task pre-fills its default tag and last description', async ({
    page,
    alice,
  }) => {
    void alice
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)
    await dashboard.openForm()
    await dashboard.form.chooseTask('Impl', 'Implementation')
    await expect(dashboard.form.options).toHaveCount(0)
    await expect(dashboard.form.tagChip('Billable')).toBeVisible()
    await expect(dashboard.form.description).toHaveText('Seed entry')
    await dashboard.form.cancel.click()
  })

  test('the task picker shows the project name and hides archived tasks', async ({
    page,
    alice,
  }) => {
    void alice
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)
    await dashboard.openForm()
    await dashboard.form.task.click()
    await expect(dashboard.form.options).toHaveText([/Implementation.*Client/])
    await dashboard.form.task.fill('Arch')
    await expect(dashboard.form.options).toHaveText([
      '+ Skapa ny uppgift "Arch"',
    ])
    await dashboard.form.cancel.click()
  })
})
