import { expect, type APIRequestContext } from '@playwright/test'

/**
 * Thin typed wrapper around the app's REST API for arranging test data. It
 * rides on the browser context's request object, so the session cookie set by
 * `register`/`login` is shared with the page automatically.
 */
export class Api {
  constructor(private readonly request: APIRequestContext) {}

  private async call<T>(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
    data?: unknown,
  ): Promise<T> {
    const response = await this.request[method](
      path,
      data === undefined ? {} : { data },
    )
    expect(
      response.ok(),
      `${method.toUpperCase()} ${path} -> ${String(response.status())} ${await response.text()}`,
    ).toBe(true)
    const text = await response.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  register(email: string, password: string) {
    return this.call<{ id: number; email: string }>(
      'post',
      '/api/auth/register',
      {
        email,
        password,
        passwordConfirmation: password,
      },
    )
  }
  login(email: string, password: string) {
    return this.call<{ id: number; email: string; name: string | null }>(
      'post',
      '/api/auth/login',
      { email, password },
    )
  }
  logout() {
    return this.call<void>('post', '/api/auth/logout')
  }
  me() {
    return this.call<{
      id: number
      email: string
      name: string | null
      isAdmin: boolean
      jiraApiTokenSet: boolean
      jiraUrl: string | null
      jiraEmail: string | null
    }>('get', '/api/auth/me')
  }

  createProject(name: string, description?: string) {
    return this.call<{ id: number; name: string; isArchived: boolean }>(
      'post',
      '/api/projects',
      { name, description },
    )
  }
  archiveProject(id: number) {
    return this.call<unknown>('patch', `/api/projects/${String(id)}/archive`)
  }
  listProjects() {
    return this.call<
      {
        id: number
        name: string
        isArchived: boolean
        taskCount: number
        totalMinutes: number
      }[]
    >('get', '/api/projects')
  }

  createTag(name: string, color?: string | null) {
    return this.call<{ id: number; name: string; color: string | null }>(
      'post',
      '/api/tags',
      { name, color },
    )
  }
  listTags() {
    return this.call<{ id: number; name: string; color: string | null }[]>(
      'get',
      '/api/tags',
    )
  }

  createTask(data: {
    title: string
    description?: string
    jiraUrl?: string
    projectId?: number
    defaultTagIds?: number[]
  }) {
    return this.call<{
      id: number
      title: string
      isArchived: boolean
      isFavorite: boolean
      jiraKey: string | null
    }>('post', '/api/tasks', data)
  }
  listTasks(query: { q?: string; includeArchived?: boolean } = {}) {
    const params = new URLSearchParams()
    if (query.q) params.set('q', query.q)
    if (query.includeArchived) params.set('includeArchived', 'true')
    const suffix = params.size ? `?${params.toString()}` : ''
    return this.call<
      {
        id: number
        title: string
        isArchived: boolean
        isFavorite: boolean
        timeEntryCount: number
        totalMinutes: number
        lastUsedAt: string | null
      }[]
    >('get', `/api/tasks${suffix}`)
  }

  createEntry(data: {
    taskId: number
    date: string
    description?: string
    startTime?: string
    endTime?: string
    durationMinutes?: number
    durationString?: string
    tagIds?: number[]
  }) {
    return this.call<TimeEntryDto>('post', '/api/time-entries', data)
  }
  listEntries(date: string) {
    return this.call<TimeEntryDto[]>('get', `/api/time-entries?date=${date}`)
  }
  weeklySummary(date: string) {
    return this.call<{
      weekNumber: number
      totalMinutes: number
      days: { date: string; totalMinutes: number }[]
    }>('get', `/api/time-entries/weekly-summary?date=${date}`)
  }

  upsertNote(date: string, content: string) {
    return this.call<{ id: number; date: string; content: string }>(
      'put',
      `/api/daily-notes/${date}`,
      { content },
    )
  }
  getNote(date: string) {
    return this.call<{ id: number; date: string; content: string } | null>(
      'get',
      `/api/daily-notes/${date}`,
    )
  }

  createBlock(data: {
    title: string
    date: string
    startTime?: string | null
    endTime?: string | null
    color?: string | null
    notes?: string | null
  }) {
    return this.call<PlannerBlockDto>('post', '/api/planner-blocks', data)
  }
  listBlocks(weekStart: string) {
    return this.call<PlannerBlockDto[]>(
      'get',
      `/api/planner-blocks?weekStart=${weekStart}`,
    )
  }

  updateProfile(data: Record<string, string | undefined>) {
    return this.call<unknown>('patch', '/api/profile', data)
  }
}

export interface TimeEntryDto {
  id: number
  date: string
  description: string | null
  position: number
  taskId: number
  taskTitle: string
  startTime: string | null
  endTime: string | null
  durationMinutes: number | null
  effectiveDurationMinutes: number
  tags: { id: number; name: string }[]
}

export interface PlannerBlockDto {
  id: number
  title: string
  date: string
  startTime: string | null
  endTime: string | null
  color: string | null
  notes: string | null
}
