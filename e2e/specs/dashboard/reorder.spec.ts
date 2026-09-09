import { test, expect } from '../../fixtures/test'
import { DashboardPage } from '../../pages/DashboardPage'
import { FIXED_DATE } from '../../env'
import { unique } from '../../fixtures/unique'

test('reorders entries with the keyboard and persists the order', async ({
  page,
  user,
  api,
}) => {
  void user
  const titles = [unique('Första'), unique('Andra'), unique('Tredje')] as const
  for (const title of titles) {
    const task = await api.createTask({ title })
    await api.createEntry({
      taskId: task.id,
      date: FIXED_DATE,
      durationString: '30m',
    })
  }
  const dashboard = new DashboardPage(page)
  await dashboard.goto(FIXED_DATE)
  // New entries are inserted at the top, so the newest comes first.
  const initial = [titles[2], titles[1], titles[0]] as const
  await expect(dashboard.entries.locator('.time-entry-title')).toHaveText(
    initial,
  )

  // dnd-kit keyboard sensor: Space picks up, arrows move, Space drops.
  const handle = dashboard
    .entry(initial[0])
    .getByRole('button', { name: 'Dra för att sortera' })
  await handle.focus()
  await expect(handle).toBeFocused()
  await page.keyboard.press('Space')
  await expect(handle).toHaveAttribute('aria-pressed', 'true')
  // Each step displaces the item it passes (dnd-kit applies a transform to it).
  await page.keyboard.press('ArrowDown')
  await expect(dashboard.entries.nth(1)).not.toHaveCSS('transform', 'none')
  await page.keyboard.press('ArrowDown')
  await expect(dashboard.entries.nth(2)).not.toHaveCSS('transform', 'none')
  await page.keyboard.press('Space')
  await expect(handle).not.toHaveAttribute('aria-pressed', 'true')

  const expected = [initial[1], initial[2], initial[0]] as const
  await expect(dashboard.entries.locator('.time-entry-title')).toHaveText(
    expected,
  )

  await expect
    .poll(async () =>
      (await api.listEntries(FIXED_DATE)).map((e) => e.taskTitle),
    )
    .toEqual(expected)
  await page.reload()
  await expect(dashboard.entries.locator('.time-entry-title')).toHaveText(
    expected,
  )
})
