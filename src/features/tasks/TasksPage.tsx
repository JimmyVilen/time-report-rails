import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  favoriteTask,
  restoreTask,
  type Task,
} from '../../api/tasks'
import { getProjects } from '../../api/projects'
import { getTags, createTag, type Tag } from '../../api/tags'
import { formatMinutes } from '../../lib/durationParser'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { TagInput } from '../../components/TagInput'

export function TasksPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'active' | 'archived'>('active')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [jiraUrl, setJiraUrl] = useState('')
  const [projectId, setProjectId] = useState<number | ''>('')
  const [defaultTags, setDefaultTags] = useState<Tag[]>([])
  const [error, setError] = useState('')

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', search, tab],
    queryFn: () => getTasks({ q: search || undefined, includeArchived: tab === 'archived' }),
  })
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects })
  const { data: allTags = [] } = useQuery({ queryKey: ['tags'], queryFn: getTags })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tasks'] })
  }

  const createTagMutation = useMutation({
    mutationFn: (name: string) => createTag({ name }),
    onSuccess: (newTag) => {
      qc.invalidateQueries({ queryKey: ['tags'] })
      setDefaultTags(prev => [...prev, newTag])
    },
    onError: (e: Error) => setError(e.message),
  })

  const createMutation = useMutation({
    mutationFn: () => createTask({ title, description: desc || undefined, jiraUrl: jiraUrl || undefined, projectId: projectId || undefined, defaultTagIds: defaultTags.map(t => t.id) }),
    onSuccess: () => { invalidate(); resetForm() },
    onError: (e: Error) => setError(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: () => updateTask(editTask!.id, { title, description: desc || null, jiraUrl: jiraUrl || null, projectId: projectId || null, defaultTagIds: defaultTags.map(t => t.id) }),
    onSuccess: () => { invalidate(); resetForm() },
    onError: (e: Error) => setError(e.message),
  })

  const deleteMutation = useMutation({ mutationFn: deleteTask, onSuccess: invalidate })
  const favoriteMutation = useMutation({ mutationFn: favoriteTask, onSuccess: invalidate })
  const restoreMutation = useMutation({ mutationFn: restoreTask, onSuccess: invalidate })

  const resetForm = () => {
    setEditTask(null); setShowForm(false); setTitle(''); setDesc(''); setJiraUrl(''); setProjectId(''); setDefaultTags([]); setError('')
  }

  const startEdit = (t: Task) => {
    setEditTask(t); setTitle(t.title); setDesc(t.description ?? ''); setJiraUrl(t.jiraUrl ?? ''); setProjectId(t.projectId ?? ''); setDefaultTags(t.defaultTags); setShowForm(false)
  }

  const filtered = tasks.filter(t => t.isArchived === (tab === 'archived'))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); setError('')
    if (editTask) updateMutation.mutate()
    else createMutation.mutate()
  }

  return (
    <div className="flex-1 p-4 md:p-6 max-w-app mx-auto w-full">
      <div className="flex items-center justify-between mb-6 gap-4">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Uppgifter</h1>
        <Button variant="primary" className="page-create-action" onClick={() => { setShowForm(s => !s); setEditTask(null); setTitle(''); setDesc(''); setJiraUrl(''); setProjectId(''); setDefaultTags([]) }}>
          + Ny uppgift
        </Button>
      </div>
      <p className="page-intro">Hantera återkommande arbete, Jira-ärenden och standardtaggar.</p>

      <input
        type="search"
        aria-label="Sök uppgifter"
        placeholder="Sök uppgifter..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full mb-4 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background-card)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
      />

      {(showForm || editTask) && (
        <form onSubmit={handleSubmit} className="bg-[var(--background-card)] border border-[var(--border)] rounded-xl p-4 mb-6 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">{editTask ? 'Redigera uppgift' : 'Ny uppgift'}</h3>
          <Input label="Titel" value={title} onChange={e => setTitle(e.target.value)} required autoFocus />
          <Input label="Beskrivning" value={desc} onChange={e => setDesc(e.target.value)} />
          <Input label="Jira URL" value={jiraUrl} onChange={e => setJiraUrl(e.target.value)} placeholder="https://yourcompany.atlassian.net/browse/PROJ-123" />
          <div className="flex flex-col gap-1">
            <label htmlFor="task-project" className="text-sm font-medium text-[var(--foreground-muted)]">Projekt</label>
            <select
              id="task-project"
              value={projectId}
              onChange={e => setProjectId(e.target.value ? Number(e.target.value) : '')}
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background-card)] text-[var(--foreground)] text-sm"
            >
              <option value="">Inget projekt</option>
              {projects.filter(p => !p.isArchived).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <TagInput
            label="Default-taggar"
            selectedTags={defaultTags}
            availableTags={allTags}
            onAdd={tag => setDefaultTags(prev => [...prev, tag])}
            onRemove={id => setDefaultTags(prev => prev.filter(t => t.id !== id))}
            onCreateAndAdd={async (name) => { try { await createTagMutation.mutateAsync(name) } catch { return } }}
            creating={createTagMutation.isPending}
          />
          {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={createMutation.isPending || updateMutation.isPending}>
              {editTask ? 'Spara' : 'Skapa'}
            </Button>
            <Button type="button" onClick={resetForm}>Avbryt</Button>
          </div>
        </form>
      )}

      <div className="flex gap-1 mb-4">
        {(['active', 'archived'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-[var(--accent)] text-white' : 'text-[var(--foreground-muted)] hover:bg-[var(--background-elevated)]'
            }`}
          >
            {t === 'active' ? 'Aktiva' : 'Arkiverade'}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {filtered.length === 0 && <p className="text-sm text-[var(--foreground-muted)] text-center py-8">Inga uppgifter.</p>}
        {filtered.map(t => (
          <div key={t.id} data-testid="task-row" className="bg-[var(--background-card)] border border-[var(--border)] rounded-xl p-5 flex flex-col items-start gap-3 shadow-[var(--shadow-sm)] sm:flex-row">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display text-lg font-semibold text-[var(--foreground)]">{t.title}</span>
                {t.jiraKey && (
                  <a href={t.jiraUrl ?? '#'} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--accent)] hover:underline">{t.jiraKey}</a>
                )}
                {t.projectName && (
                  <span className="text-xs bg-[var(--background-elevated)] text-[var(--foreground-muted)] px-2 py-0.5 rounded">{t.projectName}</span>
                )}
                {t.isArchived && (
                  <span className="text-xs bg-[var(--champagne-soft)] text-[#7e5c2b] border border-[#e2d0ae] px-2 py-0.5 rounded">Arkiverad</span>
                )}
              </div>
              {t.description && <p className="text-sm text-[var(--foreground-muted)] mt-0.5 line-clamp-2">{t.description}</p>}
              <div className="flex gap-3 mt-1 text-xs text-[var(--foreground-muted)]">
                <span>{t.timeEntryCount} poster</span>
                <span>{formatMinutes(t.totalMinutes)}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => favoriteMutation.mutate(t.id)}
                className={`text-lg leading-none ${t.isFavorite ? 'text-yellow-400' : 'text-[var(--foreground-muted)]'} hover:text-yellow-400 transition-colors`}
                title={t.isFavorite ? 'Ta bort favorit' : 'Markera som favorit'}
              >★</button>
              <Button size="sm" variant="ghost" aria-label={`Redigera ${t.title}`} onClick={() => startEdit(t)}>✎</Button>
              {t.isArchived ? (
                <Button size="sm" variant="ghost" loading={restoreMutation.isPending} onClick={() => restoreMutation.mutate(t.id)}>Återställ</Button>
              ) : (
                <Button size="sm" variant="ghost" className="hover:text-[var(--danger)]" aria-label={`Ta bort ${t.title}`}
                  onClick={() => {
                    if (confirm(`Ta bort "${t.title}"?`)) deleteMutation.mutate(t.id)
                  }}
                >✕</Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
