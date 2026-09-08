import { test, expect } from '../../fixtures/test'
import { Sidebar } from '../../pages/Sidebar'
import { FIXED_DATE } from '../../env'

test.describe('Route guard and logout', () => {
  for (const path of [
    '/dashboard',
    '/projects',
    '/tasks',
    '/notes',
    '/planner',
    '/export',
    '/profile',
  ]) {
    test(`redirects an anonymous visitor from ${path} to /login`, async ({
      page,
    }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login$/)
      await expect(
        page.getByRole('heading', { name: 'Logga in' }),
      ).toBeVisible()
    })
  }

  test("redirects the root path to today's dashboard when logged in", async ({
    page,
    user,
  }) => {
    void user
    await page.goto('/')
    await expect(page).toHaveURL(`/dashboard?date=${FIXED_DATE}`)
  })

  test('the API answers 401 JSON without a session', async ({ page }) => {
    const response = await page.request.get('/api/tasks')
    expect(response.status()).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  test('logging out ends the session everywhere', async ({ page, user }) => {
    void user
    await page.goto(`/dashboard?date=${FIXED_DATE}`)
    await new Sidebar(page).logoutButton.click()
    await expect(page).toHaveURL(/\/login$/)

    // Cookie is gone: the API refuses and protected pages bounce back to login.
    expect((await page.request.get('/api/auth/me')).status()).toBe(401)
    await page.goto('/tasks')
    await expect(page).toHaveURL(/\/login$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/login$/)
  })
})
