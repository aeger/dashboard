'use client'

import { useEffect, useState, useCallback } from 'react'
import StatusBadge from '@/components/shared/StatusBadge'
import type { Container } from '@/lib/portainer'

interface UpdateInfo {
  name: string
  has_update: boolean
  status: string
  user_status: string
  risk?: string
  current_version?: string
  latest_version?: string
  changelog_summary?: string
  changelog_url?: string
  scheduled_time?: string
  skipped_at?: string
  skip_reassess_at?: string
  completed_at?: string
  last_result?: { success: boolean; error?: string }
}

interface UpdateState {
  checked_at: string | null
  enriched_at?: string | null
  updates_available?: number
  containers: UpdateInfo[]
  policy?: { auto_risk_threshold?: string }
}

const RISK_COLORS: Record<string, string> = {
  patch:   'bg-green-500/20 text-green-400',
  rebuild: 'bg-green-500/20 text-green-400',
  minor:   'bg-amber-500/20 text-amber-400',
  major:   'bg-red-500/20 text-red-400',
  unknown: 'bg-amber-500/20 text-amber-400',
}

const RISK_LABELS: Record<string, string> = {
  patch:   'PATCH',
  rebuild: 'REBUILD',
  minor:   'MINOR',
  major:   'MAJOR',
  unknown: 'UPDATE',
}

const STACKS: Record<string, { label: string; containers: string[] }> = {
  immich:     { label: 'Immich',      containers: ['immich-server', 'immich-machine-learning', 'immich-redis', 'immich-postgres'] },
  monitoring: { label: 'Monitoring',  containers: ['prometheus', 'grafana', 'node_exporter', 'cadvisor', 'blackbox', 'snmp_exporter', 'podman_exporter'] },
  rustdesk:   { label: 'RustDesk',    containers: ['hbbs', 'hbbr'] },
  dashboard:  { label: 'Dashboard',   containers: ['az-dashboard', 'uptime-kuma'] },
}

function extractUptime(statusStr: string): string {
  // Portainer returns e.g. "Up 3 days", "Up 2 hours", "Exited (0) 5 minutes ago"
  const m = statusStr.match(/^Up (.+)$/)
  return m ? m[1] : ''
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function HealthBar({ running, total }: { running: number; total: number }) {
  const pct = total > 0 ? (running / total) * 100 : 0
  const color = pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-zinc-500 tabular-nums">{running}/{total}</span>
    </div>
  )
}

function RiskBadge({ update }: { update: UpdateInfo }) {
  const status = update.user_status
  const risk = update.risk || 'unknown'
  if (status === 'skipped') {
    const daysLeft = update.skip_reassess_at
      ? Math.max(0, Math.ceil((new Date(update.skip_reassess_at).getTime() - Date.now()) / 86400000))
      : 0
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-500 font-medium">SKIPPED{daysLeft > 0 ? ` ${daysLeft}d` : ''}</span>
  }
  if (status === 'auto_approved') return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium">AUTO 3AM</span>
  if (status === 'requested' || status === 'in_progress') return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-medium animate-pulse">UPDATING</span>
  if (status === 'scheduled') return <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-600/50 text-zinc-300 font-medium">SCHEDULED</span>
  if (status === 'ignored') return null
  if (status === 'completed') {
    const age = update.completed_at ? Date.now() - new Date(update.completed_at).getTime() : Infinity
    if (age > 86400000) return null
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-medium">UPDATED</span>
  }
  if (status === 'failed') return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">FAILED</span>
  const colorClass = RISK_COLORS[risk] || RISK_COLORS.unknown
  const label = RISK_LABELS[risk] || 'UPDATE'
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colorClass}`}>{label}</span>
}

function ActionBtn({ label, icon, onClick, disabled, color }: {
  label: string; icon: string; onClick: (e: React.MouseEvent) => void; disabled: boolean; color?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-30 ${color ?? 'text-zinc-400 bg-zinc-800/60 hover:bg-zinc-700'}`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function ContainerRow({ c, update, acting, rebuilding, actionLoading, onAction, onUpdateAction }: {
  c: Container
  update?: UpdateInfo
  acting: { id: string; action: string } | null
  rebuilding: string | null
  actionLoading: string | null
  onAction: (c: Container, action: string) => void
  onUpdateAction: (name: string, action: string) => void
}) {
  const [showDetail, setShowDetail] = useState(false)
  const isRunning = c.state === 'running'
  const isBusy = acting?.id === c.id
  const isRebuilding = rebuilding === c.name
  const hasUpdate = (update?.has_update ?? false) && update?.user_status !== 'ignored'
  const uptime = extractUptime(c.status)

  return (
    <div className="rounded-lg border border-zinc-800/60 overflow-hidden">
      {/* Main row */}
      <div
        className={`grid items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${showDetail ? 'bg-zinc-800/60' : 'bg-zinc-900/40 hover:bg-zinc-800/50'}`}
        style={{ gridTemplateColumns: '1fr auto auto auto' }}
        onClick={() => setShowDetail(!showDetail)}
      >
        {/* Name + image */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-zinc-200">{c.name}</span>
            {hasUpdate && update && <RiskBadge update={update} />}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
            <span>{c.image.split(':')[0].split('/').pop()}</span>
            {(() => {
              const tag = c.image.split(':')[1]
              const skip = ['latest', 'stable', 'release', 'main', 'master', 'edge', 'lts', 'current', undefined]
              return tag && !skip.includes(tag) ? <span className="text-zinc-700">{tag}</span> : null
            })()}
            {update?.current_version && hasUpdate && update.latest_version && (
              <span className="text-zinc-600">{update.current_version} → <span className="text-zinc-400">{update.latest_version}</span></span>
            )}
          </div>
        </div>

        {/* Uptime */}
        <div className="text-xs text-zinc-600 tabular-nums text-right min-w-[80px]">
          {uptime || <span className="text-zinc-700">—</span>}
        </div>

        {/* Endpoint */}
        <div className="text-[10px] text-zinc-700 min-w-[60px] text-right">{c.endpoint}</div>

        {/* Status + actions */}
        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <StatusBadge status={c.state} />
          {isRunning ? (
            <>
              <ActionBtn label="Restart" icon="↻" onClick={(e) => { e.stopPropagation(); onAction(c, 'restart') }} disabled={isBusy || isRebuilding} />
              <ActionBtn label="Stop" icon="■" onClick={(e) => { e.stopPropagation(); onAction(c, 'stop') }} disabled={isBusy || isRebuilding} color="text-red-400 bg-red-950/30 hover:bg-red-900/40" />
            </>
          ) : (
            <ActionBtn label="Start" icon="▶" onClick={(e) => { e.stopPropagation(); onAction(c, 'start') }} disabled={isBusy || isRebuilding} color="text-green-400 bg-green-950/30 hover:bg-green-900/40" />
          )}
          <ActionBtn
            label={isRebuilding ? 'Pulling…' : 'Pull'}
            icon="⇓"
            onClick={(e) => { e.stopPropagation(); onAction(c, 'rebuild') }}
            disabled={isBusy || isRebuilding}
            color="text-sky-400 bg-sky-950/30 hover:bg-sky-900/40"
          />
          {(isBusy || isRebuilding) && <div className="w-3.5 h-3.5 border border-zinc-500 border-t-zinc-200 rounded-full animate-spin" />}
        </div>
      </div>

      {/* Detail panel */}
      {showDetail && (
        <div className="px-4 py-3 bg-zinc-800/40 border-t border-zinc-800/60 space-y-3">
          {/* Image info always shown */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Image</div>
              <div className="text-xs text-zinc-400 font-mono break-all">{c.image.split(':')[0].split('/').pop()}</div>
            </div>
            {(() => {
              const tag = c.image.split(':')[1]
              return tag ? (
                <div>
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Tag</div>
                  <div className="text-xs text-zinc-400 font-mono">{tag}</div>
                </div>
              ) : null
            })()}
            {uptime && (
              <div>
                <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Uptime</div>
                <div className="text-xs text-zinc-300">{uptime}</div>
              </div>
            )}
            <div>
              <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Endpoint</div>
              <div className="text-xs text-zinc-400">{c.endpoint}</div>
            </div>
          </div>

          {/* Update section — only if update data exists */}
          {update ? (
            update.has_update ? (
              <div className="border-t border-zinc-700/50 pt-3 space-y-2">
                {/* Version diff */}
                {(update.current_version || update.latest_version) && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[10px] text-zinc-600 uppercase tracking-wider w-16">Version</span>
                    <span className="text-zinc-400 font-mono">{update.current_version ?? '?'}</span>
                    <span className="text-zinc-600">→</span>
                    <span className="text-zinc-200 font-mono">{update.latest_version ?? '?'}</span>
                    {update.risk && (
                      <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        update.risk === 'major' ? 'bg-red-500/20 text-red-400' :
                        update.risk === 'minor' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-green-500/20 text-green-400'
                      }`}>{update.risk}</span>
                    )}
                  </div>
                )}

                {/* Changelog */}
                {update.changelog_summary && (
                  <div>
                    <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Changelog</div>
                    <p className="text-xs text-zinc-400 leading-relaxed">{update.changelog_summary}</p>
                  </div>
                )}
                {update.changelog_url && (
                  <a href={update.changelog_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                    Full release notes ↗
                  </a>
                )}

                {/* Status-specific messages */}
                {update.user_status === 'completed' && update.completed_at && (
                  <p className="text-xs text-green-400">Updated {formatTimeAgo(update.completed_at)}</p>
                )}
                {update.user_status === 'failed' && update.last_result?.error && (
                  <p className="text-xs text-red-400">Error: {update.last_result.error}</p>
                )}
                {update.user_status === 'requested' && (
                  <p className="text-xs text-blue-400 animate-pulse">Update queued — processing shortly</p>
                )}
                {update.user_status === 'scheduled' && update.scheduled_time && (
                  <p className="text-xs text-zinc-400">Scheduled for {new Date(update.scheduled_time).toLocaleString()}</p>
                )}
                {update.user_status === 'skipped' && update.skip_reassess_at && (
                  <p className="text-xs text-zinc-500">
                    Skipped — reassess {new Date(update.skip_reassess_at).toLocaleDateString()}
                  </p>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 pt-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                  {['pending_review', 'failed'].includes(update.user_status) && (<>
                    <button onClick={() => onUpdateAction(c.name, 'update_now')} disabled={actionLoading === c.name} className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors">Update Now</button>
                    <button onClick={() => onUpdateAction(c.name, 'schedule')} disabled={actionLoading === c.name} className="text-xs px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 disabled:opacity-50 transition-colors">Schedule 3 AM</button>
                    <button onClick={() => onUpdateAction(c.name, 'skip')} disabled={actionLoading === c.name} className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-500 disabled:opacity-50 transition-colors">Skip 30d</button>
                    <button onClick={() => onUpdateAction(c.name, 'ignore')} disabled={actionLoading === c.name} className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-600 hover:text-zinc-400 disabled:opacity-50 transition-colors">Ignore</button>
                  </>)}
                  {update.user_status === 'auto_approved' && (<>
                    <span className="text-xs text-blue-400 self-center">Auto-updating at 3:47 AM</span>
                    <button onClick={() => onUpdateAction(c.name, 'update_now')} disabled={actionLoading === c.name} className="text-xs px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 disabled:opacity-50 transition-colors">Update Now</button>
                    <button onClick={() => onUpdateAction(c.name, 'skip')} disabled={actionLoading === c.name} className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-500 disabled:opacity-50 transition-colors">Skip</button>
                  </>)}
                  {update.user_status === 'scheduled' && (<>
                    <button onClick={() => onUpdateAction(c.name, 'update_now')} disabled={actionLoading === c.name} className="text-xs px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 disabled:opacity-50 transition-colors">Update Now</button>
                    <button onClick={() => onUpdateAction(c.name, 'skip')} disabled={actionLoading === c.name} className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-500 disabled:opacity-50 transition-colors">Skip</button>
                  </>)}
                  {update.user_status === 'skipped' && (<>
                    <button onClick={() => onUpdateAction(c.name, 'update_now')} disabled={actionLoading === c.name} className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors">Update Now</button>
                    <button onClick={() => onUpdateAction(c.name, 'schedule')} disabled={actionLoading === c.name} className="text-xs px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 disabled:opacity-50 transition-colors">Schedule 3 AM</button>
                  </>)}
                  {update.user_status === 'ignored' && (
                    <button onClick={() => onUpdateAction(c.name, 'unignore')} disabled={actionLoading === c.name} className="text-xs px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 disabled:opacity-50 transition-colors">Unignore</button>
                  )}
                  {actionLoading === c.name && <div className="w-4 h-4 border border-zinc-500 border-t-zinc-200 rounded-full animate-spin self-center" />}
                </div>
              </div>
            ) : (
              <div className="border-t border-zinc-700/50 pt-2">
                <span className="text-[10px] text-zinc-700 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500/60" />
                  Image up to date
                  {update.current_version && <span className="ml-1 font-mono">{update.current_version}</span>}
                </span>
              </div>
            )
          ) : (
            <div className="border-t border-zinc-700/50 pt-2">
              <span className="text-[10px] text-zinc-700">No update data</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ContainerListExpanded() {
  const [containers, setContainers] = useState<Container[]>([])
  const [updates, setUpdates] = useState<UpdateState>({ checked_at: null, containers: [] })
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<{ id: string; action: string } | null>(null)
  const [rebuilding, setRebuilding] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [stackUpdating, setStackUpdating] = useState<string | null>(null)

  const refresh = useCallback(() => {
    fetch('/api/containers').then((r) => r.json()).then((d) => setContainers(d.containers ?? [])).catch(() => {})
  }, [])

  const refreshUpdates = useCallback(() => {
    fetch('/api/containers/updates/state').then((r) => r.json()).then((d) => setUpdates(d)).catch(() => {})
  }, [])

  useEffect(() => {
    refresh(); refreshUpdates(); setLoading(false)
    const i1 = setInterval(refresh, 60000)
    const i2 = setInterval(refreshUpdates, 30000)
    return () => { clearInterval(i1); clearInterval(i2) }
  }, [refresh, refreshUpdates])

  const updateMap = new Map(updates.containers.map((u) => [u.name, u]))

  async function handleAction(c: Container, action: string) {
    if (action === 'rebuild') {
      setRebuilding(c.name)
      await fetch('/api/containers/rebuild', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ containerName: c.name }) }).catch(() => {})
      setTimeout(() => { refresh(); setRebuilding(null) }, 3000)
      return
    }
    setActing({ id: c.id, action })
    setContainers((prev) => prev.map((ct) => {
      if (ct.id !== c.id) return ct
      if (action === 'stop') return { ...ct, state: 'exited', status: 'Stopping...' }
      if (action === 'start') return { ...ct, state: 'running', status: 'Starting...' }
      if (action === 'restart') return { ...ct, state: 'restarting', status: 'Restarting...' }
      return ct
    }))
    await fetch('/api/containers/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpointId: c.endpointId, containerId: c.id, action }) }).catch(() => {})
    setTimeout(() => { refresh(); setActing(null) }, 2000)
  }

  async function handleUpdateAction(name: string, action: string) {
    setActionLoading(name)
    await fetch('/api/containers/updates/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ container: name, action }) }).catch(() => {})
    setTimeout(refreshUpdates, 5000)
    setActionLoading(null)
  }

  async function handleStackUpdate(stackName: string) {
    setStackUpdating(stackName)
    await fetch('/api/containers/stack-update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stackName }) }).catch(() => {})
    setTimeout(() => { refresh(); setStackUpdating(null) }, 4000)
  }

  if (loading) return <div className="flex items-center justify-center h-24"><div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" /></div>
  if (containers.length === 0) return <div className="text-zinc-500 text-sm text-center py-12">Portainer not configured</div>

  const sorted = [...containers].sort((a, b) => a.name.localeCompare(b.name))
  const updateNames = new Set(updates.containers.filter((u) => u.has_update && u.user_status !== 'ignored').map((u) => u.name))

  // Build groups
  const assignedNames = new Set(Object.values(STACKS).flatMap((s) => s.containers))
  const groups: Array<{ key: string; label: string; items: Container[] }> = [
    ...Object.entries(STACKS).map(([key, def]) => ({
      key,
      label: def.label,
      items: sorted.filter((c) => def.containers.includes(c.name)),
    })).filter((g) => g.items.length > 0),
    {
      key: '_other',
      label: 'Other',
      items: sorted.filter((c) => !assignedNames.has(c.name)),
    },
  ].filter((g) => g.items.length > 0)

  // Summary counts
  const totalRunning = containers.filter((c) => c.state === 'running').length
  const totalStopped = containers.filter((c) => c.state !== 'running').length
  const byRisk = updates.containers.filter((u) => u.has_update && u.user_status !== 'ignored').reduce<Record<string, number>>((acc, u) => {
    const r = u.risk ?? 'unknown'
    acc[r] = (acc[r] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-xs text-zinc-300 font-medium">{totalRunning} running</span>
        </div>
        {totalStopped > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50">
            <div className="w-2 h-2 rounded-full bg-zinc-600" />
            <span className="text-xs text-zinc-400">{totalStopped} stopped</span>
          </div>
        )}
        {byRisk.major > 0 && <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 text-red-400 border border-red-800/40">{byRisk.major} major update{byRisk.major > 1 ? 's' : ''}</span>}
        {byRisk.minor > 0 && <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-800/40">{byRisk.minor} minor</span>}
        {(byRisk.patch ?? 0) + (byRisk.rebuild ?? 0) > 0 && <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/15 text-green-400 border border-green-800/40">{(byRisk.patch ?? 0) + (byRisk.rebuild ?? 0)} patch</span>}
        {updates.checked_at && <span className="text-[10px] text-zinc-600 ml-auto">updated {formatTimeAgo(updates.checked_at)}</span>}
      </div>

      {/* Stack groups */}
      {groups.map((group) => {
        const stackDef = STACKS[group.key]
        const runningCount = group.items.filter((c) => c.state === 'running').length
        const hasStackUpdate = stackDef && group.items.some((c) => updateNames.has(c.name))

        return (
          <div key={group.key}>
            {/* Group header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">{group.label}</h3>
                <HealthBar running={runningCount} total={group.items.length} />
              </div>
              {hasStackUpdate && (
                <button
                  onClick={() => handleStackUpdate(group.key)}
                  disabled={stackUpdating === group.key}
                  className="text-[10px] px-2.5 py-1 bg-amber-700/40 hover:bg-amber-600/50 disabled:opacity-50 text-amber-200 rounded border border-amber-600/30 transition-colors"
                >
                  {stackUpdating === group.key ? '⟳ Updating…' : '↑ Update Stack'}
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {group.items.map((c) => (
                <ContainerRow
                  key={c.id}
                  c={c}
                  update={updateMap.get(c.name)}
                  acting={acting}
                  rebuilding={rebuilding}
                  actionLoading={actionLoading}
                  onAction={handleAction}
                  onUpdateAction={handleUpdateAction}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
