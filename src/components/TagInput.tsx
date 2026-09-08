import { useRef, useState } from 'react'
import type { Tag } from '../api/tags'

export function tagColorStyle(color: string | null): React.CSSProperties {
  if (!color) return {}
  // Alpha suffix only works for 6-digit hex colors (#rrggbb)
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return {
      backgroundColor: color + '20',
      color: color,
      border: `1px solid ${color}80`,
    }
  }
  return { color }
}

export const tagDefaultClass =
  'bg-[var(--background-elevated)] text-[var(--foreground-muted)] border border-[var(--border)]'

interface Props {
  label?: string
  selectedTags: Tag[]
  availableTags: Tag[]
  onAdd: (tag: Tag) => void
  onRemove: (tagId: number) => void
  onCreateAndAdd: (name: string) => Promise<void>
  creating?: boolean
}

export function TagInput({ label, selectedTags, availableTags, onAdd, onRemove, onCreateAndAdd, creating }: Props) {
  const [inputValue, setInputValue] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = label ? `tag-input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined

  const selectedIds = new Set(selectedTags.map(t => t.id))
  const term = inputValue.toLowerCase().trim()
  const filtered = availableTags
    .filter(t => !selectedIds.has(t.id) && (term === '' || t.name.toLowerCase().includes(term)))
    .slice(0, 8)

  const exactMatch = availableTags.some(t => t.name.toLowerCase() === term)
  const showCreate = term.length > 0 && !exactMatch

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-[var(--foreground-muted)]">{label}</label>
      )}
      <div className="relative">
        <div
          className="flex flex-wrap gap-1.5 items-center px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background-card)] focus-within:ring-2 focus-within:ring-[var(--accent)] focus-within:border-transparent min-h-[38px] cursor-text"
          onClick={() => inputRef.current?.focus()}
        >
          {selectedTags.map(tag => (
            <span
              key={tag.id}
              style={tagColorStyle(tag.color)}
              className={`tag-chip inline-flex items-center gap-1 px-2 py-0.5 rounded ${!tag.color ? tagDefaultClass : ''}`}
            >
              {tag.name}
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); onRemove(tag.id) }}
                className="ml-0.5 opacity-60 hover:opacity-100 leading-none"
                aria-label={`Ta bort tagg ${tag.name}`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            id={inputId}
            value={inputValue}
            onChange={e => { setInputValue(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={selectedTags.length === 0 ? 'Lägg till taggar...' : ''}
            className="flex-1 min-w-[90px] bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] outline-none"
          />
        </div>

        {open && (filtered.length > 0 || showCreate) && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--background-elevated)] border border-[var(--border)] rounded-lg shadow-lg z-20 overflow-hidden">
            {filtered.map(tag => (
              <button
                key={tag.id}
                type="button"
                className="form-list-option w-full text-left px-3 py-2 hover:bg-[var(--background-card-hover)] text-[var(--foreground)] flex items-center gap-2"
                onMouseDown={() => { onAdd(tag); setInputValue(''); setOpen(false) }}
              >
                <span
                  style={tagColorStyle(tag.color)}
                  className={`tag-chip inline-flex items-center px-2 py-0.5 rounded ${!tag.color ? tagDefaultClass : ''}`}
                >
                  {tag.name}
                </span>
              </button>
            ))}
            {showCreate && (
              <button
                type="button"
                disabled={creating}
                className="form-list-option w-full text-left px-3 py-2 hover:bg-[var(--background-card-hover)] text-[var(--accent)] disabled:opacity-50"
                onMouseDown={async () => {
                  const name = inputValue.trim()
                  setInputValue('')
                  setOpen(false)
                  await onCreateAndAdd(name)
                }}
              >
                {creating ? 'Skapar...' : `+ Skapa tagg "${inputValue.trim()}"`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
