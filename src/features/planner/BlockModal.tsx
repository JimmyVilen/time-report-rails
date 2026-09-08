import { useState, useEffect, useRef } from 'react'
import { type PlannerBlock, type BlockColor, BLOCK_COLORS, DEFAULT_COLOR } from '../../api/plannerBlocks'
import { MarkdownRenderer } from '../../components/MarkdownRenderer'

interface Props {
  initialData?: Partial<PlannerBlock> | null
  onSubmit: (data: {
    title: string
    date: string
    startTime: string | null
    endTime: string | null
    color: string
    notes: string | null
  }) => void
  onClose: () => void
  isLoading?: boolean
}

function extractTime(isoOrTime: string | null | undefined): string {
  if (!isoOrTime) return ''
  if (isoOrTime.includes('T')) return isoOrTime.split('T')[1].slice(0, 5)
  return isoOrTime.slice(0, 5)
}

export function BlockModal({ initialData, onSubmit, onClose, isLoading }: Props) {
  const [title, setTitle] = useState(initialData?.title ?? '')
  const [date, setDate] = useState(initialData?.date ?? '')
  const [startTime, setStartTime] = useState(extractTime(initialData?.startTime))
  const [endTime, setEndTime] = useState(extractTime(initialData?.endTime))
  const [color, setColor] = useState<BlockColor>((initialData?.color as BlockColor) ?? DEFAULT_COLOR)
  const [notes, setNotes] = useState(initialData?.notes ?? '')
  const [previewNotes, setPreviewNotes] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !date) return
    onSubmit({
      title: title.trim(),
      date,
      startTime: startTime ? `${date}T${startTime}:00` : null,
      endTime: endTime ? `${date}T${endTime}:00` : null,
      color,
      notes: notes.trim() || null,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#071e1a]/45 backdrop-blur-[2px]"
      role="presentation"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-[var(--background-card)] border border-[var(--border)] rounded-xl shadow-[var(--shadow-md)] w-full max-w-md mx-4 p-6" role="dialog" aria-modal="true" aria-labelledby="planner-modal-title">
        <div className="flex items-center justify-between mb-4">
          <h2 id="planner-modal-title" className="font-display text-2xl font-semibold text-[var(--foreground)]">
            {initialData?.id ? 'Redigera block' : 'Nytt block'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Stäng"
            className="text-[var(--foreground-muted)] hover:text-[var(--foreground)] text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <input
              ref={titleRef}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Rubrik"
              required
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="planner-block-date" className="text-xs text-[var(--foreground-muted)]">Datum</label>
              <input
                id="planner-block-date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
                className="px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="planner-block-start" className="text-xs text-[var(--foreground-muted)]">Starttid</label>
              <input
                id="planner-block-start"
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="planner-block-end" className="text-xs text-[var(--foreground-muted)]">Sluttid</label>
              <input
                id="planner-block-end"
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-[var(--foreground-muted)] block mb-1.5">Färg</label>
            <div className="flex gap-2">
              {(Object.keys(BLOCK_COLORS) as BlockColor[]).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                  style={{
                    background: BLOCK_COLORS[c].border,
                    outline: color === c ? `2px solid ${BLOCK_COLORS[c].border}` : 'none',
                    outlineOffset: '2px',
                  }}
                  title={c}
                  aria-label={`Välj färg ${c}`}
                  aria-pressed={color === c}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="planner-block-notes" className="text-xs text-[var(--foreground-muted)]">Anteckningar (markdown)</label>
              {notes && (
                <button
                  type="button"
                  onClick={() => setPreviewNotes(p => !p)}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  {previewNotes ? 'Redigera' : 'Förhandsgranska'}
                </button>
              )}
            </div>
            {previewNotes ? (
              <div className="min-h-[96px] p-2 rounded-lg border border-[var(--border)] bg-[var(--background)]">
                <MarkdownRenderer content={notes} />
              </div>
            ) : (
              <textarea
                id="planner-block-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Lägg till anteckningar..."
                rows={4}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm focus:outline-none focus:border-[var(--accent)] resize-none"
              />
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-elevated)] transition-colors"
            >
              Avbryt
            </button>
            <button
              type="submit"
              disabled={isLoading || !title.trim() || !date}
              className="px-4 py-2 text-sm rounded-lg bg-[var(--accent)] text-white font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {isLoading ? 'Sparar...' : 'Spara'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
