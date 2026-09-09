import { test, expect } from '../../fixtures/test'
import { FIXED_DATE } from '../../env'

test.describe('Mobile navigation drawer', () => {
  test('opens, traps focus, navigates and closes with Escape', async ({
    page,
    user,
  }) => {
    void user
    await page.goto('/tasks')
    await expect(page.getByTestId('desktop-sidebar')).toBeHidden()
    await expect(page.getByTestId('mobile-drawer')).toHaveCount(0)

    const open = page.getByRole('button', { name: 'Öppna meny' })
    await expect(open).toHaveAttribute('aria-expanded', 'false')
    await open.click()
    const drawer = page.getByRole('dialog', { name: 'Navigation' })
    await expect(drawer).toBeVisible()
    await expect(open).toHaveAttribute('aria-expanded', 'true')
    await expect(
      drawer.getByRole('button', { name: 'Stäng meny' }),
    ).toBeFocused()
    expect(await page.evaluate(() => document.body.style.overflow)).toBe(
      'hidden',
    )

    // Shift+Tab from the first focusable wraps to the last (logout).
    await drawer.getByRole('link', { name: /Time\s?Report/ }).focus()
    await page.keyboard.press('Shift+Tab')
    await expect(drawer.getByRole('button', { name: 'Logga ut' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(
      drawer.getByRole('link', { name: /Time\s?Report/ }),
    ).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('')

    await open.click()
    await drawer.getByRole('link', { name: 'Dashboard' }).click()
    await expect(page).toHaveURL(`/dashboard?date=${FIXED_DATE}`)
    await expect(drawer).toBeHidden()
  })

  test('closes when the backdrop is tapped', async ({ page, user }) => {
    void user
    await page.goto('/tasks')
    await page.getByRole('button', { name: 'Öppna meny' }).click()
    const drawer = page.getByRole('dialog', { name: 'Navigation' })
    await expect(drawer).toBeVisible()
    // The drawer slides in from the right; the backdrop is what remains on the left.
    const viewport = page.viewportSize()
    if (!viewport) throw new Error('viewport unavailable')
    await page.mouse.click(10, viewport.height / 2)
    await expect(drawer).toBeHidden()
  })

  test('the dashboard works on a narrow screen', async ({
    page,
    user,
    api,
  }) => {
    void user
    const task = await api.createTask({ title: 'Mobiluppgift' })
    await api.createEntry({
      taskId: task.id,
      date: FIXED_DATE,
      durationString: '1h',
    })
    await page.goto(`/dashboard?date=${FIXED_DATE}`)
    await expect(page.getByTestId('time-entry')).toContainText('Mobiluppgift')
    await expect(page.locator('.daily-total')).toContainText('1h')
    // No horizontal overflow on the page body.
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
