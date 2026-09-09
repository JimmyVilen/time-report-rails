import { defineConfig, devices } from '@playwright/test'
import { baseUrls, ports, repoRoot, TIMEZONE } from './env'

const isCI = !!process.env['CI']
const databaseUrl = process.env['E2E_DATABASE_URL']
const setupDatabaseUrl = process.env['E2E_SETUP_DATABASE_URL']
if (!databaseUrl || !setupDatabaseUrl)
  throw new Error(
    'E2E_DATABASE_URL and E2E_SETUP_DATABASE_URL are required (copy .env.e2e.example to .env.e2e)',
  )

// The production build is what gets deployed, so that is what the suite runs
// against. Set E2E_SKIP_BUILD=1 while iterating locally to reuse dist/.
const buildStep = process.env['E2E_SKIP_BUILD'] ? '' : 'npm run build && '

function server(port: number, database: string) {
  return {
    command: `${buildStep}node serve.js`,
    url: `http://localhost:${String(port)}/health`,
    cwd: repoRoot,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    stdout: 'ignore' as const,
    stderr: 'pipe' as const,
    env: {
      PORT: String(port),
      DATABASE_URL: database,
      BETTER_AUTH_URL: `http://localhost:${String(port)}`,
      BETTER_AUTH_SECRET: 'playwright-e2e-secret-with-at-least-32-characters',
      NODE_ENV: 'test',
      TZ: 'UTC',
    },
  }
}

export default defineConfig({
  testDir: './specs',
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  ...(isCI ? { workers: 4 } : {}),
  reporter: isCI
    ? [
        ['github'],
        ['html', { open: 'never', outputFolder: '../playwright-report' }],
      ]
    : [
        ['list'],
        ['html', { open: 'never', outputFolder: '../playwright-report' }],
      ],
  outputDir: '../test-results',
  timeout: 30_000,
  expect: { timeout: 7_500 },
  use: {
    baseURL: baseUrls.seeded,
    locale: 'sv-SE',
    timezoneId: TIMEZONE,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: [
    server(ports.seeded, databaseUrl),
    server(ports.empty, setupDatabaseUrl),
  ],
  projects: [
    {
      // First-run flow against the database that only has the schema.
      name: 'setup',
      testDir: './specs/setup',
      use: { ...devices['Desktop Chrome'], baseURL: baseUrls.empty },
    },
    {
      name: 'chromium',
      testDir: './specs',
      testIgnore: ['**/setup/**', '**/mobile/**'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      testDir: './specs/mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
})
