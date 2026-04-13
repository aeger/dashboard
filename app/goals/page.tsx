'use client'

import { useEffect, useState, useCallback } from 'react'
import LabSubNav from '@/components/lab/LabSubNav'
import type { Goal } from '@/app/api/goals/route'

// ── tree builder ───────────────────────────────────────────────────────────────

function buildTree(flat: Goal[]): Goal[] {
  const map = new Map<string, Goal>()
  flat.forEach((g) => { g.children = []; map.set(g.id, g) })
  const roots: Goal[] = []
  flat.forEach((g) => {
    if (g.parent_id && map.has(g.parent_id)) map.get(g.parent_id)!.children!.push(g)
    else roots.push(g)
  })
  const sort = (nodes: Goal[]) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order)
    nodes.forEach((n) => n.children && sort(n.children))
  }
  sort(roots)
  return roots
}

// ── sort type ──────────────────────────────────────────────────────────────────

type SortBy = 'priority' | 'date' | 'progress' | 'title'

function sortGoals(gs: Goal[], by: SortBy): Goal[] {
  return [...gs].sort((a, b) => {
    switch (by) {
      case 'date':
        if (a.target_date && b.target_date) return a.target_date.localeCompare(b.target_date)
        if (a.target_date) return -1
        if (b.target_date) return 1
        return a.sort_order - b.sort_order
      case 'progress':
        return b.progress - a.progress
      case 'title':
        return a.title.localeCompare(b.title)
      case 'priority':
      default:
        if (a.priority !== b.priority) return a.priority - b.priority
        return a.sort_order - b.sort_order
    }
  })
}

// ── search helper ──────────────────────────────────────────────────────────────

function nodeMatchesSearch(goal: Goal, text: string): boolean {
  if (!text) return true
  const q = text.toLowerCase()
  const selfMatches =
    goal.title.toLowerCase().includes(q) ||
    (goal.description ?? '').toLowerCase().includes(q) ||
    (goal.tags ?? []).some((t) => t.toLowerCase().includes(q))
  const childMatches = (goal.children ?? []).some((c) => nodeMatchesSearch(c, text))
  return selfMatches || childMatches
}

// ── filter bar ─────────────────────────────────────────────────────────────────

const ALL_STATUSES = ['active', 'planned', 'paused', 'blocked', 'completed'] as const
const ALL_LEVELS   = ['vision', 'strategy', 'milestone', 'objective'] as const

const STATUS_PILL: Record<string, { on: string; border: string; dim: string }> = {
  active:    { on: '#60a5fa', border: 'rgba(96,165,250,0.4)',   dim: 'rgba(96,165,250,0.07)'   },
  planned:   { on: '#a1a1aa', border: 'rgba(161,161,170,0.35)', dim: 'rgba(161,161,170,0.07)'  },
  paused:    { on: '#fbbf24', border: 'rgba(251,191,36,0.4)',   dim: 'rgba(251,191,36,0.07)'   },
  blocked:   { on: '#fb923c', border: 'rgba(251,146,60,0.4)',   dim: 'rgba(251,146,60,0.07)'   },
  completed: { on: '#4ade80', border: 'rgba(74,222,128,0.4)',   dim: 'rgba(74,222,128,0.07)'   },
}
const LEVEL_PILL: Record<string, { on: string; border: string; dim: string }> = {
  vision:    { on: '#c084fc', border: 'rgba(192,132,252,0.4)',  dim: 'rgba(192,132,252,0.07)'  },
  strategy:  { on: '#818cf8', border: 'rgba(129,140,248,0.4)',  dim: 'rgba(129,140,248,0.07)'  },
  milestone: { on: '#94a3b8', border: 'rgba(148,163,184,0.4)',  dim: 'rgba(148,163,184,0.07)'  },
  objective: { on: '#71717a', border: 'rgba(113,113,122,0.4)',  dim: 'rgba(113,113,122,0.07)'  },
}

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'priority', label: 'Priority' },
  { value: 'date',     label: 'Date' },
  { value: 'progress', label: 'Progress' },
  { value: 'title',    label: 'Title' },
]

interface FilterBarProps {
  filterStatuses: Set<string>
  filterLevels: Set<string>
  onToggleStatus: (s: string) => void
  onToggleLevel: (l: string) => void
  onReset: () => void
  sortBy: SortBy
  onSortChange: (v: SortBy) => void
  searchText: string
  onSearchChange: (v: string) => void
}

function FilterBar({ filterStatuses, filterLevels, onToggleStatus, onToggleLevel, onReset, sortBy, onSortChange, searchText, onSearchChange }: FilterBarProps) {
  const isFiltered =
    filterStatuses.size < ALL_STATUSES.length ||
    filterLevels.size < ALL_LEVELS.length ||
    searchText.length > 0

  return (
    <div className="mb-5 px-3 py-3 bg-zinc-900/30 border border-zinc-800/50 rounded-xl space-y-2.5">
      {/* Row 1: Status + Level filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mr-1">Status</span>
        {ALL_STATUSES.map((s) => {
          const on = filterStatuses.has(s)
          const c = STATUS_PILL[s]
          return (
            <button
              key={s}
              onClick={() => onToggleStatus(s)}
              style={{
                background: on ? `${c.dim}` : 'transparent',
                border: `1px solid ${on ? c.border : 'rgba(63,63,70,0.5)'}`,
                color: on ? c.on : '#52525b',
              }}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide transition-all duration-150 hover:scale-105"
            >
              {s}
            </button>
          )
        })}
        <span className="text-zinc-700 text-xs mx-1">|</span>
        <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mr-1">Level</span>
        {ALL_LEVELS.map((l) => {
          const on = filterLevels.has(l)
          const c = LEVEL_PILL[l]
          return (
            <button
              key={l}
              onClick={() => onToggleLevel(l)}
              style={{
                background: on ? `${c.dim}` : 'transparent',
                border: `1px solid ${on ? c.border : 'rgba(63,63,70,0.5)'}`,
                color: on ? c.on : '#52525b',
              }}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide transition-all duration-150 hover:scale-105"
            >
              {l}
            </button>
          )
        })}
        {isFiltered && (
          <button
            onClick={onReset}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 ml-auto transition-colors underline underline-offset-2"
          >
            Reset
          </button>
        )}
      </div>

      {/* Row 2: Sort + Search */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mr-1">Sort</span>
        {SORT_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onSortChange(value)}
            style={sortBy === value ? {
              background: 'rgba(167,139,250,0.1)',
              border: '1px solid rgba(167,139,250,0.4)',
              color: '#c084fc',
            } : {
              background: 'transparent',
              border: '1px solid rgba(63,63,70,0.5)',
              color: '#52525b',
            }}
            className="text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide transition-all duration-150 hover:scale-105"
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-zinc-600 text-xs">🔍</span>
          <input
            type="text"
            value={searchText}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search goals…"
            className="text-[11px] bg-zinc-900/60 border border-zinc-700/60 rounded-full px-2.5 py-1 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-purple-600/60 w-40"
          />
          {searchText && (
            <button onClick={() => onSearchChange('')} className="text-zinc-600 hover:text-zinc-300 text-xs transition-colors">✕</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── filter + search helper ─────────────────────────────────────────────────────

function nodeMatchesFilter(goal: Goal, statuses: Set<string>, levels: Set<string>, search: string): boolean {
  const selfMatches = statuses.has(goal.status) && levels.has(goal.level) && nodeMatchesSearch(goal, search)
  const childMatches = (goal.children ?? []).some((c) => nodeMatchesFilter(c, statuses, levels, search))
  return selfMatches || childMatches
}

// ── status / level styling ─────────────────────────────────────────────────────

const STATUS_BG: Record<string, string> = {
  active:    'bg-blue-900/50 text-blue-300 border-blue-800/50',
  completed: 'bg-green-900/50 text-green-300 border-green-800/50',
  planned:   'bg-zinc-800/60 text-zinc-400 border-zinc-700/50',
  paused:    'bg-yellow-900/30 text-yellow-400 border-yellow-800/30',
  blocked:   'bg-amber-900/40 text-amber-300 border-amber-800/40',
}

const LEVEL_BADGE: Record<string, string> = {
  vision:    'bg-purple-900/50 text-purple-300',
  strategy:  'bg-indigo-900/50 text-indigo-300',
  milestone: 'bg-zinc-800 text-zinc-300',
  objective: 'bg-zinc-800/50 text-zinc-500',
}

const STATUS_ICON: Record<string, string> = {
  active:    '● ',
  completed: '✓ ',
  paused:    '⏸ ',
  blocked:   '⚠ ',
  planned:   '○ ',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border uppercase tracking-wide ${STATUS_BG[status] ?? STATUS_BG.planned}`}>
      {STATUS_ICON[status] ?? ''}{status}
    </span>
  )
}

function LevelBadge({ level }: { level: string }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide ${LEVEL_BADGE[level] ?? LEVEL_BADGE.milestone}`}>
      {level}
    </span>
  )
}

function ProgressBar({ value, status }: { value: number; status: string }) {
  const color = status === 'completed' ? 'bg-green-500' :
                status === 'blocked'   ? 'bg-amber-500' :
                status === 'paused'    ? 'bg-yellow-500' : 'progress-purple'
  const fillStyle: React.CSSProperties = {
    width: `${value}%`,
    ...(status === 'active' ? { boxShadow: '0 0 6px rgba(167,139,250,0.4)' } : {}),
  }
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={fillStyle} />
      </div>
      <span className="text-[10px] text-zinc-500 tabular-nums w-7 text-right">{value}%</span>
    </div>
  )
}

// ── schedule form (inline) ─────────────────────────────────────────────────────

interface ScheduleFormProps {
  goal: Goal
  onClose: () => void
}

function ScheduleForm({ goal, onClose }: ScheduleFormProps) {
  const today = new Date().toISOString().slice(0, 10)
  const nowTime = new Date().toTimeString().slice(0, 5)
  const [date, setDate] = useState(goal.target_date ?? today)
  const [time, setTime] = useState(nowTime)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSchedule() {
    setLoading(true)
    setError(null)
    try {
      const startDt = new Date(`${date}T${time}:00`)
      const endDt = new Date(startDt.getTime() + 60 * 60 * 1000)

      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calendarId: 'primary',
          title: goal.title,
          description: goal.description ?? `Goal: ${goal.title}`,
          start: startDt.toISOString(),
          end: endDt.toISOString(),
          allDay: false,
        }),
      })
      if (res.ok) {
        setResult(`Scheduled for ${startDt.toLocaleDateString()} at ${startDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)
      } else {
        const data = await res.json()
        setError(data.error ?? 'Failed to create event')
      }
    } catch {
      setError('Request failed')
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-green-900/20 border border-green-800/40">
        <p className="text-xs text-green-400">Scheduled: {result}</p>
        <button onClick={onClose} className="mt-2 text-[10px] text-zinc-500 hover:text-zinc-300">Dismiss</button>
      </div>
    )
  }

  return (
    <div className="mt-3 p-3 rounded-lg bg-zinc-800/40 border border-zinc-700/50">
      <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Schedule as Calendar Event</p>
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="text-[10px] text-zinc-500 block mb-0.5">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-xs bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-purple-600"
          />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 block mb-0.5">Time</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="text-xs bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-purple-600"
          />
        </div>
        <button
          onClick={handleSchedule}
          disabled={loading}
          className="text-xs px-2.5 py-1 rounded-md border border-purple-800/60 bg-purple-900/30 text-purple-300 hover:bg-purple-900/50 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Creating…' : 'Create Event'}
        </button>
        <button
          onClick={onClose}
          className="text-xs px-2 py-1 rounded-md border border-zinc-700/50 bg-zinc-800/40 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  )
}

// ── goal card ──────────────────────────────────────────────────────────────────

interface TaskStatus {
  id: string
  status: string
  updated_at: string
  claimed_by: string | null
  error: string | null
}

interface GoalCardProps {
  goal: Goal
  depth?: number
  onTrigger: (goal: Goal) => Promise<string>
  onFlag: (taskId: string) => Promise<void>
  triggeredTaskId?: string
  taskStatus?: TaskStatus
  allTaskStatuses?: Record<string, TaskStatus>
  filterStatuses?: Set<string>
  filterLevels?: Set<string>
  searchText?: string
}

function TaskStatusBadge({ ts }: { ts: TaskStatus }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    pending:   { cls: 'bg-zinc-800 text-zinc-400 border-zinc-700', label: 'Queued' },
    claimed:   { cls: 'bg-blue-900/50 text-blue-300 border-blue-800/50', label: 'Running' },
    completed: { cls: 'bg-green-900/50 text-green-300 border-green-800/50', label: 'Done' },
    failed:    { cls: 'bg-red-900/40 text-red-300 border-red-800/40', label: 'Failed' },
    blocked:   { cls: 'bg-amber-900/40 text-amber-300 border-amber-800/40', label: 'Blocked' },
  }
  const { cls, label } = cfg[ts.status] ?? cfg.pending
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${cls}`} title={ts.error ?? ts.claimed_by ?? ts.id}>
      {label}
    </span>
  )
}

function GoalCard({ goal, depth = 0, onTrigger, onFlag, triggeredTaskId, taskStatus, allTaskStatuses, filterStatuses, filterLevels, searchText = '' }: GoalCardProps) {
  const daysLeft = goal.target_date
    ? Math.ceil((new Date(goal.target_date).getTime() - Date.now()) / 86400000)
    : null
  const hasChildren = (goal.children?.length ?? 0) > 0
  const [collapsed, setCollapsed] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [flagging, setFlagging] = useState(false)
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null)

  async function handleTrigger() {
    setTriggering(true)
    setTriggerMsg(null)
    try {
      const taskId = await onTrigger(goal)
      setTriggerMsg(`Queued (task ${taskId.slice(0, 8)}…)`)
    } catch {
      setTriggerMsg('Failed to queue')
    } finally {
      setTriggering(false)
    }
  }

  async function handleFlag() {
    if (!triggeredTaskId) return
    setFlagging(true)
    try {
      await onFlag(triggeredTaskId)
      setTriggerMsg('Flagged for review')
    } catch {
      setTriggerMsg('Flag failed')
    } finally {
      setFlagging(false)
    }
  }

  const LEVEL_STRIPE: Record<string, string> = {
    vision:    'border-l-4 border-l-purple-500 bg-purple-950/10',
    strategy:  'border-l-4 border-l-indigo-500',
    milestone: 'border-l-4 border-l-blue-700/60',
    objective: 'border-l-4 border-l-zinc-700',
  }
  const levelStripe = LEVEL_STRIPE[goal.level] ?? LEVEL_STRIPE.milestone
  const statusMod = goal.status === 'blocked' ? 'ring-1 ring-amber-800/40' :
                    goal.status === 'completed' ? 'opacity-70' : ''

  const visibleChildren = (goal.children ?? []).filter((child) =>
    !filterStatuses || !filterLevels
      ? true
      : nodeMatchesFilter(child, filterStatuses, filterLevels, searchText)
  )

  return (
    <div className={`${depth > 0 ? 'ml-4 border-l border-zinc-800/60 pl-4' : ''}`}>
      <div className={`card-lift rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-4 mb-3 ${levelStripe} ${statusMod}`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <LevelBadge level={goal.level} />
            <StatusBadge status={goal.status} />
            {goal.priority === 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-red-900/50 text-red-300 uppercase tracking-wide">Critical</span>
            )}
            {goal.priority === 1 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-orange-900/40 text-orange-300 uppercase tracking-wide">High</span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 text-right">
            {daysLeft !== null && goal.status !== 'completed' && (
              <span className={`text-xs font-semibold tabular-nums ${
                daysLeft < 0
                  ? 'text-red-400 bg-red-950/30 px-1.5 py-0.5 rounded'
                  : daysLeft < 7
                  ? 'text-amber-400 bg-amber-950/30 px-1.5 py-0.5 rounded'
                  : 'text-zinc-500'
              }`}>
                {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
              </span>
            )}
            {goal.target_date && (
              <span className="text-[10px] text-zinc-600">{goal.target_date}</span>
            )}
            {hasChildren && (
              <button
                onClick={() => setCollapsed((v) => !v)}
                className="text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors px-1.5 py-0.5 rounded border border-zinc-800/60 hover:border-zinc-600 bg-zinc-900/50 flex items-center gap-1"
                title={collapsed ? 'Expand children' : 'Collapse children'}
              >
                <span>{collapsed ? '▶' : '▼'}</span>
                <span>{goal.children!.length}</span>
              </button>
            )}
          </div>
        </div>

        <h3
          className={`font-semibold mb-1 ${
            goal.level === 'vision' ? 'text-xl font-bold text-white' :
            goal.level === 'strategy' ? 'text-base text-zinc-100' :
            'text-sm text-zinc-200'
          }`}
          style={goal.level === 'vision' ? { textShadow: '0 0 20px rgba(167,139,250,0.3)' } : undefined}
        >{goal.title}</h3>

        {goal.description && (
          <p className="text-xs text-zinc-400 leading-relaxed mb-3">{goal.description}</p>
        )}

        <ProgressBar value={goal.progress} status={goal.status} />

        {goal.tags && goal.tags.length > 0 && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {goal.tags.map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-500">{t}</span>
            ))}
          </div>
        )}

        {goal.notes && (
          <div className="mt-2 text-[11px] text-zinc-500 italic border-l-2 border-zinc-700 pl-2">{goal.notes}</div>
        )}

        {/* Action buttons */}
        <div className="mt-3 pt-3 border-t border-zinc-800/40 flex items-center gap-2 flex-wrap">
          <button
            onClick={handleTrigger}
            disabled={triggering}
            className="text-xs px-2.5 py-1 rounded-md border border-zinc-600 bg-zinc-800/50 text-zinc-300 hover:text-white hover:border-purple-500/50 hover:bg-purple-900/20 disabled:opacity-50 transition-colors"
          >
            {triggering ? '…' : '▶ Run'}
          </button>
          <button
            onClick={() => setShowSchedule((v) => !v)}
            className="text-xs px-2.5 py-1 rounded-md border border-zinc-600 bg-zinc-800/50 text-zinc-300 hover:text-white hover:border-purple-500/50 hover:bg-purple-900/20 transition-colors"
          >
            Schedule
          </button>
          {triggeredTaskId && (
            <button
              onClick={handleFlag}
              disabled={flagging}
              className="text-xs px-2.5 py-1 rounded-md border border-amber-800/60 bg-amber-900/20 text-amber-400 hover:bg-amber-900/40 disabled:opacity-50 transition-colors"
            >
              {flagging ? '…' : 'Flag'}
            </button>
          )}
          {taskStatus ? (
            <TaskStatusBadge ts={taskStatus} />
          ) : triggerMsg ? (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ml-1 ${
              triggerMsg.startsWith('Queued') ? 'bg-green-900/50 text-green-300 border-green-800/50' :
              triggerMsg.startsWith('Flagged') ? 'bg-amber-900/40 text-amber-300 border-amber-800/40' :
              'bg-red-900/40 text-red-300 border-red-800/40'
            }`}>{triggerMsg}</span>
          ) : null}
        </div>

        {showSchedule && (
          <ScheduleForm goal={goal} onClose={() => setShowSchedule(false)} />
        )}
      </div>

      {hasChildren && !collapsed && (
        <div className="space-y-0">
          {visibleChildren.map((child) => (
            <GoalCard
              key={child.id}
              goal={child}
              depth={depth + 1}
              onTrigger={onTrigger}
              onFlag={onFlag}
              triggeredTaskId={undefined}
              taskStatus={allTaskStatuses?.[child.id]}
              allTaskStatuses={allTaskStatuses}
              filterStatuses={filterStatuses}
              filterLevels={filterLevels}
              searchText={searchText}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── summary table ──────────────────────────────────────────────────────────────

function SummaryTable({ flat }: { flat: Goal[] }) {
  const byStatus = flat.reduce<Record<string, number>>((acc, g) => {
    acc[g.status] = (acc[g.status] ?? 0) + 1
    return acc
  }, {})
  const byLevel = flat.reduce<Record<string, number>>((acc, g) => {
    acc[g.level] = (acc[g.level] ?? 0) + 1
    return acc
  }, {})
  const avgProgress = flat.length > 0
    ? Math.round(flat.reduce((s, g) => s + g.progress, 0) / flat.length)
    : 0

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {[
        { label: 'Total Goals', value: flat.length, color: 'text-white' },
        { label: 'Active', value: byStatus.active ?? 0, color: 'text-blue-400' },
        { label: 'Completed', value: byStatus.completed ?? 0, color: 'text-green-400' },
        { label: 'Blocked', value: byStatus.blocked ?? 0, color: (byStatus.blocked ?? 0) > 0 ? 'text-amber-400' : 'text-zinc-600' },
        { label: 'Avg Progress', value: `${avgProgress}%`, color: 'text-zinc-300' },
        { label: 'Milestones', value: byLevel.milestone ?? 0, color: 'text-zinc-300' },
        { label: 'Strategies', value: byLevel.strategy ?? 0, color: 'text-indigo-300' },
        { label: 'Vision Items', value: byLevel.vision ?? 0, color: 'text-purple-300' },
      ].map(({ label, value, color }) => (
        <div key={label} className="card-lift bg-zinc-900/50 border border-zinc-800/70 rounded-xl p-4 text-center">
          <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">{label}</div>
        </div>
      ))}
    </div>
  )
}

// ── next steps ─────────────────────────────────────────────────────────────────

function NextSteps({ flat }: { flat: Goal[] }) {
  const active = flat
    .filter((g) => g.status === 'active' && g.level === 'milestone')
    .sort((a, b) => {
      if (a.target_date && b.target_date) return a.target_date.localeCompare(b.target_date)
      if (a.target_date) return -1
      if (b.target_date) return 1
      return a.priority - b.priority
    })
    .slice(0, 6)

  const blocked = flat.filter((g) => g.status === 'blocked')
  const planned = flat
    .filter((g) => g.status === 'planned' && g.level === 'milestone')
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 4)

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="card-lift bg-zinc-900/50 border border-zinc-800/70 rounded-xl p-4 border-l-4 border-l-blue-500">
        <h3 className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-3">In Progress</h3>
        <div className="space-y-2">
          {active.length === 0 ? (
            <p className="text-xs text-zinc-600">Nothing active</p>
          ) : active.map((g) => (
            <div key={g.id} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0 mt-1" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-300 leading-tight">{g.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${g.progress}%` }} />
                  </div>
                  <span className="text-[10px] text-zinc-600">{g.progress}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card-lift bg-zinc-900/50 border border-zinc-800/70 rounded-xl p-4 border-l-4 border-l-amber-500">
        <h3 className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider mb-3">Blocked / Waiting</h3>
        <div className="space-y-2">
          {blocked.length === 0 ? (
            <p className="text-xs text-zinc-600">Nothing blocked</p>
          ) : blocked.map((g) => (
            <div key={g.id} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 mt-1" />
              <div>
                <p className="text-xs text-zinc-300 leading-tight">{g.title}</p>
                {g.notes && <p className="text-[10px] text-amber-600/80 mt-0.5">{g.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card-lift bg-zinc-900/50 border border-zinc-800/70 rounded-xl p-4 border-l-4 border-l-zinc-600">
        <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">Up Next</h3>
        <div className="space-y-2">
          {planned.length === 0 ? (
            <p className="text-xs text-zinc-600">Nothing planned</p>
          ) : planned.map((g) => (
            <div key={g.id} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 flex-shrink-0 mt-1" />
              <div>
                <p className="text-xs text-zinc-400 leading-tight">{g.title}</p>
                {g.target_date && (
                  <p className="text-[10px] text-zinc-600 mt-0.5">{g.target_date}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── calendar section ───────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  calendarName?: string
  calendarColor?: string
  allDay?: boolean
}

function CalendarSection() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(true)

  useEffect(() => {
    const now = new Date().toISOString()
    const max = new Date(Date.now() + 30 * 86400000).toISOString()
    fetch(`/api/calendar/ical?timeMin=${encodeURIComponent(now)}&timeMax=${encodeURIComponent(max)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.configured === false) { setConfigured(false); return }
        setEvents((data.events ?? []).slice(0, 10))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!configured) return null

  return (
    <div className="card-lift bg-zinc-900/50 border border-zinc-800/70 rounded-xl p-4">
      {loading ? (
        <div className="flex items-center gap-2 py-2">
          <div className="w-3 h-3 border-2 border-zinc-700 border-t-purple-400 rounded-full animate-spin" />
          <span className="text-xs text-zinc-600">Loading events…</span>
        </div>
      ) : events.length === 0 ? (
        <p className="text-xs text-zinc-600">No upcoming events in the next 30 days</p>
      ) : (
        <div className="space-y-2">
          {events.map((ev) => {
            const dt = new Date(ev.start)
            const dateStr = dt.toLocaleDateString([], { month: 'short', day: 'numeric', weekday: 'short' })
            const timeStr = ev.allDay ? 'All day' : dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            return (
              <div key={ev.id} className="flex items-start gap-3">
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                  style={{ backgroundColor: ev.calendarColor ?? '#a78bfa' }}
                />
                <div className="flex-1 min-w-0 flex items-start gap-2">
                  <span className="text-[10px] font-mono bg-zinc-800/80 px-1.5 py-0.5 rounded text-purple-300 flex-shrink-0">{dateStr}</span>
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-300 leading-tight truncate">{ev.title}</p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">{timeStr}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── section header ─────────────────────────────────────────────────────────────

function SectionHeader({ title, collapsed, onToggle, count }: { title: string; collapsed: boolean; onToggle: () => void; count?: number }) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between mb-3 group"
    >
      <h2 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest group-hover:text-zinc-400 transition-colors">
        {title}
      </h2>
      <div className="flex items-center gap-2">
        {count !== undefined && (
          <span className="text-[10px] text-zinc-700">{count}</span>
        )}
        <span className="text-[10px] text-zinc-700 group-hover:text-zinc-500 transition-colors">
          {collapsed ? '▶' : '▼'}
        </span>
      </div>
    </button>
  )
}

// ── add goal modal ─────────────────────────────────────────────────────────────

interface AddGoalPanelProps {
  flat: Goal[]
  onClose: () => void
  onCreated: () => void
}

function AddGoalPanel({ flat, onClose, onCreated }: AddGoalPanelProps) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    level: 'milestone' as Goal['level'],
    parent_id: '',
    status: 'planned' as Goal['status'],
    priority: 2,
    target_date: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        level: form.level,
        status: form.status,
        priority: Number(form.priority),
      }
      if (form.description.trim()) payload.description = form.description.trim()
      if (form.parent_id) payload.parent_id = form.parent_id
      if (form.target_date) payload.target_date = form.target_date
      if (form.notes.trim()) payload.notes = form.notes.trim()

      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        onCreated()
        onClose()
      } else {
        const data = await res.json()
        setError(data.error ?? 'Failed to create goal')
      }
    } catch {
      setError('Request failed')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full text-xs bg-zinc-900 border border-zinc-700 rounded-md px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-purple-600 placeholder-zinc-600'
  const labelCls = 'text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1'

  return (
    <div
      className="fixed inset-0 z-[200] flex items-stretch justify-end"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={handleBackdrop}
    >
      <div
        className="w-full max-w-md bg-zinc-950 border-l border-zinc-800 flex flex-col h-full"
        style={{ animation: 'slideInRight 0.2s ease-out' }}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-200">Add New Goal</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-lg leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 p-4 space-y-4 overflow-y-auto">
          <div>
            <label className={labelCls}>Level</label>
            <select
              value={form.level}
              onChange={(e) => setForm((f) => ({ ...f, level: e.target.value as Goal['level'] }))}
              className={inputCls}
            >
              <option value="vision">Vision</option>
              <option value="strategy">Strategy</option>
              <option value="milestone">Milestone</option>
              <option value="objective">Objective</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>Parent Goal (optional)</label>
            <select
              value={form.parent_id}
              onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value }))}
              className={inputCls}
            >
              <option value="">— None —</option>
              {flat.map((g) => (
                <option key={g.id} value={g.id}>[{g.level}] {g.title}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Goal title…"
              className={inputCls}
              required
            />
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Optional description…"
              rows={3}
              className={inputCls + ' resize-none'}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Goal['status'] }))}
                className={inputCls}
              >
                <option value="active">Active</option>
                <option value="planned">Planned</option>
                <option value="paused">Paused</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
                className={inputCls}
              >
                <option value={0}>0 — Critical</option>
                <option value={1}>1 — High</option>
                <option value={2}>2 — Normal</option>
                <option value={3}>3 — Low</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Target Date</label>
            <input
              type="date"
              value={form.target_date}
              onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value }))}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Internal notes…"
              rows={2}
              className={inputCls + ' resize-none'}
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 border border-red-900/50 rounded-md px-3 py-2 bg-red-950/20">{error}</p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 text-xs px-3 py-2 rounded-md border border-purple-700/60 bg-purple-900/40 text-purple-200 hover:bg-purple-900/60 disabled:opacity-50 font-semibold transition-colors"
            >
              {saving ? 'Saving…' : 'Create Goal'}
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

// ── page ───────────────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const [flat, setFlat] = useState<Goal[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [triggeredTasks, setTriggeredTasks] = useState<Record<string, string>>({})
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>({})

  // filters — completed hidden by default
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(
    new Set(['active', 'planned', 'paused', 'blocked'])
  )
  const [filterLevels, setFilterLevels] = useState<Set<string>>(new Set(ALL_LEVELS))
  const [sortBy, setSortBy] = useState<SortBy>('priority')
  const [searchText, setSearchText] = useState('')

  // section collapse state
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  function toggleSection(s: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })
  }

  function toggleStatus(s: string) {
    setFilterStatuses((prev) => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })
  }
  function toggleLevel(l: string) {
    setFilterLevels((prev) => {
      const next = new Set(prev)
      next.has(l) ? next.delete(l) : next.add(l)
      return next
    })
  }
  function resetFilters() {
    setFilterStatuses(new Set(ALL_STATUSES))
    setFilterLevels(new Set(ALL_LEVELS))
    setSearchText('')
    setSortBy('priority')
  }

  const applyUpdate = useCallback((updatedGoals: Goal[]) => {
    setFlat((prev) => {
      const map = new Map(prev.map((g) => [g.id, g]))
      updatedGoals.forEach((g) => map.set(g.id, g))
      const merged = Array.from(map.values())
      setGoals(buildTree(merged))
      return merged
    })
    setLastUpdated(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    const flatMap = new Map<string, Goal>()
    const es = new EventSource('/api/goals/stream')

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'init') {
        flatMap.clear()
        ;(msg.goals as Goal[]).forEach((g) => flatMap.set(g.id, g))
      } else if (msg.type === 'delta') {
        ;(msg.goals as Goal[]).forEach((g) => flatMap.set(g.id, g))
      }
      const merged = Array.from(flatMap.values())
      setFlat(merged)
      setGoals(buildTree(merged))
      setLastUpdated(new Date())
      setLoading(false)
    }

    es.onerror = () => { setLoading(false) }

    return () => es.close()
  }, [applyUpdate])

  // Poll task statuses every 10s
  useEffect(() => {
    async function fetchTaskStatuses() {
      if (!flat.length) return
      const ids = flat.map((g) => g.id).join(',')
      try {
        const res = await fetch(`/api/goals/tasks?goalIds=${encodeURIComponent(ids)}`)
        if (!res.ok) return
        const data = await res.json()
        setTaskStatuses(data.tasks ?? {})
      } catch { /* silent */ }
    }

    fetchTaskStatuses()
    const timer = setInterval(fetchTaskStatuses, 10000)
    return () => clearInterval(timer)
  }, [flat])

  async function handleTrigger(goal: Goal): Promise<string> {
    const res = await fetch('/api/goals/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goalId: goal.id, title: goal.title, description: goal.description }),
    })
    if (!res.ok) throw new Error('Failed to trigger')
    const data = await res.json()
    setTriggeredTasks((prev) => ({ ...prev, [goal.id]: data.taskId }))
    return data.taskId
  }

  async function handleFlag(taskId: string): Promise<void> {
    const res = await fetch('/api/goals/flag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId }),
    })
    if (!res.ok) throw new Error('Failed to flag')
  }

  function handleGoalCreated() {
    window.location.reload()
  }

  const filteredGoals = goals.filter((g) =>
    nodeMatchesFilter(g, filterStatuses, filterLevels, searchText)
  )
  const visibleGoals = sortGoals(filteredGoals, sortBy)

  const calendarCollapsed = collapsedSections.has('calendar')
  const summaryCollapsed = collapsedSections.has('summary')
  const statusCollapsed = collapsedSections.has('status')
  const hierarchyCollapsed = collapsedSections.has('hierarchy')

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto">
      <LabSubNav />

      {/* Page header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-0.5">Vision &amp; Goals</h1>
          <p className="text-xs text-zinc-500">Track goals, trigger work, and schedule milestones</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddPanel(true)}
            className="text-xs px-3 py-1.5 rounded-full font-semibold bg-purple-900/30 border border-purple-700/50 text-purple-300 hover:bg-purple-900/50 hover:text-purple-200 transition-all"
          >
            + Add Goal
          </button>
          {loading && (
            <div className="w-3 h-3 border-2 border-zinc-700 border-t-blue-400 rounded-full animate-spin" />
          )}
          {lastUpdated && !loading && (
            <span className="text-[10px] text-zinc-600">
              live · {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar
        filterStatuses={filterStatuses}
        filterLevels={filterLevels}
        onToggleStatus={toggleStatus}
        onToggleLevel={toggleLevel}
        onReset={resetFilters}
        sortBy={sortBy}
        onSortChange={setSortBy}
        searchText={searchText}
        onSearchChange={setSearchText}
      />

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-zinc-700 border-t-purple-400 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Calendar section */}
          <div className="mb-6">
            <SectionHeader
              title="Upcoming Scheduled"
              collapsed={calendarCollapsed}
              onToggle={() => toggleSection('calendar')}
            />
            {!calendarCollapsed && <CalendarSection />}
          </div>

          {/* Summary table */}
          <div className="mb-6">
            <SectionHeader
              title="Summary"
              collapsed={summaryCollapsed}
              onToggle={() => toggleSection('summary')}
            />
            {!summaryCollapsed && <SummaryTable flat={flat} />}
          </div>

          {/* Status overview */}
          <div className="mb-6">
            <SectionHeader
              title="Status Overview"
              collapsed={statusCollapsed}
              onToggle={() => toggleSection('status')}
            />
            {!statusCollapsed && <NextSteps flat={flat} />}
          </div>

          {/* Goal hierarchy */}
          <div>
            <SectionHeader
              title="Goal Hierarchy"
              collapsed={hierarchyCollapsed}
              onToggle={() => toggleSection('hierarchy')}
              count={visibleGoals.length !== goals.length ? visibleGoals.length : goals.length}
            />
            {visibleGoals.length !== goals.length && !hierarchyCollapsed && (
              <p className="text-[10px] text-zinc-600 mb-3 -mt-2">
                Showing {visibleGoals.length} of {goals.length} root goals
              </p>
            )}
            {!hierarchyCollapsed && (
              visibleGoals.length === 0 ? (
                <div className="text-zinc-600 text-sm text-center py-12">
                  No goals match the current filters
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleGoals.map((g) => (
                    <GoalCard
                      key={g.id}
                      goal={g}
                      depth={0}
                      onTrigger={handleTrigger}
                      onFlag={handleFlag}
                      triggeredTaskId={triggeredTasks[g.id]}
                      taskStatus={taskStatuses[g.id]}
                      allTaskStatuses={taskStatuses}
                      filterStatuses={filterStatuses}
                      filterLevels={filterLevels}
                      searchText={searchText}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        </>
      )}

      {showAddPanel && (
        <AddGoalPanel
          flat={flat}
          onClose={() => setShowAddPanel(false)}
          onCreated={handleGoalCreated}
        />
      )}
    </div>
  )
}
