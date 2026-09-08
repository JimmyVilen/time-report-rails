import { test, expect } from '../../fixtures/test'
import { LoginPage } from '../../pages/LoginPage'
import { FIXED_DATE, seededUsers } from '../../env'

test.describe('Login', () => {
  test("logs in with valid credentials and lands on today's dashboard", async ({
    page,
  }) => {
    const login = new LoginPage(page)
    await login.goto()
    await expect(page.getByRole('heading', { name: 'Logga in' })).toBeVisible()

    await login.submit(seededUsers.alice.email, seededUsers.alice.password)

    await expect(page).toHaveURL(`/dashboard?date=${FIXED_DATE}`)
    await expect(page.getByTestId('desktop-sidebar')).toContainText(
      seededUsers.alice.email,
    )
  })

  test('rejects a wrong password and stays on the login page', async ({
    page,
  }) => {
    const login = new LoginPage(page)
    await login.goto()
    await login.submit(seededUsers.alice.email, 'not-the-password')

    // The server answers 401 "Invalid email or password", but the API client
    // maps every 401 to "Unauthorized" before the page sees it (finding #7 in
    // docs/e2e-test-plan.md). Assert the behaviour the user actually gets.
    await expect(login.error).toHaveText('Unauthorized')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('rejects an unknown email', async ({ page }) => {
    const login = new LoginPage(page)
    await login.goto()
    await login.submit('nobody@example.test', 'whatever123')
    await expect(login.error).toHaveText('Unauthorized')
  })

  test('requires both fields before submitting', async ({ page }) => {
    const login = new LoginPage(page)
    await login.goto()
    await login.submitButton.click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(login.error).toHaveCount(0)
    const invalid = await login.email.evaluate(
      (el: HTMLInputElement) => el.validity.valueMissing,
    )
    expect(invalid).toBe(true)
  })

  test('links to registration', async ({ page }) => {
    await new LoginPage(page).goto()
    await page.getByRole('link', { name: 'Registrera dig' }).click()
    await expect(page).toHaveURL(/\/register$/)
    await expect(
      page.getByRole('heading', { name: 'Skapa konto' }),
    ).toBeVisible()
  })
})
