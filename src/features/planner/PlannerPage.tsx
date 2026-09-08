import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getPlannerBlocks,
  createPlannerBlock,
  updatePlannerBlock,
  deletePlannerBlock,
  type PlannerBlock,
} from '../../api/plannerBlocks'
import { createTask } from '../../api/tasks'
import {
  today,
  getWeekStart,
  getWeekDays,
  getISOWeekNumber,
  formatShortDate,
  addDays,
} from '../../lib/dateUtils'
import { WeekGrid } from './WeekGrid'
import { BlockModal } from './BlockModal'

type ModalState =
  | { mode: 'create'; initialDate: string; initialStartTime: string; initialEndTime: string }
  | { mode: 'edit'; block: PlannerBlock }
  | null

export function PlannerPage() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(today()))
  const [modal, setModal] = useState<ModalState>(null)
  const [convertedId, setConvertedId] = useState<number | null>(null)

  const qc = useQueryClient()
  const weekDays = getWeekDays(weekStart)

  const blocksQuery = useQuery({
    queryKey: ['planner-blocks', weekStart],
    queryFn: () => getPlannerBlocks(weekStart),
  })

  const createMutation = useMutation({
    mutationFn: createPlannerBlock,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planner-blocks', weekStart] })
      setModal(null)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: PlannerBlock) =>
      updatePlannerBlock(id, {
        title: data.title,
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
        color: data.color,
        notes: data.notes,
      }),
    onMutate: async (updated) => {
      await qc.cancelQueries({ queryKey: ['planner-blocks', weekStart] })
      const prev = qc.getQueryData<PlannerBlock[]>(['planner-blocks', weekStart])
      qc.setQueryData<PlannerBlock[]>(['planner-blocks', weekStart], old =>
        old?.map(b => b.id === updated.id ? { ...b, ...updated } : b) ?? []
      )
      return { prev }
    },
    onError: (_err, _updated, ctx) => {
      if (ctx?.prev) qc.setQueryData(['planner-blocks', weekStart], ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['planner-blocks', weekStart] })
      setModal(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deletePlannerBlock,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['planner-blocks', weekStart] })
      const prev = qc.getQueryData<PlannerBlock[]>(['planner-blocks', weekStart])
      qc.setQueryData<PlannerBlock[]>(['planner-blocks', weekStart], old =>
        old?.filter(b => b.id !== id) ?? []
      )
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(['planner-blocks', weekStart], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['planner-blocks', weekStart] }),
  })

  const convertMutation = useMutation({
    mutationFn: (block: PlannerBlock) => createTask({ title: block.title }),
    onSuccess: (_task, block) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setConvertedId(block.id)
      setTimeout(() => setConvertedId(null), 2000)
    },
  })

  function handleSlotClick(date: string, startTime: string, endTime: string) {
    setModal({ mode: 'create', initialDate: date, initialStartTime: startTime, initialEndTime: endTime })
  }

  function handleUpdate(block: PlannerBlock) {
    updateMutation.mutate(block)
  }

  function handleModalSubmit(data: {
    title: string
    date: string
    startTime: string | null
    endTime: string | null
    color: string
    notes: string | null
  }) {
    if (modal?.mode === 'edit') {
      updateMutation.mutate({ ...modal.block, ...data })
    } else {
      createMutation.mutate(data)
    }
  }

  const weekNumber = getISOWeekNumber(weekStart)
  const weekEnd = addDays(weekStart, 4)
  const weekLabel = `Vecka ${weekNumber} · ${formatShortDate(weekStart)}–${formatShortDate(weekEnd)}`

  const blocks = blocksQuery.data ?? []

  return (
    <div className="flex-1 p-4 md:p-6 max-w-app mx-auto w-full">
      <h1 className="mb-8 text-xl font-semibold text-[var(--foreground)]">Planering</h1>
      <p className="page-intro">Forma veckan visuellt och omvandla planerade block till uppgifter.</p>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(ws => addDays(ws, -7))}
            className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-elevated)] transition-colors"
          >
            ← Föregående
          </button>
          <span className="text-sm font-medium text-[var(--foreground)] px-2">{weekLabel}</span>
          <button
            onClick={() => setWeekStart(ws => addDays(ws, 7))}
            className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-elevated)] transition-colors"
          >
            Nästa →
          </button>
          <button
            onClick={() => setWeekStart(getWeekStart(today()))}
            className="px-3 py-1.5 text-sm rounded-lg text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-elevated)] transition-colors"
          >
            Idag
          </button>
        </div>
        <button
          onClick={() => {
            const t = today()
            const defaultDate = weekDays.includes(t) ? t : weekStart
            setModal({ mode: 'create', initialDate: defaultDate, initialStartTime: '09:00', initialEndTime: '10:00' })
          }}
          className="px-4 py-1.5 text-sm rounded-lg bg-[var(--accent)] text-white font-medium hover:opacity-90 transition-opacity"
        >
          + Nytt block
        </button>
      </div>

      {/* Converted notification */}
      {convertedId !== null && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] text-sm border border-[#c8dad5]">
          Uppgift skapad
        </div>
      )}

      {/* Grid */}
      <div className="bg-[var(--background-card)] rounded-xl border border-[var(--border)] overflow-hidden">
        {blocksQuery.isLoading ? (
          <div className="flex items-center justify-center h-48 text-[var(--foreground-muted)] text-sm">
            Laddar...
          </div>
        ) : (
          <WeekGrid
            weekDays={weekDays}
            blocks={blocks}
            onSlotClick={handleSlotClick}
            onBlockEdit={block => setModal({ mode: 'edit', block })}
            onBlockDelete={id => deleteMutation.mutate(id)}
            onBlockUpdate={handleUpdate}
            onBlockConvert={block => convertMutation.mutate(block)}
          />
        )}
      </div>

      <p className="mt-2 text-[10px] text-[var(--foreground-muted)]">
        Klicka i ett tidsslot för att skapa ett block · Dra för att flytta · Dra i kanterna för att ändra storlek
      </p>

      {/* Modal */}
      {modal && (
        <BlockModal
          initialData={
            modal.mode === 'edit'
              ? modal.block
              : {
                  date: modal.initialDate,
                  startTime: `${modal.initialDate}T${modal.initialStartTime}:00`,
                  endTime: `${modal.initialDate}T${modal.initialEndTime}:00`,
                }
          }
          onSubmit={handleModalSubmit}
          onClose={() => setModal(null)}
          isLoading={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  )
}
