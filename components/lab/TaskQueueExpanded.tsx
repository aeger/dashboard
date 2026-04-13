'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { TaskQueueData, TaskItem, ChecklistItem } from '@/app/api/taskqueue/route'

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, { bg: string; text: string; dot: string; accent: string }> = {
  // JeffLoop statuses
  pending_jeff_action: { bg: 'bg-rose-900/60',    text: 'text-rose-200',    dot: 'bg-rose-400',    accent: '#f43f5e' },
  review_needed:       { bg: 'bg-orange-900/60',   text: 'text-orange-200',  dot: 'bg-orange-400',  accent: '#fb923c' },
  in_progress_jeff:    { bg: 'bg-cyan-900/60',     text: 'text-cyan-200',    dot: 'bg-cyan-400',    accent: '#22d3ee' },
  in_progress_agent:   { bg: 'bg-blue-900/60',     text: 'text-blue-200',    dot: 'bg-blue-400',    accent: '#60a5fa' },
  blocked:             { bg: 'bg-amber-900/60',     text: 'text-amber-200',   dot: 'bg-amber-400',   accent: '#fbbf24' },
  ready:               { bg: 'bg-zinc-700/60',      text: 'text-zinc-300',    dot: 'bg-zinc-400',    accent: '#a1a1aa' },
  backlog:             { bg: 'bg-zinc-800/60',      text: 'text-zinc-400',    dot: 'bg-zinc-600',    accent: '#71717a' },
  completed:           { bg: 'bg-emerald-900/60',   text: 'text-emerald-200', dot: 'bg-emerald-400', accent: '#34d399' },
  cancelled:           { bg: 'bg-zinc-800/40',      text: 'text-zinc-500',    dot: 'bg-zinc-700',    accent: '#52525b' },
  archived:            { bg: 'bg-zinc-900/40',      text: 'text-zinc-600',    dot: 'bg-zinc-800',    accent: '#3f3f46' },
  // Legacy compat
  pending:             { bg: 'bg-zinc-700/60',      text: 'text-zinc-300',    dot: 'bg-zinc-400',    accent: '#a1a1aa' },
  claimed:             { bg: 'bg-blue-900/60',      text: 'text-blue-200',    dot: 'bg-blue-400',    accent: '#60a5fa' },
  failed:              { bg: 'bg-red-900/60',       text: 'text-red-200',     dot: 'bg-red-400',     accent: '#f87171' },
  escalated:           { bg: 'bg-orange-900/60',    text: 'text-orange-200',  dot: 'bg-orange-400',  accent: '#fb923c' },
  delegated:           { bg: 'bg-purple-900/60',    text: 'text-purple-200',  dot: 'bg-purple-400',  accent: '#c084fc' },
  pending_eval:        { bg: 'bg-indigo-900/60',    text: 'text-indigo-200',  dot: 'bg-indigo-400',  accent: '#818cf8' },
  expired:             { bg: 'bg-zinc-800/40',      text: 'text-zinc-500',    dot: 'bg-zinc-600',    accent: '#52525b' },
}

const PRIORITY_LABEL: Record<number, { label: string; cls: string }> = {
  0: { label: 'CRIT', cls: 'bg-red-900/70 text-red-300' },
  1: { label: 'HIGH', cls: 'bg-orange-900/70 text-orange-300' },
  2: { label: 'MED',  cls: 'bg-zinc-700 text-zinc-400' },
  3: { label: 'LOW',  cls: 'bg-zinc-800 text-zinc-500' },
}

const SECTIONS = [
  { key: 'jeff_urgent',   label: 'Needs Jeff',   statuses: ['pending_jeff_action'],         headerCls: 'text-rose-400',    urgent: true  },
  { key: 'review',        label: 'Review',        statuses: ['review_needed'],                headerCls: 'text-orange-400',  urgent: true  },
  { key: 'blocked',       label: 'Blocked',       statuses: ['blocked'],                      headerCls: 'text-amber-400',   urgent: false },
  { key: 'jeff_working',  label: 'Jeff Working',  statuses: ['in_progress_jeff'],             headerCls: 'text-cyan-400',    urgent: false },
  { key: 'agent_running', label: 'Agent Running', statuses: ['in_progress_agent', 'claimed'], headerCls: 'text-blue-400',    urgent: false },
  { key: 'ready',         label: 'Ready',         statuses: ['ready', 'pending', 'backlog'],  headerCls: 'text-zinc-400',    urgent: false },
  { key: 'waiting',       label: 'Waiting',       statuses: ['delegated', 'pending_eval'],    headerCls: 'text-indigo-400',  urgent: false },
  { key: 'failed',        label: 'Failed',        statuses: ['failed', 'escalated'],          headerCls: 'text-red-400',     urgent: false },
  { key: 'completed',     label: 'Completed',     statuses: ['completed'],                    headerCls: 'text-emerald-400', urgent: false },
  { key: 'cancelled',     label: 'Cancelled',     statuses: ['cancelled', 'expired'],         headerCls: 'text-zinc-600',    urgent: false },
]

// Actions available for each status
const ACTIONS_FOR_STATUS: Record<string, Array<{ label: string; status?: string; special?: string; cls?: string }>> = {
  pending_jeff_action: [
    { label: "I'll Handle It",      status: 'in_progress_jeff',  cls: 'bg-cyan-900/60 hover:bg-cyan-800/80 text-cyan-300' },
    { label: 'Send to Agent',       status: 'in_progress_agent', cls: 'bg-blue-900/40 hover:bg-blue-800/60 text-blue-300' },
    { label: 'Mark Complete',       status: 'completed',         cls: 'bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300' },
    { label: 'Cancel',              status: 'cancelled',         cls: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400' },
  ],
  review_needed: [
    { label: 'Approve & Complete',  status: 'completed',         cls: 'bg-emerald-900/60 hover:bg-emerald-800/80 text-emerald-300' },
    { label: 'Reopen (Jeff)',        status: 'in_progress_jeff',  cls: 'bg-cyan-900/40 hover:bg-cyan-800/60 text-cyan-300' },
    { label: 'Send to Agent',       status: 'in_progress_agent', cls: 'bg-blue-900/40 hover:bg-blue-800/60 text-blue-300' },
    { label: 'Cancel',              status: 'cancelled',         cls: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400' },
  ],
  in_progress_jeff: [
    { label: 'Hand Back to Agent',  status: 'in_progress_agent', cls: 'bg-blue-900/60 hover:bg-blue-800/80 text-blue-300' },
    { label: 'Mark Complete',       status: 'completed',         cls: 'bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300' },
    { label: 'Needs Review',        status: 'review_needed',     cls: 'bg-orange-900/40 hover:bg-orange-800/60 text-orange-300' },
    { label: 'Block',               status: 'blocked',           cls: 'bg-amber-900/40 hover:bg-amber-800/60 text-amber-300' },
  ],
  in_progress_agent: [
    { label: 'Needs My Action',     status: 'pending_jeff_action', cls: 'bg-rose-900/60 hover:bg-rose-800/80 text-rose-300' },
    { label: 'Request Review',      status: 'review_needed',       cls: 'bg-orange-900/40 hover:bg-orange-800/60 text-orange-300' },
    { label: 'I\'ll Take Over',     status: 'in_progress_jeff',    cls: 'bg-cyan-900/40 hover:bg-cyan-800/60 text-cyan-300' },
    { label: 'Mark Complete',       status: 'completed',           cls: 'bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300' },
  ],
  ready: [
    { label: 'Start (Jeff)',        status: 'in_progress_jeff',   cls: 'bg-cyan-900/60 hover:bg-cyan-800/80 text-cyan-300' },
    { label: 'Needs My Action',     status: 'pending_jeff_action', cls: 'bg-rose-900/40 hover:bg-rose-800/60 text-rose-300' },
    { label: 'Cancel',              status: 'cancelled',           cls: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400' },
  ],
  backlog: [
    { label: 'Move to Ready',       status: 'ready',              cls: 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300' },
    { label: 'Start (Jeff)',        status: 'in_progress_jeff',   cls: 'bg-cyan-900/40 hover:bg-cyan-800/60 text-cyan-300' },
    { label: 'Cancel',              status: 'cancelled',           cls: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400' },
  ],
  pending: [
    { label: 'Start (Jeff)',        status: 'in_progress_jeff',   cls: 'bg-cyan-900/60 hover:bg-cyan-800/80 text-cyan-300' },
    { label: 'Needs My Action',     status: 'pending_jeff_action', cls: 'bg-rose-900/40 hover:bg-rose-800/60 text-rose-300' },
    { label: 'Cancel',              status: 'cancelled',           cls: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400' },
  ],
  blocked: [
    { label: 'Unblock → Ready',     status: 'ready',              cls: 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300' },
    { label: 'Jeff Will Handle',    status: 'in_progress_jeff',   cls: 'bg-cyan-900/40 hover:bg-cyan-800/60 text-cyan-300' },
    { label: 'Cancel',              status: 'cancelled',           cls: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400' },
  ],
  completed: [
    { label: 'Reopen',              status: 'ready',              cls: 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300' },
    { label: 'Archive',             special: 'archive',           cls: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-500' },
  ],
  cancelled: [
    { label: 'Restore to Ready',    status: 'ready',              cls: 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300' },
    { label: 'Archive',             special: 'archive',           cls: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-500' },
  ],
  failed: [
    { label: 'Send to Agent',       status: 'in_progress_agent', cls: 'bg-blue-900/40 hover:bg-blue-800/60 text-blue-300' },
    { label: 'Retry → Ready',       status: 'ready',              cls: 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300' },
    { label: 'Needs My Action',     status: 'pending_jeff_action', cls: 'bg-rose-900/40 hover:bg-rose-800/60 text-rose-300' },
    { label: 'Archive',             special: 'archive',           cls: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-500' },
  ],
  escalated: [
    { label: 'Needs My Action',     status: 'pending_jeff_action', cls: 'bg-rose-900/60 hover:bg-rose-800/80 text-rose-300' },
    { label: 'Retry → Ready',       status: 'ready',              cls: 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300' },
  ],
  claimed: [
    { label: 'Needs My Action',     status: 'pending_jeff_action', cls: 'bg-rose-900/60 hover:bg-rose-800/80 text-rose-300' },
    { label: 'Request Review',      status: 'review_needed',       cls: 'bg-orange-900/40 hover:bg-orange-800/60 text-orange-300' },
    { label: 'I\'ll Take Over',     status: 'in_progress_jeff',    cls: 'bg-cyan-900/40 hover:bg-cyan-800/60 text-cyan-300' },
  ],
  delegated: [
    { label: 'Needs My Action',     status: 'pending_jeff_action', cls: 'bg-rose-900/40 hover:bg-rose-800/60 text-rose-300' },
    { label: 'Move to Ready',       status: 'ready',              cls: 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300' },
  ],
  pending_eval: [
    { label: 'Review Needed',       status: 'review_needed',      cls: 'bg-orange-900/40 hover:bg-orange-800/60 text-orange-300' },
    { label: 'Complete',            status: 'completed',          cls: 'bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300' },
    { label: 'Move to Ready',       status: 'ready',              cls: 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300' },
  ],
  expired: [
    { label: 'Restore to Ready',    status: 'ready',              cls: 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300' },
    { label: 'Archive',             special: 'archive',           cls: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-500' },
  ],
}

// ── helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000)    return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function elapsed(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function getStatusColor(status: string) {
  return STATUS_COLOR[status] ?? STATUS_COLOR.pending
}

const isRunning = (s: string) => ['claimed', 'in_progress_agent', 'in_progress_jeff'].includes(s)
const isJeffUrgent = (s: string) => ['pending_jeff_action', 'review_needed'].includes(s)

// ── sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const c = getStatusColor(status)
  const label = status.replace(/_/g, ' ')
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 uppercase tracking-wide ${c.bg} ${c.text}`}>
      {label}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: number }) {
  const p = PRIORITY_LABEL[priority] ?? PRIORITY_LABEL[2]
  if (priority === 2) return null
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${p.cls}`}>{p.label}</span>
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ tasks }: { tasks: TaskItem[] }) {
  const counts: Record<string, number> = {}
  for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1

  // Aggregate new + legacy
  const pills = [
    { key: 'jeff_urgent', label: 'Needs Jeff', statuses: ['pending_jeff_action'], accent: '#f43f5e' },
    { key: 'review',      label: 'Review',      statuses: ['review_needed'],       accent: '#fb923c' },
    { key: 'running',     label: 'Running',     statuses: ['in_progress_agent', 'in_progress_jeff', 'claimed'], accent: '#60a5fa' },
    { key: 'ready',       label: 'Ready',       statuses: ['ready', 'backlog', 'pending'],                      accent: '#a1a1aa' },
    { key: 'blocked',     label: 'Blocked',     statuses: ['blocked'],             accent: '#fbbf24' },
    { key: 'failed',      label: 'Failed',      statuses: ['failed', 'escalated'], accent: '#f87171' },
    { key: 'done',        label: 'Done',        statuses: ['completed'],           accent: '#34d399' },
  ]

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {pills.map(({ key, label, statuses, accent }) => {
        const n = statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0)
        return (
          <div
            key={key}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium"
            style={{ background: `${accent}14`, border: `1px solid ${accent}28`, color: n > 0 ? accent : '#52525b' }}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: n > 0 ? accent : '#3f3f46' }} />
            <span className="font-bold tabular-nums">{n}</span>
            <span className="text-zinc-500">{label}</span>
          </div>
        )
      })}
      <span className="text-xs text-zinc-600 ml-1">{tasks.length} total</span>
    </div>
  )
}

// ── Checklist ─────────────────────────────────────────────────────────────────

function ChecklistPanel({ taskId, items, onUpdate }: {
  taskId: string
  items: ChecklistItem[]
  onUpdate: (items: ChecklistItem[]) => void
}) {
  const [newText, setNewText] = useState('')
  const [saving, setSaving] = useState(false)

  async function toggle(item: ChecklistItem) {
    setSaving(true)
    try {
      const res = await fetch(`/api/taskqueue/${taskId}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toggle: { id: item.id, done: !item.done } }),
      })
      if (res.ok) {
        const data = await res.json()
        onUpdate(data.checklist)
      }
    } catch { /* noop */ } finally { setSaving(false) }
  }

  async function addItem() {
    if (!newText.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/taskqueue/${taskId}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ add: newText.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        onUpdate(data.checklist)
        setNewText('')
      }
    } catch { /* noop */ } finally { setSaving(false) }
  }

  const done = items.filter(i => i.done).length
  const total = items.length

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] text-cyan-600/80 uppercase tracking-widest">Checklist</div>
        {total > 0 && (
          <span className="text-[10px] text-zinc-500">{done}/{total}</span>
        )}
      </div>
      <div className="space-y-1 mb-2">
        {items.map(item => (
          <label key={item.id} className="flex items-start gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={item.done}
              onChange={() => toggle(item)}
              disabled={saving}
              className="mt-0.5 flex-shrink-0 accent-cyan-500"
            />
            <span className={`text-xs leading-relaxed ${item.done ? 'line-through text-zinc-600' : 'text-zinc-300'}`}>
              {item.text}
            </span>
          </label>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          type="text"
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
          placeholder="Add item…"
          className="flex-1 px-2 py-1 rounded text-xs bg-zinc-800/60 border border-zinc-700/50 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-cyan-700/60"
        />
        <button
          onClick={addItem}
          disabled={!newText.trim() || saving}
          className="px-2 py-1 rounded text-xs bg-cyan-900/40 text-cyan-400 hover:bg-cyan-900/60 disabled:opacity-40"
        >+</button>
      </div>
    </div>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ task: initialTask, onClose, onRefresh }: {
  task: TaskItem
  onClose: () => void
  onRefresh: () => void
}) {
  const [task, setTask] = useState(initialTask)
  const [jeffNotes, setJeffNotes] = useState((task.context?.jeff_notes ?? '') as string)
  const [contextSummary, setContextSummary] = useState((task.context?.context_summary ?? '') as string)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [exportMenu, setExportMenu] = useState(false)
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync when parent task changes (e.g. after action)
  useEffect(() => {
    setTask(initialTask)
    setJeffNotes((initialTask.context?.jeff_notes ?? '') as string)
    setContextSummary((initialTask.context?.context_summary ?? '') as string)
  }, [initialTask.id, initialTask.status])

  const c = getStatusColor(task.status)
  const ctx = task.context ?? {}
  const checklist: ChecklistItem[] = Array.isArray(ctx.checklist) ? ctx.checklist as ChecklistItem[] : []

  async function doAction(action: { label: string; status?: string; special?: string }) {
    setActionBusy(action.label)
    try {
      if (action.special === 'archive') {
        const res = await fetch(`/api/taskqueue/${task.id}/archive`, { method: 'POST' })
        if (res.ok) { onRefresh(); onClose() }
      } else if (action.status) {
        const res = await fetch(`/api/taskqueue/${task.id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: action.status }),
        })
        if (res.ok) {
          const data = await res.json()
          setTask(data.task ?? { ...task, status: action.status })
          onRefresh()
        }
      }
    } catch (err) {
      console.error('doAction failed:', err)
    } finally { setActionBusy(null) }
  }

  function saveNotes(notes: string, summary: string) {
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(async () => {
      await fetch(`/api/taskqueue/${task.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: task.status,
          jeff_notes: notes,
          context_summary: summary,
        }),
      }).catch(() => {})
    }, 600)
  }

  function handleNotesChange(v: string) {
    setJeffNotes(v)
    saveNotes(v, contextSummary)
  }

  function handleSummaryChange(v: string) {
    setContextSummary(v)
    saveNotes(jeffNotes, v)
  }

  const actions = ACTIONS_FOR_STATUS[task.status] ?? []
  const showChecklist = task.status === 'in_progress_jeff'

  return (
    <div
      className="flex flex-col h-full border-l overflow-hidden"
      style={{ borderColor: `${c.accent}30`, background: 'rgba(10,10,12,0.96)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 p-4 border-b border-zinc-800/60 flex-shrink-0"
           style={{ borderLeftColor: c.accent, borderLeftWidth: 3 }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            {isJeffUrgent(task.status) && (
              <span className="text-[10px] bg-rose-900/40 text-rose-300 px-1.5 py-0.5 rounded animate-pulse">
                ⚡ Needs You
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-zinc-100 leading-snug">{task.title}</h3>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setExportMenu(v => !v)}
              className="text-zinc-600 hover:text-zinc-400 text-[11px] px-2 py-0.5 rounded border border-zinc-800 hover:border-zinc-700"
            >↓ Export</button>
            {exportMenu && (
              <div className="absolute right-0 top-full mt-1 rounded-lg border border-zinc-800 shadow-xl z-50 overflow-hidden"
                   style={{ background: 'rgba(14,14,16,0.98)', minWidth: 120 }}>
                {['json', 'md', 'csv'].map(fmt => (
                  <a
                    key={fmt}
                    href={`/api/taskqueue/${task.id}/export?format=${fmt}`}
                    download
                    onClick={() => setExportMenu(false)}
                    className="block px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 uppercase tracking-wide"
                  >{fmt}</a>
                ))}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 text-lg leading-none mt-0.5">✕</button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">

        {/* Context summary (Jeff-editable) */}
        <div>
          <div className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Context Summary</div>
          <textarea
            value={contextSummary}
            onChange={e => handleSummaryChange(e.target.value)}
            placeholder="Brief context for this task…"
            rows={2}
            className="w-full px-2 py-1.5 rounded-lg text-xs bg-zinc-800/60 border border-zinc-700/40 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 resize-none"
          />
        </div>

        {/* Routing */}
        <div className="flex items-center gap-2">
          <span className="text-zinc-600">Route</span>
          <span className="text-zinc-400">{task.source ?? '—'}</span>
          <span className="text-zinc-700">→</span>
          <span className="text-zinc-400">{task.target ?? '—'}</span>
          {task.claimed_by && <><span className="text-zinc-700">→</span><span className="text-blue-400">{task.claimed_by}</span></>}
        </div>

        {/* Description */}
        {task.description && (
          <div>
            <div className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Description</div>
            <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap">{task.description}</p>
          </div>
        )}

        {/* Checklist — shown when Jeff is working */}
        {showChecklist && (
          <div className="p-3 rounded-xl border border-cyan-900/40 bg-cyan-950/20">
            <ChecklistPanel
              taskId={task.id}
              items={checklist}
              onUpdate={newItems => setTask(prev => ({
                ...prev,
                context: { ...(prev.context ?? {}), checklist: newItems },
              }))}
            />
          </div>
        )}

        {/* Jeff notes */}
        <div>
          <div className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Jeff Notes</div>
          <textarea
            value={jeffNotes}
            onChange={e => handleNotesChange(e.target.value)}
            placeholder="Notes visible to agents after handback…"
            rows={3}
            className="w-full px-2 py-1.5 rounded-lg text-xs bg-zinc-800/60 border border-zinc-700/40 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 resize-none"
          />
        </div>

        {/* Result */}
        {task.result && (
          <div>
            <div className="text-[10px] text-emerald-600/80 uppercase tracking-widest mb-1">Result</div>
            <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap bg-emerald-950/20 rounded-lg p-2 border border-emerald-900/30">{task.result}</p>
          </div>
        )}

        {/* Error */}
        {task.error && (
          <div>
            <div className="text-[10px] text-red-500/80 uppercase tracking-widest mb-1">Error</div>
            <p className="text-red-300 leading-relaxed whitespace-pre-wrap bg-red-950/20 rounded-lg p-2 border border-red-900/30">{task.error}</p>
          </div>
        )}

        {/* Blocked reason */}
        {task.blocked_reason && (
          <div>
            <div className="text-[10px] text-amber-600/80 uppercase tracking-widest mb-1">Blocked Reason</div>
            <p className="text-amber-300 leading-relaxed whitespace-pre-wrap">{task.blocked_reason}</p>
          </div>
        )}

        {/* Tags */}
        {task.tags && task.tags.length > 0 && (
          <div>
            <div className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1.5">Tags</div>
            <div className="flex flex-wrap gap-1">
              {task.tags.map(tag => (
                <span key={tag} className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-[11px]">{tag}</span>
              ))}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="space-y-1 pt-1 border-t border-zinc-800/40">
          <div className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1.5">Timeline</div>
          {[
            { label: 'Created',   val: fmtDate(task.created_at) },
            { label: 'Updated',   val: fmtDate(task.updated_at) },
            { label: 'Claimed',   val: fmtDate(task.claimed_at) },
            { label: 'Attempts',  val: String(task.attempt_count) },
          ].map(({ label, val }) => val !== '—' && val !== '0' ? (
            <div key={label} className="flex justify-between">
              <span className="text-zinc-600">{label}</span>
              <span className="text-zinc-400 tabular-nums">{val}</span>
            </div>
          ) : null)}
          {task.claimed_at && isRunning(task.status) && (
            <div className="flex justify-between">
              <span className="text-zinc-600">Running for</span>
              <span className="text-blue-400 tabular-nums">{elapsed(task.claimed_at)}</span>
            </div>
          )}
        </div>

        {/* Task ID */}
        <div className="flex items-center justify-between pt-1 border-t border-zinc-800/40">
          <span className="text-zinc-700 font-mono text-[10px] truncate">{task.id}</span>
          <button
            onClick={() => navigator.clipboard.writeText(task.id)}
            className="text-[10px] text-zinc-600 hover:text-zinc-300 ml-2 flex-shrink-0"
          >📋</button>
        </div>
      </div>

      {/* Actions */}
      {actions.length > 0 && (
        <div className="flex-shrink-0 p-3 border-t border-zinc-800/60 space-y-1.5">
          {actions.map(action => (
            <button
              key={action.label}
              onClick={() => doAction(action)}
              disabled={actionBusy !== null}
              className={`w-full py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${action.cls ?? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'}`}
            >
              {actionBusy === action.label ? '…' : action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Context menu ──────────────────────────────────────────────────────────────

interface CtxMenu { x: number; y: number; task: TaskItem }

function ContextMenu({ menu, onClose, onCopyId, onMarkExpired, onNeedsAction, onArchive }: {
  menu: CtxMenu
  onClose: () => void
  onCopyId: (t: TaskItem) => void
  onMarkExpired: (t: TaskItem) => void
  onNeedsAction: (t: TaskItem) => void
  onArchive: (t: TaskItem) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const items = [
    { icon: '🔔', label: 'Needs My Action',  action: () => { onNeedsAction(menu.task); onClose() } },
    { icon: '📋', label: 'Copy task ID',      action: () => { onCopyId(menu.task); onClose() } },
    { icon: '📦', label: 'Archive',           action: () => { onArchive(menu.task); onClose() } },
    { icon: '⏭',  label: 'Mark expired',     action: () => { onMarkExpired(menu.task); onClose() } },
  ]

  return (
    <div
      ref={ref}
      className="fixed rounded-xl border shadow-2xl py-1"
      style={{
        left: menu.x, top: menu.y, zIndex: 9999,
        background: 'rgba(12,12,14,0.98)',
        backdropFilter: 'blur(16px)',
        borderColor: 'rgba(255,255,255,0.1)',
        minWidth: '180px',
      }}
    >
      <div className="px-3 py-1.5 border-b border-zinc-800/60 mb-1">
        <p className="text-[10px] text-zinc-500 truncate">{menu.task.title.slice(0, 40)}</p>
      </div>
      {items.map(item => (
        <button
          key={item.label}
          onClick={item.action}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5 hover:text-white transition-colors text-left"
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  )
}

// ── Task row ──────────────────────────────────────────────────────────────────

function TaskRow({ task, selected, onClick, onContextMenu }: {
  task: TaskItem
  selected: boolean
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const c = getStatusColor(task.status)
  const urgent = isJeffUrgent(task.status)
  const running = isRunning(task.status)

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all group ${
        urgent ? 'ring-1 ring-rose-500/20' : ''
      }`}
      style={{
        background: selected ? `${c.accent}14` : urgent ? 'rgba(244,63,94,0.04)' : undefined,
        borderLeft: selected ? `2px solid ${c.accent}` : '2px solid transparent',
      }}
      onMouseEnter={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
      onMouseLeave={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.background = urgent ? 'rgba(244,63,94,0.04)' : '' }}
    >
      {/* Status dot */}
      <div className="flex-shrink-0 mt-1.5">
        {running || urgent ? (
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${c.dot}`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${c.dot}`} />
          </span>
        ) : (
          <span className={`w-2 h-2 rounded-full ${c.dot}`} />
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <StatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
          {task.source && task.target && (
            <span className="text-[10px] text-zinc-600">{task.source} → {task.target}</span>
          )}
        </div>
        <p className="text-sm text-zinc-200 leading-snug group-hover:text-white transition-colors">{task.title}</p>
        {task.description && (
          <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2 leading-relaxed">{task.description}</p>
        )}
        {/* Context summary if available */}
        {task.context?.context_summary ? (
          <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-1 italic">
            {task.context.context_summary as string}
          </p>
        ) : null}
        {task.error && (
          <p className="text-[11px] text-red-400/80 mt-0.5 truncate">{task.error}</p>
        )}
        {task.tags && task.tags.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {task.tags.slice(0, 4).map(tag => (
              <span key={tag} className="text-[10px] px-1.5 py-0 rounded-full bg-zinc-800/80 text-zinc-500">{tag}</span>
            ))}
          </div>
        )}
      </div>

      {/* Right meta */}
      <div className="flex-shrink-0 text-right">
        <div className="text-[10px] text-zinc-600 group-hover:text-zinc-500">{timeAgo(task.updated_at)}</div>
        {isRunning(task.status) && task.claimed_at && (
          <div className="text-[10px] text-blue-400 mt-0.5">{elapsed(task.claimed_at)}</div>
        )}
      </div>
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

type SectionDef = typeof SECTIONS[number] & { urgent?: boolean }

function Section({ section, tasks, selected, onSelect, onContextMenu, defaultOpen = true }: {
  section: SectionDef
  tasks: TaskItem[]
  selected: string | null
  onSelect: (t: TaskItem) => void
  onContextMenu: (e: React.MouseEvent, t: TaskItem) => void
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (tasks.length === 0) return null

  const urgent = section.urgent

  return (
    <div className={urgent ? 'rounded-xl border border-rose-900/30 mb-3 overflow-hidden' : ''}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2 px-2 py-1.5 transition-colors ${
          urgent
            ? 'bg-rose-950/30 hover:bg-rose-950/50'
            : 'hover:bg-zinc-800/30 rounded'
        }`}
      >
        {urgent && <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse flex-shrink-0" />}
        <span className={`text-[10px] font-bold uppercase tracking-widest ${section.headerCls}`}>{section.label}</span>
        <span className={`text-[10px] font-semibold ${urgent ? 'text-rose-400' : 'text-zinc-600'}`}>{tasks.length}</span>
        <span className="ml-auto text-zinc-700 text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="space-y-0.5 mb-4 px-0.5 pt-1">
          {tasks.map(t => (
            <TaskRow
              key={t.id}
              task={t}
              selected={selected === t.id}
              onClick={() => onSelect(t)}
              onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, t) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Archived section ──────────────────────────────────────────────────────────

function ArchivedSection({ onRestore }: { onRestore: () => void }) {
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/taskqueue/archived${search ? `?search=${encodeURIComponent(search)}` : ''}`)
      if (res.ok) { const data = await res.json(); setTasks(data.tasks ?? []) }
    } catch { /* noop */ } finally { setLoading(false) }
  }

  useEffect(() => { if (open) load() }, [open])

  async function restore(id: string) {
    await fetch(`/api/taskqueue/${id}/restore`, { method: 'POST' }).catch(() => {})
    await load()
    onRestore()
  }

  return (
    <div className="border border-zinc-800/50 rounded-xl overflow-hidden mt-2">
      <button
        onClick={() => { setOpen(o => !o); if (!open) load() }}
        className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-900/60 hover:bg-zinc-800/40 transition-colors"
      >
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Archive</span>
        <span className="ml-auto text-zinc-700 text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="p-3 space-y-2">
          <div className="flex gap-1">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') load() }}
              placeholder="Search archived…"
              className="flex-1 px-2 py-1 rounded text-xs bg-zinc-800/60 border border-zinc-700/50 text-zinc-300 placeholder-zinc-600 focus:outline-none"
            />
            <button onClick={load} className="px-2 py-1 rounded text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700">🔍</button>
          </div>
          {loading ? (
            <div className="flex justify-center py-4">
              <div className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
            </div>
          ) : tasks.length === 0 ? (
            <p className="text-xs text-zinc-600 text-center py-4">No archived tasks</p>
          ) : (
            <div className="space-y-1">
              {tasks.map(t => (
                <div key={t.id} className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-zinc-900/40">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-400 truncate">{t.title}</p>
                    <p className="text-[10px] text-zinc-600">{timeAgo(t.updated_at)}</p>
                  </div>
                  <button
                    onClick={() => restore(t.id)}
                    className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
                  >Restore</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Import modal ──────────────────────────────────────────────────────────────

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [content, setContent] = useState('')
  const [preview, setPreview] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)

  function parseContent(text: string): number {
    try {
      const data = JSON.parse(text)
      const tasks = Array.isArray(data) ? data : data.tasks ?? []
      if (!Array.isArray(tasks)) throw new Error('Expected array of tasks')
      setPreview(tasks.length)
      setError('')
      return tasks.length
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON')
      setPreview(null)
      return 0
    }
  }

  async function doImport() {
    let tasks: unknown[]
    try {
      const data = JSON.parse(content)
      tasks = Array.isArray(data) ? data : data.tasks ?? []
    } catch {
      setError('Invalid JSON'); return
    }
    setImporting(true)
    try {
      const res = await fetch('/api/taskqueue/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks }),
      })
      if (res.ok) { onDone(); onClose() }
      else {
        const d = await res.json()
        setError(d.error ?? 'Import failed')
      }
    } catch { setError('Network error') } finally { setImporting(false) }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="rounded-2xl border border-zinc-800 shadow-2xl p-5 w-full max-w-lg"
           style={{ background: 'rgba(12,12,14,0.98)' }}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-zinc-100">Import Tasks</h3>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300">✕</button>
        </div>
        <p className="text-xs text-zinc-500 mb-2">Paste JSON — array of tasks or <code className="text-zinc-400">{'{"tasks": [...]}'}</code></p>
        <textarea
          value={content}
          onChange={e => { setContent(e.target.value); parseContent(e.target.value) }}
          rows={8}
          placeholder='[{"title": "My task", "description": "..."}]'
          className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-zinc-800/60 border border-zinc-700/50 text-zinc-300 placeholder-zinc-600 focus:outline-none mb-2"
        />
        {preview !== null && <p className="text-xs text-emerald-400 mb-2">{preview} task{preview !== 1 ? 's' : ''} ready to import</p>}
        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-1.5 rounded-lg text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700">Cancel</button>
          <button
            onClick={doImport}
            disabled={!preview || importing}
            className="flex-1 py-1.5 rounded-lg text-xs bg-blue-900/60 text-blue-300 hover:bg-blue-800/80 disabled:opacity-40"
          >{importing ? 'Importing…' : 'Import'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TaskQueueExpanded() {
  const [data, setData] = useState<(TaskQueueData & { jeff_urgent?: TaskItem[] }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<TaskItem | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [search, setSearch] = useState('')
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<string>>(new Set(['expired', 'cancelled']))
  const [showImport, setShowImport] = useState(false)

  const load = useCallback(() =>
    fetch('/api/taskqueue')
      .then(r => r.json())
      .then(d => !d.error && setData(d))
      .catch(() => {}), [])

  useEffect(() => {
    load().finally(() => setLoading(false))
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  const allTasks: TaskItem[] = data ? [
    ...(data.jeff_urgent ?? []),
    ...data.problems,
    ...data.waiting,
    ...data.active,
    ...(data.recent ?? []),
  ].filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i) : []

  const filteredTasks = allTasks.filter(t => {
    if (hiddenStatuses.has(t.status)) return false
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
        !(t.tags ?? []).some(tag => tag.toLowerCase().includes(search.toLowerCase()))) return false
    return true
  })

  function toggleStatus(s: string) {
    setHiddenStatuses(prev => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })
  }

  function handleCopyId(task: TaskItem) {
    navigator.clipboard.writeText(task.id).catch(() => {})
  }

  async function handleMarkExpired(task: TaskItem) {
    await fetch(`/api/taskqueue/${task.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    }).catch(() => {})
    load()
  }

  async function handleNeedsAction(task: TaskItem) {
    await fetch(`/api/taskqueue/${task.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'pending_jeff_action' }),
    }).catch(() => {})
    load()
  }

  async function handleArchive(task: TaskItem) {
    await fetch(`/api/taskqueue/${task.id}/archive`, { method: 'POST' }).catch(() => {})
    if (selected?.id === task.id) setSelected(null)
    load()
  }

  // Keep selected task in sync after reload
  useEffect(() => {
    if (selected && allTasks.length > 0) {
      const updated = allTasks.find(t => t.id === selected.id)
      if (updated && updated.status !== selected.status) {
        setSelected(updated)
      }
    }
  }, [allTasks])

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-zinc-700 border-t-blue-400 rounded-full animate-spin" />
    </div>
  )

  if (!data) return <div className="text-zinc-500 text-sm text-center py-10">Task queue unavailable</div>

  const showPanel = !!selected

  return (
    <div className="flex gap-0 h-full min-h-[600px]" onClick={() => setCtxMenu(null)}>
      {/* ── Left: task list ── */}
      <div className={`flex flex-col min-w-0 transition-all duration-200 ${showPanel ? 'flex-[0_0_55%]' : 'flex-1'}`}>

        {/* Stats */}
        <div className="mb-3">
          <StatsBar tasks={allTasks} />
        </div>

        {/* Filter + controls */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <input
            type="text"
            placeholder="Search tasks or tags…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-0 px-3 py-1.5 rounded-lg text-xs bg-zinc-800/60 border border-zinc-700/50 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
          {['cancelled', 'completed', 'expired'].map(s => {
            const hidden = hiddenStatuses.has(s)
            const c = STATUS_COLOR[s]
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] transition-all"
                style={{
                  background: hidden ? 'rgba(255,255,255,0.03)' : `${c.accent}14`,
                  border: `1px solid ${hidden ? 'rgba(255,255,255,0.08)' : c.accent + '30'}`,
                  color: hidden ? '#52525b' : c.accent,
                }}
              >
                {hidden ? 'Show' : 'Hide'} {s}
              </button>
            )
          })}
          <button
            onClick={() => setShowImport(true)}
            className="px-2 py-1.5 rounded-lg text-[11px] bg-zinc-800/60 border border-zinc-700/50 text-zinc-500 hover:text-zinc-300"
          >↑ Import</button>
        </div>

        {/* Sections */}
        <div className="flex-1 overflow-y-auto pr-1">
          {SECTIONS.filter(s => !s.statuses.every(st => hiddenStatuses.has(st))).map(section => (
            <Section
              key={section.key}
              section={section}
              tasks={filteredTasks.filter(t => section.statuses.includes(t.status))}
              selected={selected?.id ?? null}
              onSelect={t => setSelected(prev => prev?.id === t.id ? null : t)}
              onContextMenu={(e, t) => setCtxMenu({ x: e.clientX, y: e.clientY, task: t })}
              defaultOpen={['jeff_urgent', 'review', 'jeff_working', 'agent_running'].includes(section.key)}
            />
          ))}
          {filteredTasks.length === 0 && (
            <div className="text-zinc-600 text-sm text-center py-12">No tasks match</div>
          )}

          {/* Archived section at bottom */}
          <ArchivedSection onRestore={load} />
        </div>
      </div>

      {/* ── Right: detail panel ── */}
      {showPanel && selected && (
        <div className="flex-[0_0_45%] min-w-0 ml-3">
          <DetailPanel
            task={selected}
            onClose={() => setSelected(null)}
            onRefresh={load}
          />
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          menu={ctxMenu}
          onClose={() => setCtxMenu(null)}
          onCopyId={handleCopyId}
          onMarkExpired={handleMarkExpired}
          onNeedsAction={handleNeedsAction}
          onArchive={handleArchive}
        />
      )}

      {/* Import modal */}
      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onDone={load} />
      )}
    </div>
  )
}
