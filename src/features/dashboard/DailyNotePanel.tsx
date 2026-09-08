import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDailyNote, upsertDailyNote } from '../../api/dailyNotes'
import { Button } from '../../components/Button'
import { LexicalMarkdownEditor } from '../../components/LexicalMarkdownEditor'

interface Props {
  date: string
}

export function DailyNotePanel({ date }: Props) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['daily-note', date],
    queryFn: () => getDailyNote(date),
  })

  const [isOpen, setIsOpen] = useState(false)
  const [content, setContent] = useState('')

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setContent(data?.content ?? '')
    setIsOpen(false)
  }, [date, data?.content])

  const mutation = useMutation({
    mutationFn: () => upsertDailyNote(date, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['daily-note', date] })
      setIsOpen(false)
    },
  })

  const hasNote = !!data?.content

  return (
    <>
      <button
        onClick={() => setIsOpen(s => !s)}
        className="inline-flex min-h-[46px] items-center justify-center gap-2 px-5 py-2 rounded-md border border-[var(--border)] bg-[var(--background-card)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-sm font-semibold text-[var(--foreground)] transition-colors"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Notering
        {hasNote && (
          <span data-testid="daily-note-indicator" className="inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />
        )}
      </button>

      {isOpen && (
        <div className="w-full rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-5 shadow-[var(--shadow-sm)]">
          <div className="flex flex-col gap-3">
            <LexicalMarkdownEditor
              value={content}
              onChange={setContent}
              placeholder="Skriv din dagliga notering här..."
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
              >
                Stäng
              </button>
              <Button variant="primary" size="sm" loading={mutation.isPending} onClick={() => mutation.mutate()}>
                Spara
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
