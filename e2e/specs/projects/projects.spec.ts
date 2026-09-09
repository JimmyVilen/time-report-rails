import { test, expect } from '../../fixtures/test'
import { ProjectsPage } from '../../pages/ProjectsPage'
import { FIXED_DATE } from '../../env'
import { unique } from '../../fixtures/unique'

test.describe('Projects', () => {
  test('starts empty, creates and edits a project', async ({
    page,
    user,
    api,
  }) => {
    void user
    const projects = new ProjectsPage(page)
    await projects.goto()
    await expect(projects.empty).toBeVisible()

    const name = unique('Kundprojekt')
    await projects.create(name, 'Allt för kunden')
    await expect(projects.form).toBeHidden()
    const row = projects.row(name)
    await expect(row).toContainText('Allt för kunden')
    await expect(row).toContainText('0 uppgifter')
    await expect(row).toContainText('0m')

    await row.getByRole('button', { name: `Redigera ${name}` }).click()
    await expect(
      page.getByRole('heading', { name: 'Redigera projekt' }),
    ).toBeVisible()
    await expect(projects.name).toHaveValue(name)
    const renamed = unique('Omdöpt')
    await projects.name.fill(renamed)
    await projects.form.getByRole('button', { name: 'Spara' }).click()
    await expect(projects.row(name)).toHaveCount(0)
    await expect(projects.row(renamed)).toBeVisible()
    expect((await api.listProjects()).map((p) => p.name)).toEqual([renamed])
  })

  test('refuses a duplicate name regardless of case', async ({
    page,
    user,
    api,
  }) => {
    void user
    const name = unique('Dubblett')
    await api.createProject(name)
    const projects = new ProjectsPage(page)
    await projects.goto()
    await projects.create(name.toUpperCase())
    await expect(projects.form.getByRole('alert')).toHaveText(
      'A project with that name already exists',
    )
    await expect(projects.form).toBeVisible()
  })

  test('shows task count and reported time per project', async ({
    page,
    user,
    api,
  }) => {
    void user
    const project = await api.createProject(unique('Räknare'))
    const task = await api.createTask({
      title: unique('Uppgift'),
      projectId: project.id,
    })
    await api.createTask({
      title: unique('Uppgift två'),
      projectId: project.id,
    })
    await api.createEntry({
      taskId: task.id,
      date: FIXED_DATE,
      durationString: '1h 30m',
    })
    await api.createEntry({
      taskId: task.id,
      date: '2026-01-06',
      startTime: '09:00',
      endTime: '09:45',
    })
    const projects = new ProjectsPage(page)
    await projects.goto()
    const row = projects.row(project.name)
    await expect(row).toContainText('2 uppgifter')
    await expect(row).toContainText('2h 15m')
  })

  test('archives, restores and deletes with confirmation', async ({
    page,
    user,
    api,
  }) => {
    void user
    const name = unique('Livscykel')
    await api.createProject(name)
    const projects = new ProjectsPage(page)
    await projects.goto()

    await projects.row(name).getByRole('button', { name: 'Arkivera' }).click()
    await expect(projects.row(name)).toHaveCount(0)
    await expect(projects.empty).toBeVisible()

    await projects.tab('Arkiverade').click()
    await expect(projects.tab('Arkiverade')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(projects.row(name)).toBeVisible()
    await projects.row(name).getByRole('button', { name: 'Återställ' }).click()
    await expect(projects.row(name)).toHaveCount(0)
    await projects.tab('Aktiva').click()
    await expect(projects.row(name)).toBeVisible()

    let message = ''
    page.once('dialog', (dialog) => {
      message = dialog.message()
      void dialog.dismiss()
    })
    await projects
      .row(name)
      .getByRole('button', { name: `Ta bort ${name}` })
      .click()
    expect(message).toBe(`Ta bort projektet "${name}"?`)
    await expect(projects.row(name)).toBeVisible()

    page.once('dialog', (dialog) => void dialog.accept())
    await projects
      .row(name)
      .getByRole('button', { name: `Ta bort ${name}` })
      .click()
    await expect(projects.row(name)).toHaveCount(0)
    expect(await api.listProjects()).toEqual([])
  })

  test('deleting a project keeps its tasks but detaches them', async ({
    page,
    user,
    api,
  }) => {
    void user
    const project = await api.createProject(unique('Försvinner'))
    const task = await api.createTask({
      title: unique('Kvar'),
      projectId: project.id,
    })
    const projects = new ProjectsPage(page)
    await projects.goto()
    page.once('dialog', (dialog) => void dialog.accept())
    await projects
      .row(project.name)
      .getByRole('button', { name: `Ta bort ${project.name}` })
      .click()
    await expect(projects.empty).toBeVisible()
    const tasks = await api.listTasks()
    expect(tasks.map((t) => t.id)).toEqual([task.id])
  })
})
