import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TimeEntry } from '../../api/timeEntries'
import { MarkdownRenderer } from '../../components/MarkdownRenderer'
import { deleteTimeEntry, duplicateTimeEntry, pushToJira } from '../../api/timeEntries'
import { formatMinutes } from '../../lib/durationParser'
import { tagColorStyle, tagDefaultClass } from '../../components/TagInput'

interface Props {
  entry: TimeEntry
  date: string
  onEdit: (entry: TimeEntry) => void
}

export function TimeEntryCard({ entry, date, onEdit }: Props) {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['time-entries', date] })
    qc.invalidateQueries({ queryKey: ['weekly-summary'] })
  }

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.id })

  const [actionError, setActionError] = useState<string | null>(null)
  const fail = (fallback: string) => (err: unknown) => {
    setActionError(err instanceof Error ? err.message : fallback)
  }

  const deleteMutation = useMutation({
    mutationFn: () => deleteTimeEntry(entry.id),
    onSuccess: invalidate,
    onError: fail('Kunde inte radera tidsposten'),
  })

  const duplicateMutation = useMutation({
    mutationFn: () => duplicateTimeEntry(entry.id),
    onSuccess: () => { setActionError(null); invalidate() },
    onError: fail('Kunde inte duplicera tidsposten'),
  })

  const pushMutation = useMutation({
    mutationFn: () => pushToJira(entry.id),
    onSuccess: () => { setActionError(null); invalidate() },
    onError: fail('Kunde inte skicka till Jira'),
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    borderLeftColor: entry.tags[0]?.color ?? 'var(--accent)',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="time-entry-card group relative"
      data-testid="time-entry"
    >
      <div className="flex items-start gap-3 px-4 py-3.5 md:px-6 md:py-4">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab active:cursor-grabbing touch-none text-[var(--foreground-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          aria-label="Dra för att sortera"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm8-12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
          </svg>
        </button>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6">

            {/* Left: title + description */}
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                {entry.taskJiraKey && (
                  <a
                    href={entry.taskJiraUrl ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="time-entry-key shrink-0 font-display text-[var(--accent)] hover:underline"
                  >
                    [{entry.taskJiraKey}]
                  </a>
                )}
                <span className="time-entry-title font-display text-[var(--foreground-strong)] truncate">
                  {entry.taskTitle}
                </span>
              </div>
              {entry.description && (
                <div className="time-entry-description mt-1 text-[var(--foreground-muted)] line-clamp-3 [&_.prose-content]:text-[inherit] [&_.prose-content]:text-[var(--foreground-muted)] [&_.prose-content_p]:mb-0 [&_.prose-content_h1]:text-[inherit] [&_.prose-content_h2]:text-[inherit] [&_.prose-content_h3]:text-[inherit]">
                  <MarkdownRenderer content={entry.description} />
                </div>
              )}
              {entry.tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {entry.tags.map(tag => (
                    <span
                      key={tag.id}
                      style={tagColorStyle(tag.color)}
                      className={`tag-chip inline-flex items-center px-2 py-0.5 rounded ${!tag.color ? tagDefaultClass : ''}`}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Right: actions + duration */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 text-right sm:justify-end">

              {/* Actions */}
              <div className="flex items-center gap-2">
                {entry.taskJiraUrl && (
                  entry.isPushed ? (
                    <span
                      className="time-entry-action text-[var(--success)] cursor-default"
                      title={`Skickad till Jira${entry.pushedAt ? ' ' + entry.pushedAt.slice(0, 10) : ''}`}
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  ) : (
                    <button
                      onClick={() => pushMutation.mutate()}
                      disabled={
                        pushMutation.isPending ||
                        entry.effectiveDurationMinutes <= 0 ||
                        !entry.startTime ||
                        !entry.endTime
                      }
                      className="time-entry-action disabled:opacity-50 disabled:cursor-not-allowed"
                      title={
                        entry.effectiveDurationMinutes <= 0
                          ? 'Ingen tid registrerad'
                          : !entry.startTime || !entry.endTime
                            ? 'Start- och sluttid krävs för att skicka till Jira'
                            : 'Skicka till Jira'
                      }
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </button>
                  )
                )}

                <button
                  onClick={() => duplicateMutation.mutate()}
                  disabled={duplicateMutation.isPending}
                  className="time-entry-action disabled:opacity-50"
                  title="Duplicera"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>

                <button
                  onClick={() => onEdit(entry)}
                  className="time-entry-action"
                  title="Redigera"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>

                <button
                  onClick={() => { if (confirm('Är du säker på att du vill radera denna tidsrapport?')) deleteMutation.mutate() }}
                  disabled={deleteMutation.isPending}
                  className="time-entry-action hover:!text-[var(--danger)] hover:!border-[var(--danger)] disabled:opacity-50"
                  title="Radera"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              {/* Duration */}
              <div className="w-28">
                <div className="time-entry-duration font-display text-[var(--foreground-strong)] text-right">
                  {entry.effectiveDurationMinutes > 0 ? formatMinutes(entry.effectiveDurationMinutes) : ''}
                </div>
                <div className="time-entry-time mt-1 text-[var(--foreground-muted)] text-right">
                  {entry.startTime && entry.endTime
                    ? `${entry.startTime}–${entry.endTime}`
                    : entry.startTime
                      ? `${entry.startTime}–`
                      : ' '}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
      {actionError && (
        <p role="alert" className="px-4 pb-2 text-xs text-[var(--danger)]">{actionError}</p>
      )}
    </div>
  )
}
