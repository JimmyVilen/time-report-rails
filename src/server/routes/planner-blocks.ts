import { and, asc, eq, gte, lte } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../auth/middleware'
import { calendarDate, idParameter, iso } from '../contracts/common'
import type { Database } from '../db/client'
import { plannerBlocks } from '../db/schema'

const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}[T ]([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)
  .nullable()
  .optional()
const bodySchema = z.object({
  title: z.string(),
  date: calendarDate,
  startTime: localDateTime,
  endTime: localDateTime,
  color: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})
// PostgreSQL serialises `timestamp` columns with a space between date and
// clock. The UI splits on `T`, so hand out ISO-8601 local date-times.
const localDateTimeOut = (value: string | null) =>
  value?.replace(' ', 'T') ?? null
const dto = (b: typeof plannerBlocks.$inferSelect) => ({
  id: b.id,
  title: b.title,
  date: b.date,
  startTime: localDateTimeOut(b.startTime),
  endTime: localDateTimeOut(b.endTime),
  color: b.color,
  notes: b.notes,
  createdAt: iso(b.createdAt),
  updatedAt: iso(b.updatedAt),
})
const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function plannerBlockRoutes(db: Database) {
  const app = new Hono<AppEnv>()
  app.get('/', async (c) => {
    const start = calendarDate.safeParse(c.req.query('weekStart'))
    if (!start.success) return c.json({ error: 'Invalid weekStart date' }, 400)
    return c.json(
      (
        await db
          .select()
          .from(plannerBlocks)
          .where(
            and(
              eq(plannerBlocks.userId, c.get('currentUserId')),
              gte(plannerBlocks.date, start.data),
              lte(plannerBlocks.date, addDays(start.data, 6)),
            ),
          )
          .orderBy(asc(plannerBlocks.date), asc(plannerBlocks.startTime))
      ).map(dto),
    )
  })
  app.post('/', async (c) => {
    const body = bodySchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Invalid request' }, 400)
    if (!body.data.title.trim())
      return c.json({ error: 'Title is required' }, 400)
    const [row] = await db
      .insert(plannerBlocks)
      .values({
        userId: c.get('currentUserId'),
        ...body.data,
        title: body.data.title.trim(),
        startTime: body.data.startTime ?? null,
        endTime: body.data.endTime ?? null,
        color: body.data.color ?? null,
        notes: body.data.notes ?? null,
      })
      .returning()
    if (!row) throw new Error('Planner block insert returned no row')
    return c.json(dto(row))
  })
  app.put('/:id', async (c) => {
    const id = idParameter.safeParse(c.req.param('id'))
    const body = bodySchema.safeParse(await c.req.json().catch(() => null))
    if (!id.success || !body.success)
      return c.json({ error: 'Invalid request' }, 400)
    if (!body.data.title.trim())
      return c.json({ error: 'Title is required' }, 400)
    const [row] = await db
      .update(plannerBlocks)
      .set({
        ...body.data,
        title: body.data.title.trim(),
        startTime: body.data.startTime ?? null,
        endTime: body.data.endTime ?? null,
        color: body.data.color ?? null,
        notes: body.data.notes ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(plannerBlocks.id, id.data),
          eq(plannerBlocks.userId, c.get('currentUserId')),
        ),
      )
      .returning()
    return row ? c.json(dto(row)) : c.body(null, 404)
  })
  app.delete('/:id', async (c) => {
    const id = idParameter.safeParse(c.req.param('id'))
    if (!id.success) return c.body(null, 404)
    const rows = await db
      .delete(plannerBlocks)
      .where(
        and(
          eq(plannerBlocks.id, id.data),
          eq(plannerBlocks.userId, c.get('currentUserId')),
        ),
      )
      .returning({ id: plannerBlocks.id })
    return rows.length ? c.body(null, 204) : c.body(null, 404)
  })
  return app
}
