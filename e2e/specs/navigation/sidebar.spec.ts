import { test, expect } from '../../fixtures/test'
import { Sidebar } from '../../pages/Sidebar'
import { FIXED_DATE } from '../../env'

test.describe('Sidebar navigation', () => {
  test("marks the current page and carries today's date to the dashboard", async ({
    page,
    user,
  }) => {
    const sidebar = new Sidebar(page)
    await page.goto('/tasks')
    await expect(sidebar.root).toContainText(user.email)
    await expect(sidebar.link('Uppgifter')).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(sidebar.link('Dashboard')).not.toHaveAttribute(
      'aria-current',
      'page',
    )

    const expectations: [string, RegExp, string][] = [
      ['Projekt', /\/projects$/, 'Projekt'],
      ['Anteckningar', /\/notes$/, 'Noteringar'],
      ['Planering', /\/planner$/, 'Planering'],
      ['Exportera', /\/export$/, 'Exportera'],
      ['Inställningar', /\/profile$/, 'Profil'],
    ]
    for (const [link, url, heading] of expectations) {
      await sidebar.link(link).click()
      await expect(page).toHaveURL(url)
      await expect(
        page.getByRole('heading', { name: heading, exact: true }),
      ).toBeVisible()
      await expect(sidebar.link(link)).toHaveAttribute('aria-current', 'page')
    }

    await sidebar.link('Dashboard').click()
    await expect(page).toHaveURL(`/dashboard?date=${FIXED_DATE}`)
    await expect(sidebar.link('Dashboard')).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('the brand link returns to today', async ({ page, user }) => {
    void user
    await page.goto('/dashboard?date=2026-03-03')
    await new Sidebar(page).root
      .getByRole('link', { name: /Time\s?Report/ })
      .click()
    await expect(page).toHaveURL(`/dashboard?date=${FIXED_DATE}`)
  })
})
