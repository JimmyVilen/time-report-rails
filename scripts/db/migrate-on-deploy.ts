// Build-time migration guard for hosted deployments.
//
// Vercel runs this ahead of `vite build` (see the `vercel-build` script). It
// applies migrations only for the production deployment, so a preview build can
// never reshape the production database. Point previews at their own database
// and set MIGRATE_ON_DEPLOY=true on that environment to migrate it too.
const environment = process.env['VERCEL_ENV'] ?? 'local'
const optedIn = process.env['MIGRATE_ON_DEPLOY'] === 'true'

if (environment === 'production' || optedIn) {
  console.info(`Running migrations for deployment environment: ${environment}`)
  await import('./migrate')
} else {
  console.info(`Skipping migrations for deployment environment: ${environment}`)
}
