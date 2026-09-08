import { test, expect } from '../../fixtures/test'
import { DashboardPage } from '../../pages/DashboardPage'
import { FIXED_DATE } from '../../env'
import { unique } from '../../fixtures/unique'

test.describe('Dashboard: weekly summary', () => {
  test('summarises the week and navigates between its days', async ({
    page,
    user,
    api,
  }) => {
    void user
    const task = await api.createTask({ title: unique('Vecka') })
    await api.createEntry({
      taskId: task.id,
      date: FIXED_DATE,
      durationString: '2h',
    })
    await api.createEntry({
      taskId: task.id,
      date: '2026-01-07',
      durationString: '3h 30m',
    })
    await api.createEntry({
      taskId: task.id,
      date: '2026-01-11',
      durationString: '1h',
    })
    await api.createEntry({
      taskId: task.id,
      date: '2026-01-12',
      durationString: '8h',
    }) // next week

    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)
    const week = dashboard.week

    await expect(week).toHaveAttribute('aria-label', 'Vecka 2')
    await expect(week.locator('.week-caption')).toContainText('6h 30m totalt')
    await expect(
      week.locator('.summary-instrument').filter({ hasText: 'Idag' }),
    ).toContainText('2h')
    await expect(
      week.locator('.summary-instrument').filter({ hasText: 'Vecka 2' }),
    ).toContainText('6h 30m')
    // 390 of 2400 minutes -> 16.25 %, rounded.
    await expect(
      week.locator('.summary-instrument').filter({ hasText: 'Klargrad' }),
    ).toContainText('16 %')

    const days = week.locator('button.week-day')
    await expect(days).toHaveCount(7)
    await expect(days.nth(0)).toHaveAttribute('aria-pressed', 'true')
    await expect(days.nth(0)).toContainText('mån')
    await expect(days.nth(0).locator('.week-day-total')).toHaveText('2h')
    await expect(days.nth(1).locator('.week-day-total')).toHaveText('–')
    await expect(days.nth(2).locator('.week-day-total')).toHaveText('3h 30m')
    await expect(days.nth(6).locator('.week-day-total')).toHaveText('1h')

    await days.nth(2).click()
    await expect(page).toHaveURL('/dashboard?date=2026-01-07')
    await expect(dashboard.heading).toHaveText('Onsdag 7 januari')
    await expect(days.nth(2)).toHaveAttribute('aria-pressed', 'true')
    await expect(days.nth(0)).toHaveAttribute('aria-pressed', 'false')
    await expect(
      week.locator('.summary-instrument').filter({ hasText: 'Idag' }),
    ).toContainText('3h 30m')
  })

  test('updates the week total when an entry is added', async ({
    page,
    user,
  }) => {
    void user
    const dashboard = new DashboardPage(page)
    await dashboard.goto(FIXED_DATE)
    await expect(dashboard.week.locator('.week-caption')).toContainText(
      '0m totalt',
    )

    await dashboard.openForm()
    await dashboard.form.createTask(unique('Lägg till'))
    await dashboard.form.duration.fill('4h')
    await dashboard.form.submit.click()

    await expect(dashboard.week.locator('.week-caption')).toContainText(
      '4h totalt',
    )
    await expect(
      dashboard.week
        .locator('.summary-instrument')
        .filter({ hasText: 'Klargrad' }),
    ).toContainText('10 %')
  })
})
