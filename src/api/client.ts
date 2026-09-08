type FetchOptions = RequestInit & { json?: unknown }

async function request<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { json, ...init } = opts
  if (json !== undefined) {
    init.body = JSON.stringify(json)
    init.headers = { 'Content-Type': 'application/json', ...init.headers }
  }
  const res = await fetch(path, { credentials: 'include', ...init })

  if (res.status === 401) {
    throw new ApiError('Unauthorized', 401)
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.error ?? `HTTP ${res.status}`, res.status)
  }

  // Some endpoints (delete, reorder) reply with an empty body. The
  // Content-Length header is not guaranteed to be present, so read the
  // text and only parse it when there is something to parse.
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, json?: unknown) => request<T>(path, { method: 'POST', json }),
  put: <T>(path: string, json?: unknown) => request<T>(path, { method: 'PUT', json }),
  patch: <T>(path: string, json?: unknown) => request<T>(path, { method: 'PATCH', json }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
