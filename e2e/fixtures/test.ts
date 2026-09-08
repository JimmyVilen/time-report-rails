import { test as base, expect } from '@playwright/test'
import { Api } from './api'
import { FIXED_INSTANT, seededUsers } from '../env'

export interface TestUser {
  id: number
  email: string
  password: string
}

interface Fixtures {
  /** API client sharing the browser context's cookie jar. */
  api: Api
  /** A freshly registered, logged-in user unique to this test. */
  user: TestUser
  /** The seeded user Alice, logged in. Use for read-only checks of seed data. */
  alice: TestUser
}

let sequence = 0

export const test = base.extend<Fixtures>({
  // Every page sees the same wall clock so that "today", week labels and
  // default export ranges are deterministic. Timers keep running for real.
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(FIXED_INSTANT)
    await use(page)
  },
  api: async ({ page }, use) => {
    await use(new Api(page.request))
  },
  user: async ({ api }, use, testInfo) => {
    sequence += 1
    const email = `e2e-${String(testInfo.workerIndex)}-${String(process.pid)}-${String(sequence)}-${Date.now().toString(36)}@example.test`
    const password = 'E2ePassword!1'
    const created = await api.register(email, password)
    await use({ id: created.id, email, password })
  },
  alice: async ({ api }, use) => {
    const me = await api.login(
      seededUsers.alice.email,
      seededUsers.alice.password,
    )
    await use({ id: me.id, ...seededUsers.alice })
  },
})

export { expect }
