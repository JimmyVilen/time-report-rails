import { z } from 'zod'

export const idParameter = z.coerce.number().int().positive()
export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`)
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    )
  }, 'Invalid calendar date')

export function iso(value: Date): string {
  return value.toISOString()
}

// Optional `from`/`to` bounds for the CSV exports. An absent or empty bound is
// open-ended; anything else must be a calendar date, both because PostgreSQL
// rejects other strings for a `date` comparison and because the values end
// up in the Content-Disposition file name.
const exportRangeSchema = z.object({
  from: calendarDate.optional(),
  to: calendarDate.optional(),
})
export function exportRange(
  from: string | undefined,
  to: string | undefined,
): z.infer<typeof exportRangeSchema> | null {
  const parsed = exportRangeSchema.safeParse({
    from: from || undefined,
    to: to || undefined,
  })
  return parsed.success ? parsed.data : null
}
