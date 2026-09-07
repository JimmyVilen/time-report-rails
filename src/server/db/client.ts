import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// A long-lived Node process owns one pool and can afford to keep connections
// open. Serverless is the opposite: every concurrent function instance holds its
// own pool, so a large `max` multiplies into far more backend connections than
// PostgreSQL (or a pooler) will accept. `prepare: false` is required either way
// for a transaction-mode pooler, which does not keep prepared statements.
export function defaultPoolSize(
  environment: NodeJS.ProcessEnv = process.env,
): number {
  return environment['VERCEL'] ? 1 : 10
}

export function createDatabase(url: string, max = defaultPoolSize()) {
  const client = postgres(url, {
    max,
    prepare: false,
    // Drop idle connections quickly so a frozen function instance stops holding
    // a slot, and fail fast rather than hanging a request when the pool is full.
    idle_timeout: 20,
    connect_timeout: 10,
  })
  return { db: drizzle(client, { schema }), client }
}

export type Database = ReturnType<typeof createDatabase>['db']
