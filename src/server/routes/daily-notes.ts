import { and, asc, count, desc, eq, gte, ilike, lte } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../auth/middleware'
import { calendarDate, exportRange, iso } from '../contracts/common'
import type { Database } from '../db/client'
import { dailyNotes } from '../db/schema'
import { csvEscape } from '../services/csv'

const bodySchema = z.object({ content: z.string() })
const dto = (note: typeof dailyNotes.$inferSelect) => ({
  id: note.id,
  date: note.date,
  content: note.content,
  updatedAt: iso(note.updatedAt),
})

export function dailyNoteRoutes(db: Database) {
  const app = new Hono<AppEnv>()
  app.get('/export', async (c) => {
    const range = exportRange(c.req.query('from'), c.req.query('to'))
    if (!range) return c.json({ error: 'Invalid date' }, 400)
    const { from, to } = range
    const uid = c.get('currentUserId')
    const conditions = [eq(dailyNotes.userId, uid)]
    if (from) conditions.push(gte(dailyNotes.date, from))
    if (to) conditions.push(lte(dailyNotes.date, to))
    const rows = await db
      .select()
      .from(dailyNotes)
      .where(and(...conditions))
      .orderBy(asc(dailyNotes.date))
    const csv = `Datum,Notering\n${rows.map((n) => `${n.date},${csvEscape(n.content)}`).join('\n')}${rows.length ? '\n' : ''}`
    return c.body(csv, 200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="anteckningar_${from ?? 'all'}_${to ?? 'all'}.csv"`,
    })
  })
  app.get('/', async (c) => {
    const requestedPage = z.coerce
      .number()
      .int()
      .min(1)
      .catch(1)
      .parse(c.req.query('page'))
    const q = c.req.query('q')?.trim()
    const uid = c.get('currentUserId')
    const condition = and(
      eq(dailyNotes.userId, uid),
      q ? ilike(dailyNotes.content, `%${q}%`) : undefined,
    )
    const counts = await db
      .select({ value: count() })
      .from(dailyNotes)
      .where(condition)
    const total = counts[0]?.value ?? 0
    const totalPages = Math.ceil(total / 10)
    const page = Math.min(requestedPage, Math.max(1, totalPages))
    const notes = await db
      .select()
      .from(dailyNotes)
      .where(condition)
      .orderBy(desc(dailyNotes.date))
      .limit(10)
      .offset((page - 1) * 10)
    return c.json({ notes: notes.map(dto), total, totalPages, page })
  })
  app.get('/:date', async (c) => {
    const date = calendarDate.safeParse(c.req.param('date'))
    if (!date.success) return c.json({ error: 'Invalid date' }, 400)
    const [note] = await db
      .select()
      .from(dailyNotes)
      .where(
        and(
          eq(dailyNotes.userId, c.get('currentUserId')),
          eq(dailyNotes.date, date.data),
        ),
      )
      .limit(1)
    return c.json({ content: note?.content ?? null })
  })
  app.put('/:date', async (c) => {
    const date = calendarDate.safeParse(c.req.param('date'))
    const parsed = bodySchema.safeParse(await c.req.json().catch(() => null))
    if (!date.success || !parsed.success)
      return c.json({ error: 'Invalid request' }, 400)
    const [note] = await db
      .insert(dailyNotes)
      .values({
        userId: c.get('currentUserId'),
        date: date.data,
        content: parsed.data.content,
      })
      .onConflictDoUpdate({
        target: [dailyNotes.userId, dailyNotes.date],
        set: { content: parsed.data.content, updatedAt: new Date() },
      })
      .returning()
    if (!note) throw new Error('Daily note upsert returned no row')
    return c.json(dto(note))
  })
  return app
}
