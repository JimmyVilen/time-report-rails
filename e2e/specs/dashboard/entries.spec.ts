import { test, expect } from '../../fixtures/test'
import { DashboardPage } from '../../pages/DashboardPage'
import { FIXED_DATE } from '../../env'
import { unique } from '../../fixtures/unique'

test.describe('Dashboard: time entries', () => {
  test('shows the date header, empty state and day navigation', async ({
    page,
    user,
  }) => {
    void user
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)

    await expect(dashboard.heading).toHaveText('Måndag 5 januari')
    await expect(page.getByText('2026 · Välj datum')).toBeVisible()
    await expect(dashboard.emptyState).toHaveText(
      'Inga tidsposter för 5 januari 2026',
    )
    await expect(dashboard.total).toHaveCount(0)

    await dashboard.nextDay.click()
    await expect(page).toHaveURL('/dashboard?date=2026-01-06')
    await expect(dashboard.heading).toHaveText('Tisdag 6 januari')

    await dashboard.previousDay.click()
    await dashboard.previousDay.click()
    await expect(page).toHaveURL('/dashboard?date=2026-01-04')
    await expect(dashboard.heading).toHaveText('Söndag 4 januari')

    await dashboard.datePicker.fill('2026-02-14')
    await expect(page).toHaveURL('/dashboard?date=2026-02-14')
    await expect(dashboard.heading).toHaveText('Lördag 14 februari')
  })

  test('creates an entry with a brand new task and a duration', async ({
    page,
    user,
    api,
  }) => {
    void user
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)
    await dashboard.openForm()
    await expect(
      page.getByRole('heading', { name: 'Registrera tid' }),
    ).toBeVisible()
    await expect(dashboard.toggleFormButton).toHaveText('Stäng')

    const title = unique('Kodning')
    await dashboard.form.createTask(title)
    await dashboard.form.duration.fill('1h 30m')
    await dashboard.form.submit.click()

    await expect(dashboard.form.root).toBeHidden()
    const card = dashboard.entry(title)
    await expect(card).toHaveCount(1)
    await expect(card.locator('.time-entry-duration')).toHaveText('1h 30m')
    await expect(dashboard.total).toContainText('1h 30m')

    const [entry] = await api.listEntries(FIXED_DATE)
    expect(entry).toMatchObject({
      taskTitle: title,
      durationMinutes: 90,
      effectiveDurationMinutes: 90,
    })
    const tasks = await api.listTasks()
    expect(tasks.map((t) => t.title)).toContain(title)
  })

  test('creates an entry from start and end time with an existing task', async ({
    page,
    user,
    api,
  }) => {
    void user
    const title = unique('Möte')
    await api.createTask({ title })
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)
    await dashboard.openForm()

    await dashboard.form.chooseTask(title.slice(0, 4), title)
    await expect(dashboard.form.task).toHaveValue(title)
    await dashboard.form.start.fill('09:00')
    await dashboard.form.end.fill('10:45')
    await dashboard.form.submit.click()

    const card = dashboard.entry(title)
    await expect(card.locator('.time-entry-duration')).toHaveText('1h 45m')
    await expect(card.locator('.time-entry-time')).toHaveText('09:00–10:45')
  })

  test('edits an entry and keeps the list in sync', async ({
    page,
    user,
    api,
  }) => {
    void user
    const title = unique('Granskning')
    const task = await api.createTask({ title })
    await api.createEntry({
      taskId: task.id,
      date: FIXED_DATE,
      durationString: '30m',
    })
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)

    await dashboard.entry(title).getByTitle('Redigera').click()
    await expect(
      page.getByRole('heading', { name: 'Redigera tidspost' }),
    ).toBeVisible()
    await expect(dashboard.form.task).toHaveValue(title)
    await expect(dashboard.form.duration).toHaveValue('30m')

    await dashboard.form.duration.fill('2h')
    await dashboard.form.description.fill('Uppdaterad beskrivning')
    await dashboard.form.submit.click()

    await expect(dashboard.form.root).toBeHidden()
    await expect(
      dashboard.entry(title).locator('.time-entry-duration'),
    ).toHaveText('2h')
    await expect(dashboard.entry(title)).toContainText('Uppdaterad beskrivning')
    await expect(dashboard.total).toContainText('2h')
  })

  test('duplicates an entry right below the original, tags included', async ({
    page,
    user,
    api,
  }) => {
    void user
    const title = unique('Support')
    const task = await api.createTask({ title })
    const tag = await api.createTag(unique('Tagg'))
    await api.createEntry({
      taskId: task.id,
      date: FIXED_DATE,
      durationString: '45m',
      tagIds: [tag.id],
    })
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)

    await dashboard.entry(title).getByTitle('Duplicera').click()

    await expect(dashboard.entries).toHaveCount(2)
    for (const card of await dashboard.entries.all()) {
      await expect(card).toContainText(title)
      await expect(card.locator('.tag-chip')).toHaveText([tag.name])
    }
    await expect(dashboard.total).toContainText('1h 30m')
    const entries = await api.listEntries(FIXED_DATE)
    expect(entries.map((e) => e.position)).toEqual([0, 1])
  })

  test('deletes an entry after confirmation, and keeps it when cancelled', async ({
    page,
    user,
    api,
  }) => {
    void user
    const title = unique('Radera')
    const task = await api.createTask({ title })
    await api.createEntry({
      taskId: task.id,
      date: FIXED_DATE,
      durationString: '1h',
    })
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)

    let message = ''
    page.once('dialog', (dialog) => {
      message = dialog.message()
      void dialog.dismiss()
    })
    await dashboard.entry(title).getByTitle('Radera').click()
    expect(message).toBe('Är du säker på att du vill radera denna tidsrapport?')
    await expect(dashboard.entry(title)).toHaveCount(1)

    page.once('dialog', (dialog) => void dialog.accept())
    await dashboard.entry(title).getByTitle('Radera').click()
    await expect(dashboard.entry(title)).toHaveCount(0)
    await expect(dashboard.emptyState).toBeVisible()
    expect(await api.listEntries(FIXED_DATE)).toEqual([])
  })

  test('renders markdown typed in the description editor', async ({
    page,
    user,
  }) => {
    void user
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)
    await dashboard.openForm()
    await dashboard.form.createTask(unique('Dokumentation'))

    await dashboard.form.description.click()
    await page.keyboard.type('Möte med ')
    await page.keyboard.press('ControlOrMeta+b')
    await page.keyboard.type('kunden')
    await page.keyboard.press('ControlOrMeta+b')
    await page.keyboard.press('Enter')
    await page.keyboard.type('- punkt ett')
    await dashboard.form.duration.fill('15m')
    await dashboard.form.submit.click()

    const card = dashboard.entries.first()
    await expect(card.locator('.time-entry-description strong')).toHaveText(
      'kunden',
    )
    await expect(card.locator('.time-entry-description li')).toHaveText(
      'punkt ett',
    )
  })

  test('cancelling the form discards the draft', async ({ page, user }) => {
    void user
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)
    await dashboard.openForm()
    await dashboard.form.duration.fill('3h')
    await dashboard.form.cancel.click()
    await expect(dashboard.form.root).toBeHidden()
    await expect(dashboard.emptyState).toBeVisible()
    await dashboard.openForm()
    await expect(dashboard.form.duration).toHaveValue('')
  })
})
