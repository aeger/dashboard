'use client'

import { useEffect, useState } from 'react'
import type { TaskQueueStats } from '@/app/api/taskqueue/route'

const STATUS_COLOR: Record<string, string> = {
  pending:     '#6366f1', // indigo
  in_progress: '#f59e0b', // amber
  completed:   '#22c55e', // green
  failed:      '#ef4444', // red
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'Running',
  completed: 'Done',
  failed: 'Failed',
}

const MODEL_BADGE: Record<string, { label: string; color: string }> = {
  nemotron: { label: 'Nemotron', color: 'text-violet-400 bg-violet-900/40' },
  claude:   { label: 'Claude',   color: 'text-blue-400 bg-blue-900/40' },
}

// SVG donut chart — no external dep
function DonutChart({ counts }: { counts: TaskQueueStats['counts'] }) {
  const segments = Object.entries(counts).filter(([, v]) => v > 0)
  const total = segments.reduce((s, [, v]) => s + v, 0)
  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center w-24 h-24">
        <div className="text-2xl font-semibold text-zinc-500">0</div>
        <div className="text-xs text-zinc-600">tasks</div>
      </div>
    )
  }

  const r = 30
  const cx = 40
  const cy = 40
  let angle = -Math.PI / 2 // start at top

  const arcs = segments.map(([status, count]) => {
    const sweep = (count / total) * 2 * Math.PI
    const x1 = cx + r * Math.cos(angle)
    const y1 = cy + r * Math.sin(angle)
    angle += sweep
    const x2 = cx + r * Math.cos(angle)
    const y2 = cy + r * Math.sin(angle)
    const large = sweep > Math.PI ? 1 : 0
    return { status, d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z` }
  })

  return (
    <div className="flex items-center gap-3">
      <svg width="80" height="80" viewBox="0 0 80 80">
        {arcs.map(({ status, d }) => (
          <path key={status} d={d} fill={STATUS_COLOR[status]} opacity={0.85} />
        ))}
        {/* Inner hole */}
        <circle cx={cx} cy={cy} r={16} fill="#18181b" />
        <text x={cx} y={cy + 5} textAnchor="middle" className="fill-white" fontSize="12" fontWeight="600">
          {total}
        </text>
      </svg>
      <div className="space-y-1">
        {Object.entries(counts).map(([status, count]) => (
          <div key={status} className="flex items-center gap-1.5 text-xs">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[status] }} />
            <span className="text-zinc-400">{STATUS_LABEL[status]}</span>
            <span className="text-zinc-200 font-medium ml-auto pl-2">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function StatusDot({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? '#71717a'
  const pulse = status === 'in_progress'
  return (
    <span className="relative inline-flex flex-shrink-0 h-2 w-2">
      {pulse && (
        <span
          className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
          style={{ background: color }}
        />
      )}
      <span
        className="relative inline-flex rounded-full h-2 w-2"
        style={{ background: color }}
      />
    </span>
  )
}

export default function TaskQueueWidget() {
  const [data, setData] = useState<TaskQueueStats | null>(null)
  const [loading, setLoading] = useState(true)

  const load = () =>
    fetch('/api/taskqueue')
      .then((r) => r.json())
      .then((d) => !d.error && setData(d))
      .catch(() => {})

  useEffect(() => {
    load().finally(() => setLoading(false))
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-24">
      <div className="w-5 h-5 border-2 border-zinc-600 border-t-indigo-400 rounded-full animate-spin" />
    </div>
  )

  if (!data) return (
    <div className="text-zinc-500 text-sm text-center py-6">Task queue unavailable</div>
  )

  return (
    <div className="space-y-4">
      {/* Donut + counts */}
      <DonutChart counts={data.counts} />

      {/* 24h stat */}
      {data.total_24h > 0 && (
        <div className="text-xs text-zinc-500">
          <span className="text-zinc-300 font-medium">{data.total_24h}</span> tasks in last 24h
        </div>
      )}

      {/* Recent tasks */}
      {data.recent.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-xs text-zinc-600 uppercase tracking-wider mb-1">Recent</div>
          {data.recent.map((t) => {
            const badge = t.model ? MODEL_BADGE[t.model] : null
            return (
              <div key={t.id} className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-zinc-800/40 group">
                <StatusDot status={t.status} />
                <span className="text-xs text-zinc-300 truncate flex-1 min-w-0">{t.title}</span>
                {badge && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium ${badge.color}`}>
                    {badge.label}
                  </span>
                )}
                <span className="text-[10px] text-zinc-600 flex-shrink-0 group-hover:text-zinc-500">
                  {timeAgo(t.created_at)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
