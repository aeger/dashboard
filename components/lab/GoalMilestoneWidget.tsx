'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Goal } from '@/app/api/goals/route'

// ── status styling ─────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  active:    'bg-blue-400',
  completed: 'bg-green-400',
  planned:   'bg-zinc-500',
  paused:    'bg-yellow-500',
  blocked:   'bg-amber-400',
}

const STATUS_LABEL: Record<string, string> = {
  active:    'Active',
  completed: 'Done',
  planned:   'Planned',
  paused:    'Paused',
  blocked:   'Blocked',
}

const LEVEL_COLOR: Record<string, string> = {
  vision:    'text-purple-300',
  strategy:  'text-blue-300',
  milestone: 'text-zinc-200',
  objective: 'text-zinc-400',
}

// ── progress bar ───────────────────────────────────────────────────────────────

function ProgressBar({ value, status }: { value: number; status: string }) {
  const color = status === 'completed' ? 'bg-green-500' :
                status === 'blocked'   ? 'bg-amber-500' :
                status === 'paused'    ? 'bg-yellow-500' :
                'bg-blue-500'
  return (
    <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
    </div>
  )
}

// ── milestone row ──────────────────────────────────────────────────────────────

function MilestoneRow({ goal }: { goal: Goal }) {
  const dot = STATUS_DOT[goal.status] ?? 'bg-zinc-600'
  const daysLeft = goal.target_date
    ? Math.ceil((new Date(goal.target_date).getTime() - Date.now()) / 86400000)
    : null

  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-zinc-300 truncate flex-1">{goal.title}</span>
          <span className="text-[10px] text-zinc-600 flex-shrink-0 tabular-nums">{goal.progress}%</span>
        </div>
        <ProgressBar value={goal.progress} status={goal.status} />
      </div>
      {daysLeft !== null && goal.status !== 'completed' && (
        <span className={`text-[10px] flex-shrink-0 tabular-nums ${daysLeft < 7 ? 'text-amber-400' : daysLeft < 0 ? 'text-red-400' : 'text-zinc-600'}`}>
          {daysLeft < 0 ? `${Math.abs(daysLeft)}d over` : `${daysLeft}d`}
        </span>
      )}
    </div>
  )
}

// ── strategy section ───────────────────────────────────────────────────────────

function StrategySection({ goal }: { goal: Goal }) {
  const milestones = (goal.children ?? []).filter((c) => c.level === 'milestone')
  const done = milestones.filter((m) => m.status === 'completed').length
  const active = milestones.filter((m) => m.status === 'active').length

  return (
    <div className="border border-zinc-800/60 rounded-lg p-3 space-y-1">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-zinc-200">{goal.title}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {active > 0 && <span className="text-[10px] text-blue-400">{active} active</span>}
          <span className="text-[10px] text-zinc-600">{done}/{milestones.length}</span>
          <div className="w-12 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${goal.progress}%` }} />
          </div>
        </div>
      </div>
      {milestones.length > 0 ? (
        <div className="space-y-px pl-1">
          {milestones.map((m) => <MilestoneRow key={m.id} goal={m} />)}
        </div>
      ) : (
        <div className="text-[10px] text-zinc-600 pl-1">No milestones defined</div>
      )}
    </div>
  )
}

// ── main widget ────────────────────────────────────────────────────────────────

export default function GoalMilestoneWidget() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/goals')
      .then((r) => r.json())
      .then((d) => { if (d.goals) setGoals(d.goals) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-16">
      <div className="w-4 h-4 border-2 border-zinc-600 border-t-purple-400 rounded-full animate-spin" />
    </div>
  )

  // Find vision node(s)
  const visions = goals.filter((g) => g.level === 'vision')
  if (visions.length === 0) return (
    <div className="text-zinc-500 text-xs px-1">No goals defined</div>
  )

  const vision = visions[0]
  const strategies = (vision.children ?? []).filter((c) => c.level === 'strategy' && c.status !== 'completed')

  return (
    <div className="space-y-3">
      {/* Vision statement */}
      <div className="px-1">
        <div className="flex items-start gap-2">
          <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider flex-shrink-0 mt-0.5">Vision</span>
          <p className="text-xs text-zinc-300 leading-relaxed">{vision.title}</p>
        </div>
      </div>

      {/* Strategy sections with milestones */}
      <div className="space-y-2">
        {strategies.map((s) => <StrategySection key={s.id} goal={s} />)}
      </div>

      {/* Footer link */}
      <div className="flex justify-end pt-1">
        <Link
          href="/goals"
          className="text-[10px] text-zinc-500 hover:text-purple-400 transition-colors flex items-center gap-1"
        >
          Big Picture →
        </Link>
      </div>
    </div>
  )
}
