'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { statusGlyph, type Tone } from '@/lib/colorThemes'

interface ContainerSummary { up: number; down: number; idle: number; total: number; updates: number; majorUpdates: number }
interface TaskSummary { pending: number; active: number; completed: number; failed: number; blocked: number; needsJeff: number; withAgent: number; total: number }
interface SecuritySummary { score: number; critical: number; warning: number }
interface BackupSummary { ok: number; overdue: number; failed: number; total: number }

/* ── Shared pill shell ────────────────────────────────────────────────────
   Prototype grammar: a NEUTRAL surface pill (--t-surf) whose color lives only
   in a shape-coded status glyph (● UP ▲ WARN ■ DOWN ◆ INFO ○ IDLE). Because
   the glyph tone reads from --t-* tokens, the color is correct in every theme
   — no more baking dark-theme hex tints into the background (which washed out
   on daylight). Meaning survives on shape alone (CVD-safe). */
const PILL = 'az-pill az-lift text-[11px] no-underline'

function PillBody({ tone, label, children }: { tone: Tone; label: string; children: React.ReactNode }) {
  return (
    <>
      <span className={`az-glyph is-${tone}`}>{statusGlyph[tone]}</span>
      <span className="az-pill__label">{label}</span>
      <span className="az-pill__val">{children}</span>
    </>
  )
}

function ContainerPill() {
  const [summary, setSummary] = useState<ContainerSummary | null>(null)

  useEffect(() => {
    const load = () => Promise.all([
      fetch('/api/containers').then(r => r.json()),
      fetch('/api/containers/updates/state').then(r => r.json()).catch(() => ({ containers: [] })),
    ]).then(([cd, ud]) => {
      const containers: { state: string }[] = cd.containers ?? []
      // 'created' means the container has NEVER been started — ad-hoc scratch
      // containers (e.g. Jeff's az-tei-probe-* A/B eval probes) sit here
      // indefinitely by design: no restart policy, gone-but-not-removed after a
      // reboot. Counting them as "down" turned the pill red and read as "TEI is
      // broken" when production TEI was healthy the whole time. Only 'exited'/
      // 'dead' — something that WAS running and isn't — is a real outage.
      const idle = containers.filter(c => c.state === 'created').length
      const active = containers.filter(c => c.state !== 'created')
      const up = active.filter(c => c.state === 'running').length
      const updList: { has_update: boolean; user_status: string; risk?: string }[] = ud.containers ?? []
      const pending = updList.filter(u => u.has_update && u.user_status !== 'ignored' && u.user_status !== 'completed')
      setSummary({
        up, down: active.length - up, idle, total: active.length,
        updates: pending.length,
        majorUpdates: pending.filter(u => u.risk === 'major').length,
      })
    }).catch(() => {})
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [])

  const pct = summary ? Math.round((summary.up / Math.max(summary.total, 1)) * 100) : null
  const tone: Tone = !summary ? 'idle' : summary.down > 0 ? 'crit' : pct === 100 ? 'ok' : 'warn'

  return (
    <Link href="/lab/containers" className={PILL}>
      <PillBody tone={tone} label="containers">
        {summary ? (
          <>
            {summary.up}/{summary.total}
            {summary.down > 0 && <span className="text-red-400 font-semibold ml-1.5">↓{summary.down}</span>}
            {summary.idle > 0 && (
              <span className="ml-1.5" style={{ color: 'var(--t-txf)' }} title={`${summary.idle} never-started container(s) — ad-hoc/scratch, not an outage`}>○{summary.idle}</span>
            )}
            {summary.updates > 0 && (
              <span className={`font-semibold ml-1.5 ${summary.majorUpdates > 0 ? 'text-red-400' : 'text-amber-400'}`}>↑{summary.updates}</span>
            )}
          </>
        ) : '—'}
      </PillBody>
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
          const jeffUrgent: { status: string; target: string | null }[] = d.jeff_urgent ?? []
          const summary24h: Record<string, number> = d.summary24h ?? {}
          // JeffLoop split (mirrors TaskQueueExpanded isJeffUrgent/isWithAgent):
          // pending_jeff_action + review_needed with target jeff/null → Jeff's plate;
          // review_needed handed back to an agent → with agent.
          const needsJeff = jeffUrgent.filter(
            t => t.status === 'pending_jeff_action' || (t.status === 'review_needed' && (!t.target || t.target === 'jeff'))
          ).length
          const withAgent = jeffUrgent.filter(
            t => t.status === 'review_needed' && !!t.target && t.target !== 'jeff'
          ).length
          setSummary({
            pending: recent.filter(t => t.status === 'pending').length,
            active: active.length,
            completed: summary24h['completed'] ?? 0,
            failed: problems.filter(t => t.status === 'failed').length,
            blocked: [...problems.filter(t => t.status === 'escalated'), ...waiting.filter(t => t.status === 'blocked')].length,
            needsJeff,
            withAgent,
            total: recent.length,
          })
        })
        .catch(() => {})
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [])

  // Mockup grammar: "queue N open" — open = active + pending. Tone escalates:
  // failed or needs-jeff → crit; blocked or with-agent → warn; else ok. "Needs
  // Jeff" is an actionable-by-Jeff state so it lights the glyph like a problem.
  const open = summary ? summary.active + summary.pending : null
  const tone: Tone = !summary ? 'idle'
    : summary.failed > 0 || summary.needsJeff > 0 ? 'crit'
    : summary.blocked > 0 || summary.withAgent > 0 ? 'warn'
    : 'ok'

  return (
    <Link href="/lab/tasks" className={PILL}>
      <PillBody tone={tone} label="queue">
        {summary ? (
          <>
            {open} open
            {summary.needsJeff > 0 && <span className="text-rose-400 font-semibold ml-1.5">{summary.needsJeff} needs jeff</span>}
            {summary.withAgent > 0 && <span className="text-blue-400 font-semibold ml-1.5">{summary.withAgent} with agent</span>}
            {summary.failed > 0 && <span className="text-red-400 font-semibold ml-1.5">{summary.failed} failed</span>}
            {summary.blocked > 0 && <span className="text-amber-400 font-semibold ml-1.5">{summary.blocked} blocked</span>}
          </>
        ) : '—'}
      </PillBody>
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

  const tone: Tone = !summary ? 'idle' : summary.failed > 0 ? 'crit' : summary.overdue > 0 ? 'warn' : 'ok'

  return (
    <a
      href="#backups"
      onClick={(e) => {
        e.preventDefault()
        document.getElementById('backups')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }}
      className={`${PILL} cursor-pointer`}
    >
      <PillBody tone={tone} label="backups">
        {summary ? (
          <>
            {summary.ok} ok
            {summary.failed > 0 && <span className="text-red-400 font-semibold ml-1.5">{summary.failed} failed</span>}
            {summary.overdue > 0 && <span className="text-amber-400 font-semibold ml-1.5">{summary.overdue} overdue</span>}
          </>
        ) : '—'}
      </PillBody>
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

  // Mockup grammar: "N security findings" — glyph carries severity.
  const findings = summary ? summary.critical + summary.warning : null
  const tone: Tone = !summary ? 'idle' : summary.critical > 0 ? 'crit' : summary.warning > 0 ? 'warn' : 'ok'

  return (
    <a
      href="#security"
      onClick={(e) => {
        e.preventDefault()
        document.getElementById('security')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }}
      className={`${PILL} cursor-pointer`}
    >
      <PillBody tone={tone} label="security">
        {summary ? `${findings} ${findings === 1 ? 'finding' : 'findings'}` : '—'}
      </PillBody>
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

  const tone: Tone = updateError ? 'crit'
    : !data && fetchError ? 'crit'
    : !data ? 'idle'
    : data.updateAvailable ? 'warn'
    : 'ok'

  const isClickable = !!data?.updateAvailable && !updating

  return (
    <button
      onClick={handleUpdate}
      disabled={!isClickable}
      className={PILL}
      style={{ cursor: isClickable ? 'pointer' : 'default' }}
      title={data?.updateAvailable ? `Click to install v${data.latest}` : undefined}
    >
      <PillBody tone={tone} label="claude">
        {updating ? (
          <span className="text-amber-400">updating…</span>
        ) : updateError ? (
          <span className="text-red-400 font-semibold">update failed</span>
        ) : data ? (
          <>
            v{data.current}
            {data.updateAvailable && <span className="text-amber-400 font-semibold ml-1.5">↑ v{data.latest}</span>}
            {fetchError && <span className="text-amber-400 ml-1" title="Last refresh failed; showing cached version">⚠</span>}
          </>
        ) : fetchError ? (
          <span className="text-red-400 font-semibold">unavailable</span>
        ) : '—'}
      </PillBody>
    </button>
  )
}

function SpendPill() {
  const [data, setData] = useState<{ bucketSpend: number; bucketLimit: number; bucketPct: number; apiSpend: number; realSpend: number; actualSpend: number; planLabel: string; available: boolean } | null>(null)

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
  const tone: Tone = !data || !data.available ? 'idle'
    : exhausted ? 'warn'
    : data.bucketPct >= 85 ? 'warn'
    : 'ok'

  return (
    <a
      href="#claude-spend"
      onClick={(e) => {
        e.preventDefault()
        document.getElementById('claude-spend')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }}
      className={`${PILL} cursor-pointer`}
    >
      <PillBody tone={tone} label="spend">
        {data && data.available ? (
          <span
            title={`You actually pay $${(data.actualSpend ?? 0).toFixed(2)} this month (${data.planLabel ?? 'flat plan'}${data.apiSpend > 0 ? ` + $${data.apiSpend.toFixed(2)} API overflow` : ' flat'}). Notional API-equivalent usage: $${(data.realSpend ?? 0).toFixed(2)}.`}
          >
            ${(data.actualSpend ?? 0).toFixed(2)}
            {data.apiSpend > 0 && <span className="text-amber-400 font-semibold ml-1.5">+${data.apiSpend.toFixed(2)} api</span>}
          </span>
        ) : '—'}
      </PillBody>
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
