'use client'

import { useEffect, useState } from 'react'
import type { TaskQueueData, TaskItem } from '@/app/api/taskqueue/route'

// ── colours ──────────────────────────────────────────────────────────────────

const STATUS_BG: Record<string, string> = {
  pending:     'bg-zinc-700 text-zinc-300',
  claimed:     'bg-blue-900/60 text-blue-300',
  completed:   'bg-green-900/60 text-green-300',
  failed:      'bg-red-900/60 text-red-300',
  escalated:   'bg-orange-900/60 text-orange-300',
  blocked:     'bg-amber-900/60 text-amber-300',
  delegated:   'bg-purple-900/60 text-purple-300',
  expired:     'bg-zinc-800 text-zinc-500',
}

const STATUS_DOT: Record<string, string> = {
  pending:     'bg-zinc-500',
  claimed:     'bg-blue-400',
  completed:   'bg-green-400',
  failed:      'bg-red-400',
  escalated:   'bg-orange-400',
  blocked:     'bg-amber-400',
  delegated:   'bg-purple-400',
  expired:     'bg-zinc-600',
}

const PRIORITY_LABEL: Record<number, { label: string; cls: string }> = {
  0: { label: 'CRIT', cls: 'bg-red-900/70 text-red-300' },
  1: { label: 'HIGH', cls: 'bg-orange-900/70 text-orange-300' },
  2: { label: 'MED',  cls: 'bg-zinc-700 text-zinc-400' },
  3: { label: 'LOW',  cls: 'bg-zinc-800 text-zinc-600' },
}

// ── helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000)   return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function elapsed(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  return `${m}m`
}

function shortName(s: string | null): string {
  if (!s) return '?'
  return s.length <= 8 ? s : s.split(/[-_\s]/)[0]
}

function truncate(s: string | null, max: number): string {
  if (!s) return ''
  return s.length > max ? s.slice(0, max) + '…' : s
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 uppercase tracking-wide ${STATUS_BG[status] ?? 'bg-zinc-700 text-zinc-400'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: number }) {
  const p = PRIORITY_LABEL[priority] ?? PRIORITY_LABEL[2]
  if (priority === 2) return null // skip normal priority to reduce noise
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${p.cls}`}>
      {p.label}
    </span>
  )
}

function AgentFlow({ source, target }: { source: string | null; target: string | null }) {
  if (!source && !target) return null
  return (
    <span className="text-[10px] text-zinc-500 flex-shrink-0 whitespace-nowrap">
      {shortName(source)} → {shortName(target)}
    </span>
  )
}

function ProblemBanner({ task }: { task: TaskItem }) {
  const isError = task.status === 'failed' || task.status === 'escalated'
  const banner = isError
    ? 'border-red-800 bg-red-950/40'
    : 'border-yellow-800 bg-yellow-950/30'
  const detail = task.error ?? task.failure_mode ?? (task.attempt_count >= 2 ? `${task.attempt_count} attempts` : null)

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${banner}`}>
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 text-[10px] font-bold flex-shrink-0 ${isError ? 'text-red-400' : 'text-yellow-400'}`}>
          {isError ? '✗' : '!'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatusBadge status={task.status} />
            <span className="text-zinc-200 truncate">{truncate(task.title, 55)}</span>
          </div>
          {detail && (
            <div className={`mt-0.5 truncate ${isError ? 'text-red-400' : 'text-yellow-500'}`}>
              {truncate(detail, 80)}
            </div>
          )}
        </div>
        <span className="text-zinc-600 flex-shrink-0 text-[10px]">{timeAgo(task.updated_at)}</span>
      </div>
    </div>
  )
}

function WaitingBanner({ task }: { task: TaskItem }) {
  const isBlocked = task.status === 'blocked'
  const reason = task.blocked_reason ?? task.description ?? null
  const age = timeAgo(task.created_at)

  return (
    <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-xs">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-[10px] font-bold flex-shrink-0 text-amber-400">
          {isBlocked ? '⏸' : '⇢'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            <span className="text-zinc-200 truncate">{truncate(task.title, 50)}</span>
          </div>
          {reason && (
            <div className="mt-0.5 text-amber-600/80 truncate">
              {truncate(reason, 90)}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
          <AgentFlow source={task.source} target={task.target} />
          <span className="text-zinc-600 text-[10px]">{age}</span>
        </div>
      </div>
    </div>
  )
}

function ActiveRow({ task }: { task: TaskItem }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-blue-950/30 border border-blue-900/40">
      <span className="relative flex-shrink-0 h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
      </span>
      <span className="text-xs text-zinc-200 truncate flex-1 min-w-0">{truncate(task.title, 50)}</span>
      <AgentFlow source={task.claimed_by ?? task.source} target={task.target} />
      {task.claimed_at && (
        <span className="text-[10px] text-blue-400 flex-shrink-0 font-medium">{elapsed(task.claimed_at)}</span>
      )}
    </div>
  )
}

function RecentRow({ task }: { task: TaskItem }) {
  const [expanded, setExpanded] = useState(false)
  const dot = STATUS_DOT[task.status] ?? 'bg-zinc-600'
  const preview = task.result ?? task.error
  const hasPreview = !!preview

  return (
    <div
      className={`py-1 px-1.5 rounded hover:bg-zinc-800/40 group ${hasPreview ? 'cursor-pointer' : ''}`}
      onClick={() => hasPreview && setExpanded((e) => !e)}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
        <StatusBadge status={task.status} />
        <PriorityBadge priority={task.priority} />
        <AgentFlow source={task.source} target={task.target} />
        <span className="text-xs text-zinc-300 truncate flex-1 min-w-0">{truncate(task.title, 55)}</span>
        {task.tags && task.tags.length > 0 && (
          <span className="text-[10px] text-zinc-600 flex-shrink-0 hidden group-hover:inline">
            {task.tags.slice(0, 2).join(' ')}
          </span>
        )}
        <span className="text-[10px] text-zinc-600 flex-shrink-0 group-hover:text-zinc-500">
          {timeAgo(task.updated_at)}
        </span>
        {hasPreview && (
          <span className="text-[10px] text-zinc-700 flex-shrink-0">{expanded ? '▲' : '▼'}</span>
        )}
      </div>
      {expanded && preview && (
        <div className="mt-1 ml-3.5 text-[11px] text-zinc-500 leading-relaxed break-words">
          {truncate(preview, 200)}
        </div>
      )}
    </div>
  )
}

function SummaryBar({ summary }: { summary: Record<string, number> }) {
  const items = [
    { key: 'completed',  label: 'done',      cls: 'text-green-400' },
    { key: 'failed',     label: 'failed',    cls: 'text-red-400' },
    { key: 'escalated',  label: 'escalated', cls: 'text-orange-400' },
    { key: 'claimed',    label: 'active',    cls: 'text-blue-400' },
    { key: 'blocked',    label: 'blocked',   cls: 'text-amber-400' },
    { key: 'delegated',  label: 'delegated', cls: 'text-purple-400' },
    { key: 'pending',    label: 'pending',   cls: 'text-zinc-400' },
  ]
  const total = Object.values(summary).reduce((s, v) => s + v, 0)

  return (
    <div className="flex items-center gap-3 px-2 py-1.5 bg-zinc-800/30 rounded-lg text-[11px] flex-wrap">
      <span className="text-zinc-500">24h:</span>
      {items.map(({ key, label, cls }) =>
        (summary[key] ?? 0) > 0 ? (
          <span key={key} className={`font-medium ${cls}`}>
            {summary[key]} {label}
          </span>
        ) : null
      )}
      {total === 0 && <span className="text-zinc-600">no activity</span>}
    </div>
  )
}

// ── main widget ───────────────────────────────────────────────────────────────

export default function TaskQueueWidget() {
  const [data, setData] = useState<TaskQueueData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = () =>
    fetch('/api/taskqueue')
      .then((r) => r.json())
      .then((d) => !d.error && setData(d))
      .catch(() => {})

  useEffect(() => {
    load().finally(() => setLoading(false))
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-24">
      <div className="w-5 h-5 border-2 border-zinc-600 border-t-blue-400 rounded-full animate-spin" />
    </div>
  )

  if (!data) return (
    <div className="text-zinc-500 text-sm text-center py-6">Task queue unavailable</div>
  )

  const { problems, waiting, active, recent, summary24h } = data

  return (
    <div className="space-y-3 text-sm">

      {/* ── Problem flags ── */}
      {problems.length > 0 && (
        <div className="space-y-1.5">
          {problems.map((t) => <ProblemBanner key={t.id} task={t} />)}
        </div>
      )}

      {/* ── Waiting / on-hold ── */}
      {waiting.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold text-amber-600/70 uppercase tracking-wider px-1">Waiting</div>
          <div className="space-y-1.5">
            {waiting.map((t) => <WaitingBanner key={t.id} task={t} />)}
          </div>
        </div>
      )}

      {/* ── Active / claimed ── */}
      {active.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1">Running</div>
          {active.map((t) => <ActiveRow key={t.id} task={t} />)}
        </div>
      )}

      {/* ── Summary bar ── */}
      <SummaryBar summary={summary24h} />

      {/* ── Recent activity feed ── */}
      <div>
        <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1 mb-1">Recent Activity</div>
        {recent.length === 0 ? (
          <div className="text-zinc-600 text-xs px-1">No recent tasks</div>
        ) : (
          <div className="space-y-px max-h-80 overflow-y-auto pr-1">
            {recent.map((t) => <RecentRow key={t.id} task={t} />)}
          </div>
        )}
      </div>

    </div>
  )
}
