import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getTasks, createTask, fetchJiraDetails } from '../../api/tasks'
import { createTimeEntry, updateTimeEntry, getRecentDescription } from '../../api/timeEntries'
import type { TimeEntry } from '../../api/timeEntries'
import { getTags, createTag } from '../../api/tags'
import type { Tag } from '../../api/tags'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { TagInput } from '../../components/TagInput'
import { parseDuration, formatMinutes } from '../../lib/durationParser'
import { LexicalMarkdownEditor } from '../../components/LexicalMarkdownEditor'

interface Props {
  date: string
  editEntry?: TimeEntry | null
  onClose: () => void
}

function isHttpUrl(val: string): boolean {
  try {
    const url = new URL(val)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function taskLabel(t: { jiraKey?: string | null; title?: string; taskJiraKey?: string | null; taskTitle?: string }): string {
  const key = t.jiraKey ?? t.taskJiraKey ?? null
  const title = t.title ?? t.taskTitle ?? ''
  return key ? `[${key}] ${title}` : title
}

export function TimeEntryForm({ date, editEntry, onClose }: Props) {
  const qc = useQueryClient()
  const { data: tasks = [] } = useQuery({ queryKey: ['tasks'], queryFn: () => getTasks() })
  const { data: allTags = [] } = useQuery({ queryKey: ['tags'], queryFn: getTags })
  const containerRef = useRef<HTMLDivElement>(null)

  const [selectedTags, setSelectedTags] = useState<Tag[]>(editEntry?.tags ?? [])
  const [taskId, setTaskId] = useState<number | ''>(editEntry?.taskId ?? '')
  const [taskSearch, setTaskSearch] = useState(editEntry ? taskLabel(editEntry) : '')
  const [showDropdown, setShowDropdown] = useState(false)
  const [description, setDescription] = useState(editEntry?.description ?? '')
  const [editorKey, setEditorKey] = useState(0)
  const [startTime, setStartTime] = useState(editEntry?.startTime ?? '')
  const [endTime, setEndTime] = useState(editEntry?.endTime ?? '')
  const [durationStr, setDurationStr] = useState(
    editEntry ? formatMinutes(editEntry.effectiveDurationMinutes) : ''
  )
  const [error, setError] = useState('')

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['time-entries', date] })
    qc.invalidateQueries({ queryKey: ['weekly-summary'] })
    qc.invalidateQueries({ queryKey: ['tasks'] })
  }

  const createTagMutation = useMutation({
    mutationFn: (name: string) => createTag({ name }),
    onSuccess: (newTag) => {
      qc.invalidateQueries({ queryKey: ['tags'] })
      setSelectedTags(prev => [...prev, newTag])
    },
    onError: (e: Error) => setError(e.message),
  })

  const mutation = useMutation({
    mutationFn: () => {
      const data = {
        taskId: taskId as number,
        date,
        description: description || undefined,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        durationString: durationStr || undefined,
        tagIds: selectedTags.map(t => t.id),
      }
      return editEntry
        ? updateTimeEntry(editEntry.id, data)
        : createTimeEntry(data)
    },
    onSuccess: () => { invalidate(); onClose() },
    onError: (e: Error) => setError(e.message),
  })

  const recentDescQuery = useQuery({
    queryKey: ['recent-description', taskId],
    queryFn: () => getRecentDescription(taskId as number),
    enabled: !!taskId && !editEntry,
  })
  useEffect(() => {
    if (recentDescQuery.data?.description && !editEntry) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDescription(recentDescQuery.data.description)
      setEditorKey(k => k + 1)
    }
  }, [recentDescQuery.data, editEntry])

  const handleStartChange = (val: string) => {
    setStartTime(val)
    if (val && endTime) {
      const s = new Date(`${date}T${val}`)
      const e = new Date(`${date}T${endTime}`)
      const diff = Math.round((e.getTime() - s.getTime()) / 60000)
      if (diff > 0) setDurationStr(formatMinutes(diff))
    } else if (val && durationStr) {
      const mins = parseDuration(durationStr)
      if (mins) {
        const s = new Date(`${date}T${val}`)
        s.setMinutes(s.getMinutes() + mins)
        setEndTime(s.toTimeString().slice(0, 5))
      }
    }
  }

  const handleEndChange = (val: string) => {
    setEndTime(val)
    if (startTime && val) {
      const s = new Date(`${date}T${startTime}`)
      const e = new Date(`${date}T${val}`)
      const diff = Math.round((e.getTime() - s.getTime()) / 60000)
      if (diff > 0) setDurationStr(formatMinutes(diff))
    } else if (val && durationStr) {
      const mins = parseDuration(durationStr)
      if (mins) {
        const e = new Date(`${date}T${val}`)
        e.setMinutes(e.getMinutes() - mins)
        setStartTime(e.toTimeString().slice(0, 5))
      }
    }
  }

  const handleDurationChange = (val: string) => {
    setDurationStr(val)
    const mins = parseDuration(val)
    if (mins && startTime && !endTime) {
      const s = new Date(`${date}T${startTime}`)
      s.setMinutes(s.getMinutes() + mins)
      setEndTime(s.toTimeString().slice(0, 5))
    } else if (mins && endTime && !startTime) {
      const e = new Date(`${date}T${endTime}`)
      e.setMinutes(e.getMinutes() - mins)
      setStartTime(e.toTimeString().slice(0, 5))
    }
  }

  const term = taskSearch.toLowerCase()
  const filteredTasks = tasks.filter(t =>
    !t.isArchived && (
      t.title.toLowerCase().includes(term) ||
      (t.jiraKey?.toLowerCase().includes(term) ?? false) ||
      (t.jiraUrl?.toLowerCase().includes(term) ?? false)
    )
  ).slice(0, 8)

  const handleTaskSelect = (t: (typeof tasks)[0]) => {
    setTaskId(t.id)
    setTaskSearch(taskLabel(t))
    setShowDropdown(false)
    if (!editEntry && t.defaultTags?.length) {
      setSelectedTags(prev => {
        const existingIds = new Set(prev.map(tag => tag.id))
        return [...prev, ...t.defaultTags.filter(tag => !existingIds.has(tag.id))]
      })
    }
  }

  const handleTaskSearchChange = (val: string) => {
    setTaskSearch(val)
    setTaskId('')
    setShowDropdown(true)

    if (isHttpUrl(val)) {
      const existing = tasks.find(t => t.jiraUrl === val && !t.isArchived)
      if (existing) {
        handleTaskSelect(existing)
      }
    }
  }

  const handleFocus = () => {
    if (taskId !== '') {
      setTaskSearch('')
    }
    setShowDropdown(true)
  }

  const isJiraUrl = isHttpUrl(taskSearch) && !taskId

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskId) { setError('Välj en uppgift'); return }
    setError('')
    mutation.mutate()
  }

  return (
    <div className="bg-[var(--background-card)] border border-[var(--border)] rounded-xl p-5 md:p-6 shadow-[var(--shadow-sm)]">
      <h3 className="font-display text-xl font-semibold text-[var(--foreground)] mb-5">
        {editEntry ? 'Redigera tidspost' : 'Registrera tid'}
      </h3>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">

        {/* Task selector */}
        <div className="relative" ref={containerRef}>
          <div className="flex flex-col gap-1">
            <label htmlFor="time-entry-task" className="text-sm font-medium text-[var(--foreground-muted)]">Uppgift</label>
            <input
              id="time-entry-task"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showDropdown}
              aria-controls="time-entry-task-options"
              value={taskSearch}
              onChange={e => handleTaskSearchChange(e.target.value)}
              onFocus={handleFocus}
              placeholder="Sök uppgift eller klistra in Jira-URL..."
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background-card)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          {showDropdown && (filteredTasks.length > 0 || isJiraUrl || taskSearch.length > 1) && (
            <div id="time-entry-task-options" role="listbox" className="absolute top-full left-0 right-0 mt-1 bg-[var(--background-elevated)] border border-[var(--border)] rounded-lg shadow-lg z-20 overflow-hidden">
              {filteredTasks.map(t => (
                <button
                  key={t.id}
                  type="button"
                  role="option"
                  aria-selected={t.id === taskId}
                  className="form-list-option w-full text-left px-3 py-2 hover:bg-[var(--background-card-hover)] text-[var(--foreground)] flex items-center gap-2"
                  onMouseDown={() => handleTaskSelect(t)}
                >
                  {t.isFavorite && <span className="text-yellow-400">★</span>}
                  <span className="truncate">{taskLabel(t)}</span>
                  {t.projectName && <span className="form-list-option-meta text-[var(--foreground-muted)] shrink-0">{t.projectName}</span>}
                </button>
              ))}
              {isJiraUrl && (
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="form-list-option w-full text-left px-3 py-2 hover:bg-[var(--background-card-hover)] text-[var(--accent)]"
                  onMouseDown={async () => {
                    setShowDropdown(false)
                    try {
                      const details = await fetchJiraDetails(taskSearch)
                      const newTask = await createTask({ title: details.summary, jiraUrl: taskSearch, description: details.description ?? undefined })
                      qc.invalidateQueries({ queryKey: ['tasks'] })
                      handleTaskSelect(newTask)
                    } catch (e: unknown) {
                      setError((e as Error).message)
                    }
                  }}
                >
                  + Skapa uppgift från Jira-URL
                </button>
              )}
              {!isJiraUrl && taskSearch.length > 1 && (
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="form-list-option w-full text-left px-3 py-2 hover:bg-[var(--background-card-hover)] text-[var(--accent)]"
                  onMouseDown={async () => {
                    setShowDropdown(false)
                    try {
                      const newTask = await createTask({ title: taskSearch })
                      qc.invalidateQueries({ queryKey: ['tasks'] })
                      handleTaskSelect(newTask)
                    } catch (e: unknown) {
                      setError((e as Error).message)
                    }
                  }}
                >
                  + Skapa ny uppgift "{taskSearch}"
                </button>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="time-entry-start" className="text-sm font-medium text-[var(--foreground-muted)]">Start</label>
            <input
              id="time-entry-start"
              type="time"
              value={startTime}
              onChange={e => handleStartChange(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background-card)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="time-entry-end" className="text-sm font-medium text-[var(--foreground-muted)]">Slut</label>
            <input
              id="time-entry-end"
              type="time"
              value={endTime}
              onChange={e => handleEndChange(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background-card)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <Input
            label="Tid (t.ex. 1h 30m)"
            value={durationStr}
            onChange={e => handleDurationChange(e.target.value)}
            placeholder="1h 30m"
          />
        </div>

        <LexicalMarkdownEditor
          key={`${editEntry?.id ?? 'new'}-${editorKey}`}
          label="Beskrivning"
          value={description}
          onChange={setDescription}
          placeholder="Valfri beskrivning"
        />

        <TagInput
          label="Taggar"
          selectedTags={selectedTags}
          availableTags={allTags}
          onAdd={tag => setSelectedTags(prev => [...prev, tag])}
          onRemove={id => setSelectedTags(prev => prev.filter(t => t.id !== id))}
          onCreateAndAdd={async (name) => { try { await createTagMutation.mutateAsync(name) } catch { return } }}
          creating={createTagMutation.isPending}
        />

        {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            {editEntry ? 'Spara' : 'Lägg till'}
          </Button>
          <Button type="button" onClick={onClose}>Avbryt</Button>
        </div>
      </form>
    </div>
  )
}
