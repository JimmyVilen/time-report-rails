import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Shared constants for the Playwright suite. The suite reads `.env.e2e` from
 * the repository root when present (local runs); CI passes the same variables
 * through the workflow environment instead.
 */
export const repoRoot = resolve(import.meta.dirname, '..')

const envFile = resolve(repoRoot, '.env.e2e')
if (existsSync(envFile) && !process.env['E2E_DATABASE_URL']) {
  process.loadEnvFile(envFile)
}
process.env['NODE_ENV'] = 'test'

export const ports = { seeded: 5174, empty: 5175 } as const
export const baseUrls = {
  seeded:
    process.env['E2E_BASE_URL'] ?? `http://localhost:${String(ports.seeded)}`,
  empty:
    process.env['E2E_SETUP_BASE_URL'] ??
    `http://localhost:${String(ports.empty)}`,
} as const

/** The seed fixture is anchored on this Monday (ISO week 2 of 2026). */
export const FIXED_DATE = '2026-01-05'
export const FIXED_INSTANT = new Date('2026-01-05T09:00:00+01:00')
export const TIMEZONE = 'Europe/Stockholm'

export const seededUsers = {
  admin: { email: 'admin@example.test', password: 'TestPassword!1' },
  alice: { email: 'alice@example.test', password: 'TestPassword!1' },
  bob: { email: 'bob@example.test', password: 'TestPassword!1' },
} as const
