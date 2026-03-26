import { headers } from 'next/headers'
import Link from 'next/link'
import type { Goal } from '@/app/api/goals/route'

export const dynamic = 'force-dynamic'

// ── data fetching ──────────────────────────────────────────────────────────────

async function fetchGoals(): Promise<{ goals: Goal[]; flat: Goal[] }> {
  const host = (await headers()).get('host') ?? 'localhost:3000'
  const proto = host.includes('localhost') ? 'http' : 'https'
  try {
    const res = await fetch(`${proto}://${host}/api/goals`, { cache: 'no-store' })
    if (!res.ok) return { goals: [], flat: [] }
    return res.json()
  } catch {
    return { goals: [], flat: [] }
  }
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

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide ${STATUS_BG[status] ?? STATUS_BG.planned}`}>
      {status}
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
                status === 'paused'    ? 'bg-yellow-500' : 'bg-blue-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] text-zinc-500 tabular-nums w-7 text-right">{value}%</span>
    </div>
  )
}

// ── goal card ──────────────────────────────────────────────────────────────────

function GoalCard({ goal, depth = 0 }: { goal: Goal; depth?: number }) {
  const daysLeft = goal.target_date
    ? Math.ceil((new Date(goal.target_date).getTime() - Date.now()) / 86400000)
    : null
  const hasChildren = (goal.children?.length ?? 0) > 0

  return (
    <div className={`${depth > 0 ? 'ml-4 border-l border-zinc-800/60 pl-4' : ''}`}>
      <div className={`rounded-xl border p-4 mb-3 ${
        goal.status === 'blocked' ? 'border-amber-900/40 bg-amber-950/10' :
        goal.status === 'completed' ? 'border-green-900/30 bg-green-950/5' :
        'border-zinc-800/60 bg-zinc-900/30'
      }`}>
        {/* Header row */}
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
              <span className={`text-xs tabular-nums ${daysLeft < 0 ? 'text-red-400' : daysLeft < 7 ? 'text-amber-400' : 'text-zinc-500'}`}>
                {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
              </span>
            )}
            {goal.target_date && (
              <span className="text-[10px] text-zinc-600">{goal.target_date}</span>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className={`font-semibold mb-1 ${
          goal.level === 'vision' ? 'text-lg text-white' :
          goal.level === 'strategy' ? 'text-base text-zinc-100' :
          'text-sm text-zinc-200'
        }`}>{goal.title}</h3>

        {/* Description */}
        {goal.description && (
          <p className="text-xs text-zinc-400 leading-relaxed mb-3">{goal.description}</p>
        )}

        {/* Progress */}
        <ProgressBar value={goal.progress} status={goal.status} />

        {/* Tags */}
        {goal.tags && goal.tags.length > 0 && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {goal.tags.map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-500">{t}</span>
            ))}
          </div>
        )}

        {/* Notes */}
        {goal.notes && (
          <div className="mt-2 text-[11px] text-zinc-500 italic border-l-2 border-zinc-700 pl-2">{goal.notes}</div>
        )}
      </div>

      {/* Children */}
      {hasChildren && (
        <div className="space-y-0">
          {goal.children!.map((child) => (
            <GoalCard key={child.id} goal={child} depth={depth + 1} />
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
  const activeCount = byStatus.active ?? 0
  const blockedCount = byStatus.blocked ?? 0
  const completedCount = byStatus.completed ?? 0

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {[
        { label: 'Total Goals', value: flat.length, color: 'text-white' },
        { label: 'Active', value: activeCount, color: 'text-blue-400' },
        { label: 'Completed', value: completedCount, color: 'text-green-400' },
        { label: 'Blocked', value: blockedCount, color: blockedCount > 0 ? 'text-amber-400' : 'text-zinc-600' },
        { label: 'Avg Progress', value: `${avgProgress}%`, color: 'text-zinc-300' },
        { label: 'Milestones', value: byLevel.milestone ?? 0, color: 'text-zinc-300' },
        { label: 'Strategies', value: byLevel.strategy ?? 0, color: 'text-indigo-300' },
        { label: 'Vision Items', value: byLevel.vision ?? 0, color: 'text-purple-300' },
      ].map(({ label, value, color }) => (
        <div key={label} className="bg-zinc-900/40 border border-zinc-800/60 rounded-lg p-3 text-center">
          <div className={`text-xl font-semibold tabular-nums ${color}`}>{value}</div>
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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {/* In Progress */}
      <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-4">
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
                  <div className="flex-1 h-0.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${g.progress}%` }} />
                  </div>
                  <span className="text-[10px] text-zinc-600">{g.progress}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Blocked */}
      <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-4">
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

      {/* Up Next */}
      <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-4">
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

// ── page ───────────────────────────────────────────────────────────────────────

export default async function GoalsPage() {
  const { goals, flat } = await fetchGoals()

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/lab" className="text-zinc-600 hover:text-zinc-400 text-sm transition-colors">← Lab</Link>
            <span className="text-zinc-700">|</span>
            <h1 className="text-xl font-semibold text-white">Big Picture</h1>
          </div>
          <p className="text-xs text-zinc-500">Goals, milestones, and the direction of work</p>
        </div>
      </div>

      {/* Summary stats */}
      <SummaryTable flat={flat} />

      {/* Next steps matrix */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Status Overview</h2>
        <NextSteps flat={flat} />
      </div>

      {/* Full goal tree */}
      <div>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Goal Hierarchy</h2>
        {goals.length === 0 ? (
          <div className="text-zinc-600 text-sm text-center py-12">No goals found</div>
        ) : (
          <div className="space-y-2">
            {goals.map((g) => <GoalCard key={g.id} goal={g} depth={0} />)}
          </div>
        )}
      </div>
    </div>
  )
}
