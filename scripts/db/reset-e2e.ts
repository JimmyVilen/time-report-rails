import { e2eDatabaseUrls } from './environment'
import { ensureDatabase, resetDatabase } from './reset'

/**
 * Prepares both Playwright databases: the seeded one that most specs use and
 * the empty one that only the first-run setup flow talks to. Safe to run at
 * any time; it is also what Playwright's global setup calls before a run.
 */
export async function resetE2eDatabases(): Promise<void> {
  const urls = e2eDatabaseUrls()
  for (const [label, url] of Object.entries(urls)) {
    if (await ensureDatabase(url)) console.info(`Created ${label} e2e database`)
  }
  await resetDatabase(urls.seeded, { seed: true })
  await resetDatabase(urls.empty, { seed: false })
  console.info('E2E databases reset (seeded + empty)')
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  await resetE2eDatabases()
}
