import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { getTimeEntries, reorderTimeEntries } from '../../api/timeEntries'
import type { TimeEntry } from '../../api/timeEntries'
import { addDays, formatDate } from '../../lib/dateUtils'
import { formatMinutes } from '../../lib/durationParser'
import { WeeklySummary } from './WeeklySummary'
import { TimeEntryCard } from './TimeEntryCard'
import { TimeEntryForm } from './TimeEntryForm'
import { DailyNotePanel } from './DailyNotePanel'
import { Button } from '../../components/Button'

export interface DashboardPageProps {
  date: string
  onDateChange: (date: string) => void
}

export function DashboardPage({ date, onDateChange }: DashboardPageProps) {
  const [showForm, setShowForm] = useState(false)
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null)

  const qc = useQueryClient()

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['time-entries', date],
    queryFn: () => getTimeEntries(date),
  })

  const totalMinutes = entries.reduce((s, e) => s + e.effectiveDurationMinutes, 0)

  const reorderMutation = useMutation({
    mutationFn: reorderTimeEntries,
    // The drag handler writes the new order into the cache optimistically, so
    // refetch on failure too or the list keeps showing an order the server
    // never saved.
    onSettled: () => qc.invalidateQueries({ queryKey: ['time-entries', date] }),
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = entries.findIndex(e => e.id === active.id)
    const newIndex = entries.findIndex(e => e.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = [...entries]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)

    const items = reordered.map((e, i) => ({ id: e.id, position: i }))
    qc.setQueryData(['time-entries', date], reordered.map((e, i) => ({ ...e, position: i })))
    reorderMutation.mutate(items)
  }

  const handleDateChange = (newDate: string) => {
    onDateChange(newDate)
    setShowForm(false)
    setEditEntry(null)
  }

  const handleEdit = (entry: TimeEntry) => {
    setEditEntry(entry)
    setShowForm(true)
  }

  const selectedDate = new Date(date + 'T00:00:00')
  const dateTitle = new Intl.DateTimeFormat('sv-SE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(selectedDate)
  const dateYear = new Intl.DateTimeFormat('sv-SE', { year: 'numeric' }).format(selectedDate)
  const capitalizedDateTitle = dateTitle.charAt(0).toUpperCase() + dateTitle.slice(1)

  return (
    <div className="dashboard-page flex-1 p-4 md:p-6 max-w-app mx-auto w-full">
      <div className="dashboard-header">
        <div className="date-navigation">
            <button
              type="button"
              onClick={() => handleDateChange(addDays(date, -1))}
              className="date-arrow"
              aria-label="Föregående dag"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <label className="date-heading select-none">
              <h1>{capitalizedDateTitle}</h1>
              <p>{dateYear} · Välj datum</p>
              <input
                type="date"
                value={date}
                onChange={e => handleDateChange(e.target.value)}
                className="absolute inset-0 opacity-0 w-full cursor-pointer"
                title="Välj datum"
                aria-label="Välj datum"
              />
            </label>

            <button
              type="button"
              onClick={() => handleDateChange(addDays(date, 1))}
              className="date-arrow"
              aria-label="Nästa dag"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

        <div className="dashboard-actions">
            <Button
              variant="primary"
              size="lg"
              onClick={() => { setEditEntry(null); setShowForm(s => !s) }}
            >
              {showForm && !editEntry ? 'Stäng' : '+ Registrera tid'}
            </Button>
            <DailyNotePanel date={date} />
          </div>
      </div>

      <WeeklySummary date={date} onDateClick={handleDateChange} todayMinutes={totalMinutes} />

      {showForm && (
        <div className="mb-4">
            <TimeEntryForm
              key={editEntry?.id ?? 'new'}
              date={date}
              editEntry={editEntry}
              onClose={() => { setShowForm(false); setEditEntry(null) }}
            />
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-[var(--foreground-muted)] py-8 text-center">Laddar dagens tid…</div>
      ) : entries.length === 0 ? (
        <div className="dashboard-empty-state py-12 text-center border border-dashed border-[var(--border)] rounded-xl bg-[var(--background-card)]/60">
          Inga tidsposter för {formatDate(date)}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={entries.map(e => e.id)} strategy={verticalListSortingStrategy}>
            <div className="dashboard-stack">
              {entries.map(entry => (
                <TimeEntryCard
                  key={entry.id}
                  entry={entry}
                  date={date}
                  onEdit={e => handleEdit(e)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {totalMinutes > 0 && (
        <div className="daily-total">
          <span>Totalt:</span>
          <strong>{formatMinutes(totalMinutes)}</strong>
        </div>
      )}
    </div>
  )
}
