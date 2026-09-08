import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  archiveProject,
  unarchiveProject,
  type Project,
} from '../../api/projects'
import { formatMinutes } from '../../lib/durationParser'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'

export function ProjectsPage() {
  const qc = useQueryClient()
  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: getProjects })
  const projects = projectsQuery.data ?? []
  const [tab, setTab] = useState<'active' | 'archived'>('active')
  const [showForm, setShowForm] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  const invalidate = () => qc.invalidateQueries({ queryKey: ['projects'] })

  const createMutation = useMutation({
    mutationFn: () => createProject(name, description || undefined),
    onSuccess: () => { invalidate(); setShowForm(false); setName(''); setDescription(''); setError('') },
    onError: (e: Error) => setError(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: () => updateProject(editProject!.id, name, description || undefined),
    onSuccess: () => { invalidate(); setEditProject(null); setError('') },
    onError: (e: Error) => setError(e.message),
  })

  const deleteMutation = useMutation({ mutationFn: deleteProject, onSuccess: invalidate })
  const archiveMutation = useMutation({ mutationFn: archiveProject, onSuccess: invalidate })
  const unarchiveMutation = useMutation({ mutationFn: unarchiveProject, onSuccess: invalidate })

  const filtered = projects.filter(p => tab === 'active' ? !p.isArchived : p.isArchived)

  const startEdit = (p: Project) => {
    setEditProject(p); setName(p.name); setDescription(p.description ?? ''); setShowForm(false)
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (editProject) updateMutation.mutate()
    else createMutation.mutate()
  }

  return (
    <div className="flex-1 p-4 md:p-6 max-w-app mx-auto w-full">
      <div className="flex items-center justify-between mb-6 gap-4">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Projekt</h1>
        <Button variant="primary" className="page-create-action" onClick={() => { setShowForm(s => !s); setEditProject(null); setName(''); setDescription('') }}>
          + Nytt projekt
        </Button>
      </div>
      <p className="page-intro">Organisera uppgifter och följ den rapporterade tiden per projekt.</p>

      {(showForm || editProject) && (
        <form onSubmit={handleFormSubmit} className="bg-[var(--background-card)] border border-[var(--border)] rounded-xl p-4 mb-6 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">{editProject ? 'Redigera projekt' : 'Nytt projekt'}</h3>
          <Input label="Namn" value={name} onChange={e => setName(e.target.value)} required autoFocus />
          <Input label="Beskrivning" value={description} onChange={e => setDescription(e.target.value)} />
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={createMutation.isPending || updateMutation.isPending}>
              {editProject ? 'Spara' : 'Skapa'}
            </Button>
            <Button type="button" onClick={() => { setShowForm(false); setEditProject(null) }}>Avbryt</Button>
          </div>
        </form>
      )}

      <div className="flex gap-1 mb-4">
        {(['active', 'archived'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-[var(--accent)] text-white' : 'text-[var(--foreground-muted)] hover:bg-[var(--background-elevated)]'
            }`}
          >
            {t === 'active' ? 'Aktiva' : 'Arkiverade'}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {projectsQuery.isPending && (
          <p className="text-sm text-[var(--foreground-muted)] text-center py-8">Laddar projekt…</p>
        )}
        {projectsQuery.isError && (
          <p className="text-sm text-[var(--danger)] text-center py-8">
            Kunde inte hämta projekt: {projectsQuery.error.message}
          </p>
        )}
        {projectsQuery.isSuccess && filtered.length === 0 && (
          <p className="text-sm text-[var(--foreground-muted)] text-center py-8">Inga projekt.</p>
        )}
        {filtered.map(p => (
          <div key={p.id} className="bg-[var(--background-card)] border border-[var(--border)] rounded-xl p-5 flex flex-col items-start gap-4 shadow-[var(--shadow-sm)] sm:flex-row sm:items-center">
            <div className="flex-1 min-w-0">
              <span className="font-display text-lg font-semibold text-[var(--foreground)]">
                {p.name}
              </span>
              {p.description && <p className="text-sm text-[var(--foreground-muted)] mt-0.5">{p.description}</p>}
              <div className="flex gap-3 mt-1 text-xs text-[var(--foreground-muted)]">
                <span>{p.taskCount} uppgifter</span>
                <span>{formatMinutes(p.totalMinutes)}</span>
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => startEdit(p)}>✎</Button>
              {p.isArchived ? (
                <Button size="sm" variant="ghost" loading={unarchiveMutation.isPending} onClick={() => unarchiveMutation.mutate(p.id)}>Återställ</Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => archiveMutation.mutate(p.id)}>Arkivera</Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="hover:text-[var(--danger)]"
                onClick={() => { if (confirm(`Ta bort projektet "${p.name}"?`)) deleteMutation.mutate(p.id) }}
              >✕</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
