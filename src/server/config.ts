import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z
    .url()
    .refine(
      (url) => url.startsWith('postgres://') || url.startsWith('postgresql://'),
      'Must be a PostgreSQL URL',
    ),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  NODE_ENV: z.enum(['development', 'test', 'production']),
  // Only the standalone Node server binds a port. Serverless platforms route to
  // the function directly and set no PORT, so this must not be required there.
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
})

export type Config = z.infer<typeof schema> & {
  /** Extra origins Better Auth accepts, beyond `BETTER_AUTH_URL`. */
  trustedOrigins: string[]
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): Config {
  const result = schema.safeParse({
    ...environment,
    BETTER_AUTH_URL: resolveAuthUrl(environment),
  })
  if (!result.success) {
    const details = z.flattenError(result.error).fieldErrors
    throw new Error(`Invalid environment: ${JSON.stringify(details)}`)
  }
  return {
    ...result.data,
    trustedOrigins: resolveTrustedOrigins(environment, result.data),
  }
}

// Better Auth validates the request Origin against its base URL, so on Vercel
// the value has to follow the deployment rather than come from a fixed variable:
// every preview gets its own hostname. A configured BETTER_AUTH_URL still wins
// off-Vercel and in production, where the domain is stable and may be custom.
function resolveAuthUrl(environment: NodeJS.ProcessEnv): string | undefined {
  if (environment['VERCEL_ENV'] === 'preview')
    return httpsUrl(environment['VERCEL_URL'])
  return (
    environment['BETTER_AUTH_URL'] ??
    httpsUrl(environment['VERCEL_PROJECT_PRODUCTION_URL'])
  )
}

// A preview is reachable both on its immutable deployment URL and on the branch
// alias; production answers on the deployment URL too. Trusting all of them
// keeps sign-in working whichever one the browser happens to be on.
function resolveTrustedOrigins(
  environment: NodeJS.ProcessEnv,
  config: z.infer<typeof schema>,
): string[] {
  const candidates = [
    config.BETTER_AUTH_URL,
    httpsUrl(environment['VERCEL_URL']),
    httpsUrl(environment['VERCEL_BRANCH_URL']),
    httpsUrl(environment['VERCEL_PROJECT_PRODUCTION_URL']),
  ]
  return [...new Set(candidates.filter((value) => value !== undefined))]
}

function httpsUrl(host: string | undefined): string | undefined {
  return host ? `https://${host}` : undefined
}

export function requireTestDatabaseUrl(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  if (environment['NODE_ENV'] !== 'test')
    throw new Error('Database test tools require NODE_ENV=test')
  const value = environment['TEST_DATABASE_URL']
  if (!value)
    throw new Error(
      'TEST_DATABASE_URL is required; DATABASE_URL is never used by test tools',
    )
  return z.url().parse(value)
}
