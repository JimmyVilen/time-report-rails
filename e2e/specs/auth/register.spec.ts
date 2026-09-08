import { test, expect } from '../../fixtures/test'
import { FIXED_DATE, seededUsers } from '../../env'

async function fillRegistration(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
  confirm = password,
) {
  await page.goto('/register')
  await page.getByLabel('E-post').fill(email)
  await page.getByLabel('Lösenord', { exact: true }).fill(password)
  await page.getByLabel('Bekräfta lösenord').fill(confirm)
  await page.getByRole('button', { name: 'Registrera' }).click()
}

test.describe('Registration', () => {
  test('creates an account and logs the new user in', async ({ page, api }) => {
    const email = `e2e-register-${Date.now().toString(36)}@example.test`
    await fillRegistration(page, email, 'Registrera!123')

    await expect(page).toHaveURL(`/dashboard?date=${FIXED_DATE}`)
    const me = await api.me()
    expect(me.email).toBe(email)
    expect(me.isAdmin).toBe(false)
    // The display name is derived from the local part of the e-mail address.
    await expect(page.getByTestId('desktop-sidebar')).toContainText(email)
  })

  test('rejects an e-mail that is already registered', async ({ page }) => {
    await fillRegistration(page, seededUsers.alice.email, 'Registrera!123')
    await expect(page.getByRole('alert')).toHaveText('Email already in use')
    await expect(page).toHaveURL(/\/register$/)
  })

  test('rejects mismatching passwords', async ({ page }) => {
    await fillRegistration(
      page,
      `e2e-mismatch-${Date.now().toString(36)}@example.test`,
      'Registrera!123',
      'Registrera!124',
    )
    await expect(page.getByRole('alert')).toHaveText('Passwords do not match')
  })

  test('rejects passwords shorter than eight characters', async ({ page }) => {
    await fillRegistration(
      page,
      `e2e-short-${Date.now().toString(36)}@example.test`,
      'kort1',
    )
    await expect(page.getByRole('alert')).toHaveText(
      'Password must be at least 8 characters',
    )
  })

  test('links back to login', async ({ page }) => {
    await page.goto('/register')
    await page.getByRole('link', { name: 'Logga in' }).click()
    await expect(page).toHaveURL(/\/login$/)
  })
})
