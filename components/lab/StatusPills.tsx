'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface ContainerSummary { up: number; down: number; total: number; updates: number; majorUpdates: number }
interface TaskSummary { pending: number; active: number; completed: number; failed: number; blocked: number; total: number }
interface SecuritySummary { score: number; critical: number; warning: number }
interface BackupSummary { ok: number; overdue: number; failed: number; total: number }

function ContainerPill() {
  const [summary, setSummary] = useState<ContainerSummary | null>(null)

  useEffect(() => {
    const load = () => Promise.all([
      fetch('/api/containers').then(r => r.json()),
      fetch('/api/containers/updates/state').then(r => r.json()).catch(() => ({ containers: [] })),
    ]).then(([cd, ud]) => {
      const containers: { state: string }[] = cd.containers ?? []
      const up = containers.filter(c => c.state === 'running').length
      const updList: { has_update: boolean; user_status: string; risk?: string }[] = ud.containers ?? []
      const pending = updList.filter(u => u.has_update && u.user_status !== 'ignored' && u.user_status !== 'completed')
      setSummary({
        up, down: containers.length - up, total: containers.length,
        updates: pending.length,
        majorUpdates: pending.filter(u => u.risk === 'major').length,
      })
    }).catch(() => {})
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [])

  const pct = summary ? Math.round((summary.up / Math.max(summary.total, 1)) * 100) : null
  const color = pct == null ? '#52525b' : summary!.down > 0 ? '#ef4444' : pct === 100 ? '#22c55e' : '#f59e0b'
  const updateColor = summary && summary.majorUpdates > 0 ? '#ef4444' : '#f59e0b'

  return (
    <Link
      href="/lab/containers"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all hover:brightness-125"
      style={{
        background: `${color}12`,
        borderColor: `${color}30`,
        color,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-zinc-400 font-normal">containers</span>
      {summary ? (
        <>
          <span className="font-semibold tabular-nums" style={{ color }}>{summary.up}/{summary.total}</span>
          {summary.down > 0 && <span className="text-red-400 tabular-nums font-semibold">↓{summary.down}</span>}
          {summary.updates > 0 && (
            <span className="font-semibold tabular-nums" style={{ color: updateColor }}>↑{summary.updates}</span>
          )}
        </>
      ) : (
        <span className="text-zinc-600">—</span>
      )}
    </Link>
  )
}

function TaskPill() {
  const [summary, setSummary] = useState<TaskSummary | null>(null)

  useEffect(() => {
    const load = () =>
      fetch('/api/taskqueue')
        .then(r => r.json())
        .then(d => {
          const problems: { status: string }[] = d.problems ?? []
          const waiting: { status: string }[] = d.waiting ?? []
          const active: { status: string }[] = d.active ?? []
          const recent: { status: string }[] = d.recent ?? []
          const summary24h: Record<string, number> = d.summary24h ?? {}
          setSummary({
            pending: recent.filter(t => t.status === 'pending').length,
            active: active.length,
            completed: summary24h['completed'] ?? 0,
            failed: problems.filter(t => t.status === 'failed').length,
            blocked: [...problems.filter(t => t.status === 'escalated'), ...waiting.filter(t => t.status === 'blocked')].length,
            total: recent.length,
          })
        })
        .catch(() => {})
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [])

  // Dominant color: failed red > blocked amber > active/pending green-ok idle zinc.
  // Mockup grammar: "queue N open" — open = active + pending.
  const open = summary ? summary.active + summary.pending : null
  const color = !summary ? '#71717a'
    : summary.failed > 0 ? '#ef4444'
    : summary.blocked > 0 ? '#f59e0b'
    : '#22c55e'

  return (
    <Link
      href="/lab/tasks"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all hover:brightness-125"
      style={{
        background: `${color}12`,
        borderColor: `${color}30`,
        color,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-zinc-400 font-normal">queue</span>
      {summary ? (
        <span className="flex items-center gap-1.5 tabular-nums">
          <span className="font-semibold" style={{ color }}>{open}</span>
          <span className="text-zinc-400 font-normal">open</span>
          {summary.failed > 0 && <span className="text-red-400 font-semibold">{summary.failed} failed</span>}
          {summary.blocked > 0 && <span className="text-amber-400 font-semibold">{summary.blocked} blocked</span>}
        </span>
      ) : (
        <span className="text-zinc-500">—</span>
      )}
    </Link>
  )
}

function BackupsPill() {
  const [summary, setSummary] = useState<BackupSummary | null>(null)

  useEffect(() => {
    const load = () =>
      fetch('/api/backups')
        .then(r => r.json())
        .then(d => {
          const backups: { health: string }[] = d.backups ?? []
          setSummary({
            ok: backups.filter(b => b.health === 'ok').length,
            overdue: backups.filter(b => b.health === 'overdue').length,
            failed: backups.filter(b => ['failed', 'never_succeeded'].includes(b.health)).length,
            total: backups.length,
          })
        })
        .catch(() => {})
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  const color = !summary ? '#71717a'
    : summary.failed > 0 ? '#ef4444'
    : summary.overdue > 0 ? '#f59e0b'
    : '#22c55e'

  return (
    <a
      href="#backups"
      onClick={(e) => {
        e.preventDefault()
        document.getElementById('backups')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all hover:brightness-125 cursor-pointer"
      style={{
        background: `${color}12`,
        borderColor: `${color}30`,
        color,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-zinc-400 font-normal">backups</span>
      {summary ? (
        <span className="flex items-center gap-1.5 tabular-nums">
          <span className="font-semibold" style={{ color }}>{summary.ok} ok</span>
          {summary.failed > 0 && <span className="text-red-400 font-semibold">{summary.failed} failed</span>}
          {summary.overdue > 0 && <span className="text-amber-400 font-semibold">{summary.overdue} overdue</span>}
        </span>
      ) : (
        <span className="text-zinc-500">—</span>
      )}
    </a>
  )
}

function SecurityPill() {
  const [summary, setSummary] = useState<SecuritySummary | null>(null)

  useEffect(() => {
    const load = () =>
      fetch('/api/security')
        .then(r => r.json())
        .then(d => {
          if (d.error) return
          setSummary({ score: d.score ?? 0, critical: d.counts?.critical ?? 0, warning: d.counts?.warning ?? 0 })
        })
        .catch(() => {})
    load()
    const id = setInterval(load, 120_000)
    return () => clearInterval(id)
  }, [])

  // Mockup grammar: "N security findings" — color carries severity.
  const findings = summary ? summary.critical + summary.warning : null
  const color = !summary ? '#71717a'
    : summary.critical > 0 ? '#ef4444'
    : summary.warning > 0 ? '#f59e0b'
    : '#22c55e'

  return (
    <a
      href="#security"
      onClick={(e) => {
        e.preventDefault()
        document.getElementById('security')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all hover:brightness-125 cursor-pointer"
      style={{
        background: `${color}12`,
        borderColor: `${color}30`,
        color,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      {summary ? (
        <span className="flex items-center gap-1.5 tabular-nums">
          <span className="font-semibold" style={{ color }}>{findings}</span>
          <span className="text-zinc-400 font-normal">security {findings === 1 ? 'finding' : 'findings'}</span>
        </span>
      ) : (
        <>
          <span className="text-zinc-400 font-normal">security</span>
          <span className="text-zinc-500">—</span>
        </>
      )}
    </a>
  )
}

function ClaudeVersionPill() {
  const [data, setData] = useState<{ current: string; latest: string; updateAvailable: boolean } | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState(false)

  const load = useCallback(() =>
    fetch('/api/claude-version')
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          setFetchError(true)
        } else {
          setData(d)
          setFetchError(false)
        }
      })
      .catch(() => { setFetchError(true) }), [])

  useEffect(() => {
    load()
    const slowId = setInterval(load, 5 * 60_000)
    return () => clearInterval(slowId)
  }, [load])

  // Fast retry while we have no data at all (initial-load failure).
  useEffect(() => {
    if (data || !fetchError) return
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [data, fetchError, load])

  const handleUpdate = async () => {
    if (!data?.updateAvailable || updating) return
    setUpdating(true)
    setUpdateError(false)
    try {
      const res = await fetch('/api/claude-update', { method: 'POST' })
      const d = await res.json()
      if (d.success) {
        await load()
      } else {
        setUpdateError(true)
      }
    } catch {
      setUpdateError(true)
    } finally {
      setUpdating(false)
    }
  }

  const color = updateError ? '#ef4444'
    : !data && fetchError ? '#ef4444'
    : !data ? '#71717a'
    : data.updateAvailable ? '#f59e0b'
    : '#22c55e'

  const isClickable = !!data?.updateAvailable && !updating

  return (
    <button
      onClick={handleUpdate}
      disabled={!isClickable}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all${isClickable ? ' hover:brightness-125' : ''}`}
      style={{
        background: `${color}12`,
        borderColor: `${color}30`,
        color,
        cursor: isClickable ? 'pointer' : 'default',
      }}
      title={data?.updateAvailable ? `Click to install v${data.latest}` : undefined}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-zinc-400 font-normal">claude</span>
      {updating ? (
        <span className="text-amber-400">updating…</span>
      ) : updateError ? (
        <span className="text-red-400 font-semibold">update failed</span>
      ) : data ? (
        <>
          <span className="font-semibold tabular-nums font-mono" style={{ color }}>v{data.current}</span>
          {data.updateAvailable && (
            <span className="text-amber-400 font-semibold">↑ v{data.latest}</span>
          )}
          {fetchError && <span className="text-amber-400" title="Last refresh failed; showing cached version">⚠</span>}
        </>
      ) : fetchError ? (
        <span className="text-red-400 font-semibold">unavailable</span>
      ) : (
        <span className="text-zinc-500">—</span>
      )}
    </button>
  )
}

function SpendPill() {
  const [data, setData] = useState<{ bucketSpend: number; bucketLimit: number; bucketPct: number; apiSpend: number; available: boolean } | null>(null)

  useEffect(() => {
    const load = () =>
      fetch('/api/claude-spend')
        .then(r => r.json())
        .then(d => { if (d && !d.error) setData(d) })
        .catch(() => {})
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  const exhausted = data ? data.bucketSpend >= data.bucketLimit : false
  const color = !data ? '#71717a'
    : exhausted ? '#f59e0b'
    : data.bucketPct >= 85 ? '#eab308'
    : '#10b981'

  return (
    <a
      href="#claude-spend"
      onClick={(e) => {
        e.preventDefault()
        document.getElementById('claude-spend')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all hover:brightness-125 cursor-pointer"
      style={{ background: `${color}12`, borderColor: `${color}30`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-zinc-400 font-normal">spend</span>
      {data && data.available ? (
        <>
          <span className="font-semibold tabular-nums" style={{ color }}>
            ${data.bucketSpend < 0.01 ? data.bucketSpend.toFixed(3) : data.bucketSpend.toFixed(2)}
          </span>
          <span className="text-zinc-600 tabular-nums">/{data.bucketLimit}</span>
          {data.apiSpend > 0 && <span className="text-amber-400 tabular-nums font-semibold">+${data.apiSpend.toFixed(2)}</span>}
        </>
      ) : (
        <span className="text-zinc-600">—</span>
      )}
    </a>
  )
}

// Mockup strip order: containers · security findings · queue · backups · spend · claude
export default function StatusPills() {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <ContainerPill />
      <SecurityPill />
      <TaskPill />
      <BackupsPill />
      <SpendPill />
      <ClaudeVersionPill />
    </div>
  )
}
