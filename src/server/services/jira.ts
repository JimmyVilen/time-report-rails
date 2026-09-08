export function extractIssueKey(
  jiraUrl: string | null | undefined,
): string | null {
  if (!jiraUrl) return null
  try {
    const path = new URL(jiraUrl).pathname.replace(/\/$/, '')
    return path.split('/').at(-1) || null
  } catch {
    return null
  }
}

export function extractAdfText(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  if (Array.isArray(value))
    return value
      .map(
        (child) => `${extractAdfText(child)}${isParagraph(child) ? '\n' : ''}`,
      )
      .join('')
      .trim()
  const record = value as Record<string, unknown>
  if (record['type'] === 'text' && typeof record['text'] === 'string')
    return record['text']
  return extractAdfText(record['content'])
}

function isParagraph(value: unknown): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>)['type'] === 'paragraph'
  )
}

export function formatWorklogDate(value: Date): string {
  return `${value.toISOString().slice(0, 23)}+0000`
}

export class JiraError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }

  // The status to answer our own client with. A 401 from Jira means the
  // user's stored Jira credentials are wrong, not that their app session is
  // invalid, and the UI treats any 401 as a lost session.
  get responseStatus(): number {
    return this.status === 401 ? 400 : this.status
  }
}

export class JiraClient {
  private headers(email: string, token: string) {
    return {
      authorization: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`,
      accept: 'application/json',
      'content-type': 'application/json',
    }
  }
  async fetchIssue(baseUrl: string, email: string, token: string, key: string) {
    const response = await fetch(
      `${baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,description`,
      { headers: this.headers(email, token) },
    )
    ensureSuccess(response, key)
    const body = (await response.json()) as {
      fields: { summary?: string; description?: unknown }
    }
    return {
      summary: body.fields.summary ?? '',
      description: extractAdfText(body.fields.description),
    }
  }
  async createWorklog(
    baseUrl: string,
    email: string,
    token: string,
    key: string,
    seconds: number,
    started: Date,
    comment: string | null,
  ) {
    const body: Record<string, unknown> = {
      timeSpentSeconds: seconds,
      started: formatWorklogDate(started),
    }
    if (comment)
      body['comment'] = {
        type: 'doc',
        version: 1,
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: comment }] },
        ],
      }
    const response = await fetch(
      `${baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${encodeURIComponent(key)}/worklog`,
      {
        method: 'POST',
        headers: this.headers(email, token),
        body: JSON.stringify(body),
      },
    )
    ensureSuccess(response, key)
    return ((await response.json()) as { id: string }).id
  }
  async deleteWorklog(
    baseUrl: string,
    email: string,
    token: string,
    key: string,
    id: string,
  ) {
    const response = await fetch(
      `${baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${encodeURIComponent(key)}/worklog/${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: this.headers(email, token) },
    )
    if (response.status !== 404) ensureSuccess(response, key)
  }
}

function ensureSuccess(response: Response, key: string): void {
  if (response.ok) return
  const message =
    response.status === 401
      ? 'Jira authentication failed – check your email and API token'
      : response.status === 403
        ? `Not authorized to access issue ${key}`
        : response.status === 404
          ? `Issue ${key} not found or inaccessible`
          : response.status >= 500
            ? 'Jira is unavailable, try again later'
            : `Jira returned ${String(response.status)}`
  throw new JiraError(message, response.status)
}
