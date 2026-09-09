import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../auth/middleware'
import {
  calendarDate,
  exportRange,
  idParameter,
  iso,
} from '../contracts/common'
import type { Database } from '../db/client'
import { tags, tasks, timeEntries, timeEntryTags, users } from '../db/schema'
import { csvEscape } from '../services/csv'
import { parseDuration } from '../services/duration'
import { extractIssueKey, JiraClient, JiraError } from '../services/jira'
import {
  parseTimeOnDate,
  resolveTimeEntry,
} from '../services/time-entry-resolver'

const baseBody = z.object({
  taskId: z.number().int().positive().optional(),
  date: calendarDate.optional(),
  description: z.string().nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  durationMinutes: z.number().int().nullable().optional(),
  durationString: z.string().nullable().optional(),
  tagIds: z.array(z.number().int().positive()).nullable().optional(),
  deleteJiraWorklog: z.boolean().optional(),
})
const createBody = baseBody.extend({
  taskId: z.number().int().positive(),
  date: calendarDate,
})
const selection = {
  id: timeEntries.id,
  userId: timeEntries.userId,
  taskId: timeEntries.taskId,
  date: timeEntries.date,
  description: timeEntries.description,
  startTime: timeEntries.startTime,
  endTime: timeEntries.endTime,
  durationMinutes: timeEntries.durationMinutes,
  position: timeEntries.position,
  jiraWorklogId: timeEntries.jiraWorklogId,
  pushedToSystem: timeEntries.pushedToSystem,
  pushedAt: timeEntries.pushedAt,
  createdAt: timeEntries.createdAt,
  updatedAt: timeEntries.updatedAt,
  taskTitle: sql<string>`(select title from tasks where id=${timeEntries.taskId})`,
  taskJiraUrl: sql<
    string | null
  >`(select jira_url from tasks where id=${timeEntries.taskId})`,
  projectId: sql<
    number | null
  >`(select project_id from tasks where id=${timeEntries.taskId})`,
  projectName: sql<
    string | null
  >`(select p.name from projects p join tasks t on t.project_id=p.id where t.id=${timeEntries.taskId})`,
}
type EntryRow = typeof timeEntries.$inferSelect & {
  taskTitle: string
  taskJiraUrl: string | null
  projectId: number | null
  projectName: string | null
}

export function timeEntryRoutes(db: Database, jira = new JiraClient()) {
  const app = new Hono<AppEnv>()
  app.get('/weekly-summary', async (c) => weeklySummary(c, db))
  app.get('/recent-description', async (c) => {
    const taskId = idParameter.safeParse(c.req.query('task_id'))
    if (!taskId.success) return c.json({ description: null })
    const [row] = await db
      .select({ description: timeEntries.description })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.userId, c.get('currentUserId')),
          eq(timeEntries.taskId, taskId.data),
          sql`${timeEntries.description} is not null and ${timeEntries.description} <> ''`,
        ),
      )
      .orderBy(desc(timeEntries.createdAt))
      .limit(1)
    return c.json({ description: row?.description ?? null })
  })
  app.get('/export', async (c) => exportEntries(c, db))
  app.get('/', async (c) => {
    const date = calendarDate.safeParse(c.req.query('date'))
    if (!date.success) return c.json({ error: 'Invalid date' }, 400)
    const rows = await db
      .select(selection)
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.userId, c.get('currentUserId')),
          eq(timeEntries.date, date.data),
        ),
      )
      .orderBy(asc(timeEntries.position))
    return c.json(
      await Promise.all(rows.map((row) => entryDto(db, row as EntryRow))),
    )
  })
  app.post('/reorder', async (c) => {
    const parsed = z
      .array(
        z.object({
          id: z.number().int().positive(),
          position: z.number().int(),
        }),
      )
      .safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
    const uid = c.get('currentUserId')
    await db.transaction(async (tx) => {
      for (const item of parsed.data)
        await tx
          .update(timeEntries)
          .set({ position: item.position })
          .where(and(eq(timeEntries.id, item.id), eq(timeEntries.userId, uid)))
    })
    return c.body(null, 200)
  })
  app.post('/', async (c) => {
    const parsed = createBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
    const error = await validateRelations(
      db,
      c.get('currentUserId'),
      parsed.data.taskId,
      parsed.data.tagIds,
    )
    if (error) return c.json({ error }, 400)
    let resolved
    try {
      resolved = resolve(parsed.data.date, parsed.data)
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : 'Invalid time' },
        400,
      )
    }
    const uid = c.get('currentUserId')
    let id: number | undefined
    await db.transaction(async (tx) => {
      await tx
        .update(timeEntries)
        .set({ position: sql`${timeEntries.position} + 1` })
        .where(
          and(
            eq(timeEntries.userId, uid),
            eq(timeEntries.date, parsed.data.date),
          ),
        )
      const [created] = await tx
        .insert(timeEntries)
        .values({
          userId: uid,
          taskId: parsed.data.taskId,
          date: parsed.data.date,
          description: parsed.data.description?.trim() || null,
          ...resolved,
          position: 0,
        })
        .returning({ id: timeEntries.id })
      id = created?.id
      if (!id) throw new Error('Entry insert returned no id')
      if (parsed.data.tagIds?.length)
        await tx.insert(timeEntryTags).values(
          [...new Set(parsed.data.tagIds)].map((tagId) => ({
            timeEntryId: id as number,
            tagId,
          })),
        )
      await tx
        .update(tasks)
        .set({ lastUsedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(tasks.id, parsed.data.taskId), eq(tasks.userId, uid)))
    })
    const row = await getOwned(db, uid, id)
    if (!row) throw new Error('Created entry not found')
    return c.json(await entryDto(db, row))
  })
  app.put('/:id', async (c) => updateEntry(c, db, jira))
  app.delete('/:id', async (c) => {
    const id = idParameter.safeParse(c.req.param('id'))
    if (!id.success) return c.body(null, 404)
    const rows = await db
      .delete(timeEntries)
      .where(
        and(
          eq(timeEntries.id, id.data),
          eq(timeEntries.userId, c.get('currentUserId')),
        ),
      )
      .returning({ id: timeEntries.id })
    return rows.length ? c.body(null, 200) : c.body(null, 404)
  })
  app.post('/:id/duplicate', async (c) => {
    const original = await getOwned(
      db,
      c.get('currentUserId'),
      idParameter.safeParse(c.req.param('id')).data,
    )
    if (!original) return c.body(null, 404)
    const oldTags = await db
      .select({ tagId: timeEntryTags.tagId })
      .from(timeEntryTags)
      .innerJoin(
        tags,
        and(eq(tags.id, timeEntryTags.tagId), eq(tags.userId, original.userId)),
      )
      .where(eq(timeEntryTags.timeEntryId, original.id))
    let id: number | undefined
    await db.transaction(async (tx) => {
      await tx
        .update(timeEntries)
        .set({ position: sql`${timeEntries.position} + 1` })
        .where(
          and(
            eq(timeEntries.userId, original.userId),
            eq(timeEntries.date, original.date),
            sql`${timeEntries.position} > ${original.position}`,
          ),
        )
      const [copy] = await tx
        .insert(timeEntries)
        .values({
          userId: original.userId,
          taskId: original.taskId,
          date: original.date,
          description: original.description,
          startTime: original.startTime,
          endTime: original.endTime,
          durationMinutes: original.durationMinutes,
          position: original.position + 1,
        })
        .returning({ id: timeEntries.id })
      id = copy?.id
      if (!id) throw new Error('Duplicate returned no id')
      if (oldTags.length)
        await tx.insert(timeEntryTags).values(
          oldTags.map((tag) => ({
            timeEntryId: id as number,
            tagId: tag.tagId,
          })),
        )
    })
    const row = await getOwned(db, original.userId, id)
    if (!row) throw new Error('Duplicate not found')
    return c.json(await entryDto(db, row))
  })
  app.post('/:id/push-to-jira', async (c) => pushToJira(c, db, jira))
  return app
}

function resolve(date: string, body: z.infer<typeof baseBody>) {
  const duration = body.durationMinutes ?? parseDuration(body.durationString)
  const value = resolveTimeEntry(
    date,
    parseTimeOnDate(date, body.startTime),
    parseTimeOnDate(date, body.endTime),
    duration,
  )
  return {
    startTime: value.startTime?.replace('T', ' ') ?? null,
    endTime: value.endTime?.replace('T', ' ') ?? null,
    durationMinutes: value.durationMinutes,
  }
}
async function validateRelations(
  db: Database,
  uid: number,
  taskId: number,
  tagIds: number[] | null | undefined,
) {
  const task = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, uid)))
    .limit(1)
  if (!task.length) return 'Task not found'
  const unique = [...new Set(tagIds ?? [])]
  if (unique.length) {
    const ownedTags = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.userId, uid), inArray(tags.id, unique)))
    if (ownedTags.length !== unique.length) return 'Tag not found'
  }
  return null
}
async function getOwned(db: Database, uid: number, rawId: unknown) {
  const id = idParameter.safeParse(rawId)
  if (!id.success) return null
  const [row] = await db
    .select(selection)
    .from(timeEntries)
    .where(and(eq(timeEntries.id, id.data), eq(timeEntries.userId, uid)))
    .limit(1)
  return row as EntryRow | undefined
}
function minutes(
  row: Pick<EntryRow, 'startTime' | 'endTime' | 'durationMinutes'>,
) {
  if (row.startTime && row.endTime)
    return Math.round(
      (new Date(`${row.endTime.replace(' ', 'T')}Z`).getTime() -
        new Date(`${row.startTime.replace(' ', 'T')}Z`).getTime()) /
        60_000,
    )
  return row.durationMinutes ?? 0
}
async function entryDto(db: Database, row: EntryRow) {
  const entryTags = await db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
    })
    .from(timeEntryTags)
    .innerJoin(
      tags,
      and(eq(tags.id, timeEntryTags.tagId), eq(tags.userId, row.userId)),
    )
    .where(eq(timeEntryTags.timeEntryId, row.id))
  return {
    id: row.id,
    date: row.date,
    description: row.description,
    position: row.position,
    taskId: row.taskId,
    taskTitle: row.taskTitle,
    taskJiraUrl: row.taskJiraUrl,
    taskJiraKey: extractIssueKey(row.taskJiraUrl),
    projectId: row.projectId,
    projectName: row.projectName,
    startTime: row.startTime?.slice(11, 16) ?? null,
    endTime: row.endTime?.slice(11, 16) ?? null,
    durationMinutes: row.durationMinutes,
    effectiveDurationMinutes: minutes(row),
    jiraWorklogId: row.jiraWorklogId,
    pushedToSystem: row.pushedToSystem,
    pushedAt: row.pushedAt?.toISOString() ?? null,
    isPushed: !!row.pushedToSystem,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    tags: entryTags,
  }
}

async function updateEntry(
  c: import('hono').Context<AppEnv>,
  db: Database,
  jira: JiraClient,
) {
  const original = await getOwned(db, c.get('currentUserId'), c.req.param('id'))
  if (!original) return c.body(null, 404)
  const parsed = baseBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const taskId = parsed.data.taskId ?? original.taskId
  const error = await validateRelations(
    db,
    original.userId,
    taskId,
    parsed.data.tagIds,
  )
  if (error) return c.json({ error }, 400)
  if (parsed.data.deleteJiraWorklog && original.jiraWorklogId) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, original.userId))
    const key = extractIssueKey(original.taskJiraUrl)
    if (user?.jiraUrl && user.jiraEmail && user.jiraApiToken && key)
      try {
        await jira.deleteWorklog(
          user.jiraUrl,
          user.jiraEmail,
          user.jiraApiToken,
          key,
          original.jiraWorklogId,
        )
      } catch (error) {
        if (!(error instanceof JiraError)) throw error
      }
  }
  const date = parsed.data.date ?? original.date
  let resolved
  try {
    resolved = resolve(date, parsed.data)
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Invalid time' },
      400,
    )
  }
  await db.transaction(async (tx) => {
    await tx
      .update(timeEntries)
      .set({
        taskId,
        date,
        description: parsed.data.description?.trim() || null,
        ...resolved,
        jiraWorklogId: parsed.data.deleteJiraWorklog
          ? null
          : original.jiraWorklogId,
        pushedToSystem: parsed.data.deleteJiraWorklog
          ? null
          : original.pushedToSystem,
        pushedAt: parsed.data.deleteJiraWorklog ? null : original.pushedAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(timeEntries.id, original.id),
          eq(timeEntries.userId, original.userId),
        ),
      )
    if (parsed.data.tagIds !== undefined) {
      await tx
        .delete(timeEntryTags)
        .where(eq(timeEntryTags.timeEntryId, original.id))
      if (parsed.data.tagIds?.length)
        await tx.insert(timeEntryTags).values(
          [...new Set(parsed.data.tagIds)].map((tagId) => ({
            timeEntryId: original.id,
            tagId,
          })),
        )
    }
  })
  const row = await getOwned(db, original.userId, original.id)
  if (!row) throw new Error('Updated entry not found')
  return c.json(await entryDto(db, row))
}

async function weeklySummary(c: import('hono').Context<AppEnv>, db: Database) {
  const parsed = calendarDate.safeParse(c.req.query('date'))
  if (!parsed.success) return c.json({ error: 'Invalid date' }, 400)
  const selected = new Date(`${parsed.data}T00:00:00Z`)
  const offset = selected.getUTCDay() === 0 ? 6 : selected.getUTCDay() - 1
  selected.setUTCDate(selected.getUTCDate() - offset)
  const monday = selected.toISOString().slice(0, 10)
  selected.setUTCDate(selected.getUTCDate() + 6)
  const sunday = selected.toISOString().slice(0, 10)
  const rows = await db
    .select(selection)
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, c.get('currentUserId')),
        gte(timeEntries.date, monday),
        lte(timeEntries.date, sunday),
      ),
    )
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(`${monday}T00:00:00Z`)
    day.setUTCDate(day.getUTCDate() + index)
    const date = day.toISOString().slice(0, 10)
    const entries = (rows as EntryRow[]).filter((row) => row.date === date)
    const starts = entries.flatMap((row) =>
      row.startTime ? [row.startTime.slice(11, 16)] : [],
    )
    const ends = entries.flatMap((row) =>
      row.endTime ? [row.endTime.slice(11, 16)] : [],
    )
    return {
      date,
      dayName: [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ][day.getUTCDay()],
      firstStart: starts.sort()[0] ?? null,
      lastEnd: ends.sort().at(-1) ?? null,
      totalMinutes: entries.reduce((sum, row) => sum + minutes(row), 0),
    }
  })
  return c.json({
    weekNumber: isoWeek(new Date(`${monday}T00:00:00Z`)),
    totalMinutes: days.reduce((sum, day) => sum + day.totalMinutes, 0),
    days,
  })
}
function isoWeek(date: Date) {
  const value = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
  value.setUTCDate(value.getUTCDate() + 4 - (value.getUTCDay() || 7))
  const first = new Date(Date.UTC(value.getUTCFullYear(), 0, 1))
  return Math.ceil(((value.getTime() - first.getTime()) / 86_400_000 + 1) / 7)
}
async function exportEntries(c: import('hono').Context<AppEnv>, db: Database) {
  const range = exportRange(c.req.query('from'), c.req.query('to'))
  if (!range) return c.json({ error: 'Invalid date' }, 400)
  const { from, to } = range
  const conditions = [eq(timeEntries.userId, c.get('currentUserId'))]
  if (from) conditions.push(gte(timeEntries.date, from))
  if (to) conditions.push(lte(timeEntries.date, to))
  const rows = await db
    .select(selection)
    .from(timeEntries)
    .where(and(...conditions))
    .orderBy(asc(timeEntries.date), asc(timeEntries.position))
  const header = 'Datum,Projekt,Uppgift,Beskrivning,Start,Slut,Minuter,Taggar'
  const lines = await Promise.all(
    (rows as EntryRow[]).map(async (row) => {
      const rowTags = await db
        .select({ name: tags.name })
        .from(timeEntryTags)
        .innerJoin(
          tags,
          and(eq(tags.id, timeEntryTags.tagId), eq(tags.userId, row.userId)),
        )
        .where(eq(timeEntryTags.timeEntryId, row.id))
        .orderBy(asc(tags.name))
      return [
        row.date,
        row.projectName ?? '',
        row.taskTitle,
        row.description ?? '',
        row.startTime?.slice(11, 16) ?? '',
        row.endTime?.slice(11, 16) ?? '',
        String(minutes(row)),
        rowTags.map((tag) => tag.name).join('|'),
      ]
        .map(csvEscape)
        .join(',')
    }),
  )
  return c.body(
    `${header}\n${lines.join('\n')}${lines.length ? '\n' : ''}`,
    200,
    {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="tidrapport_${from ?? 'all'}_${to ?? 'all'}.csv"`,
    },
  )
}
async function pushToJira(
  c: import('hono').Context<AppEnv>,
  db: Database,
  jira: JiraClient,
) {
  const row = await getOwned(db, c.get('currentUserId'), c.req.param('id'))
  if (!row) return c.body(null, 404)
  const [user] = await db.select().from(users).where(eq(users.id, row.userId))
  const key = extractIssueKey(row.taskJiraUrl)
  if (minutes(row) <= 0) return c.json({ error: 'Entry has no duration' }, 400)
  if (!row.startTime || !row.endTime)
    return c.json(
      { error: 'Entry requires start and end time to push to Jira' },
      400,
    )
  if (!row.taskJiraUrl) return c.json({ error: 'Task has no Jira URL' }, 400)
  if (!key) return c.json({ error: 'Could not extract Jira issue key' }, 400)
  if (!user?.jiraUrl || !user.jiraEmail || !user.jiraApiToken)
    return c.json({ error: 'Jira credentials not configured' }, 400)
  try {
    const started = new Date(`${row.startTime.replace(' ', 'T')}Z`)
    const worklogId = await jira.createWorklog(
      user.jiraUrl,
      user.jiraEmail,
      user.jiraApiToken,
      key,
      minutes(row) * 60,
      started,
      row.description,
    )
    const [updated] = await db
      .update(timeEntries)
      .set({
        jiraWorklogId: worklogId,
        pushedToSystem: user.jiraIntegrationSystem,
        pushedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(timeEntries.id, row.id), eq(timeEntries.userId, row.userId)),
      )
      .returning({ id: timeEntries.id })
    const result = await getOwned(db, row.userId, updated?.id)
    if (!result) throw new Error('Pushed entry not found')
    return c.json(await entryDto(db, result))
  } catch (error) {
    if (error instanceof JiraError)
      return c.json({ error: error.message }, error.responseStatus as 400)
    throw error
  }
}
