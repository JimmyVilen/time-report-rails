import { test, expect } from '../../fixtures/test'
import { PlannerPage, yForTime } from '../../pages/PlannerPage'
import { FIXED_DATE } from '../../env'
import { unique } from '../../fixtures/unique'

// A tall viewport keeps the whole 07:00-19:00 grid on screen so that pointer
// drags never trigger dnd-kit's edge auto-scroll.
test.use({ viewport: { width: 1280, height: 1500 } })

test.describe('Planner', () => {
  test('opens on the current week and navigates weeks', async ({
    page,
    user,
  }) => {
    void user
    const planner = new PlannerPage(page)
    await planner.goto()
    await expect(planner.weekLabel).toHaveText(/^Vecka 2 · 5 jan\.?–9 jan\.?$/)
    await expect(page.locator('[data-date]')).toHaveCount(5)
    await expect(planner.column('2026-01-09')).toBeVisible()
    await expect(planner.column('2026-01-10')).toHaveCount(0)

    await planner.nextWeek.click()
    await expect(planner.weekLabel).toHaveText(
      /^Vecka 3 · 12 jan\.?–16 jan\.?$/,
    )
    await planner.previousWeek.click()
    await planner.previousWeek.click()
    await expect(planner.weekLabel).toHaveText(/^Vecka 1 · 29 dec\.?–2 jan\.?$/)
    await planner.todayButton.click()
    await expect(planner.weekLabel).toHaveText(/^Vecka 2 · 5 jan\.?–9 jan\.?$/)
  })

  test('creates a block from the header button', async ({
    page,
    user,
    api,
  }) => {
    void user
    const planner = new PlannerPage(page)
    await planner.goto()
    await planner.newBlockButton.click()

    const modal = planner.modal
    await expect(
      planner.dialog.getByRole('heading', { name: 'Nytt block' }),
    ).toBeVisible()
    await expect(modal.title).toBeFocused()
    await expect(modal.date).toHaveValue(FIXED_DATE)
    await expect(modal.start).toHaveValue('09:00')
    await expect(modal.end).toHaveValue('10:00')
    await expect(modal.save).toBeDisabled()
    await expect(modal.color('blue')).toHaveAttribute('aria-pressed', 'true')

    const title = unique('Fokus')
    await modal.title.fill(title)
    await modal.end.fill('11:00')
    await modal.color('green').click()
    await expect(modal.color('green')).toHaveAttribute('aria-pressed', 'true')
    await expect(modal.color('blue')).toHaveAttribute('aria-pressed', 'false')
    await modal.notes.fill('Förbered **demo**')
    await planner.dialog
      .getByRole('button', { name: 'Förhandsgranska' })
      .click()
    await expect(planner.dialog.locator('strong')).toHaveText('demo')
    await planner.dialog.getByRole('button', { name: 'Redigera' }).click()
    await modal.save.click()

    await expect(planner.dialog).toBeHidden()
    const block = planner
      .column(FIXED_DATE)
      .getByTestId('planner-block')
      .filter({ hasText: title })
    await expect(block).toBeVisible()
    await expect(block).toContainText('09:00–11:00')
    await expect(block.locator('strong')).toHaveText('demo')
    const [saved] = await api.listBlocks(FIXED_DATE)
    expect(saved).toMatchObject({
      title,
      date: FIXED_DATE,
      color: 'green',
      notes: 'Förbered **demo**',
    })
    expect(saved?.startTime).toMatch(/^2026-01-05[T ]09:00/)
    expect(saved?.endTime).toMatch(/^2026-01-05[T ]11:00/)
  })

  test('clicking a time slot pre-fills a one hour block on that day', async ({
    page,
    user,
  }) => {
    void user
    const planner = new PlannerPage(page)
    await planner.goto()
    await planner
      .column('2026-01-07')
      .click({ position: { x: 40, y: yForTime('13:00') + 5 } })

    const modal = planner.modal
    await expect(modal.date).toHaveValue('2026-01-07')
    await expect(modal.start).toHaveValue('13:00')
    await expect(modal.end).toHaveValue('14:00')

    await page.keyboard.press('Escape')
    await expect(planner.dialog).toBeHidden()
  })

  test('edits an existing block through the dialog', async ({
    page,
    user,
    api,
  }) => {
    void user
    const title = unique('Möte')
    await api.createBlock({
      title,
      date: '2026-01-06',
      startTime: '2026-01-06T10:00:00',
      endTime: '2026-01-06T11:00:00',
    })
    const planner = new PlannerPage(page)
    await planner.goto()
    await planner.block(title).click()

    await expect(
      planner.dialog.getByRole('heading', { name: 'Redigera block' }),
    ).toBeVisible()
    await expect(planner.modal.title).toHaveValue(title)
    const renamed = unique('Workshop')
    await planner.modal.title.fill(renamed)
    await planner.modal.date.fill('2026-01-08')
    await planner.modal.start.fill('14:00')
    await planner.modal.end.fill('16:00')
    await planner.modal.save.click()

    await expect(
      planner
        .column('2026-01-08')
        .getByTestId('planner-block')
        .filter({ hasText: renamed }),
    ).toContainText('14:00–16:00')
    await expect(
      planner.column('2026-01-06').getByTestId('planner-block'),
    ).toHaveCount(0)
    await expect
      .poll(async () =>
        (await api.listBlocks(FIXED_DATE)).map((b) => [b.title, b.date]),
      )
      .toEqual([[renamed, '2026-01-08']])
  })

  test('closes the dialog via the close button, cancel and the backdrop', async ({
    page,
    user,
  }) => {
    void user
    const planner = new PlannerPage(page)
    await planner.goto()
    await planner.newBlockButton.click()
    await planner.modal.close.click()
    await expect(planner.dialog).toBeHidden()
    await planner.newBlockButton.click()
    await planner.modal.cancel.click()
    await expect(planner.dialog).toBeHidden()
    await planner.newBlockButton.click()
    const viewport = page.viewportSize()
    if (!viewport) throw new Error('viewport unavailable')
    await page.mouse.click(viewport.width - 20, viewport.height - 20)
    await expect(planner.dialog).toBeHidden()
  })

  test('deletes a block from its hover actions', async ({
    page,
    user,
    api,
  }) => {
    void user
    const title = unique('Bort')
    await api.createBlock({
      title,
      date: FIXED_DATE,
      startTime: '2026-01-05T08:00:00',
      endTime: '2026-01-05T09:00:00',
    })
    const planner = new PlannerPage(page)
    await planner.goto()
    const block = planner.block(title)
    await block.hover()
    await block.getByTitle('Ta bort').click()
    await expect(block).toHaveCount(0)
    await expect.poll(async () => api.listBlocks(FIXED_DATE)).toEqual([])
    await page.reload()
    await expect(planner.blocks).toHaveCount(0)
  })

  test('converts a block into a task', async ({ page, user, api }) => {
    void user
    const title = unique('Planerat arbete')
    await api.createBlock({
      title,
      date: FIXED_DATE,
      startTime: '2026-01-05T09:00:00',
      endTime: '2026-01-05T10:00:00',
    })
    const planner = new PlannerPage(page)
    await planner.goto()
    const block = planner.block(title)
    await block.hover()
    await block.getByTitle('Konvertera till uppgift').click()
    await expect(planner.toast).toBeVisible()
    await expect(planner.toast).toBeHidden({ timeout: 5_000 })
    await expect(block).toBeVisible()
    expect((await api.listTasks()).map((t) => t.title)).toEqual([title])
  })

  test('drags a block to another day and time', async ({ page, user, api }) => {
    void user
    const title = unique('Flytta')
    await api.createBlock({
      title,
      date: FIXED_DATE,
      startTime: '2026-01-05T09:00:00',
      endTime: '2026-01-05T10:00:00',
    })
    const planner = new PlannerPage(page)
    await planner.goto()
    const block = planner.block(title)
    const source = await block.boundingBox()
    const target = await planner.column('2026-01-07').boundingBox()
    if (!source || !target) throw new Error('planner geometry unavailable')

    const startX = source.x + source.width / 2
    const startY = source.y + source.height / 2
    const endX = target.x + target.width / 2
    // The drop maps the pointer's y (not the block's top) to a time, measured
    // from the top of the grid body, which sits one 32 px day header above the
    // column; the result snaps to 30 minutes.
    const endY = target.y - 32 + yForTime('13:00')
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 10, startY + 10)
    await page.mouse.move(endX, endY, { steps: 12 })
    await page.mouse.up()

    const moved = planner
      .column('2026-01-07')
      .getByTestId('planner-block')
      .filter({ hasText: title })
    await expect(moved).toBeVisible()
    await expect(moved).toContainText('13:00–14:00')
    await expect
      .poll(async () =>
        (await api.listBlocks(FIXED_DATE)).map((b) => [
          b.date,
          b.startTime?.slice(11, 16),
          b.endTime?.slice(11, 16),
        ]),
      )
      .toEqual([['2026-01-07', '13:00', '14:00']])
  })

  test('resizes a block from its bottom edge in 30 minute steps', async ({
    page,
    user,
    api,
  }) => {
    void user
    const title = unique('Sträck')
    await api.createBlock({
      title,
      date: FIXED_DATE,
      startTime: '2026-01-05T09:00:00',
      endTime: '2026-01-05T10:00:00',
    })
    const planner = new PlannerPage(page)
    await planner.goto()
    const handle = planner.block(title).getByTestId('resize-bottom')
    const box = await handle.boundingBox()
    if (!box) throw new Error('resize handle unavailable')
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    // Two rows (80 px) equal one hour; 1.6 rows (64 px = 48 min) also snaps to it.
    await page.mouse.move(x, y + 64, { steps: 8 })
    await page.mouse.up()

    await expect(planner.block(title)).toContainText('09:00–11:00')
    await expect
      .poll(async () =>
        (await api.listBlocks(FIXED_DATE)).map((b) => b.endTime?.slice(11, 16)),
      )
      .toEqual(['11:00'])
  })

  test.fixme('shows blocks planned on the weekend', async ({
    page,
    user,
    api,
  }) => {
    // Finding #4 in docs/e2e-test-plan.md: the API returns Monday to Sunday but
    // the grid only renders Monday to Friday, so weekend blocks are invisible.
    void user
    const title = unique('Helg')
    await api.createBlock({
      title,
      date: '2026-01-10',
      startTime: '2026-01-10T09:00:00',
      endTime: '2026-01-10T10:00:00',
    })
    const planner = new PlannerPage(page)
    await planner.goto()
    await expect(planner.block(title)).toBeVisible()
  })
})
