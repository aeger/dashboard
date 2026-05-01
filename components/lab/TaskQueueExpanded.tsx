'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { TaskQueueData, TaskItem, ChecklistItem, TaskRun } from '@/app/api/taskqueue/route'
import TaskDependencyGraph from './TaskDependencyGraph'
import TaskDependencyModal from './TaskDependencyModal'

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
  { key: 'failed',        label: 'Failed',        statuses: ['failed', 'escalated'],          headerCls: 'text-red-400',     urgent: false },
  { key: 'blocked',       label: 'Blocked',       statuses: ['blocked'],                      headerCls: 'text-amber-400',   urgent: false },
  { key: 'waiting',       label: 'Waiting',       statuses: ['delegated', 'pending_eval'],    headerCls: 'text-indigo-400',  urgent: false },
  { key: 'jeff_working',  label: 'Jeff Working',  statuses: ['in_progress_jeff'],             headerCls: 'text-cyan-400',    urgent: false },
  { key: 'agent_running', label: 'Agent Running', statuses: ['in_progress_agent', 'claimed'], headerCls: 'text-blue-400',    urgent: false },
  { key: 'ready',         label: 'Ready',         statuses: ['ready', 'pending', 'backlog'],  headerCls: 'text-zinc-400',    urgent: false },
  { key: 'completed',     label: 'Completed',     statuses: ['completed'],                    headerCls: 'text-emerald-400', urgent: false },
  { key: 'cancelled',     label: 'Cancelled',     statuses: ['cancelled', 'expired'],         headerCls: 'text-zinc-600',    urgent: false },
]

// Actions available for each status
const ACTIONS_FOR_STATUS: Record<string, Array<{ label: string; status?: string; special?: string; cls?: string }>> = {
  pending_jeff_action: [
    { label: "I'll Handle It",            status: 'in_progress_jeff',  cls: 'bg-cyan-900/60 hover:bg-cyan-800/80 text-cyan-300' },
    { label: 'Return to Agent Queue',     status: 'ready',             cls: 'bg-blue-900/40 hover:bg-blue-800/60 text-blue-300' },
    { label: 'Mark Complete',             status: 'completed',         cls: 'bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300' },
    { label: 'Cancel',                    status: 'cancelled',         cls: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400' },
  ],
  review_needed: [
    { label: 'Approve & Complete',        status: 'completed',         cls: 'bg-emerald-900/60 hover:bg-emerald-800/80 text-emerald-300' },
    { label: 'I\'ll Fix It (take over)', status: 'in_progress_jeff',  cls: 'bg-cyan-900/40 hover:bg-cyan-800/60 text-cyan-300' },
    { label: 'Send Back to Agent',        status: 'ready',             cls: 'bg-blue-900/40 hover:bg-blue-800/60 text-blue-300' },
    { label: 'Cancel',                    status: 'cancelled',         cls: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400' },
  ],
  in_progress_jeff: [
    { label: 'Hand Back to Agent Queue',  status: 'ready',             cls: 'bg-blue-900/60 hover:bg-blue-800/80 text-blue-300' },
    { label: 'Mark Complete',             status: 'completed',         cls: 'bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300' },
    { label: 'Flag for Review',           status: 'review_needed',     cls: 'bg-orange-900/40 hover:bg-orange-800/60 text-orange-300' },
    { label: 'Block',                     status: 'blocked',           cls: 'bg-amber-900/40 hover:bg-amber-800/60 text-amber-300' },
  ],
  in_progress_agent: [
    { label: 'Needs My Input',            status: 'pending_jeff_action', cls: 'bg-rose-900/60 hover:bg-rose-800/80 text-rose-300' },
    { label: 'Flag for Review',           status: 'review_needed',       cls: 'bg-orange-900/40 hover:bg-orange-800/60 text-orange-300' },
    { label: 'I\'ll Take Over',           status: 'in_progress_jeff',    cls: 'bg-cyan-900/40 hover:bg-cyan-800/60 text-cyan-300' },
    { label: 'Mark Complete',             status: 'completed',           cls: 'bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300' },
  ],
  ready: [
    { label: '▶ Run Now',                 special: 'run',                cls: 'bg-violet-900/60 hover:bg-violet-800/80 text-violet-300' },
    { label: 'I\'ll Handle It (Jeff)',    status: 'in_progress_jeff',    cls: 'bg-cyan-900/60 hover:bg-cyan-800/80 text-cyan-300' },
    { label: 'Needs My Input First',      status: 'pending_jeff_action', cls: 'bg-rose-900/40 hover:bg-rose-800/60 text-rose-300' },
    { label: 'Cancel',                    status: 'cancelled',           cls: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400' },
  ],
  backlog: [
    { label: '▶ Run Now',                 special: 'run',                cls: 'bg-violet-900/60 hover:bg-violet-800/80 text-violet-300' },
    { label: 'Queue for Agent',           status: 'ready',               cls: 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300' },
    { label: 'I\'ll Handle It (Jeff)',    status: 'in_progress_jeff',    cls: 'bg-cyan-900/40 hover:bg-cyan-800/60 text-cyan-300' },
    { label: 'Cancel',                    status: 'cancelled',           cls: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400' },
  ],
  pending: [
    { label: '▶ Run Now',                 special: 'run',                cls: 'bg-violet-900/60 hover:bg-violet-800/80 text-violet-300' },
    { label: 'I\'ll Handle It (Jeff)',    status: 'in_progress_jeff',    cls: 'bg-cyan-900/60 hover:bg-cyan-800/80 text-cyan-300' },
    { label: 'Needs My Input First',      status: 'pending_jeff_action', cls: 'bg-rose-900/40 hover:bg-rose-800/60 text-rose-300' },
    { label: 'Cancel',                    status: 'cancelled',           cls: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400' },
  ],
  blocked: [
    { label: 'Unblock → Back to Queue',   status: 'ready',              cls: 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300' },
    { label: 'I\'ll Handle It (Jeff)',    status: 'in_progress_jeff',   cls: 'bg-cyan-900/40 hover:bg-cyan-800/60 text-cyan-300' },
    { label: 'Cancel',                    status: 'cancelled',           cls: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400' },
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
    { label: 'Retry (Agent)',        status: 'ready',              cls: 'bg-blue-900/40 hover:bg-blue-800/60 text-blue-300' },
    { label: 'I\'ll Fix It (Jeff)', status: 'in_progress_jeff',   cls: 'bg-cyan-900/40 hover:bg-cyan-800/60 text-cyan-300' },
    { label: 'Needs My Input',       status: 'pending_jeff_action', cls: 'bg-rose-900/40 hover:bg-rose-800/60 text-rose-300' },
    { label: 'Archive',              special: 'archive',           cls: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-500' },
  ],
  escalated: [
    { label: 'Needs My Action',     status: 'pending_jeff_action', cls: 'bg-rose-900/60 hover:bg-rose-800/80 text-rose-300' },
    { label: 'Retry → Ready',       status: 'ready',              cls: 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300' },
  ],
  claimed: [
    { label: 'Needs My Input',       status: 'pending_jeff_action', cls: 'bg-rose-900/60 hover:bg-rose-800/80 text-rose-300' },
    { label: 'Flag for Review',      status: 'review_needed',       cls: 'bg-orange-900/40 hover:bg-orange-800/60 text-orange-300' },
    { label: 'I\'ll Take Over',      status: 'in_progress_jeff',    cls: 'bg-cyan-900/40 hover:bg-cyan-800/60 text-cyan-300' },
  ],
  delegated: [
    { label: 'Needs My Action',     status: 'pending_jeff_action', cls: 'bg-rose-900/40 hover:bg-rose-800/60 text-rose-300' },
    { label: 'Move to Ready',       status: 'ready',              cls: 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300' },
  ],
  pending_eval: [
    { label: 'Approve & Complete',  status: 'completed',          cls: 'bg-emerald-900/60 hover:bg-emerald-800/80 text-emerald-300' },
    { label: 'Split into Subtasks', special: 'split',             cls: 'bg-indigo-900/60 hover:bg-indigo-800/80 text-indigo-300' },
    { label: 'Review Needed',       status: 'review_needed',      cls: 'bg-orange-900/40 hover:bg-orange-800/60 text-orange-300' },
    { label: 'Send Back to Agent',  status: 'ready',              cls: 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300' },
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

type ActivityRow = { id: string; activity_type: string; content: string; created_at: string }

function HistoryPanel({ runs, totalCount }: { runs: TaskRun[]; totalCount?: number | null }) {
  const [open, setOpen] = useState(true)
  if (!runs || runs.length === 0) {
    return (
      <div className="rounded-xl border border-violet-900/30 bg-violet-950/10 p-3">
        <div className="text-[10px] text-violet-500/80 uppercase tracking-widest">Run History</div>
        <div className="text-xs text-zinc-500 mt-1 italic">No runs recorded yet.</div>
      </div>
    )
  }
  // Render newest-first; sort by run_at desc.
  const sorted = [...runs].sort((a, b) =>
    (b.run_at ?? '').localeCompare(a.run_at ?? '')
  )
  return (
    <div className="rounded-xl border border-violet-900/30 bg-violet-950/10">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-violet-950/20 transition rounded-xl"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-violet-500/80 uppercase tracking-widest">Run History</span>
          <span className="text-[10px] text-violet-700/60">
            {totalCount ?? sorted.length} run{(totalCount ?? sorted.length) === 1 ? '' : 's'}
          </span>
        </div>
        <span className="text-zinc-500 text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 max-h-96 overflow-y-auto">
          {sorted.map((run, idx) => {
            const isLatest = idx === 0
            const status = run.status ?? 'unknown'
            const statusColor =
              status === 'completed' ? 'text-emerald-400' :
              status === 'failed' || status === 'escalated' ? 'text-red-400' :
              status === 'ready' ? 'text-amber-400' :
              'text-zinc-500'
            return (
              <div
                key={`${run.run_at}-${idx}`}
                className={`rounded-lg p-2 border text-xs ${isLatest ? 'border-violet-700/40 bg-violet-900/10' : 'border-zinc-800/60 bg-zinc-900/30'}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-zinc-500 text-[10px] tabular-nums whitespace-nowrap">
                      {fmtDate(run.run_at)}
                    </span>
                    <span className={`uppercase text-[9px] tracking-wider ${statusColor}`}>
                      {status}
                    </span>
                    {isLatest && (
                      <span className="text-[9px] uppercase tracking-wider text-violet-500/80 px-1.5 py-0.5 rounded bg-violet-950/40">
                        latest
                      </span>
                    )}
                  </div>
                  {run.completed_at && run.completed_at !== run.run_at && (
                    <span className="text-zinc-600 text-[10px] whitespace-nowrap">
                      done {timeAgo(run.completed_at)}
                    </span>
                  )}
                </div>
                {run.result && (
                  <div className="text-zinc-400 leading-relaxed whitespace-pre-wrap break-words mt-1">
                    {run.result.length > 600 ? run.result.slice(0, 600) + '…' : run.result}
                  </div>
                )}
                {run.notes && (
                  <div className="mt-1 pt-1 border-t border-zinc-800/40 text-zinc-500 italic">
                    📝 {run.notes}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function LiveActivityLog({ taskId }: { taskId: string }) {
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [lastTs, setLastTs] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const poll = useCallback(async () => {
    const params = new URLSearchParams({ task_id: taskId, limit: '30' })
    if (lastTs) params.set('since', lastTs)
    const res = await fetch(`/api/agent-activity?${params}`).catch(() => null)
    if (!res?.ok) return
    const data = await res.json()
    const newRows: ActivityRow[] = data.rows ?? []
    if (newRows.length) {
      setRows(prev => {
        const ids = new Set(prev.map(r => r.id))
        const added = newRows.filter(r => !ids.has(r.id))
        return added.length ? [...prev, ...added] : prev
      })
      setLastTs(newRows[newRows.length - 1].created_at)
    }
  }, [taskId, lastTs])

  useEffect(() => { poll() }, [taskId])
  useEffect(() => {
    const t = setInterval(poll, 5000)
    return () => clearInterval(t)
  }, [poll])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [rows.length])

  const typeStyle: Record<string, string> = {
    thinking:  'text-zinc-500',
    tool_call: 'text-blue-400',
    result:    'text-emerald-400',
    status:    'text-indigo-400',
    error:     'text-red-400',
  }

  if (!rows.length) return (
    <div className="text-[10px] text-zinc-600 italic animate-pulse">Waiting for agent activity…</div>
  )

  return (
    <div className="space-y-1 max-h-48 overflow-y-auto font-mono">
      {rows.map(r => (
        <div key={r.id} className="flex gap-2 text-[10px] leading-relaxed">
          <span className="text-zinc-700 flex-shrink-0 tabular-nums">
            {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <span className={`flex-shrink-0 ${typeStyle[r.activity_type] ?? 'text-zinc-500'}`}>
            [{r.activity_type}]
          </span>
          <span className="text-zinc-300 break-all">{r.content.slice(0, 200)}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

// ── SplitModal ────────────────────────────────────────────────────────────────

interface SubtaskDraft { title: string; description: string; priority: number }

function SplitModal({ task, onClose, onDone }: {
  task: TaskItem
  onClose: () => void
  onDone: () => void
}) {
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([
    { title: '', description: '', priority: task.priority },
    { title: '', description: '', priority: task.priority },
  ])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addRow() {
    setSubtasks(prev => [...prev, { title: '', description: '', priority: task.priority }])
  }
  function removeRow(i: number) {
    setSubtasks(prev => prev.filter((_, idx) => idx !== i))
  }
  function update(i: number, field: keyof SubtaskDraft, val: string | number) {
    setSubtasks(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s))
  }

  async function handleSubmit() {
    const valid = subtasks.filter(s => s.title.trim())
    if (!valid.length) { setError('Add at least one subtask title'); return }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/taskqueue/${task.id}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtasks: valid }),
      })
      const data = await res.json()
      if (res.ok) {
        onDone()
      } else {
        setError(data.error ?? `Failed (${res.status})`)
      }
    } catch {
      setError('Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-xl mx-4 rounded-2xl border border-indigo-900/60 shadow-2xl overflow-hidden"
           style={{ background: 'rgba(12,12,16,0.98)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-indigo-900/40">
          <div>
            <div className="text-sm font-semibold text-indigo-300">Split into Subtasks</div>
            <div className="text-[10px] text-zinc-500 mt-0.5 truncate max-w-sm">{task.title}</div>
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 text-lg">✕</button>
        </div>

        {/* Subtask list */}
        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">
            Define subtasks — each will be queued as Ready for the agent
          </div>
          {subtasks.map((s, i) => (
            <div key={i} className="p-3 rounded-xl border border-zinc-800/60 bg-zinc-900/40 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-600 font-mono w-4 flex-shrink-0">{i + 1}.</span>
                <input
                  value={s.title}
                  onChange={e => update(i, 'title', e.target.value)}
                  placeholder="Subtask title…"
                  autoFocus={i === 0}
                  className="flex-1 px-2 py-1 rounded-lg text-xs bg-zinc-800/60 border border-zinc-700/40 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-700/60"
                />
                <select
                  value={s.priority}
                  onChange={e => update(i, 'priority', Number(e.target.value))}
                  className="px-2 py-1 rounded-lg text-[10px] bg-zinc-800/60 border border-zinc-700/40 text-zinc-400 focus:outline-none"
                >
                  <option value={0}>CRIT</option>
                  <option value={1}>HIGH</option>
                  <option value={2}>MED</option>
                  <option value={3}>LOW</option>
                </select>
                {subtasks.length > 1 && (
                  <button onClick={() => removeRow(i)} className="text-zinc-600 hover:text-red-400 text-sm flex-shrink-0">✕</button>
                )}
              </div>
              <textarea
                value={s.description}
                onChange={e => update(i, 'description', e.target.value)}
                placeholder="Description (optional)…"
                rows={2}
                className="w-full px-2 py-1.5 rounded-lg text-[11px] bg-zinc-800/40 border border-zinc-800/60 text-zinc-400 placeholder-zinc-600 focus:outline-none focus:border-indigo-800/60 resize-none"
              />
            </div>
          ))}
          <button
            onClick={addRow}
            className="w-full py-2 rounded-xl border border-dashed border-zinc-700/60 text-zinc-600 hover:text-zinc-400 hover:border-zinc-600 text-xs transition-colors"
          >+ Add subtask</button>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-zinc-800/40 space-y-2">
          {error && (
            <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">{error}</div>
          )}
          <div className="text-[10px] text-zinc-600">
            Parent task will be marked <span className="text-emerald-500">completed</span>. Subtasks queued as <span className="text-zinc-400">ready</span>.
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={busy}
              className="flex-1 py-2 rounded-xl text-xs font-semibold bg-indigo-900/70 hover:bg-indigo-800/90 text-indigo-200 disabled:opacity-50 transition-colors"
            >{busy ? 'Creating…' : `Create ${subtasks.filter(s => s.title.trim()).length} Subtask${subtasks.filter(s => s.title.trim()).length !== 1 ? 's' : ''}`}</button>
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailPanel({ task: initialTask, onClose, onRefresh, onEditDependencies }: {
  task: TaskItem
  onClose: () => void
  onRefresh: () => void
  onEditDependencies?: (task: TaskItem) => void
}) {
  const [task, setTask] = useState(initialTask)
  const [jeffNotes, setJeffNotes] = useState((task.context?.jeff_notes ?? '') as string)
  const [contextSummary, setContextSummary] = useState((task.context?.context_summary ?? '') as string)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [exportMenu, setExportMenu] = useState(false)
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const [editDescription, setEditDescription] = useState(task.description ?? '')
  const [editPriority, setEditPriority] = useState(task.priority)
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [showSplitModal, setShowSplitModal] = useState(false)

  // Sync when parent task changes (e.g. after action)
  useEffect(() => {
    setTask(initialTask)
    setJeffNotes((initialTask.context?.jeff_notes ?? '') as string)
    setContextSummary((initialTask.context?.context_summary ?? '') as string)
    setEditTitle(initialTask.title)
    setEditDescription(initialTask.description ?? '')
    setEditPriority(initialTask.priority)
    setIsEditMode(false)
  }, [initialTask.id, initialTask.status])

  const c = getStatusColor(task.status)
  const ctx = task.context ?? {}
  const checklist: ChecklistItem[] = Array.isArray(ctx.checklist) ? ctx.checklist as ChecklistItem[] : []

  async function doAction(action: { label: string; status?: string; special?: string }) {
    if (action.special === 'split') {
      setShowSplitModal(true)
      return
    }
    setActionBusy(action.label)
    setActionError(null)
    // Flush pending notes debounce immediately so notes are always included in status transitions
    if (notesTimer.current) { clearTimeout(notesTimer.current); notesTimer.current = null }
    try {
      if (action.special === 'archive') {
        const res = await fetch(`/api/taskqueue/${task.id}/archive`, { method: 'POST' })
        if (res.ok) { onRefresh(); onClose() }
        else setActionError('Archive failed')
      } else if (action.special === 'run') {
        const res = await fetch(`/api/taskqueue/${task.id}/run`, { method: 'POST' })
        const data = await res.json()
        if (res.ok) { onRefresh() }
        else setActionError(data.error ?? 'Failed to trigger poller')
      } else if (action.status) {
        const res = await fetch(`/api/taskqueue/${task.id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: action.status,
            jeff_notes: jeffNotes,
            context_summary: contextSummary,
          }),
        })
        const data = await res.json()
        if (res.ok && data.task) {
          setTask(data.task)
          onRefresh()
        } else {
          setActionError(data.error ?? `Failed (${res.status})`)
        }
      }
    } catch (err) {
      console.error('doAction failed:', err)
      setActionError('Network error')
    } finally { setActionBusy(null) }
  }

  async function saveEdit() {
    setEditBusy(true)
    setEditError(null)
    try {
      const res = await fetch(`/api/taskqueue/${task.id}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, description: editDescription, priority: editPriority }),
      })
      const data = await res.json()
      if (res.ok && data.task) {
        setTask(data.task)
        setIsEditMode(false)
        onRefresh()
      } else {
        setEditError(data.error ?? `Failed (${res.status})`)
      }
    } catch {
      setEditError('Network error')
    } finally {
      setEditBusy(false)
    }
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
          {isEditMode ? (
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              className="w-full mt-1 px-2 py-1 rounded-lg text-sm font-semibold bg-zinc-800/80 border border-blue-700/50 text-zinc-100 focus:outline-none focus:border-blue-500"
            />
          ) : (
            <h3 className="text-sm font-semibold text-zinc-100 leading-snug">{task.title}</h3>
          )}
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
          {onEditDependencies && (
            <button
              onClick={() => onEditDependencies(task)}
              className="text-zinc-600 hover:text-zinc-400 text-[11px] px-2 py-0.5 rounded border border-zinc-800 hover:border-zinc-700"
              title="Edit task dependencies"
            >🔗 Dependencies</button>
          )}
          <button
            onClick={() => { setIsEditMode(v => !v); setEditError(null) }}
            className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${isEditMode ? 'bg-blue-900/40 border-blue-700/50 text-blue-300' : 'border-zinc-800 text-zinc-600 hover:text-zinc-400 hover:border-zinc-700'}`}
            title="Edit task fields"
          >✎ Edit</button>
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

        {/* Parent task indicator */}
        {(task as TaskItem & { parent_task_id?: string | null }).parent_task_id && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-indigo-950/30 border border-indigo-900/30">
            <span className="text-indigo-500 text-[10px]">⤴</span>
            <span className="text-[10px] text-indigo-400">Subtask of</span>
            <span className="text-[10px] text-indigo-300 font-mono truncate">
              {(task as TaskItem & { parent_task_id?: string | null }).parent_task_id?.slice(0, 8)}…
            </span>
          </div>
        )}

        {/* Routing */}
        <div className="flex items-center gap-2">
          <span className="text-zinc-600">Route</span>
          <span className="text-zinc-400">{task.source ?? '—'}</span>
          <span className="text-zinc-700">→</span>
          <span className="text-zinc-400">{task.target ?? '—'}</span>
          {task.claimed_by && <><span className="text-zinc-700">→</span><span className="text-blue-400">{task.claimed_by}</span></>}
        </div>

        {/* Description / Edit mode */}
        {isEditMode ? (
          <div className="space-y-3 p-3 rounded-xl border border-blue-900/40 bg-blue-950/10">
            <div className="text-[10px] text-blue-400 uppercase tracking-widest">Editing Task</div>
            <div>
              <div className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Description</div>
              <textarea
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                rows={5}
                className="w-full px-2 py-1.5 rounded-lg text-xs bg-zinc-800/60 border border-blue-700/40 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-y"
                placeholder="Task description…"
              />
            </div>
            <div>
              <div className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Priority</div>
              <select
                value={editPriority}
                onChange={e => setEditPriority(Number(e.target.value))}
                className="px-2 py-1 rounded-lg text-xs bg-zinc-800/60 border border-blue-700/40 text-zinc-300 focus:outline-none focus:border-blue-500"
              >
                <option value={0}>0 — CRIT</option>
                <option value={1}>1 — HIGH</option>
                <option value={2}>2 — MED</option>
                <option value={3}>3 — LOW</option>
              </select>
            </div>
            {editError && (
              <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">{editError}</div>
            )}
            <div className="flex gap-2">
              <button
                onClick={saveEdit}
                disabled={editBusy || !editTitle.trim()}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-blue-900/60 hover:bg-blue-800/80 text-blue-200 disabled:opacity-50 transition-colors"
              >{editBusy ? 'Saving…' : 'Save Changes'}</button>
              <button
                onClick={() => { setIsEditMode(false); setEditError(null) }}
                className="px-3 py-1.5 rounded-lg text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
              >Cancel</button>
            </div>
          </div>
        ) : task.description && (
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

        {/* Live activity — shown while agent is running */}
        {isRunning(task.status) && (
          <div className="p-3 rounded-xl border border-blue-900/30 bg-blue-950/10">
            <div className="flex items-center gap-2 mb-2">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-400" />
              </span>
              <div className="text-[10px] text-blue-500 uppercase tracking-widest">Live Activity</div>
            </div>
            <LiveActivityLog taskId={task.id} />
          </div>
        )}

        {/* Jeff notes — highlighted when task needs handback context */}
        <div className={`rounded-xl border p-3 ${jeffNotes ? 'border-amber-800/40 bg-amber-950/10' : 'border-zinc-800/40 bg-zinc-900/10'}`}>
          <div className="flex items-center justify-between mb-1">
            <div className={`text-[10px] uppercase tracking-widest ${jeffNotes ? 'text-amber-500/80' : 'text-zinc-600'}`}>
              {jeffNotes ? '📝 Jeff Notes (visible to agents)' : 'Jeff Notes'}
            </div>
            <div className="text-[10px] text-zinc-700">auto-saves</div>
          </div>
          <textarea
            value={jeffNotes}
            onChange={e => handleNotesChange(e.target.value)}
            placeholder="Add context, direction, or feedback for the agent when sending this task back…"
            rows={4}
            className={`w-full px-2 py-1.5 rounded-lg text-xs bg-zinc-800/60 border text-zinc-300 placeholder-zinc-600 focus:outline-none resize-y ${jeffNotes ? 'border-amber-700/40 focus:border-amber-600' : 'border-zinc-700/40 focus:border-zinc-600'}`}
          />
        </div>

        {/* Result */}
        {task.result && (
          <div>
            <div className="text-[10px] text-emerald-600/80 uppercase tracking-widest mb-1">Result</div>
            <div className="bg-emerald-950/20 rounded-lg p-2 border border-emerald-900/30 prose prose-invert prose-xs max-w-none text-zinc-300 text-xs leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.result}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Run history — only shown for recurring (canonical scheduled) tasks */}
        {task.recurring && (
          <HistoryPanel
            runs={Array.isArray(task.runs) ? task.runs : []}
            totalCount={task.run_count ?? null}
          />
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
          {actionError && (
            <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">
              {actionError}
            </div>
          )}
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

      {/* Split Modal */}
      {showSplitModal && (
        <SplitModal
          task={task}
          onClose={() => setShowSplitModal(false)}
          onDone={() => { setShowSplitModal(false); onRefresh(); onClose() }}
        />
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

function TaskRow({ task, selected, onClick, onContextMenu, onNeedsAction }: {
  task: TaskItem
  selected: boolean
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onNeedsAction?: (t: TaskItem) => void
}) {
  const c = getStatusColor(task.status)
  const urgent = isJeffUrgent(task.status)
  const running = isRunning(task.status)
  const showNeedsAction = onNeedsAction && ['in_progress_agent', 'claimed', 'failed', 'escalated', 'waiting', 'delegated', 'pending_eval'].includes(task.status)

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
      <div className="flex-shrink-0 text-right flex flex-col items-end gap-1">
        {task.recurring && task.last_run_at ? (
          <div className="text-[10px] text-violet-400/80 group-hover:text-violet-300" title={`Recurring task — ${task.run_count ?? '?'} runs`}>
            ↻ last run {timeAgo(task.last_run_at)}
          </div>
        ) : (
          <div className="text-[10px] text-zinc-600 group-hover:text-zinc-500">{timeAgo(task.updated_at)}</div>
        )}
        {isRunning(task.status) && task.claimed_at && (
          <div className="text-[10px] text-blue-400">{elapsed(task.claimed_at)}</div>
        )}
        {showNeedsAction && (
          <button
            onClick={(e) => { e.stopPropagation(); onNeedsAction!(task) }}
            className="text-[10px] px-1.5 py-0.5 rounded bg-rose-900/40 border border-rose-800/40 text-rose-300 hover:bg-rose-900/70 transition-colors opacity-0 group-hover:opacity-100"
            title="Needs My Action"
          >
            ! Jeff
          </button>
        )}
      </div>
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

type SectionDef = typeof SECTIONS[number] & { urgent?: boolean }

function Section({ section, tasks, selected, onSelect, onContextMenu, onNeedsAction, defaultOpen = true }: {
  section: SectionDef
  tasks: TaskItem[]
  selected: string | null
  onSelect: (t: TaskItem) => void
  onContextMenu: (e: React.MouseEvent, t: TaskItem) => void
  onNeedsAction: (t: TaskItem) => void
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
              onNeedsAction={onNeedsAction}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Scheduled view ────────────────────────────────────────────────────────────

const DOW_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DOW_LONG  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_LABEL = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_LONG  = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function scheduleLabel(s: string): string {
  const key = s.trim().toLowerCase()
  if (key === 'hourly')   return 'Every hour'
  if (key === 'daily')    return 'Every day'
  if (key === 'weekly')   return 'Every week'
  if (key === 'biweekly') return 'Every 2 weeks'
  if (key === 'monthly')  return 'Every month'
  if (key === 'yearly')   return 'Every year'
  if (key === 'weekdays') return 'Weekdays (Mon–Fri)'
  // biweekly M H D custom format
  const biw = /^biweekly\s+(\d+)\s+(\d+)\s+([0-6])$/.exec(s.trim().toLowerCase())
  if (biw) {
    const [, min, hr, d] = biw
    const t = `${hr.padStart(2,'0')}:${min.padStart(2,'0')}`
    return `Every 2 weeks on ${DOW_LONG[Number(d)]} at ${t}`
  }
  // Humanize 5-field cron
  const parts = s.trim().split(/\s+/)
  if (parts.length === 5) {
    const [min, hr, dom, mon, dow] = parts
    const minOk = /^\d+$/.test(min)
    const hrOk = /^\d+$/.test(hr)
    const t = (minOk && hrOk) ? `${hr.padStart(2,'0')}:${min.padStart(2,'0')}` : null
    // Hourly at a given minute: M * * * *
    if (minOk && hr === '*' && dom === '*' && mon === '*' && dow === '*') {
      return `Hourly at :${min.padStart(2,'0')}`
    }
    // Daily
    if (t && dom === '*' && mon === '*' && dow === '*') return `Daily at ${t}`
    // Weekdays
    if (t && dom === '*' && mon === '*' && dow === '1-5') return `Weekdays at ${t}`
    // Single DOW (weekly)
    if (t && dom === '*' && mon === '*' && /^[0-6]$/.test(dow)) {
      return `Every ${DOW_LONG[Number(dow)]} at ${t}`
    }
    // Multi DOW
    if (t && dom === '*' && mon === '*' && /^[0-6](,[0-6])+$/.test(dow)) {
      const days = dow.split(',').map(n => DOW_LABEL[Number(n)]).join(', ')
      return `${days} at ${t}`
    }
    // Yearly: M H D Mon *
    if (t && /^\d+$/.test(dom) && /^\d+$/.test(mon) && dow === '*') {
      const m = Number(mon)
      if (m >= 1 && m <= 12) return `Every year on ${MONTH_LONG[m]} ${dom} at ${t}`
    }
    // Monthly: M H D * *
    if (t && /^\d+$/.test(dom) && mon === '*' && dow === '*') return `Monthly on day ${dom} at ${t}`
  }
  return s
}

// ── Shared schedule editor ────────────────────────────────────────────────────

type RepeatFreq =
  | 'none' | 'hourly' | 'daily' | 'weekly' | 'biweekly'
  | 'monthly' | 'yearly' | 'weekdays' | 'custom_days' | 'cron'

type ScheduleState = {
  freq: RepeatFreq
  time: string           // HH:MM UTC — used by daily/weekdays/weekly/biweekly/custom_days/monthly/yearly
  minute: number         // 0-59 — used by hourly (separate so time stays HH:MM clean)
  days: number[]         // 0-6 (Sun=0) — multi for custom_days, single for weekly/biweekly ([0])
  dayOfMonth: number     // 1-31 — used by monthly/yearly
  month: number          // 1-12 — used by yearly
  cron: string           // custom cron expression
}

const DEFAULT_SCHED: ScheduleState = {
  freq: 'none', time: '09:00', minute: 0, days: [1],
  dayOfMonth: 1, month: 1, cron: '',
}

const REPEAT_OPTIONS: { value: RepeatFreq; label: string }[] = [
  { value: 'none',        label: 'Does not repeat' },
  { value: 'hourly',      label: 'Hourly' },
  { value: 'daily',       label: 'Daily' },
  { value: 'weekly',      label: 'Weekly' },
  { value: 'biweekly',    label: 'Every 2 weeks' },
  { value: 'monthly',     label: 'Monthly' },
  { value: 'yearly',      label: 'Yearly' },
  { value: 'weekdays',    label: 'Weekdays (Mon–Fri)' },
  { value: 'custom_days', label: 'Custom days of week…' },
  { value: 'cron',        label: 'Custom cron expression…' },
]

const DOW_CHIPS = [
  { key: 'SU', num: 0, label: 'Su' },
  { key: 'MO', num: 1, label: 'Mo' },
  { key: 'TU', num: 2, label: 'Tu' },
  { key: 'WE', num: 3, label: 'We' },
  { key: 'TH', num: 4, label: 'Th' },
  { key: 'FR', num: 5, label: 'Fr' },
  { key: 'SA', num: 6, label: 'Sa' },
]

// Build the schedule string the poller expects from the UI state.
function buildSchedule(st: ScheduleState): string {
  const { freq, time, minute, days, dayOfMonth, month, cron } = st
  if (freq === 'none') return ''
  if (freq === 'cron') return cron.trim()
  const [hh, mm] = (time || '09:00').split(':')
  const h = Math.max(0, Math.min(23, Number(hh) || 0))
  const m = Math.max(0, Math.min(59, Number(mm) || 0))
  const dom = Math.max(1, Math.min(31, Number(dayOfMonth) || 1))
  const mon = Math.max(1, Math.min(12, Number(month) || 1))
  const dow0 = (days[0] ?? 1) // default Mon
  const minOfHour = Math.max(0, Math.min(59, Number(minute) || 0))
  if (freq === 'hourly')   return `${minOfHour} * * * *`
  if (freq === 'daily')    return `${m} ${h} * * *`
  if (freq === 'weekdays') return `${m} ${h} * * 1-5`
  if (freq === 'weekly')   return `${m} ${h} * * ${dow0}`
  if (freq === 'biweekly') return `biweekly ${m} ${h} ${dow0}`
  if (freq === 'monthly')  return `${m} ${h} ${dom} * *`
  if (freq === 'yearly')   return `${m} ${h} ${dom} ${mon} *`
  if (freq === 'custom_days') {
    if (!days.length) return ''
    return `${m} ${h} * * ${[...days].sort((a,b) => a - b).join(',')}`
  }
  return ''
}

// Inverse: best-effort parse a stored schedule string back into UI state.
function parseSchedule(s: string): ScheduleState {
  if (!s) return { ...DEFAULT_SCHED }
  const key = s.trim().toLowerCase()
  // Legacy bare aliases
  const bareAliases: RepeatFreq[] = ['hourly','daily','weekly','biweekly','monthly','yearly','weekdays']
  if ((bareAliases as string[]).includes(key)) {
    return { ...DEFAULT_SCHED, freq: key as RepeatFreq }
  }
  // biweekly M H D
  const biw = /^biweekly\s+(\d+)\s+(\d+)\s+([0-6])$/.exec(key)
  if (biw) {
    const [, min, hr, d] = biw
    return {
      ...DEFAULT_SCHED,
      freq: 'biweekly',
      time: `${hr.padStart(2,'0')}:${min.padStart(2,'0')}`,
      days: [Number(d)],
    }
  }
  const parts = s.trim().split(/\s+/)
  if (parts.length === 5) {
    const [min, hr, dom, mon, dow] = parts
    // Hourly: M * * * *
    if (/^\d+$/.test(min) && hr === '*' && dom === '*' && mon === '*' && dow === '*') {
      return { ...DEFAULT_SCHED, freq: 'hourly', minute: Number(min) }
    }
    if (/^\d+$/.test(min) && /^\d+$/.test(hr)) {
      const time = `${hr.padStart(2,'0')}:${min.padStart(2,'0')}`
      if (dom === '*' && mon === '*' && dow === '*')   return { ...DEFAULT_SCHED, freq: 'daily', time }
      if (dom === '*' && mon === '*' && dow === '1-5') return { ...DEFAULT_SCHED, freq: 'weekdays', time }
      // Weekly single DOW
      if (dom === '*' && mon === '*' && /^[0-6]$/.test(dow)) {
        return { ...DEFAULT_SCHED, freq: 'weekly', time, days: [Number(dow)] }
      }
      // Custom days
      if (dom === '*' && mon === '*' && /^[0-6](,[0-6])+$/.test(dow)) {
        return { ...DEFAULT_SCHED, freq: 'custom_days', time, days: dow.split(',').map(Number) }
      }
      // Yearly
      if (/^\d+$/.test(dom) && /^\d+$/.test(mon) && dow === '*') {
        return { ...DEFAULT_SCHED, freq: 'yearly', time, dayOfMonth: Number(dom), month: Number(mon) }
      }
      // Monthly
      if (/^\d+$/.test(dom) && mon === '*' && dow === '*') {
        return { ...DEFAULT_SCHED, freq: 'monthly', time, dayOfMonth: Number(dom) }
      }
    }
  }
  return { ...DEFAULT_SCHED, freq: 'cron', cron: s }
}

function ScheduleEditor({
  state, onChange, compact = false,
}: {
  state: ScheduleState
  onChange: (next: ScheduleState) => void
  compact?: boolean
}) {
  const { freq, time, minute, days, dayOfMonth, month, cron } = state
  const set = (patch: Partial<ScheduleState>) => onChange({ ...state, ...patch })
  const needsTime = ['daily','weekdays','weekly','biweekly','custom_days','monthly','yearly'].includes(freq)
  const inputCls = compact
    ? 'text-xs px-2 py-1 rounded bg-zinc-800 border border-zinc-700/50 text-zinc-300 w-full'
    : 'w-full text-xs bg-zinc-900 border border-zinc-700 rounded-md px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-600'
  const smallSelectCls = 'text-xs bg-zinc-800 border border-zinc-700/50 rounded px-2 py-1 text-zinc-200'
  const dow0 = days[0] ?? 1
  return (
    <div className="space-y-2">
      <select
        value={freq}
        onChange={e => {
          const newFreq = e.target.value as RepeatFreq
          // Re-initialize days sensibly when switching into weekly/biweekly/custom_days
          let nextDays = days
          if (newFreq === 'weekly' || newFreq === 'biweekly') nextDays = [days[0] ?? 1]
          else if (newFreq === 'custom_days' && !days.length) nextDays = [1]
          set({ freq: newFreq, days: nextDays })
        }}
        className={inputCls}
      >
        {REPEAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {freq === 'hourly' && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Starts at minute</span>
          <select
            value={minute}
            onChange={e => set({ minute: Number(e.target.value) })}
            className={smallSelectCls}
          >
            {Array.from({ length: 60 }, (_, i) => i).map(i => (
              <option key={i} value={i}>:{i.toString().padStart(2,'0')}</option>
            ))}
          </select>
          <span className="text-[10px] text-zinc-600">of every hour (UTC)</span>
        </div>
      )}

      {(freq === 'weekly' || freq === 'biweekly') && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">On</span>
          <select
            value={dow0}
            onChange={e => set({ days: [Number(e.target.value)] })}
            className={smallSelectCls}
          >
            {DOW_LONG.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
      )}

      {freq === 'monthly' && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">On day</span>
          <select
            value={dayOfMonth}
            onChange={e => set({ dayOfMonth: Number(e.target.value) })}
            className={smallSelectCls}
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map(i => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
          <span className="text-[10px] text-zinc-600">of every month</span>
        </div>
      )}

      {freq === 'yearly' && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">On</span>
          <select
            value={month}
            onChange={e => set({ month: Number(e.target.value) })}
            className={smallSelectCls}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(i => (
              <option key={i} value={i}>{MONTH_LONG[i]}</option>
            ))}
          </select>
          <select
            value={dayOfMonth}
            onChange={e => set({ dayOfMonth: Number(e.target.value) })}
            className={smallSelectCls}
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map(i => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </div>
      )}

      {needsTime && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Run at</span>
          <input
            type="time"
            value={time || '09:00'}
            onChange={e => set({ time: e.target.value })}
            className="text-xs bg-zinc-800 border border-zinc-700/50 rounded px-2 py-1 text-zinc-200"
          />
          <span className="text-[10px] text-zinc-600">UTC</span>
        </div>
      )}

      {freq === 'custom_days' && (
        <div className="flex gap-1 flex-wrap">
          {DOW_CHIPS.map(d => {
            const selected = days.includes(d.num)
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => {
                  const next = selected ? days.filter(x => x !== d.num) : [...days, d.num]
                  set({ days: next })
                }}
                className={`w-7 h-7 rounded-full text-[11px] font-medium transition-colors ${
                  selected
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-500'
                }`}
              >
                {d.label}
              </button>
            )
          })}
        </div>
      )}

      {freq === 'cron' && (
        <input
          value={cron}
          onChange={e => set({ cron: e.target.value })}
          placeholder="e.g. 0 9 * * 1  (Mon 9am UTC)"
          className={`${inputCls} font-mono`}
        />
      )}
    </div>
  )
}

// ── Unified Scheduled Activity view (Phase 2) ─────────────────────────────────
// Reads from /api/scheduled-activity (which queries the scheduled_activity
// registry seeded by scripts/scheduled_activity_seed.py). Surfaces every
// scheduler in az-lab — systemd timers, cron, CCR triggers, agent loops,
// task_queue recurring rows — in one view.

interface ScheduledActivityRow {
  id: string
  name: string
  display_name: string | null
  description: string | null
  kind: 'systemd' | 'cron' | 'ccr_trigger' | 'agent_loop' | 'task_queue_recurring'
  schedule: string
  schedule_tz: string
  enabled: boolean
  paused_at: string | null
  pause_reason: string | null
  source_ref: Record<string, unknown>
  last_run_at: string | null
  last_status: string | null
  last_result_summary: string | null
  next_run_at: string | null
  run_count: number
  runs: Array<{ run_at: string; status?: string; result_summary?: string | null; duration_sec?: number | null; notes?: string | null }>
  tags: string[]
}

const KIND_LABEL: Record<ScheduledActivityRow['kind'], { short: string; long: string; cls: string }> = {
  systemd:              { short: 'systemd',  long: 'systemd timer',          cls: 'bg-blue-950/40 border-blue-800/40 text-blue-300' },
  cron:                 { short: 'cron',     long: 'user crontab',           cls: 'bg-amber-950/30 border-amber-800/40 text-amber-300' },
  ccr_trigger:          { short: 'ccr',      long: 'claude.ai trigger',      cls: 'bg-purple-950/30 border-purple-800/40 text-purple-300' },
  agent_loop:           { short: 'agent',    long: 'always-on agent loop',   cls: 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300' },
  task_queue_recurring: { short: 'task',     long: 'task_queue recurring',   cls: 'bg-cyan-950/30 border-cyan-800/40 text-cyan-300' },
}

const STATUS_DOT: Record<string, string> = {
  success: 'bg-emerald-400',
  failure: 'bg-red-400',
  running: 'bg-blue-400 animate-pulse',
  skipped: 'bg-zinc-500',
  unknown: 'bg-zinc-600',
}

function ScheduledActivityView({ onCount }: { onCount?: (n: number) => void }) {
  const [rows, setRows] = useState<ScheduledActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [kindFilter, setKindFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(() => {
    fetch('/api/scheduled-activity')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setRows(d.activities ?? [])
        setError(null)
        if (onCount) onCount(d.total ?? (d.activities?.length ?? 0))
      })
      .catch(e => setError(e instanceof Error ? e.message : 'fetch failed'))
      .finally(() => setLoading(false))
  }, [onCount])

  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  const filtered = rows.filter(r => {
    if (kindFilter && r.kind !== kindFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!r.name.toLowerCase().includes(q) &&
          !(r.display_name ?? '').toLowerCase().includes(q) &&
          !(r.description ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const kindCounts: Record<string, number> = {}
  for (const r of rows) kindCounts[r.kind] = (kindCounts[r.kind] ?? 0) + 1

  if (loading && rows.length === 0) {
    return <div className="text-zinc-600 text-sm text-center py-16">Loading scheduled activity…</div>
  }
  if (error) {
    return <div className="text-red-400 text-sm text-center py-16">Error: {error}</div>
  }
  if (rows.length === 0) {
    return (
      <div className="text-zinc-600 text-sm text-center py-16">
        <div className="text-2xl mb-2">⏱</div>
        Nothing in <code className="text-zinc-400">scheduled_activity</code> yet.
        Run <code className="text-zinc-400">azlab/scripts/scheduled_activity_seed.py</code> to populate.
      </div>
    )
  }

  return (
    <div className="space-y-3 pr-1 overflow-y-auto">
      {/* Kind filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setKindFilter(null)}
          className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
            !kindFilter
              ? 'bg-zinc-700 border-zinc-500 text-zinc-100'
              : 'bg-zinc-900/40 border-zinc-800 text-zinc-500 hover:border-zinc-600'
          }`}
        >
          All ({rows.length})
        </button>
        {(Object.keys(KIND_LABEL) as ScheduledActivityRow['kind'][]).map(k => {
          const count = kindCounts[k] ?? 0
          if (count === 0) return null
          const isActive = kindFilter === k
          return (
            <button
              key={k}
              onClick={() => setKindFilter(isActive ? null : k)}
              className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                isActive
                  ? KIND_LABEL[k].cls + ' ring-1 ring-current'
                  : 'bg-zinc-900/40 border-zinc-800 text-zinc-500 hover:border-zinc-600'
              }`}
            >
              {KIND_LABEL[k].short} ({count})
            </button>
          )
        })}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          className="ml-auto text-xs px-2 py-1 rounded bg-zinc-800/60 border border-zinc-700/50 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-zinc-600 text-xs text-center py-8 italic">No matches.</div>
      ) : filtered.map(row => {
        const kindCfg = KIND_LABEL[row.kind]
        const expanded = expandedId === row.id
        const statusDot = STATUS_DOT[row.last_status ?? 'unknown'] ?? STATUS_DOT.unknown
        const sourceTitle = row.display_name ?? row.name

        return (
          <div
            key={row.id}
            className={`rounded-lg border p-3 transition-colors ${
              !row.enabled
                ? 'border-zinc-800/40 bg-zinc-950/30 opacity-60'
                : row.paused_at
                ? 'border-amber-900/40 bg-amber-950/10'
                : 'border-zinc-800/60 bg-zinc-900/30 hover:border-zinc-700/60'
            }`}
          >
            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : row.id)}
              className="w-full text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot}`}
                          title={row.last_status ?? 'no runs recorded'} />
                    <span className="text-xs text-zinc-200 font-medium truncate">{sourceTitle}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${kindCfg.cls}`}>
                      {kindCfg.short}
                    </span>
                    {!row.enabled && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 uppercase">disabled</span>
                    )}
                    {row.paused_at && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-800/40 text-amber-300 uppercase">paused</span>
                    )}
                    {row.run_count > 0 && (
                      <span className="text-[10px] text-zinc-600">×{row.run_count}</span>
                    )}
                  </div>
                  <div className="ml-3.5 flex items-center gap-3 text-[11px] text-zinc-500 flex-wrap">
                    <span className="px-2 py-0.5 rounded bg-zinc-800/60 border border-zinc-700/40 text-cyan-300 font-mono text-[10px]">
                      ⏱ {row.schedule}
                    </span>
                    {row.last_run_at && (
                      <span title={row.last_run_at}>
                        last <span className="text-zinc-300">{timeAgo(row.last_run_at)}</span>
                      </span>
                    )}
                    {row.next_run_at && (
                      <span title={row.next_run_at} className="text-blue-400/80">
                        next {timeAgo(row.next_run_at).replace(' ago', ' from now').replace('-', '')}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-zinc-600 text-xs">{expanded ? '▾' : '▸'}</span>
              </div>
            </button>

            {expanded && (
              <div className="mt-3 ml-3.5 space-y-2 text-xs">
                {row.description && (
                  <p className="text-zinc-400 leading-relaxed">{row.description}</p>
                )}

                {/* source_ref — points at native config */}
                <div>
                  <div className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">
                    Source ({kindCfg.long})
                  </div>
                  <div className="rounded bg-zinc-950/50 border border-zinc-800/40 p-2 font-mono text-[10px] text-zinc-400">
                    {Object.entries(row.source_ref).map(([k, v]) => (
                      <div key={k}>
                        <span className="text-zinc-600">{k}</span>: {String(v)}
                      </div>
                    ))}
                  </div>
                </div>

                {/* last result */}
                {row.last_result_summary && (
                  <div>
                    <div className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Last result</div>
                    <div className="rounded bg-zinc-950/50 border border-zinc-800/40 p-2 text-zinc-400 leading-relaxed">
                      {row.last_result_summary.length > 600
                        ? row.last_result_summary.slice(0, 600) + '…'
                        : row.last_result_summary}
                    </div>
                  </div>
                )}

                {/* runs[] history */}
                {row.runs && row.runs.length > 0 && (
                  <div>
                    <div className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">
                      Run history ({row.runs.length})
                    </div>
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {[...row.runs].reverse().slice(0, 12).map((r, idx) => {
                        const dot = STATUS_DOT[r.status ?? 'unknown'] ?? STATUS_DOT.unknown
                        return (
                          <div key={idx} className="flex items-start gap-2 text-[11px] py-1 border-b border-zinc-800/30 last:border-b-0">
                            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${dot}`} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 text-zinc-500 text-[10px]">
                                <span title={r.run_at}>{timeAgo(r.run_at)}</span>
                                {r.status && <span className="uppercase tracking-wider">{r.status}</span>}
                                {r.duration_sec != null && <span>{r.duration_sec.toFixed(1)}s</span>}
                              </div>
                              {r.result_summary && (
                                <div className="text-zinc-400 mt-0.5">
                                  {r.result_summary.length > 120 ? r.result_summary.slice(0, 120) + '…' : r.result_summary}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <ScheduledActivityActions row={row} onChange={load} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ScheduledActivityActions({ row, onChange }: {
  row: ScheduledActivityRow
  onChange: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRun, setConfirmRun] = useState(false)
  const isPaused = !!row.paused_at
  const isDisabled = !row.enabled
  const canRunNow = row.kind !== 'agent_loop' && row.kind !== 'ccr_trigger'

  async function patch(body: Record<string, unknown>, action: string) {
    setBusy(action)
    setError(null)
    try {
      const res = await fetch(`/api/scheduled-activity/${encodeURIComponent(row.name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      onChange()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed')
    } finally {
      setBusy(null)
    }
  }

  async function runNow() {
    setBusy('run-now')
    setError(null)
    try {
      const res = await fetch(`/api/scheduled-activity/${encodeURIComponent(row.name)}/run-now`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? `HTTP ${res.status}`)
      setConfirmRun(false)
      onChange()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="pt-2 border-t border-zinc-800/40">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => patch({ paused_at: isPaused ? null : new Date().toISOString(), pause_reason: isPaused ? null : 'Manual pause from lab page' }, 'pause-toggle')}
          disabled={busy !== null || isDisabled}
          className={`text-[10px] px-2 py-1 rounded border transition-colors ${
            isPaused
              ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300 hover:bg-emerald-900/40'
              : 'bg-amber-950/30 border-amber-800/40 text-amber-300 hover:bg-amber-900/40'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {busy === 'pause-toggle' ? '…' : isPaused ? 'Resume' : 'Pause'}
        </button>

        <button
          onClick={() => patch({ enabled: !row.enabled }, 'enable-toggle')}
          disabled={busy !== null}
          className={`text-[10px] px-2 py-1 rounded border transition-colors ${
            isDisabled
              ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300 hover:bg-emerald-900/40'
              : 'bg-zinc-950/30 border-zinc-800/40 text-zinc-400 hover:bg-zinc-900/40'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {busy === 'enable-toggle' ? '…' : isDisabled ? 'Enable' : 'Disable'}
        </button>

        {canRunNow && (
          confirmRun ? (
            <span className="flex items-center gap-1.5 text-[10px]">
              <span className="text-amber-300">Run now?</span>
              <button
                onClick={runNow}
                disabled={busy !== null}
                className="px-2 py-1 rounded bg-blue-700/60 border border-blue-500/50 text-blue-100 hover:bg-blue-600/70 disabled:opacity-50"
              >
                {busy === 'run-now' ? '…' : 'Yes, run'}
              </button>
              <button
                onClick={() => setConfirmRun(false)}
                disabled={busy !== null}
                className="px-2 py-1 rounded bg-zinc-800/60 border border-zinc-700/40 text-zinc-400 hover:bg-zinc-700/60"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmRun(true)}
              disabled={busy !== null}
              className="text-[10px] px-2 py-1 rounded bg-blue-950/30 border border-blue-800/40 text-blue-300 hover:bg-blue-900/40 disabled:opacity-50"
            >
              Run now
            </button>
          )
        )}

        {error && (
          <span className="text-[10px] text-red-400 ml-2">{error}</span>
        )}

        <span className="text-[10px] text-zinc-600 ml-auto italic">
          Changes propagate to native scheduler within ~30s via control daemon.
        </span>
      </div>
    </div>
  )
}

function ScheduledView({ tasks, onRefresh }: { tasks: TaskItem[]; onRefresh: () => void }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [editState, setEditState] = useState<ScheduleState>({ ...DEFAULT_SCHED, freq: 'daily' })
  const [busy, setBusy] = useState<string | null>(null)
  const editVal = buildSchedule(editState)

  async function handleCancel(task: TaskItem) {
    setBusy(task.id)
    try {
      await fetch(`/api/taskqueue/${task.id}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recurring_schedule: null }),
      })
      if (['pending', 'ready', 'backlog'].includes(task.status)) {
        await fetch(`/api/taskqueue/${task.id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'cancelled' }),
        })
      }
      onRefresh()
    } catch { /* noop */ } finally { setBusy(null) }
  }

  async function handleSave(task: TaskItem) {
    const sched = editVal.trim()
    if (!sched) return
    setBusy(task.id)
    try {
      await fetch(`/api/taskqueue/${task.id}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recurring_schedule: sched }),
      })
      setEditing(null)
      onRefresh()
    } catch { /* noop */ } finally { setBusy(null) }
  }

  if (tasks.length === 0) {
    return (
      <div className="text-zinc-600 text-sm text-center py-16">
        <div className="text-2xl mb-2">⏱</div>
        No scheduled tasks — create one with the <span className="text-zinc-400">+ New</span> button and set a recurrence.
      </div>
    )
  }

  async function handleRunNow(task: TaskItem) {
    setBusy(task.id)
    try {
      const status = task.status
      // If the scheduled task is in a runnable state, just trigger the poller.
      // Otherwise (completed/failed/cancelled), clone it as a one-off ready task —
      // the recurring chain stays intact via context.recurring_schedule on the original.
      const runnable = ['ready', 'pending', 'backlog'].includes(status)
      if (runnable) {
        await fetch(`/api/taskqueue/${task.id}/run`, { method: 'POST' })
      } else {
        await fetch('/api/taskqueue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: task.title,
            description: task.description,
            priority: task.priority,
            target: task.target,
            tags: [...(task.tags ?? []), 'manual-run'],
            status: 'ready',
            // Drop recurring_schedule on the manual run so it doesn't double-recur
            context: { manual_run_of: task.id },
          }),
        })
      }
      onRefresh()
    } finally { setBusy(null) }
  }

  return (
    <div className="space-y-2 pr-1 overflow-y-auto">
      {tasks.map(task => {
        const schedule = task.context?.recurring_schedule ?? ''
        const isEditing = editing === task.id
        const isBusy = busy === task.id
        const sc = STATUS_COLOR[task.status] ?? STATUS_COLOR.pending
        const lastRun = task.claimed_at ?? task.updated_at
        const resultExcerpt = task.result ? task.result.replace(/\s+/g, ' ').slice(0, 220) : null
        const errorExcerpt = task.error ? task.error.replace(/\s+/g, ' ').slice(0, 220) : null

        return (
          <div key={task.id} className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sc.dot}`} />
                  <span className="text-xs text-zinc-200 font-medium truncate">{task.title}</span>
                </div>
                {!isEditing ? (
                  <div className="ml-3.5 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700/50 text-cyan-300 font-mono">
                        ⏱ {scheduleLabel(schedule)}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide ${sc.bg} ${sc.text}`}
                        style={{ borderColor: sc.accent + '40' }}>
                        {task.status.replace(/_/g, ' ')}
                      </span>
                      {task.attempt_count > 0 && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border ${task.attempt_count > 1 ? 'bg-amber-950/30 border-amber-900/40 text-amber-300' : 'bg-zinc-800/60 border-zinc-700/40 text-zinc-500'}`}
                          title={`${task.attempt_count} attempt${task.attempt_count !== 1 ? 's' : ''}`}
                        >
                          ×{task.attempt_count}
                        </span>
                      )}
                      {task.priority !== 2 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_LABEL[task.priority]?.cls ?? 'bg-zinc-800 text-zinc-400'}`}>
                          {PRIORITY_LABEL[task.priority]?.label ?? `P${task.priority}`}
                        </span>
                      )}
                      {task.tags && task.tags.length > 0 && task.tags.slice(0, 4).map(t => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-500">{t}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                      <span title={lastRun}>Last run: <span className="text-zinc-300">{timeAgo(lastRun)}</span></span>
                      {task.claimed_by && <span>Agent: <span className="text-blue-400">{task.claimed_by}</span></span>}
                      {task.target && <span>Target: <span className="text-zinc-400">{task.target}</span></span>}
                    </div>
                    {errorExcerpt && (
                      <div className="text-[10px] px-2 py-1 rounded bg-red-950/30 border border-red-900/30 text-red-300 whitespace-pre-wrap">
                        <span className="font-semibold">Error: </span>{errorExcerpt}
                      </div>
                    )}
                    {!errorExcerpt && resultExcerpt && task.status === 'completed' && (
                      <div className="text-[10px] px-2 py-1 rounded bg-emerald-950/20 border border-emerald-900/30 text-zinc-400">
                        <span className="text-emerald-500 font-semibold">Last result: </span>{resultExcerpt}…
                      </div>
                    )}
                    {task.context?.jeff_notes && (
                      <div className="text-[10px] px-2 py-1 rounded bg-amber-950/30 border border-amber-900/30 text-amber-300">
                        <span className="font-semibold">Notes: </span>{String(task.context.jeff_notes).slice(0, 200)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="ml-3.5 space-y-2 mt-1">
                    <ScheduleEditor
                      state={editState}
                      onChange={setEditState}
                      compact
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSave(task)}
                        disabled={isBusy || !editVal.trim()}
                        className="text-xs px-3 py-1 rounded bg-blue-900/60 border border-blue-700/50 text-blue-300 hover:bg-blue-800/80 disabled:opacity-40"
                      >{isBusy ? '…' : 'Save'}</button>
                      <button
                        onClick={() => setEditing(null)}
                        className="text-xs px-2 py-1 rounded text-zinc-500 hover:text-zinc-300"
                      >Discard</button>
                    </div>
                  </div>
                )}
              </div>
              {!isEditing && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleRunNow(task)}
                    disabled={isBusy}
                    className="text-[11px] px-2 py-1 rounded border border-violet-700/60 bg-violet-900/30 text-violet-300 hover:bg-violet-800/50 disabled:opacity-40 transition-colors"
                    title="Queue this task to run immediately (next occurrence still fires on schedule)"
                  >▶ Run Now</button>
                  <button
                    onClick={() => {
                      setEditing(task.id)
                      setEditState(parseSchedule(schedule))
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-zinc-700/50 bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 transition-colors"
                  >Edit</button>
                  <button
                    onClick={() => handleCancel(task)}
                    disabled={isBusy}
                    className="text-[11px] px-2 py-1 rounded border border-red-900/50 bg-red-950/20 text-red-400 hover:bg-red-900/40 disabled:opacity-40 transition-colors"
                  >{isBusy ? '…' : 'Cancel'}</button>
                </div>
              )}
            </div>
          </div>
        )
      })}
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

// ── New task modal — markdown helpers ─────────────────────────────────────────

interface TaskMdToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (v: string) => void
}

const TASK_MD_TOOLS = [
  { label: 'B',   title: 'Bold',          wrap: ['**', '**'],      placeholder: 'bold text',  style: 'font-bold' },
  { label: 'I',   title: 'Italic',        wrap: ['_', '_'],        placeholder: 'italic',     style: 'italic' },
  { label: '<>',  title: 'Inline code',   wrap: ['`', '`'],        placeholder: 'code',       style: 'font-mono text-[10px]' },
  { label: '```', title: 'Code block',    wrap: ['```\n', '\n```'], placeholder: 'code block', style: 'font-mono text-[9px]' },
  { label: '•',   title: 'Bullet list',   prefix: '- ',            style: '' },
  { label: '1.',  title: 'Numbered list', prefix: '1. ',           style: '' },
  { label: '[ ]', title: 'Task item',     prefix: '- [ ] ',        style: 'font-mono text-[9px]' },
] as const

function applyTaskMarkdown(
  tool: (typeof TASK_MD_TOOLS)[number],
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
) {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selected = value.slice(start, end)
  let newValue = value
  let newCursorStart = start
  let newCursorEnd = end

  if ('insert' in tool) {
    const ins = (tool as { insert: string }).insert
    newValue = value.slice(0, start) + ins + value.slice(end)
    newCursorStart = newCursorEnd = start + ins.length
  } else if ('prefix' in tool) {
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    newValue = value.slice(0, lineStart) + tool.prefix + value.slice(lineStart)
    newCursorStart = start + tool.prefix.length
    newCursorEnd = end + tool.prefix.length
  } else if ('wrap' in tool) {
    const [open, close] = tool.wrap
    const text = selected || tool.placeholder
    newValue = value.slice(0, start) + open + text + close + value.slice(end)
    newCursorStart = start + open.length
    newCursorEnd = start + open.length + text.length
  }

  onChange(newValue)
  requestAnimationFrame(() => {
    textarea.focus()
    textarea.setSelectionRange(newCursorStart, newCursorEnd)
  })
}

function TaskMdToolbar({ textareaRef, value, onChange }: TaskMdToolbarProps) {
  return (
    <div className="flex items-center gap-0.5 flex-wrap px-2 py-1.5 bg-zinc-800/60 border border-zinc-700/60 border-b-0 rounded-t-md">
      {TASK_MD_TOOLS.map((tool) => (
        <button
          key={tool.title}
          type="button"
          title={tool.title}
          onClick={() => textareaRef.current && applyTaskMarkdown(tool, textareaRef.current, value, onChange)}
          className={`text-[10px] px-1.5 py-0.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/60 transition-colors ${tool.style}`}
        >
          {tool.label}
        </button>
      ))}
    </div>
  )
}

function TaskMdPreview({ content }: { content: string }) {
  if (!content.trim()) return <p className="text-xs text-zinc-600 italic">Nothing to preview yet…</p>
  return (
    <div className="prose prose-invert prose-xs max-w-none text-zinc-300 text-xs leading-relaxed
      [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-2 [&_li]:mb-0.5
      [&_code]:bg-zinc-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-blue-300 [&_code]:font-mono [&_code]:text-[10px]
      [&_pre]:bg-zinc-800/80 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:mb-2 [&_pre_code]:bg-transparent [&_pre_code]:text-green-300
      [&_strong]:text-zinc-100 [&_strong]:font-semibold [&_a]:text-blue-400 [&_a]:underline
      [&_input[type=checkbox]]:mr-1.5
    ">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

// ── New task modal ────────────────────────────────────────────────────────────

function NewTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 2,
    target: 'claude-code',
    tags: '',
  })
  const [sched, setSched] = useState<ScheduleState>({ ...DEFAULT_SCHED })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [descTab, setDescTab] = useState<'edit' | 'preview'>('edit')
  const descRef = useRef<HTMLTextAreaElement>(null)

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError(null)
    try {
      const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean)
      const schedule = buildSchedule(sched)
      const res = await fetch('/api/taskqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          priority: form.priority,
          target: form.target || null,
          tags: tags.length ? tags : [],
          recurring_schedule: schedule || null,
        }),
      })
      if (res.ok) { onCreated(); onClose() }
      else {
        const d = await res.json()
        setError(d.error ?? 'Failed to create task')
      }
    } catch { setError('Network error') } finally { setSaving(false) }
  }

  const inputCls = 'w-full text-xs bg-zinc-900 border border-zinc-700 rounded-md px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-600 placeholder-zinc-600'
  const labelCls = 'text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1'
  const tabBtn = (active: boolean) =>
    `text-[10px] px-2.5 py-1 rounded-t font-medium transition-colors ${active ? 'bg-zinc-900 text-zinc-200 border border-zinc-700 border-b-zinc-900' : 'text-zinc-500 hover:text-zinc-300'}`

  const PRIORITIES = [
    { value: 0, label: '0 — Critical' },
    { value: 1, label: '1 — High' },
    { value: 2, label: '2 — Normal' },
    { value: 3, label: '3 — Low' },
  ]
  const AGENTS = ['claude-code', 'cowork', 'atlas', 'forge', 'volt', 'hermes', '']

  return (
    <div
      className="fixed inset-0 z-[200] flex items-stretch justify-end"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={handleBackdrop}
    >
      <div
        className="w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 flex flex-col h-full"
        style={{ animation: 'slideInRight 0.2s ease-out' }}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-200">New Task</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-lg leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 p-5 space-y-4 overflow-y-auto">
          {/* Priority + Target Agent */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Priority</label>
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
                className={inputCls}
              >
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Target Agent</label>
              <select
                value={form.target}
                onChange={e => setForm(f => ({ ...f, target: e.target.value }))}
                className={inputCls}
              >
                {AGENTS.map(a => <option key={a} value={a}>{a || '— unassigned —'}</option>)}
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className={labelCls}>Title *</label>
            <input
              autoFocus
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="What needs to be done?"
              className={inputCls}
              required
            />
          </div>

          {/* Description with markdown toolbar + preview */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelCls}>Description</label>
              <div className="flex gap-0.5 -mb-px relative z-10">
                <button type="button" className={tabBtn(descTab === 'edit')} onClick={() => setDescTab('edit')}>Edit</button>
                <button type="button" className={tabBtn(descTab === 'preview')} onClick={() => setDescTab('preview')}>Preview</button>
              </div>
            </div>
            {descTab === 'edit' ? (
              <>
                <TaskMdToolbar textareaRef={descRef} value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} />
                <textarea
                  ref={descRef}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Context, steps, links… (supports **markdown**)"
                  rows={10}
                  className="w-full text-xs bg-zinc-900 border border-zinc-700 rounded-b-md px-3 py-2 text-zinc-200 focus:outline-none focus:border-blue-600 placeholder-zinc-600 resize-y font-mono leading-relaxed"
                />
              </>
            ) : (
              <div className="min-h-[220px] bg-zinc-900/60 border border-zinc-700 rounded-md px-3 py-2">
                <TaskMdPreview content={form.description} />
              </div>
            )}
          </div>

          {/* Tags */}
          <div>
            <label className={labelCls}>Tags <span className="text-zinc-700 normal-case font-normal">(comma-separated)</span></label>
            <input
              value={form.tags}
              onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="homelab, infra, security…"
              className={inputCls}
            />
          </div>

          {/* Schedule */}
          <div>
            <label className={labelCls}>Schedule <span className="text-zinc-700 normal-case font-normal">(optional repeat)</span></label>
            <ScheduleEditor
              state={sched}
              onChange={setSched}
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 border border-red-900/50 rounded-md px-3 py-2 bg-red-950/20">{error}</p>
          )}

          <div className="flex gap-2 pt-2 pb-4">
            <button
              type="submit"
              disabled={saving || !form.title.trim()}
              className="flex-1 text-xs px-3 py-2 rounded-md border border-blue-700/60 bg-blue-900/40 text-blue-200 hover:bg-blue-900/60 disabled:opacity-50 font-semibold transition-colors"
            >
              {saving ? 'Creating…' : 'Create Task'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-2 rounded-md border border-zinc-700/50 bg-zinc-800/40 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
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
  const [data, setData] = useState<(TaskQueueData & { jeff_urgent?: TaskItem[]; completedTotal?: number; completedOffset?: number; completedPageSize?: number }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<TaskItem | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [search, setSearch] = useState('')
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<string>>(new Set(['expired', 'cancelled']))
  const [showImport, setShowImport] = useState(false)
  const [showNewTask, setShowNewTask] = useState(false)
  const [completedPage, setCompletedPage] = useState(0)
  const [viewTab, setViewTab] = useState<'list' | 'scheduled' | 'dependencies'>('list')
  const [dependencyModal, setDependencyModal] = useState<TaskItem | null>(null)
  const [scheduledCount, setScheduledCount] = useState<number>(0)

  const load = useCallback((page?: number) => {
    const offset = (page ?? completedPage) * 25
    return fetch(`/api/taskqueue?completedOffset=${offset}`)
      .then(r => r.json())
      .then(d => !d.error && setData(d))
      .catch(() => {})
  }, [completedPage])

  useEffect(() => {
    load().finally(() => setLoading(false))
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  // Always fetch the scheduled-activity count so the tab badge stays accurate
  // even when the user is on the list tab.
  useEffect(() => {
    const fetchCount = () => {
      fetch('/api/scheduled-activity')
        .then(r => r.json())
        .then(d => { if (typeof d.total === 'number') setScheduledCount(d.total) })
        .catch(() => {})
    }
    fetchCount()
    const id = setInterval(fetchCount, 60_000)
    return () => clearInterval(id)
  }, [])

  const allTasks: TaskItem[] = data ? [
    ...(data.jeff_urgent ?? []),
    ...data.problems,
    ...data.waiting,
    ...data.active,
    ...(data.recent ?? []),
    ...(data.completed ?? []),
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

  async function handleSaveDependencies(task: TaskItem, blockedByIds: string[]) {
    await fetch(`/api/task-dependencies`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, blockedByIds }),
    }).catch(() => {})
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

        {/* View tabs */}
        <div className="flex gap-2 mb-3 px-1">
          <button
            onClick={() => setViewTab('list')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition ${
              viewTab === 'list'
                ? 'bg-blue-900/60 text-blue-300 border border-blue-700/50'
                : 'bg-zinc-800/40 text-zinc-500 border border-zinc-700/30 hover:bg-zinc-800/60'
            }`}
          >
            Tasks
          </button>
          <button
            onClick={() => setViewTab('scheduled')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition flex items-center gap-1.5 ${
              viewTab === 'scheduled'
                ? 'bg-cyan-900/60 text-cyan-300 border border-cyan-700/50'
                : 'bg-zinc-800/40 text-zinc-500 border border-zinc-700/30 hover:bg-zinc-800/60'
            }`}
          >
            ⏱ Scheduled
            {scheduledCount > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${viewTab === 'scheduled' ? 'bg-cyan-700/60 text-cyan-200' : 'bg-zinc-700/60 text-zinc-400'}`}>
                {scheduledCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setViewTab('dependencies')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition ${
              viewTab === 'dependencies'
                ? 'bg-blue-900/60 text-blue-300 border border-blue-700/50'
                : 'bg-zinc-800/40 text-zinc-500 border border-zinc-700/30 hover:bg-zinc-800/60'
            }`}
          >
            Dependencies
          </button>
        </div>

        {/* Conditional view content */}
        {viewTab === 'scheduled' ? (
          <div className="flex-1 overflow-y-auto">
            <ScheduledActivityView onCount={setScheduledCount} />
          </div>
        ) : viewTab === 'list' ? (
          <>
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
            onClick={() => setShowNewTask(true)}
            className="px-2 py-1.5 rounded-lg text-[11px] bg-blue-900/50 border border-blue-700/50 text-blue-300 hover:bg-blue-800/60"
          >+ New</button>
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
              onNeedsAction={handleNeedsAction}
              defaultOpen={['jeff_urgent', 'review', 'failed', 'waiting', 'jeff_working', 'agent_running'].includes(section.key)}
            />
          ))}
          {filteredTasks.length === 0 && (
            <div className="text-zinc-600 text-sm text-center py-12">No tasks match</div>
          )}

          {/* Completed pagination controls */}
          {!hiddenStatuses.has('completed') && (() => {
            const total = data?.completedTotal ?? 0
            const pageSize = data?.completedPageSize ?? 25
            const totalPages = Math.ceil(total / pageSize)
            if (totalPages <= 1) return null
            const start = completedPage * pageSize + 1
            const end = Math.min((completedPage + 1) * pageSize, total)
            return (
              <div className="flex items-center justify-between px-3 py-2 mt-1 rounded-lg bg-zinc-800/40 border border-zinc-700/30 text-[11px] text-zinc-500">
                <span>{start}–{end} of {total} completed</span>
                <div className="flex gap-2">
                  <button
                    disabled={completedPage === 0}
                    onClick={() => { const p = completedPage - 1; setCompletedPage(p); load(p) }}
                    className="px-2 py-0.5 rounded bg-zinc-700/60 hover:bg-zinc-600/60 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300"
                  >← Prev</button>
                  <span className="px-1 text-zinc-600">pg {completedPage + 1}/{totalPages}</span>
                  <button
                    disabled={completedPage >= totalPages - 1}
                    onClick={() => { const p = completedPage + 1; setCompletedPage(p); load(p) }}
                    className="px-2 py-0.5 rounded bg-zinc-700/60 hover:bg-zinc-600/60 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300"
                  >Next →</button>
                </div>
              </div>
            )
          })()}

          {/* Archived section at bottom */}
          <ArchivedSection onRestore={load} />
        </div>
          </>
        ) : (
          // Dependencies view
          <div className="flex-1 min-w-0 overflow-hidden">
            <TaskDependencyGraph
              tasks={allTasks}
              onTaskSelect={(taskId) => {
                const task = allTasks.find(t => t.id === taskId)
                if (task) {
                  setViewTab('list')
                  setSelected(task)
                }
              }}
            />
          </div>
        )}
      </div>

      {/* ── Right: detail panel ── */}
      {showPanel && selected && (
        <div key={selected.id} className="flex-[0_0_45%] min-w-0 ml-3 sticky top-4 self-start overflow-hidden" style={{ height: 'calc(100vh - 6rem)' }}>
          <DetailPanel
            task={selected}
            onClose={() => setSelected(null)}
            onRefresh={load}
            onEditDependencies={setDependencyModal}
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

      {/* New Task modal */}
      {showNewTask && (
        <NewTaskModal onClose={() => setShowNewTask(false)} onCreated={load} />
      )}

      {/* Import modal */}
      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onDone={load} />
      )}

      {/* Dependency modal */}
      {dependencyModal && (
        <TaskDependencyModal
          task={dependencyModal}
          allTasks={allTasks}
          onClose={() => setDependencyModal(null)}
          onSave={(blockedByIds) => handleSaveDependencies(dependencyModal, blockedByIds)}
        />
      )}
    </div>
  )
}
