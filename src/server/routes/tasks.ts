import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../auth/middleware'
import { idParameter, iso } from '../contracts/common'
import type { Database } from '../db/client'
import {
  projects,
  tags,
  taskDefaultTags,
  tasks,
  timeEntries,
  users,
} from '../db/schema'
import { extractIssueKey, JiraClient, JiraError } from '../services/jira'

const bodySchema = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
  jiraUrl: z.string().nullable().optional(),
  projectId: z.number().int().positive().nullable().optional(),
  defaultTagIds: z.array(z.number().int().positive()).optional(),
})
const selection = {
  id: tasks.id,
  userId: tasks.userId,
  projectId: tasks.projectId,
  title: tasks.title,
  description: tasks.description,
  isArchived: tasks.isArchived,
  isFavorite: tasks.isFavorite,
  jiraUrl: tasks.jiraUrl,
  lastUsedAt: tasks.lastUsedAt,
  deletedAt: tasks.deletedAt,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
  projectName: sql<
    string | null
  >`(select name from projects where id=${tasks.projectId})`,
  timeEntryCount: sql<number>`(select count(*)::int from time_entries where task_id=${tasks.id})`,
  totalMinutes: sql<number>`coalesce((select sum(case when start_time is not null and end_time is not null then round(extract(epoch from (end_time-start_time))/60) else coalesce(duration_minutes,0) end)::int from time_entries where task_id=${tasks.id}),0)`,
}
type TaskRow = typeof tasks.$inferSelect & {
  projectName: string | null
  timeEntryCount: number
  totalMinutes: number
}

export function taskRoutes(db: Database, jira = new JiraClient()) {
  const app = new Hono<AppEnv>()
  app.get('/jira-details', async (c) => {
    const url = c.req.query('jira_url')
    const key = extractIssueKey(url)
    if (!key) return c.json({ error: 'Invalid Jira URL' }, 400)
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, c.get('currentUserId')))
    if (!user?.jiraUrl || !user.jiraEmail || !user.jiraApiToken)
      return c.json({ error: 'Jira credentials not configured' }, 400)
    try {
      const issue = await jira.fetchIssue(
        user.jiraUrl,
        user.jiraEmail,
        user.jiraApiToken,
        key,
      )
      return c.json({ ...issue, issueKey: key })
    } catch (error) {
      if (error instanceof JiraError)
        return c.json({ error: error.message }, error.responseStatus as 400)
      throw error
    }
  })
  app.get('/', async (c) => {
    const uid = c.get('currentUserId')
    const q = c.req.query('q')?.trim()
    const includeArchived = c.req.query('includeArchived') === 'true'
    const condition = and(
      eq(tasks.userId, uid),
      includeArchived ? undefined : eq(tasks.isArchived, false),
      q
        ? or(
            ilike(tasks.title, `%${q}%`),
            ilike(tasks.description, `%${q}%`),
            ilike(tasks.jiraUrl, `%${q}%`),
            sql`exists(select 1 from projects p where p.id=${tasks.projectId} and p.name ilike ${`%${q}%`})`,
          )
        : undefined,
    )
    const rows = await db
      .select(selection)
      .from(tasks)
      .where(condition)
      .orderBy(
        desc(tasks.isFavorite),
        desc(tasks.lastUsedAt),
        desc(tasks.createdAt),
      )
    return c.json(
      await Promise.all(rows.map((row) => taskDto(db, row as TaskRow))),
    )
  })
  app.get('/:id', async (c) => {
    const row = await owned(db, c.get('currentUserId'), c.req.param('id'))
    return row ? c.json(await taskDto(db, row)) : c.body(null, 404)
  })
  app.post('/', async (c) => saveTask(c, db))
  app.put('/:id', async (c) => {
    const id = idParameter.safeParse(c.req.param('id'))
    return id.success
      ? saveTask(c, db, id.data)
      : c.json({ error: 'Invalid request' }, 400)
  })
  app.delete('/:id', async (c) => {
    const row = await owned(db, c.get('currentUserId'), c.req.param('id'))
    if (!row) return c.body(null, 404)
    const hasEntries = await db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.userId, c.get('currentUserId')),
          eq(timeEntries.taskId, row.id),
        ),
      )
      .limit(1)
    if (hasEntries.length) {
      await db
        .update(tasks)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(
          and(eq(tasks.id, row.id), eq(tasks.userId, c.get('currentUserId'))),
        )
      return c.json({ archived: true })
    }
    await db
      .delete(tasks)
      .where(
        and(eq(tasks.id, row.id), eq(tasks.userId, c.get('currentUserId'))),
      )
    return c.json({ archived: false })
  })
  app.patch('/:id/favorite', async (c) => toggle(c, db, 'favorite'))
  app.patch('/:id/restore', async (c) => toggle(c, db, 'restore'))
  return app
}

async function owned(db: Database, uid: number, rawId: string) {
  const id = idParameter.safeParse(rawId)
  if (!id.success) return null
  const [row] = await db
    .select(selection)
    .from(tasks)
    .where(and(eq(tasks.id, id.data), eq(tasks.userId, uid)))
    .limit(1)
  return row as TaskRow | undefined
}
async function taskDto(db: Database, row: TaskRow) {
  const defaults = await db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
    })
    .from(taskDefaultTags)
    .innerJoin(
      tags,
      and(eq(tags.id, taskDefaultTags.tagId), eq(tags.userId, row.userId)),
    )
    .where(eq(taskDefaultTags.taskId, row.id))
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    jiraUrl: row.jiraUrl,
    jiraKey: extractIssueKey(row.jiraUrl),
    projectId: row.projectId,
    projectName: row.projectName,
    isFavorite: row.isFavorite,
    isArchived: row.isArchived,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    timeEntryCount: row.timeEntryCount,
    totalMinutes: row.totalMinutes,
    defaultTags: defaults,
  }
}

async function saveTask(
  c: import('hono').Context<AppEnv>,
  db: Database,
  id?: number,
) {
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success || !parsed.data.title.trim())
    return c.json({ error: 'Invalid request' }, 400)
  const uid = c.get('currentUserId')
  if (id && !(await owned(db, uid, String(id)))) return c.body(null, 404)
  if (parsed.data.projectId) {
    const project = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(eq(projects.id, parsed.data.projectId), eq(projects.userId, uid)),
      )
      .limit(1)
    if (!project.length) return c.json({ error: 'Project not found' }, 400)
  }
  const tagIds = [...new Set(parsed.data.defaultTagIds ?? [])]
  if (tagIds.length) {
    const ownedTags = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.userId, uid), inArray(tags.id, tagIds)))
    if (ownedTags.length !== tagIds.length)
      return c.json({ error: 'Tag not found' }, 400)
  }
  let taskId = id
  await db.transaction(async (tx) => {
    const values = {
      title: parsed.data.title.trim(),
      description: parsed.data.description?.trim() || null,
      jiraUrl: parsed.data.jiraUrl?.trim() || null,
      projectId: parsed.data.projectId ?? null,
      updatedAt: new Date(),
    }
    if (id)
      await tx
        .update(tasks)
        .set(values)
        .where(and(eq(tasks.id, id), eq(tasks.userId, uid)))
    else {
      const [created] = await tx
        .insert(tasks)
        .values({ ...values, userId: uid })
        .returning({ id: tasks.id })
      taskId = created?.id
    }
    if (!taskId) throw new Error('Task insert returned no id')
    const savedTaskId = taskId
    if (parsed.data.defaultTagIds !== undefined) {
      await tx
        .delete(taskDefaultTags)
        .where(eq(taskDefaultTags.taskId, savedTaskId))
      if (tagIds.length)
        await tx
          .insert(taskDefaultTags)
          .values(tagIds.map((tagId) => ({ taskId: savedTaskId, tagId })))
    }
  })
  const row = await owned(db, uid, String(taskId))
  if (!row) throw new Error('Saved task not found')
  return c.json(await taskDto(db, row))
}
async function toggle(
  c: import('hono').Context<AppEnv>,
  db: Database,
  action: 'favorite' | 'restore',
) {
  const row = await owned(db, c.get('currentUserId'), c.req.param('id') ?? '')
  if (!row) return c.body(null, 404)
  const [updated] = await db
    .update(tasks)
    .set(
      action === 'favorite'
        ? { isFavorite: !row.isFavorite, updatedAt: new Date() }
        : { isArchived: false, updatedAt: new Date() },
    )
    .where(and(eq(tasks.id, row.id), eq(tasks.userId, c.get('currentUserId'))))
    .returning()
  const selected = await owned(db, c.get('currentUserId'), String(updated?.id))
  if (!selected) throw new Error('Updated task not found')
  return c.json(await taskDto(db, selected))
}
