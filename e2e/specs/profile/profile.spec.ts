import { test, expect } from '../../fixtures/test'
import { ProfilePage } from '../../pages/ProfilePage'
import { LoginPage } from '../../pages/LoginPage'
import { Sidebar } from '../../pages/Sidebar'
import { FIXED_DATE } from '../../env'

test.describe('Profile', () => {
  test('shows the account and saves a new display name', async ({
    page,
    user,
    api,
  }) => {
    const profile = new ProfilePage(page)
    await profile.goto()
    await expect(page.getByRole('main').getByText(user.email)).toBeVisible()
    await expect(profile.jiraToken).toHaveAttribute(
      'placeholder',
      'Din Jira API-token',
    )

    await profile.name.fill('Testare Testsson')
    await profile.save.click()
    await expect(profile.status).toHaveText('Profilen sparades.')
    await expect(new Sidebar(page).root).toContainText('Testare Testsson')
    // The confirmation clears itself after a few seconds.
    await expect(profile.status).toBeHidden({ timeout: 6_000 })
    expect(await api.me()).toMatchObject({ name: 'Testare Testsson' })
  })

  test('changes the password and requires it on the next login', async ({
    page,
    user,
  }) => {
    const profile = new ProfilePage(page)
    await profile.goto()
    await profile.password.fill('NyttLosen!456')
    await profile.passwordConfirm.fill('NyttLosen!456')
    await profile.save.click()
    await expect(profile.status).toHaveText('Profilen sparades.')
    await expect(profile.password).toHaveValue('')
    await expect(profile.passwordConfirm).toHaveValue('')

    await new Sidebar(page).logoutButton.click()
    await expect(page).toHaveURL(/\/login$/)
    const login = new LoginPage(page)
    await login.submit(user.email, user.password)
    await expect(login.error).toBeVisible()
    await login.submit(user.email, 'NyttLosen!456')
    await expect(page).toHaveURL(`/dashboard?date=${FIXED_DATE}`)
  })

  test('validates password confirmation and length', async ({ page, user }) => {
    void user
    const profile = new ProfilePage(page)
    await profile.goto()
    await profile.password.fill('NyttLosen!456')
    await profile.passwordConfirm.fill('Annat!456')
    await profile.save.click()
    await expect(profile.error).toHaveText('Passwords do not match')

    await profile.password.fill('kort')
    await profile.passwordConfirm.fill('kort')
    await profile.save.click()
    await expect(profile.error).toHaveText(
      'Password must be at least 8 characters',
    )
    await expect(profile.status).toHaveCount(0)
  })

  test('stores Jira settings without ever echoing the token', async ({
    page,
    user,
    api,
  }) => {
    void user
    const profile = new ProfilePage(page)
    await profile.goto()
    await profile.jiraUrl.fill('https://example.atlassian.net')
    await profile.jiraEmail.fill('jira@example.test')
    await profile.jiraToken.fill('super-secret-token')
    await profile.save.click()
    await expect(profile.status).toHaveText('Profilen sparades.')
    await expect(profile.jiraToken).toHaveValue('')
    await expect(profile.jiraToken).toHaveAttribute('placeholder', '••••••••')

    await page.reload()
    await expect(profile.jiraUrl).toHaveValue('https://example.atlassian.net')
    await expect(profile.jiraEmail).toHaveValue('jira@example.test')
    await expect(profile.jiraToken).toHaveAttribute('placeholder', '••••••••')
    const me = await api.me()
    expect(me).toMatchObject({
      jiraUrl: 'https://example.atlassian.net',
      jiraEmail: 'jira@example.test',
      jiraApiTokenSet: true,
    })
    expect(JSON.stringify(me)).not.toContain('super-secret-token')
  })

  test.fixme('clearing the Jira URL removes it from the profile', async ({
    page,
    user,
    api,
  }) => {
    // Finding #5 in docs/e2e-test-plan.md: emptied fields are dropped from the
    // request instead of being sent as empty strings, so nothing is cleared.
    void user
    await api.updateProfile({ jiraUrl: 'https://example.atlassian.net' })
    const profile = new ProfilePage(page)
    await profile.goto()
    await profile.jiraUrl.fill('')
    await profile.save.click()
    await expect(profile.status).toHaveText('Profilen sparades.')
    expect(await api.me()).toMatchObject({ jiraUrl: null })
  })
})
