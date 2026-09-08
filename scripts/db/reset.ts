import postgres from 'postgres'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { fileURLToPath } from 'node:url'
import { createDatabase } from '../../src/server/db/client'
import { seedTest } from './seed-test'

const migrationsFolder = fileURLToPath(
  new URL('../../drizzle', import.meta.url),
)

/**
 * Drops everything in the target database, re-applies the reviewed migrations
 * and optionally loads the deterministic test fixture. Callers must pass a URL
 * that already went through the test-database guard in ./environment.
 */
export async function resetDatabase(
  url: string,
  options: { seed: boolean },
): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => undefined })
  try {
    await sql.unsafe('drop schema public cascade')
    await sql.unsafe('drop schema if exists drizzle cascade')
    await sql.unsafe('create schema public')
  } finally {
    await sql.end()
  }

  const database = createDatabase(url, 1)
  try {
    await migrate(database.db, { migrationsFolder })
    if (options.seed) await seedTest(database.db)
  } finally {
    await database.client.end()
  }
}

/**
 * Creates the database named in `url` when it does not exist yet, connecting
 * through the maintenance database on the same server. Idempotent.
 */
export async function ensureDatabase(url: string): Promise<boolean> {
  const target = new URL(url)
  const name = target.pathname.slice(1)
  if (!/^[a-z0-9_]+$/.test(name))
    throw new Error(`Unsupported database name: ${name}`)
  const maintenance = new URL(url)
  maintenance.pathname = '/postgres'
  const sql = postgres(maintenance.toString(), { max: 1 })
  try {
    const rows = await sql`select 1 from pg_database where datname = ${name}`
    if (rows.length > 0) return false
    await sql.unsafe(`create database "${name}"`)
    return true
  } finally {
    await sql.end()
  }
}
