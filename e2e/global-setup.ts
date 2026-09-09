import { resetE2eDatabases } from '../scripts/db/reset-e2e'
import './env'

/**
 * Runs once per `playwright test` invocation, before any worker starts: both
 * databases are created if missing, dropped, migrated and (for the main one)
 * seeded, so every run starts from the same known state.
 */
export default async function globalSetup(): Promise<void> {
  await resetE2eDatabases()
}
