import { expect, type Locator, type Page } from '@playwright/test'

export class ExportPage {
  constructor(readonly page: Page) {}

  async goto() {
    await this.page.goto('/export')
    await expect(
      this.page.getByRole('heading', { name: 'Exportera' }),
    ).toBeVisible()
  }

  section(name: 'Tidsrapport' | 'Noteringar') {
    const root: Locator = this.page.getByRole('region', { name })
    return {
      root,
      from: root.getByLabel('Från'),
      to: root.getByLabel('Till'),
      download: root.getByRole('button', { name: 'Ladda ner CSV' }),
    }
  }
}
