import { useRef, useState, useEffect } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { type PlannerBlock, type BlockColor, BLOCK_COLORS } from '../../api/plannerBlocks'
import { MarkdownRenderer } from '../../components/MarkdownRenderer'

const GRID_START_HOUR = 7
const GRID_END_HOUR = 19
const GRID_DURATION_MINUTES = (GRID_END_HOUR - GRID_START_HOUR) * 60
const ROW_HEIGHT = 40
const TOTAL_HEIGHT = (GRID_DURATION_MINUTES / 30) * ROW_HEIGHT

function parseTimeMinutes(isoOrTime: string | null): number | null {
  if (!isoOrTime) return null
  const t = isoOrTime.includes('T') ? isoOrTime.split('T')[1] : isoOrTime
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToTimeStr(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatTimeRange(startIso: string | null, endIso: string | null): string {
  const start = startIso?.includes('T') ? startIso.split('T')[1].slice(0, 5) : startIso?.slice(0, 5)
  const end = endIso?.includes('T') ? endIso.split('T')[1].slice(0, 5) : endIso?.slice(0, 5)
  if (start && end) return `${start}–${end}`
  if (start) return start
  return ''
}

interface ResizingState {
  edge: 'top' | 'bottom'
  origStart: number
  origEnd: number
  currentDelta: number
}

interface Props {
  block: PlannerBlock
  onEdit: (block: PlannerBlock) => void
  onDelete: (id: number) => void
  onUpdate: (block: PlannerBlock) => void
  onConvert: (block: PlannerBlock) => void
}

export function PlannerBlockCard({ block, onEdit, onDelete, onUpdate, onConvert }: Props) {
  const [resizing, setResizing] = useState<ResizingState | null>(null)
  const [showActions, setShowActions] = useState(false)
  const resizingRef = useRef<ResizingState | null>(null)

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: block.id,
    data: block,
  })

  useEffect(() => {
    resizingRef.current = resizing
  }, [resizing])

  const colorKey = (block.color as BlockColor) ?? 'blue'
  const colorStyle = BLOCK_COLORS[colorKey] ?? BLOCK_COLORS.blue

  const origStart = parseTimeMinutes(block.startTime) ?? GRID_START_HOUR * 60
  const origEnd = parseTimeMinutes(block.endTime) ?? (origStart + 60)

  let displayStart = origStart
  let displayEnd = origEnd
  if (resizing) {
    const snapped = Math.round(resizing.currentDelta / 30) * 30
    if (resizing.edge === 'top') {
      displayStart = Math.max(GRID_START_HOUR * 60, Math.min(origEnd - 30, origStart + snapped))
    } else {
      displayEnd = Math.min(GRID_END_HOUR * 60, Math.max(origStart + 30, origEnd + snapped))
    }
  }

  const topPx = ((displayStart - GRID_START_HOUR * 60) / GRID_DURATION_MINUTES) * TOTAL_HEIGHT
  const heightPx = Math.max(ROW_HEIGHT, ((displayEnd - displayStart) / GRID_DURATION_MINUTES) * TOTAL_HEIGHT)
  const duration = displayEnd - displayStart

  function handleResizePointerDown(e: React.PointerEvent, edge: 'top' | 'bottom') {
    e.preventDefault()
    e.stopPropagation()

    const startY = e.clientY
    const state: ResizingState = { edge, origStart, origEnd, currentDelta: 0 }
    resizingRef.current = state
    setResizing(state)

    const onMove = (moveE: PointerEvent) => {
      const deltaY = moveE.clientY - startY
      const deltaMinutes = (deltaY / ROW_HEIGHT) * 30
      const updated = { ...resizingRef.current!, currentDelta: deltaMinutes }
      resizingRef.current = updated
      setResizing({ ...updated })
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)

      const s = resizingRef.current
      if (s) {
        const snapped = Math.round(s.currentDelta / 30) * 30
        const newStart = s.edge === 'top'
          ? Math.max(GRID_START_HOUR * 60, Math.min(origEnd - 30, origStart + snapped))
          : origStart
        const newEnd = s.edge === 'bottom'
          ? Math.min(GRID_END_HOUR * 60, Math.max(origStart + 30, origEnd + snapped))
          : origEnd

        onUpdate({
          ...block,
          startTime: `${block.date}T${minutesToTimeStr(newStart)}:00`,
          endTime: `${block.date}T${minutesToTimeStr(newEnd)}:00`,
        })
      }

      resizingRef.current = null
      setResizing(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      data-planner-block
      data-testid="planner-block"
      data-block-id={block.id}
      className="absolute left-1 right-1 rounded select-none shadow-[0_4px_12px_rgba(27,43,38,0.06)]"
      style={{
        top: topPx,
        height: heightPx,
        background: colorStyle.bg,
        borderLeft: `3px solid ${colorStyle.border}`,
        opacity: isDragging ? 0 : 1,
        zIndex: resizing ? 20 : 10,
      }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Top resize handle */}
      <div
        data-testid="resize-top"
        className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize z-10"
        onPointerDown={e => handleResizePointerDown(e, 'top')}
      />

      {/* Drag handle + content */}
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        className="absolute inset-0 top-1.5 bottom-1.5 overflow-hidden cursor-grab active:cursor-grabbing px-1.5 pt-1"
        onClick={e => {
          if (resizing) return
          e.stopPropagation()
          onEdit(block)
        }}
      >
        <div className="text-xs font-medium leading-tight truncate" style={{ color: colorStyle.border }}>
          {block.title}
        </div>
        {duration >= 60 && (
          <div className="text-[10px] text-[var(--foreground-muted)] mt-0.5">
            {formatTimeRange(block.startTime, block.endTime)}
          </div>
        )}
        {duration >= 90 && block.notes && (
          <div className="mt-1 text-[10px] text-[var(--foreground-muted)] overflow-hidden" style={{ maxHeight: heightPx - 48 }}>
            <MarkdownRenderer content={block.notes} />
          </div>
        )}
      </div>

      {/* Bottom resize handle */}
      <div
        data-testid="resize-bottom"
        className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize z-10"
        onPointerDown={e => handleResizePointerDown(e, 'bottom')}
      />

      {/* Hover action buttons */}
      {showActions && !isDragging && !resizing && (
        <div
          className="absolute top-0.5 right-0.5 flex gap-0.5 z-30"
          onMouseDown={e => e.stopPropagation()}
        >
          <button
            onClick={e => { e.stopPropagation(); onConvert(block) }}
            className="w-5 h-5 flex items-center justify-center rounded text-[var(--foreground-muted)] hover:text-[var(--accent)] hover:bg-[var(--background-elevated)] text-[10px]"
            title="Konvertera till uppgift"
          >
            ✓
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(block.id) }}
            className="w-5 h-5 flex items-center justify-center rounded text-[var(--foreground-muted)] hover:text-[var(--danger)] hover:bg-[var(--background-elevated)] text-[10px]"
            title="Ta bort"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
