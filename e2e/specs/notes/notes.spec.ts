import { test, expect } from '../../fixtures/test'
import { NotesPage } from '../../pages/NotesPage'

function dateInJanuary(day: number): string {
  return `2026-01-${String(day).padStart(2, '0')}`
}

test.describe('Notes', () => {
  test('shows the empty state for a new user', async ({ page, user }) => {
    void user
    const notes = new NotesPage(page)
    await notes.goto()
    await expect(notes.count).toHaveText('0 noteringar')
    await expect(page.getByText('Inga noteringar än.')).toBeVisible()
    await expect(notes.pagination).toHaveCount(0)
  })

  test('lists notes newest first with singular and plural counts', async ({
    page,
    user,
    api,
  }) => {
    void user
    await api.upsertNote(dateInJanuary(3), 'Första **noteringen**')
    const notes = new NotesPage(page)
    await notes.goto()
    await expect(notes.count).toHaveText('1 notering')
    await expect(notes.articles).toHaveCount(1)
    await expect(notes.articles.first().locator('time')).toHaveText(
      '2026-01-03',
    )
    await expect(notes.articles.first().locator('strong')).toHaveText(
      'noteringen',
    )
    await expect(
      notes.articles.first().getByTitle('Öppna i dashboard'),
    ).toHaveAttribute('href', '/dashboard?date=2026-01-03')

    await api.upsertNote(dateInJanuary(9), 'Senare notering')
    await page.reload()
    await expect(notes.count).toHaveText('2 noteringar')
    await expect(notes.articles.locator('time')).toHaveText([
      '2026-01-09',
      '2026-01-03',
    ])
  })

  test('opens a note on its dashboard day', async ({ page, user, api }) => {
    void user
    await api.upsertNote(dateInJanuary(3), 'Hoppa hit')
    const notes = new NotesPage(page)
    await notes.goto()
    await notes.articles.first().getByTitle('Öppna i dashboard').click()
    await expect(page).toHaveURL('/dashboard?date=2026-01-03')
    await expect(page.getByTestId('daily-note-indicator')).toBeVisible()
  })

  test('searches on submit only and reports no matches', async ({
    page,
    user,
    api,
  }) => {
    void user
    await api.upsertNote(dateInJanuary(2), 'Möte om budget')
    await api.upsertNote(dateInJanuary(5), 'Kodgranskning hela dagen')
    await api.upsertNote(dateInJanuary(8), 'Budgetuppföljning med ledningen')
    const notes = new NotesPage(page)
    await notes.goto()
    await expect(notes.articles).toHaveCount(3)

    // Typing alone does not filter.
    await notes.search.fill('budget')
    await expect(notes.articles).toHaveCount(3)
    await notes.searchButton.click()
    await expect(notes.count).toHaveText('2 noteringar')
    await expect(notes.articles.locator('time')).toHaveText([
      '2026-01-08',
      '2026-01-02',
    ])

    await notes.search.fill('semester')
    await notes.search.press('Enter')
    await expect(notes.count).toHaveText('0 noteringar')
    await expect(
      page.getByText('Inga noteringar matchar sökningen.'),
    ).toBeVisible()

    await notes.search.fill('')
    await notes.searchButton.click()
    await expect(notes.articles).toHaveCount(3)
  })

  test('paginates ten notes per page', async ({ page, user, api }) => {
    void user
    for (let day = 1; day <= 12; day += 1)
      await api.upsertNote(dateInJanuary(day), `Notering dag ${String(day)}`)
    const notes = new NotesPage(page)
    await notes.goto()
    await expect(notes.count).toHaveText('12 noteringar')
    await expect(notes.articles).toHaveCount(10)
    await expect(notes.articles.first().locator('time')).toHaveText(
      '2026-01-12',
    )
    await expect(notes.pagination).toContainText('Sida 1 av 2')
    // The boundary control is rendered as inert text, not a disabled button.
    await expect(
      notes.pagination.getByRole('button', { name: 'Föregående' }),
    ).toHaveCount(0)
    await expect(notes.pagination.getByText('Föregående')).toBeVisible()

    await notes.pagination.getByRole('button', { name: 'Nästa' }).click()
    await expect(notes.pagination).toContainText('Sida 2 av 2')
    await expect(notes.articles).toHaveCount(2)
    await expect(notes.articles.locator('time')).toHaveText([
      '2026-01-02',
      '2026-01-01',
    ])
    await expect(
      notes.pagination.getByRole('button', { name: 'Nästa' }),
    ).toHaveCount(0)

    await notes.pagination.getByRole('button', { name: 'Föregående' }).click()
    await expect(notes.pagination).toContainText('Sida 1 av 2')

    // A new search resets to the first page.
    await notes.pagination.getByRole('button', { name: 'Nästa' }).click()
    await notes.search.fill('dag 1')
    await notes.searchButton.click()
    await expect(notes.count).toHaveText('4 noteringar')
    await expect(notes.pagination).toHaveCount(0)
  })
})
