import { test, expect } from '../../fixtures/test'
import { TasksPage } from '../../pages/TasksPage'
import { FIXED_DATE } from '../../env'
import { unique } from '../../fixtures/unique'

test.describe('Tasks', () => {
  test('starts empty and creates a task with project and default tags', async ({
    page,
    user,
    api,
  }) => {
    void user
    const project = await api.createProject(unique('Projekt'))
    const archived = await api.createProject(unique('Arkiverat'))
    await api.archiveProject(archived.id)
    const tag = await api.createTag(unique('Tagg'))
    const tasks = new TasksPage(page)
    await tasks.goto()
    await expect(tasks.empty).toBeVisible()

    await tasks.newButton.click()
    await expect(
      page.getByRole('heading', { name: 'Ny uppgift' }),
    ).toBeVisible()
    await expect(tasks.title).toBeFocused()
    // Archived projects are not offered.
    await expect(tasks.project.locator('option')).toHaveText([
      'Inget projekt',
      project.name,
    ])

    const title = unique('Uppgift')
    await tasks.title.fill(title)
    await tasks.description.fill('Beskrivning av uppgiften')
    await tasks.project.selectOption({ label: project.name })
    await tasks.defaultTags.fill(tag.name)
    await tasks.form
      .getByRole('button', { name: tag.name, exact: true })
      .click()
    await tasks.submitButton('create').click()

    await expect(tasks.form).toBeHidden()
    const row = tasks.row(title)
    await expect(row).toBeVisible()
    await expect(row).toContainText(project.name)
    await expect(row).toContainText('Beskrivning av uppgiften')
    await expect(row).toContainText('0 poster')
    await expect(row).toContainText('0m')

    const created = (await api.listTasks()).find((t) => t.title === title)
    expect(created).toBeDefined()
  })

  test('rejects a blank title', async ({ page, user }) => {
    void user
    const tasks = new TasksPage(page)
    await tasks.goto()
    await tasks.newButton.click()
    await tasks.title.fill('   ')
    await tasks.submitButton('create').click()
    await expect(tasks.form.getByRole('alert')).toHaveText('Invalid request')
  })

  test('edits a task and clears its description', async ({
    page,
    user,
    api,
  }) => {
    void user
    const title = unique('Före')
    await api.createTask({ title, description: 'gammal' })
    const tasks = new TasksPage(page)
    await tasks.goto()

    await tasks
      .row(title)
      .getByRole('button', { name: `Redigera ${title}` })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Redigera uppgift' }),
    ).toBeVisible()
    await expect(tasks.title).toHaveValue(title)
    const renamed = unique('Efter')
    await tasks.title.fill(renamed)
    await tasks.description.fill('')
    await tasks.jiraUrl.fill('https://example.atlassian.net/browse/TR-1')
    await tasks.submitButton('edit').click()

    await expect(tasks.row(title)).toHaveCount(0)
    const row = tasks.row(renamed)
    await expect(row).toBeVisible()
    await expect(row.getByRole('link', { name: 'TR-1' })).toHaveAttribute(
      'href',
      'https://example.atlassian.net/browse/TR-1',
    )
    await expect(row).not.toContainText('gammal')
  })

  test('favourites sort first and toggle back', async ({ page, user, api }) => {
    void user
    const first = unique('A')
    const second = unique('B')
    await api.createTask({ title: first })
    await api.createTask({ title: second })
    const tasks = new TasksPage(page)
    await tasks.goto()
    // Newest first by default.
    await expect(tasks.rows.locator('span.font-display')).toHaveText([
      second,
      first,
    ])

    await tasks.row(first).getByTitle('Markera som favorit').click()
    await expect(tasks.rows.locator('span.font-display')).toHaveText([
      first,
      second,
    ])
    await expect(tasks.row(first).getByTitle('Ta bort favorit')).toBeVisible()

    await tasks.row(first).getByTitle('Ta bort favorit').click()
    await expect(tasks.rows.locator('span.font-display')).toHaveText([
      second,
      first,
    ])
  })

  test('filters as you type and reports no matches', async ({
    page,
    user,
    api,
  }) => {
    void user
    await api.createTask({ title: unique('Fakturering kund') })
    await api.createTask({
      title: unique('Kodgranskning'),
      description: 'granska pull requests',
    })
    const tasks = new TasksPage(page)
    await tasks.goto()
    await expect(tasks.rows).toHaveCount(2)

    await tasks.search.fill('faktur')
    await expect(tasks.rows).toHaveCount(1)
    await expect(tasks.rows.first()).toContainText('Fakturering kund')

    // Description is searched too.
    await tasks.search.fill('pull req')
    await expect(tasks.rows).toHaveText([/Kodgranskning/])

    await tasks.search.fill('finns inte')
    await expect(tasks.empty).toBeVisible()
    await tasks.search.fill('')
    await expect(tasks.rows).toHaveCount(2)
  })

  test('deleting a task without entries removes it for good', async ({
    page,
    user,
    api,
  }) => {
    void user
    const title = unique('Tom uppgift')
    await api.createTask({ title })
    const tasks = new TasksPage(page)
    await tasks.goto()

    let message = ''
    page.once('dialog', (dialog) => {
      message = dialog.message()
      void dialog.accept()
    })
    await tasks
      .row(title)
      .getByRole('button', { name: `Ta bort ${title}` })
      .click()
    expect(message).toBe(`Ta bort "${title}"?`)
    await expect(tasks.row(title)).toHaveCount(0)
    await expect(tasks.empty).toBeVisible()
    await tasks.tab('Arkiverade').click()
    await expect(tasks.empty).toBeVisible()
    expect(await api.listTasks({ includeArchived: true })).toEqual([])
  })

  test('deleting a task with entries archives it, and it can be restored', async ({
    page,
    user,
    api,
  }) => {
    void user
    const title = unique('Med poster')
    const task = await api.createTask({ title })
    await api.createEntry({
      taskId: task.id,
      date: FIXED_DATE,
      durationString: '1h 15m',
    })
    const tasks = new TasksPage(page)
    await tasks.goto()
    await expect(tasks.row(title)).toContainText('1 poster')
    await expect(tasks.row(title)).toContainText('1h 15m')

    page.once('dialog', (dialog) => void dialog.accept())
    await tasks
      .row(title)
      .getByRole('button', { name: `Ta bort ${title}` })
      .click()
    await expect(tasks.row(title)).toHaveCount(0)

    await tasks.tab('Arkiverade').click()
    await expect(tasks.tab('Arkiverade')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const row = tasks.row(title)
    await expect(row).toContainText('Arkiverad')
    await expect(
      row.getByRole('button', { name: `Ta bort ${title}` }),
    ).toHaveCount(0)

    await row.getByRole('button', { name: 'Återställ' }).click()
    await expect(tasks.row(title)).toHaveCount(0)
    await tasks.tab('Aktiva').click()
    await expect(tasks.row(title)).toBeVisible()
    await expect(tasks.row(title)).not.toContainText('Arkiverad')
  })

  test('cancelling a dialog keeps the task', async ({ page, user, api }) => {
    void user
    const title = unique('Behåll')
    await api.createTask({ title })
    const tasks = new TasksPage(page)
    await tasks.goto()
    page.once('dialog', (dialog) => void dialog.dismiss())
    await tasks
      .row(title)
      .getByRole('button', { name: `Ta bort ${title}` })
      .click()
    await expect(tasks.row(title)).toBeVisible()
    expect(await api.listTasks()).toHaveLength(1)
  })
})
