import { test, expect } from '../../fixtures/test'
import { FIXED_DATE } from '../../env'

// This project talks to the database that only has the schema, so the order
// matters: the admin account is created exactly once, half-way through.
test.describe.configure({ mode: 'serial' })

const admin = { email: 'first-admin@example.test', password: 'FirstAdmin!123' }

async function submitSetup(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
  confirm = password,
) {
  await page.getByLabel('E-post').fill(email)
  await page.getByLabel('Lösenord (minst 8 tecken)').fill(password)
  await page.getByLabel('Bekräfta lösenord').fill(confirm)
  await page.getByRole('button', { name: 'Skapa konto' }).click()
}

test.describe('First-run setup', () => {
  test('sends every visitor to /setup while no user exists', async ({
    page,
  }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/setup$/)
    await expect(page.getByRole('heading', { name: 'Välkommen' })).toBeVisible()
    await expect(
      page.getByText('Skapa ett administratörskonto för att komma igång.'),
    ).toBeVisible()
  })

  test('refuses registration before setup is complete', async ({ page }) => {
    const response = await page.request.post('/api/auth/register', {
      data: {
        email: 'early@example.test',
        password: 'Early!12345',
        passwordConfirmation: 'Early!12345',
      },
    })
    expect(response.status()).toBe(403)
  })

  test('validates password length and confirmation', async ({ page }) => {
    await page.goto('/setup')
    await submitSetup(page, admin.email, 'short1')
    await expect(page.getByRole('alert')).toHaveText(
      'Password must be at least 8 characters',
    )

    await submitSetup(page, admin.email, admin.password, 'Different!123')
    await expect(page.getByRole('alert')).toHaveText('Passwords do not match')
    expect(
      await page.request.get('/api/auth/setup-status').then((r) => r.json()),
    ).toEqual({ usersExist: false })
  })

  test('creates the first user as admin and logs in', async ({ page, api }) => {
    await page.goto('/setup')
    await submitSetup(page, admin.email, admin.password)

    await expect(page).toHaveURL(`/dashboard?date=${FIXED_DATE}`)
    const me = await api.me()
    expect(me).toMatchObject({ email: admin.email, isAdmin: true })
    await expect(page.getByTestId('desktop-sidebar')).toContainText(admin.email)
  })

  test('refuses a second setup and opens registration instead', async ({
    page,
  }) => {
    await page.goto('/setup')
    await submitSetup(page, 'second@example.test', 'Second!12345')
    await expect(page.getByRole('alert')).toHaveText('Setup already completed')

    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login$/)

    const response = await page.request.post('/api/auth/register', {
      data: {
        email: 'second@example.test',
        password: 'Second!12345',
        passwordConfirmation: 'Second!12345',
      },
    })
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({
      email: 'second@example.test',
      isAdmin: false,
    })
  })
})
