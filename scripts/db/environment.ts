import { z } from 'zod'

// Migrations take DDL locks and run in a single session, so they want a direct
// or session-mode connection. The app itself may be pointed at a transaction
// -mode pooler, which is why MIGRATION_DATABASE_URL takes precedence when set.
export function productionDatabaseUrl(): string {
  const value =
    process.env['MIGRATION_DATABASE_URL'] ?? process.env['DATABASE_URL']
  if (!value)
    throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL is required')
  return validatePostgresUrl(value)
}

export function testDatabaseUrl(): string {
  if (process.env['NODE_ENV'] !== 'test')
    throw new Error('Refusing: NODE_ENV must equal test')
  const value = process.env['TEST_DATABASE_URL']
  if (!value)
    throw new Error(
      'TEST_DATABASE_URL is required; test scripts never fall back to DATABASE_URL',
    )
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
