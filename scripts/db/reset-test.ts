import { resetDatabase } from './reset'
import { testDatabaseUrl } from './environment'

await resetDatabase(testDatabaseUrl(), { seed: true })
console.info('Test database reset, migrated, and seeded')
