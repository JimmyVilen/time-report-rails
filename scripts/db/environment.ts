import { z } from 'zod'

export function productionDatabaseUrl(): string {
  const value = process.env['DATABASE_URL']
  if (!value) throw new Error('DATABASE_URL is required')
  return validatePostgresUrl(value)
}

export function testDatabaseUrl(): string {
  return guardedDatabaseUrl('TEST_DATABASE_URL')
}

/**
 * The Playwright suite uses two databases: one that is reset and seeded before
 * every run, and one that is only migrated so the first-run `/setup` flow can be
 * exercised against an empty schema.
 */
export function e2eDatabaseUrls(): { seeded: string; empty: string } {
  return {
    seeded: guardedDatabaseUrl('E2E_DATABASE_URL'),
    empty: guardedDatabaseUrl('E2E_SETUP_DATABASE_URL'),
  }
}

function guardedDatabaseUrl(variable: string): string {
  if (process.env['NODE_ENV'] !== 'test')
    throw new Error('Refusing: NODE_ENV must equal test')
  const value = process.env[variable]
  if (!value)
    throw new Error(
      `${variable} is required; test scripts never fall back to DATABASE_URL`,
    )
  return validateTestDatabaseUrl(value)
}

/** Accepts only local hosts and database names that are explicitly marked as test. */
export function validateTestDatabaseUrl(value: string): string {
  const url = new URL(validatePostgresUrl(value))
  const host = url.hostname.toLowerCase()
  const database = url.pathname.slice(1).toLowerCase()
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(host))
    throw new Error(`Refusing non-local test database host: ${host}`)
  if (!/(^|[_-])(test|testing)([_-]|$)/.test(database))
    throw new Error(
      `Refusing database without an explicit test name: ${database}`,
    )
  if (host.endsWith('.supabase.co') || /prod|production|staging/.test(database))
    throw new Error('Refusing a production, staging, or Supabase target')
  return url.toString()
}

function validatePostgresUrl(value: string): string {
  const parsed = z.url().parse(value)
  if (!/^postgres(ql)?:/.test(parsed))
    throw new Error('A PostgreSQL URL is required')
  return parsed
}
