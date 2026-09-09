import { test, expect } from '../../fixtures/test'
import { DashboardPage } from '../../pages/DashboardPage'
import { TasksPage } from '../../pages/TasksPage'
import { ProjectsPage } from '../../pages/ProjectsPage'
import { FIXED_DATE, seededUsers } from '../../env'

// Bob owns project "Private" (archived), tag "Other" and an archived task.
// None of it may leak into Alice's UI or API responses.
test.describe('User isolation', () => {
  test("Alice never sees Bob's projects, tags or tasks", async ({
    page,
    alice,
    api,
  }) => {
    void alice
    const projects = new ProjectsPage(page)
    await projects.goto()
    await expect(projects.rows).toHaveText([/Client/])
    await projects.tab('Arkiverade').click()
    await expect(projects.empty).toBeVisible()

    const tasks = new TasksPage(page)
    await tasks.goto()
    await expect(tasks.rows).toHaveText([/Implementation/])
    await tasks.tab('Arkiverade').click()
    await expect(tasks.empty).toBeVisible()

    expect((await api.listTags()).map((t) => t.name)).toEqual(['Billable'])
    expect(
      (await api.listTasks({ includeArchived: true })).map((t) => t.title),
    ).toEqual(['Implementation'])
  })

  test("the tag picker only offers Alice's tags", async ({ page, alice }) => {
    void alice
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)
    await dashboard.openForm()
    await dashboard.form.tags.click()
    const options = dashboard.form.root.locator('.form-list-option')
    await expect(options).toHaveText(['Billable'])
    await dashboard.form.tags.fill('Oth')
    await expect(options).toHaveText(['+ Skapa tagg "Oth"'])
  })

  test("Bob's resources answer 404 to Alice through the API", async ({
    page,
    alice,
  }) => {
    void alice
    // Seed ids: project 2, tag 2 and task 2 belong to Bob.
    for (const path of ['/api/projects/2', '/api/tasks/2']) {
      const response = await page.request.get(path)
      expect(response.status(), path).toBe(404)
    }
    expect((await page.request.delete('/api/tags/2')).status()).toBe(404)
    expect(
      (
        await page.request.put('/api/planner-blocks/999999', {
          data: { title: 'x', date: FIXED_DATE },
        })
      ).status(),
    ).toBe(404)
  })

  test("Bob sees his own data and nothing of Alice's", async ({
    page,
    api,
  }) => {
    await api.login(seededUsers.bob.email, seededUsers.bob.password)
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)
    await expect(dashboard.emptyState).toBeVisible()
    await expect(page.getByTestId('daily-note-indicator')).toHaveCount(0)

    const projects = new ProjectsPage(page)
    await projects.goto()
    await expect(projects.empty).toBeVisible()
    await projects.tab('Arkiverade').click()
    await expect(projects.rows).toHaveText([/Private/])
  })
})
