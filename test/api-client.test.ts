import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api/client'

describe('api client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns undefined for an empty body without a Content-Length header', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    )
    await expect(api.delete('/api/time-entries/1')).resolves.toBeUndefined()
  })

  it('returns undefined for a 204 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    )
    await expect(api.delete('/api/tags/1')).resolves.toBeUndefined()
  })

  it('parses a JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ id: 7 })),
    )
    await expect(
      api.get<{ id: number }>('/api/time-entries/7'),
    ).resolves.toEqual({ id: 7 })
  })

  it('throws ApiError with the server message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'Nope' }, { status: 400 })),
    )
    await expect(api.post('/api/time-entries', {})).rejects.toMatchObject({
      message: 'Nope',
      status: 400,
    })
  })
})
