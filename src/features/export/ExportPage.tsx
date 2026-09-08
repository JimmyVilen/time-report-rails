import { useState } from 'react'
import { exportTimeEntries } from '../../api/timeEntries'
import { exportNotes } from '../../api/dailyNotes'

function lastWeekRange() {
  const today = new Date()
  // ISO weeks run Monday–Sunday, so treat Sunday as day 7 rather than 0;
  // otherwise a Sunday would default to the current week instead of last.
  const dayOfWeek = today.getDay() || 7
  const lastMonday = new Date(today)
  lastMonday.setDate(today.getDate() - dayOfWeek - 6)
  const lastSunday = new Date(lastMonday)
  lastSunday.setDate(lastMonday.getDate() + 6)
  const fmt = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  return { from: fmt(lastMonday), to: fmt(lastSunday) }
}

const dateInputClass = 'rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none'
const labelClass = 'text-xs text-[var(--foreground-muted)]'

function ExportSection({ title, subtitle, from, setFrom, to, setTo, onExport }: {
  title: string
  subtitle: string
  from: string
  setFrom: (v: string) => void
  to: string
  setTo: (v: string) => void
  onExport: () => void
}) {
  return (
    <div>
      <h2 className="mb-1 text-sm font-medium text-[var(--foreground)]">{title}</h2>
      <p className="mb-4 text-sm text-[var(--foreground-muted)]">{subtitle}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Från</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} required className={dateInputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Till</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} required className={dateInputClass} />
        </div>
        <button
          type="button"
          onClick={onExport}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Ladda ner CSV
        </button>
      </div>
    </div>
  )
}

export function ExportPage() {
  const { from: defaultFrom, to: defaultTo } = lastWeekRange()
  const [teFrom, setTeFrom] = useState(defaultFrom)
  const [teTo, setTeTo] = useState(defaultTo)
  const [notesFrom, setNotesFrom] = useState(defaultFrom)
  const [notesTo, setNotesTo] = useState(defaultTo)

  return (
    <div className="flex-1 p-4 md:p-6 max-w-app mx-auto w-full">
      <h1 className="mb-8 text-xl font-semibold text-[var(--foreground)]">Exportera</h1>
      <p className="page-intro">Hämta tid och noteringar som CSV för valda datumintervall.</p>

      <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--background-card)] px-6 shadow-[var(--shadow-sm)]">
        <div className="py-7">
          <ExportSection
            title="Tidsrapport"
            subtitle="Exportera tidrapportsposter som CSV"
            from={teFrom} setFrom={setTeFrom}
            to={teTo} setTo={setTeTo}
            onExport={() => exportTimeEntries(teFrom, teTo)}
          />
        </div>
        <div className="py-7">
          <ExportSection
            title="Noteringar"
            subtitle="Exportera dagliga noteringar som CSV"
            from={notesFrom} setFrom={setNotesFrom}
            to={notesTo} setTo={setNotesTo}
            onExport={() => exportNotes(notesFrom, notesTo)}
          />
        </div>
      </div>
    </div>
  )
}
