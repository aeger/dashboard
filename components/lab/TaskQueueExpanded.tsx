'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { TaskQueueData, TaskItem } from '@/app/api/taskqueue/route'

// ── colours ───────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, { bg: string; text: string; dot: string; accent: string }> = {
  pending:      { bg: 'bg-zinc-700/60',       text: 'text-zinc-300',   dot: 'bg-zinc-500',    accent: '#71717a' },
  claimed:      { bg: 'bg-blue-900/50',        text: 'text-blue-300',   dot: 'bg-blue-400',    accent: '#60a5fa' },
  completed:    { bg: 'bg-emerald-900/50',     text: 'text-emerald-300',dot: 'bg-emerald-400', accent: '#34d399' },
  failed:       { bg: 'bg-red-900/50',         text: 'text-red-300',    dot: 'bg-red-400',     accent: '#f87171' },
  escalated:    { bg: 'bg-orange-900/50',      text: 'text-orange-300', dot: 'bg-orange-400',  accent: '#fb923c' },
  blocked:      { bg: 'bg-amber-900/50',       text: 'text-amber-300',  dot: 'bg-amber-400',   accent: '#fbbf24' },
  delegated:    { bg: 'bg-purple-900/50',      text: 'text-purple-300', dot: 'bg-purple-400',  accent: '#c084fc' },
  pending_eval: { bg: 'bg-indigo-900/50',      text: 'text-indigo-300', dot: 'bg-indigo-400',  accent: '#818cf8' },
  expired:      { bg: 'bg-zinc-800/40',        text: 'text-zinc-500',   dot: 'bg-zinc-600',    accent: '#52525b' },
}

const PRIORITY_LABEL: Record<number, { label: string; cls: string }> = {
  0: { label: 'CRIT', cls: 'bg-red-900/70 text-red-300' },
  1: { label: 'HIGH', cls: 'bg-orange-900/70 text-orange-300' },
  2: { label: 'MED',  cls: 'bg-zinc-700 text-zinc-400' },
  3: { label: 'LOW',  cls: 'bg-zinc-800 text-zinc-500' },
}

const SECTIONS = [
  { key: 'problems',  label: 'Problems',  statuses: ['failed', 'escalated'],              headerCls: 'text-red-400/80'    },
  { key: 'waiting',   label: 'Waiting',   statuses: ['blocked', 'delegated','pending_eval'], headerCls: 'text-amber-400/80'  },
  { key: 'running',   label: 'Running',   statuses: ['claimed'],                           headerCls: 'text-blue-400/80'   },
  { key: 'pending',   label: 'Pending',   statuses: ['pending'],                           headerCls: 'text-zinc-400/80'   },
  { key: 'completed', label: 'Completed', statuses: ['completed'],                         headerCls: 'text-emerald-400/80'},
  { key: 'expired',   label: 'Expired',   statuses: ['expired'],                           headerCls: 'text-zinc-600'      },
]

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

// ── sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLOR[status] ?? STATUS_COLOR.pending
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 uppercase tracking-wide ${c.bg} ${c.text}`}>
      {status.replace('_', ' ')}
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

  const pills = [
    { key: 'claimed',    label: 'Running',   accent: '#60a5fa' },
    { key: 'pending',    label: 'Pending',   accent: '#71717a' },
    { key: 'failed',     label: 'Failed',    accent: '#f87171' },
    { key: 'escalated',  label: 'Escalated', accent: '#fb923c' },
    { key: 'blocked',    label: 'Blocked',   accent: '#fbbf24' },
    { key: 'delegated',  label: 'Delegated', accent: '#c084fc' },
    { key: 'completed',  label: 'Done',      accent: '#34d399' },
    { key: 'expired',    label: 'Expired',   accent: '#52525b' },
  ]

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {pills.map(({ key, label, accent }) => {
        const n = counts[key] ?? 0
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

// ── Context menu ──────────────────────────────────────────────────────────────

interface CtxMenu { x: number; y: number; task: TaskItem }

function ContextMenu({ menu, onClose, onFlag, onCopyId, onMarkExpired }: {
  menu: CtxMenu
  onClose: () => void
  onFlag: (t: TaskItem) => void
  onCopyId: (t: TaskItem) => void
  onMarkExpired: (t: TaskItem) => void
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
    { icon: '🚩', label: 'Flag for Wren',   action: () => { onFlag(menu.task); onClose() } },
    { icon: '📋', label: 'Copy task ID',    action: () => { onCopyId(menu.task); onClose() } },
    { icon: '⏭', label: 'Mark expired',    action: () => { onMarkExpired(menu.task); onClose() }, danger: false },
  ]

  return (
    <div
      ref={ref}
      className="fixed rounded-xl border shadow-2xl py-1"
      style={{
        left: menu.x, top: menu.y, zIndex: 9999,
        background: 'rgba(18,18,20,0.98)',
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

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ task, onClose }: { task: TaskItem; onClose: () => void }) {
  const c = STATUS_COLOR[task.status] ?? STATUS_COLOR.pending
  const [flagState, setFlagState] = useState<'idle' | 'loading' | 'done'>('idle')

  async function flag() {
    setFlagState('loading')
    try {
      const res = await fetch('/api/taskqueue/flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, taskTitle: task.title, taskStatus: task.status }),
      })
      setFlagState(res.ok ? 'done' : 'idle')
    } catch { setFlagState('idle') }
  }

  return (
    <div
      className="flex flex-col h-full border-l overflow-hidden"
      style={{ borderColor: `${c.accent}30`, background: 'rgba(12,12,14,0.9)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 p-4 border-b border-zinc-800/60 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
          </div>
          <h3 className="text-sm font-semibold text-zinc-100 leading-snug">{task.title}</h3>
        </div>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 text-lg leading-none flex-shrink-0 mt-0.5">✕</button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">

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

        {/* Timestamps */}
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
          {task.claimed_at && task.status === 'claimed' && (
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
      <div className="flex-shrink-0 p-3 border-t border-zinc-800/60">
        <button
          onClick={flag}
          disabled={flagState !== 'idle'}
          className={`w-full py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            flagState === 'done' ? 'bg-indigo-900/50 text-indigo-300' :
            'bg-zinc-800 hover:bg-indigo-900/40 text-zinc-400 hover:text-indigo-300 disabled:opacity-50'
          }`}
        >
          {flagState === 'done' ? '🚩 Flagged for Wren' : flagState === 'loading' ? 'Flagging…' : '🚩 Flag for Wren'}
        </button>
      </div>
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
  const c = STATUS_COLOR[task.status] ?? STATUS_COLOR.pending
  const isRunning = task.status === 'claimed'

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group"
      style={{
        background: selected ? `${c.accent}14` : undefined,
        borderLeft: selected ? `2px solid ${c.accent}` : '2px solid transparent',
      }}
      onMouseEnter={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
      onMouseLeave={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.background = '' }}
    >
      {/* Status dot */}
      <div className="flex-shrink-0 mt-1.5">
        {isRunning ? (
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
        {isRunning && task.claimed_at && (
          <div className="text-[10px] text-blue-400 mt-0.5">{elapsed(task.claimed_at)}</div>
        )}
      </div>
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ section, tasks, selected, onSelect, onContextMenu, defaultOpen = true }: {
  section: typeof SECTIONS[number]
  tasks: TaskItem[]
  selected: string | null
  onSelect: (t: TaskItem) => void
  onContextMenu: (e: React.MouseEvent, t: TaskItem) => void
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (tasks.length === 0) return null

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-1 py-1 hover:bg-zinc-800/30 rounded transition-colors mb-1"
      >
        <span className={`text-[10px] font-bold uppercase tracking-widest ${section.headerCls}`}>{section.label}</span>
        <span className="text-[10px] text-zinc-600 font-medium">{tasks.length}</span>
        <span className="ml-auto text-zinc-700 text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="space-y-0.5 mb-4">
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

// ── Main component ────────────────────────────────────────────────────────────

export default function TaskQueueExpanded() {
  const [data, setData] = useState<TaskQueueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<TaskItem | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [search, setSearch] = useState('')
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<string>>(new Set(['expired']))

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
    ...data.problems,
    ...data.waiting,
    ...data.active,
    ...(data.recent ?? []),
  ].filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i) : []

  const filteredTasks = allTasks.filter(t => {
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

  async function handleFlag(task: TaskItem) {
    await fetch('/api/taskqueue/flag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, taskTitle: task.title, taskStatus: task.status }),
    }).catch(() => {})
  }

  function handleCopyId(task: TaskItem) {
    navigator.clipboard.writeText(task.id).catch(() => {})
  }

  async function handleMarkExpired(task: TaskItem) {
    await fetch('/api/taskqueue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, status: 'expired' }),
    }).catch(() => {})
    load()
  }

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
        <div className="mb-4">
          <StatsBar tasks={allTasks} />
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <input
            type="text"
            placeholder="Search tasks or tags…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-0 px-3 py-1.5 rounded-lg text-xs bg-zinc-800/60 border border-zinc-700/50 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
          {['expired', 'completed'].map(s => {
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
              defaultOpen={['problems', 'waiting', 'running', 'pending'].includes(section.key)}
            />
          ))}
          {filteredTasks.length === 0 && (
            <div className="text-zinc-600 text-sm text-center py-12">No tasks match</div>
          )}
        </div>
      </div>

      {/* ── Right: detail panel ── */}
      {showPanel && selected && (
        <div className="flex-[0_0_45%] min-w-0 ml-3">
          <DetailPanel task={selected} onClose={() => setSelected(null)} />
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          menu={ctxMenu}
          onClose={() => setCtxMenu(null)}
          onFlag={handleFlag}
          onCopyId={handleCopyId}
          onMarkExpired={handleMarkExpired}
        />
      )}
    </div>
  )
}
