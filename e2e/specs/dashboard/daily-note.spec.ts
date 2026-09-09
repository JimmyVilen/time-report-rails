import { test, expect } from '../../fixtures/test'
import { DashboardPage } from '../../pages/DashboardPage'
import { NotesPage } from '../../pages/NotesPage'
import { FIXED_DATE } from '../../env'

test.describe('Dashboard: daily note', () => {
  test('writes, saves and shows the note for the day', async ({
    page,
    user,
    api,
  }) => {
    void user
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)
    await expect(page.getByTestId('daily-note-indicator')).toHaveCount(0)

    await dashboard.noteButton.click()
    const editor = page.getByRole('textbox', {
      name: 'Skriv din dagliga notering här...',
    })
    await editor.click()
    await page.keyboard.type('Dagens fokus: e2e-tester')
    await page.getByRole('button', { name: 'Spara', exact: true }).click()

    await expect(editor).toBeHidden()
    await expect(page.getByTestId('daily-note-indicator')).toBeVisible()
    expect(await api.getNote(FIXED_DATE)).toMatchObject({
      content: 'Dagens fokus: e2e-tester',
    })

    // Re-opening shows the saved text; switching day shows an empty editor.
    await dashboard.noteButton.click()
    await expect(editor).toHaveText('Dagens fokus: e2e-tester')
    await dashboard.nextDay.click()
    await expect(editor).toBeHidden()
    await expect(page.getByTestId('daily-note-indicator')).toHaveCount(0)

    const notes = new NotesPage(page)
    await notes.goto()
    await expect(notes.count).toHaveText('1 notering')
    await expect(notes.articles.first()).toContainText(
      'Dagens fokus: e2e-tester',
    )
  })

  test('closing without saving discards the draft', async ({
    page,
    user,
    api,
  }) => {
    void user
    await api.upsertNote(FIXED_DATE, 'Sparad text')
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)
    await dashboard.noteButton.click()
    const editor = page.getByRole('textbox', {
      name: 'Skriv din dagliga notering här...',
    })
    await expect(editor).toHaveText('Sparad text')
    await editor.click()
    await page.keyboard.type(' plus utkast')
    await page.getByRole('button', { name: 'Stäng', exact: true }).click()
    await expect(editor).toBeHidden()
    expect(await api.getNote(FIXED_DATE)).toMatchObject({
      content: 'Sparad text',
    })
  })
})
