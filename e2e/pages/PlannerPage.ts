import { expect, type Locator, type Page } from '@playwright/test'

/** Grid geometry mirrored from src/features/planner/WeekGrid.tsx. */
export const GRID = { startHour: 7, endHour: 19, rowHeight: 40 } as const

export function yForTime(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number)
  return (((h - GRID.startHour) * 60 + m) / 30) * GRID.rowHeight
}

export class PlannerPage {
  readonly weekLabel: Locator
  readonly previousWeek: Locator
  readonly nextWeek: Locator
  readonly todayButton: Locator
  readonly newBlockButton: Locator
  readonly dialog: Locator
  readonly blocks: Locator
  readonly toast: Locator

  constructor(readonly page: Page) {
    this.weekLabel = page.getByText(/^Vecka \d+ · /)
    this.previousWeek = page.getByRole('button', { name: '← Föregående' })
    this.nextWeek = page.getByRole('button', { name: 'Nästa →' })
    this.todayButton = page.getByRole('button', { name: 'Idag' })
    this.newBlockButton = page.getByRole('button', { name: '+ Nytt block' })
    this.dialog = page.getByRole('dialog')
    this.blocks = page.getByTestId('planner-block')
    this.toast = page.getByText('Uppgift skapad')
  }

  async goto() {
    await this.page.goto('/planner')
    await expect(
      this.page.getByRole('heading', { name: 'Planering' }),
    ).toBeVisible()
    await expect(this.column('2026-01-05')).toBeVisible()
  }

  column(date: string): Locator {
    return this.page.locator(`[data-date="${date}"]`)
  }

  block(title: string): Locator {
    return this.blocks.filter({ hasText: title })
  }

  get modal() {
    const dialog = this.dialog
    return {
      title: dialog.getByPlaceholder('Rubrik'),
      date: dialog.getByLabel('Datum'),
      start: dialog.getByLabel('Starttid'),
      end: dialog.getByLabel('Sluttid'),
      notes: dialog.getByLabel('Anteckningar (markdown)'),
      color: (name: string) =>
        dialog.getByRole('button', { name: `Välj färg ${name}` }),
      save: dialog.getByRole('button', { name: /Spara/ }),
      cancel: dialog.getByRole('button', { name: 'Avbryt' }),
      close: dialog.getByRole('button', { name: 'Stäng' }),
    }
  }
}
