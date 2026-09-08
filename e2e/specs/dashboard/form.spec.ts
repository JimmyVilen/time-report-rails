import { test, expect } from '../../fixtures/test'
import { DashboardPage } from '../../pages/DashboardPage'
import { FIXED_DATE } from '../../env'
import { unique } from '../../fixtures/unique'

test.describe('Dashboard: form behaviour and validation', () => {
  test('requires a task', async ({ page, user }) => {
    void user
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)
    await dashboard.openForm()
    await dashboard.form.duration.fill('1h')
    await dashboard.form.submit.click()
    await expect(dashboard.form.error).toHaveText('Välj en uppgift')
    await expect(dashboard.form.root).toBeVisible()
  })

  test('surfaces server validation for an inverted time range', async ({
    page,
    user,
    api,
  }) => {
    void user
    const title = unique('Fel')
    await api.createTask({ title })
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)
    await dashboard.openForm()
    await dashboard.form.chooseTask(title)
    await dashboard.form.start.fill('10:00')
    await dashboard.form.end.fill('09:00')
    // No duration is derived from a negative span.
    await expect(dashboard.form.duration).toHaveValue('')
    await dashboard.form.submit.click()
    await expect(dashboard.form.error).toHaveText(
      'End time must be after start time',
    )
    expect(await api.listEntries(FIXED_DATE)).toEqual([])
  })

  test('requires either a duration or a time range', async ({
    page,
    user,
    api,
  }) => {
    void user
    const title = unique('Tom')
    await api.createTask({ title })
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)
    await dashboard.openForm()
    await dashboard.form.chooseTask(title)
    await dashboard.form.submit.click()
    await expect(dashboard.form.error).toHaveText(
      'Provide duration or start/end time',
    )
  })

  test('derives the missing time field from the other two', async ({
    page,
    user,
    api,
  }) => {
    void user
    const title = unique('Räkna')
    await api.createTask({ title })
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)
    await dashboard.openForm()
    await dashboard.form.chooseTask(title)

    // start + duration -> end
    await dashboard.form.start.fill('08:00')
    await dashboard.form.duration.fill('1h 30m')
    await expect(dashboard.form.end).toHaveValue('09:30')

    // start + end -> duration
    await dashboard.form.end.fill('11:00')
    await expect(dashboard.form.duration).toHaveValue('3h')

    // end + duration (no start) -> start
    await dashboard.form.start.fill('')
    await dashboard.form.duration.fill('45m')
    await expect(dashboard.form.start).toHaveValue('10:15')
  })

  test('accepts the documented duration formats', async ({
    page,
    user,
    api,
  }) => {
    void user
    const title = unique('Format')
    const task = await api.createTask({ title })
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)

    for (const [input, expected] of [
      ['1.5h', '1h 30m'],
      ['90m', '1h 30m'],
      ['2H', '2h'],
    ] as const) {
      await api.createEntry({
        taskId: task.id,
        date: FIXED_DATE,
        durationString: input,
      })
      await page.reload()
      await expect(
        dashboard.entries.first().locator('.time-entry-duration'),
      ).toHaveText(expected)
    }
  })

  test('creating a tag inline and removing a chip', async ({
    page,
    user,
    api,
  }) => {
    void user
    const title = unique('Taggar')
    await api.createTask({ title })
    const existing = await api.createTag(unique('Befintlig'))
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)
    await dashboard.openForm()
    await dashboard.form.chooseTask(title)

    const created = unique('Ny tagg')
    await dashboard.form.createTag(created)
    await dashboard.form.addTag(existing.name)
    await expect(dashboard.form.tagChip(existing.name)).toBeVisible()

    await dashboard.form.root
      .getByRole('button', { name: `Ta bort tagg ${existing.name}` })
      .click()
    await expect(dashboard.form.tagChip(existing.name)).toHaveCount(0)

    await dashboard.form.duration.fill('20m')
    await dashboard.form.submit.click()
    await expect(dashboard.entry(title).locator('.tag-chip')).toHaveText([
      created,
    ])
    expect((await api.listTags()).map((t) => t.name)).toEqual(
      expect.arrayContaining([created, existing.name]),
    )
  })

  test('never offers to create a tag that already exists', async ({
    page,
    user,
    api,
  }) => {
    void user
    const title = unique('Dubblett')
    await api.createTask({ title })
    const tag = await api.createTag(unique('Unik'))
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)
    await dashboard.openForm()
    await dashboard.form.chooseTask(title)

    // The match is case-insensitive, so only the existing tag is offered.
    const create = dashboard.form.root.getByRole('button', {
      name: /\+ Skapa tagg/,
    })
    await dashboard.form.tags.fill(tag.name)
    await expect(
      dashboard.form.root.getByRole('button', { name: tag.name, exact: true }),
    ).toBeVisible()
    await expect(create).toHaveCount(0)
    await dashboard.form.tags.fill(tag.name.toUpperCase())
    await expect(
      dashboard.form.root.getByRole('button', { name: tag.name, exact: true }),
    ).toBeVisible()
    await expect(create).toHaveCount(0)

    // The server guards the same rule for direct API calls.
    const response = await page.request.post('/api/tags', {
      data: { name: tag.name.toUpperCase() },
    })
    expect(response.status()).toBe(400)
    expect(await response.json()).toEqual({
      error: 'A tag with that name already exists',
    })
  })

  test('applies default tags and the latest description when a task is picked', async ({
    page,
    user,
    api,
  }) => {
    void user
    const tag = await api.createTag(unique('Standard'))
    const title = unique('Standarduppgift')
    const task = await api.createTask({ title, defaultTagIds: [tag.id] })
    await api.createEntry({
      taskId: task.id,
      date: '2026-01-02',
      durationString: '1h',
      description: 'Senaste beskrivningen',
    })

    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)
    await dashboard.openForm()
    await dashboard.form.chooseTask(title)

    await expect(dashboard.form.tagChip(tag.name)).toBeVisible()
    await expect(dashboard.form.description).toHaveText('Senaste beskrivningen')
  })

  test('offers to create a Jira task for a pasted URL and reports missing credentials', async ({
    page,
    user,
  }) => {
    void user
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)
    await dashboard.openForm()
    await dashboard.form.task.fill(
      'https://example.atlassian.net/browse/PROJ-42',
    )
    await dashboard.form.options
      .filter({ hasText: '+ Skapa uppgift från Jira-URL' })
      .click()
    await expect(dashboard.form.error).toHaveText(
      'Jira credentials not configured',
    )
  })

  test('re-selects an existing task when its Jira URL is pasted', async ({
    page,
    user,
    api,
  }) => {
    void user
    const title = unique('Jira-uppgift')
    await api.createTask({
      title,
      jiraUrl: 'https://example.atlassian.net/browse/ABC-7',
    })
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)
    await dashboard.openForm()
    await dashboard.form.task.fill('https://example.atlassian.net/browse/ABC-7')
    await expect(dashboard.form.task).toHaveValue(`[ABC-7] ${title}`)
    await dashboard.form.duration.fill('10m')
    await dashboard.form.submit.click()
    const card = dashboard.entry(title)
    await expect(card.getByRole('link', { name: '[ABC-7]' })).toHaveAttribute(
      'href',
      'https://example.atlassian.net/browse/ABC-7',
    )
    // Without start/end the Jira push button is disabled and explains why.
    await expect(
      card.getByTitle('Start- och sluttid krävs för att skicka till Jira'),
    ).toBeDisabled()
  })
})
