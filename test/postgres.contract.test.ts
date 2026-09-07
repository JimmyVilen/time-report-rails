import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/server/app'
import { createAuth } from '../src/server/auth/auth'
import type { Config } from '../src/server/config'
import { createDatabase } from '../src/server/db/client'

const databaseUrl = process.env['TEST_DATABASE_URL']
const suite = databaseUrl ? describe : describe.skip
let close: (() => Promise<void>) | undefined
let app: ReturnType<typeof createApp>
let cookie = ''

suite('PostgreSQL contracts', () => {
  beforeAll(async () => {
    const url = databaseUrl ?? ''
    const database = createDatabase(url, 2)
    close = async () => database.client.end()
    const config: Config = {
      DATABASE_URL: url,
      BETTER_AUTH_SECRET: 'test-contract-secret-with-at-least-32-characters',
      BETTER_AUTH_URL: 'http://localhost',
      NODE_ENV: 'test',
      PORT: 3000,
      trustedOrigins: [],
    }
    const auth = createAuth(database.db, config)
    app = createApp({ db: database.db, auth })
    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@example.test',
        password: 'TestPassword!1',
      }),
    })
    expect(response.status).toBe(200)
    cookie = response.headers.get('set-cookie')?.split(';')[0] ?? ''
  })
  afterAll(async () => close?.())

  it('returns the numeric legacy user contract', async () => {
    const response = await app.request('/api/auth/me', { headers: { cookie } })
    expect(await response.json()).toMatchObject({
      id: 2,
      email: 'alice@example.test',
      jiraApiTokenSet: false,
    })
  })
  it('loads owned task relations and totals', async () => {
    const response = await app.request('/api/tasks', { headers: { cookie } })
    expect(await response.json()).toEqual([
      expect.objectContaining({
        id: 1,
        projectName: 'Client',
        totalMinutes: 60,
      }),
    ])
  })
  it('loads owned projects and totals', async () => {
    const response = await app.request('/api/projects', { headers: { cookie } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      expect.objectContaining({
        name: 'Client',
        taskCount: 1,
        totalMinutes: 60,
      }),
    ])
  })
  it("cannot delete another user's tag", async () => {
    expect(
      (
        await app.request('/api/tags/2', {
          method: 'DELETE',
          headers: { cookie },
        })
      ).status,
    ).toBe(404)
  })
  it('keeps unknown API paths as JSON 404', async () => {
    const response = await app.request('/api/not-real', { headers: { cookie } })
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
  })
})
