'use client'

import { useEffect, useState, useCallback } from 'react'
import StatusBadge from '@/components/shared/StatusBadge'
import type { Container } from '@/lib/portainer'

type ActionState = { id: string; action: string } | null

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
  patch: 'bg-green-500/20 text-green-400',
  rebuild: 'bg-green-500/20 text-green-400',
  minor: 'bg-amber-500/20 text-amber-400',
  major: 'bg-red-500/20 text-red-400',
  unknown: 'bg-amber-500/20 text-amber-400',
}

const RISK_LABELS: Record<string, string> = {
  patch: 'PATCH',
  rebuild: 'REBUILD',
  minor: 'MINOR',
  major: 'MAJOR',
  unknown: 'UPDATE',
}

export default function ContainerList() {
  const [containers, setContainers] = useState<Container[]>([])
  const [updates, setUpdates] = useState<UpdateState>({ checked_at: null, containers: [] })
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<ActionState>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const refresh = useCallback(() => {
    fetch('/api/containers')
      .then((r) => r.json())
      .then((d) => setContainers(d.containers ?? []))
      .catch(() => {})
  }, [])

  const refreshUpdates = useCallback(() => {
    fetch('/api/containers/updates/state')
      .then((r) => r.json())
      .then((d) => setUpdates(d))
      .catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    refreshUpdates()
    setLoading(false)
    const interval = setInterval(refresh, 60000)
    const updateInterval = setInterval(refreshUpdates, 30000)
    return () => { clearInterval(interval); clearInterval(updateInterval) }
  }, [refresh, refreshUpdates])

  const updateMap = new Map(updates.containers.map((u) => [u.name, u]))

  async function handleContainerAction(c: Container, action: string) {
    setActing({ id: c.id, action })
    try {
      const res = await fetch('/api/containers/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpointId: c.endpointId, containerId: c.id, action }),
      })
      if (!res.ok) console.error('Container action failed')
      setTimeout(refresh, 1500)
    } catch (e) {
      console.error('Container action error:', e)
    } finally {
      setActing(null)
    }
  }

  async function handleUpdateAction(name: string, action: string) {
    setActionLoading(name)
    try {
      await fetch('/api/containers/updates/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ container: name, action }),
      })
      setTimeout(refreshUpdates, 1000)
    } catch (e) {
      console.error('Update action error:', e)
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-24">
      <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
    </div>
  )

  if (containers.length === 0) return (
    <div className="text-zinc-500 text-sm text-center py-6">Portainer not configured</div>
  )

  // Count by status
  const autoCount = updates.containers.filter((u) => u.user_status === 'auto_approved').length
  const reviewCount = updates.containers.filter((u) => u.user_status === 'pending_review').length
  const skippedCount = updates.containers.filter((u) => u.user_status === 'skipped').length
  const totalUpdates = (updates.updates_available ?? 0)

  return (
    <div className="space-y-2">
      {/* Summary bar */}
      {updates.checked_at && (
        <div className="flex items-center justify-between text-xs px-1">
          <div className="flex items-center gap-2">
            {totalUpdates > 0 ? (
              <>
                <span className="text-zinc-300">{totalUpdates} update{totalUpdates !== 1 ? 's' : ''}</span>
                {autoCount > 0 && <span className="text-green-400">{autoCount} auto</span>}
                {reviewCount > 0 && <span className="text-amber-400">{reviewCount} review</span>}
                {skippedCount > 0 && <span className="text-zinc-500">{skippedCount} skipped</span>}
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-zinc-400">All images current</span>
              </>
            )}
          </div>
          <span className="text-zinc-600" title={updates.checked_at}>
            {formatTimeAgo(updates.checked_at)}
          </span>
        </div>
      )}

      {/* Container list */}
      <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
        {containers.map((c) => {
          const isRunning = c.state === 'running'
          const isBusy = acting?.id === c.id
          const update = updateMap.get(c.name)
          const isExpanded = expanded === c.name
          const hasUpdate = update?.has_update ?? false

          return (
            <div key={c.id}>
              {/* Main row */}
              <div
                className={`flex items-center justify-between py-1.5 px-2 rounded-lg transition-colors cursor-pointer ${
                  isExpanded ? 'bg-zinc-800/70' : 'bg-zinc-800/40 hover:bg-zinc-800/70'
                }`}
                onClick={() => hasUpdate ? setExpanded(isExpanded ? null : c.name) : undefined}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-zinc-200 truncate">{c.name}</span>
                    {hasUpdate && update && <RiskBadge update={update} />}
                  </div>
                  <div className="text-xs text-zinc-500 truncate">
                    {c.image.split(':')[0].split('/').pop()}
                    {hasUpdate && update?.current_version && update?.latest_version && (
                      <span className="text-zinc-600 ml-1">
                        {update.current_version} → {update.latest_version}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                  <span className="text-xs text-zinc-600 mr-1">{c.endpoint}</span>
                  {isRunning ? (
                    <>
                      <ActionBtn label="Restart" icon="↻" onClick={(e) => { e.stopPropagation(); handleContainerAction(c, 'restart') }} disabled={isBusy} title="Restart" />
                      <ActionBtn label="Stop" icon="■" onClick={(e) => { e.stopPropagation(); handleContainerAction(c, 'stop') }} disabled={isBusy} color="text-red-400 hover:bg-red-500/20" title="Stop" />
                    </>
                  ) : (
                    <ActionBtn label="Start" icon="▶" onClick={(e) => { e.stopPropagation(); handleContainerAction(c, 'start') }} disabled={isBusy} color="text-green-400 hover:bg-green-500/20" title="Start" />
                  )}
                  {isBusy && <div className="w-3.5 h-3.5 border border-zinc-500 border-t-zinc-200 rounded-full animate-spin" />}
                  <StatusBadge status={c.state} />
                </div>
              </div>

              {/* Expanded detail panel */}
              {isExpanded && hasUpdate && update && (
                <ExpandedPanel
                  update={update}
                  onAction={(action) => handleUpdateAction(c.name, action)}
                  loading={actionLoading === c.name}
                />
              )}
            </div>
          )
        })}
      </div>
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
    return (
      <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-500 font-medium">
        SKIPPED {daysLeft > 0 ? `(${daysLeft}d)` : ''}
      </span>
    )
  }

  if (status === 'auto_approved') {
    return (
      <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium">
        AUTO 3AM
      </span>
    )
  }

  if (status === 'requested' || status === 'in_progress') {
    return (
      <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-medium animate-pulse">
        UPDATING
      </span>
    )
  }

  if (status === 'scheduled') {
    return (
      <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-zinc-600/50 text-zinc-300 font-medium">
        SCHEDULED
      </span>
    )
  }

  if (status === 'completed') {
    return (
      <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-medium">
        UPDATED
      </span>
    )
  }

  if (status === 'failed') {
    return (
      <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">
        FAILED
      </span>
    )
  }

  // pending_review — show risk level
  const colorClass = RISK_COLORS[risk] || RISK_COLORS.unknown
  const label = RISK_LABELS[risk] || 'UPDATE'
  return (
    <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${colorClass}`}>
      {label}
    </span>
  )
}

function ExpandedPanel({ update, onAction, loading }: {
  update: UpdateInfo
  onAction: (action: string) => void
  loading: boolean
}) {
  const [showFull, setShowFull] = useState(false)
  const status = update.user_status

  return (
    <div className="mx-2 mb-1 p-3 rounded-b-lg bg-zinc-800/60 border-t border-zinc-700/50 space-y-2">
      {/* Version info */}
      {update.current_version && update.latest_version && (
        <div className="text-xs text-zinc-400">
          Version: <span className="text-zinc-300">{update.current_version}</span>
          <span className="text-zinc-600 mx-1">→</span>
          <span className="text-zinc-200">{update.latest_version}</span>
          {update.risk && (
            <span className={`ml-2 ${update.risk === 'major' ? 'text-red-400' : update.risk === 'minor' ? 'text-amber-400' : 'text-green-400'}`}>
              ({update.risk})
            </span>
          )}
        </div>
      )}

      {/* Changelog */}
      {update.changelog_summary && (
        <div className="text-xs text-zinc-500">
          <div className={showFull ? '' : 'line-clamp-3'}>
            {update.changelog_summary}
          </div>
          <div className="flex gap-2 mt-1">
            {update.changelog_summary.length > 150 && (
              <button onClick={() => setShowFull(!showFull)} className="text-zinc-400 hover:text-zinc-300">
                {showFull ? 'Show less' : 'Show more'}
              </button>
            )}
            {update.changelog_url && (
              <a href={update.changelog_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                Release notes ↗
              </a>
            )}
          </div>
        </div>
      )}

      {/* Status info */}
      {status === 'completed' && update.completed_at && (
        <div className="text-xs text-green-400">Updated {formatTimeAgo(update.completed_at)}</div>
      )}
      {status === 'failed' && update.last_result?.error && (
        <div className="text-xs text-red-400">Failed: {update.last_result.error}</div>
      )}
      {status === 'scheduled' && update.scheduled_time && (
        <div className="text-xs text-zinc-400">Scheduled for {new Date(update.scheduled_time).toLocaleString()}</div>
      )}

      {/* Action buttons */}
      {['pending_review', 'failed'].includes(status) && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onAction('update_now')}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors"
          >
            {loading ? 'Processing...' : 'Update Now'}
          </button>
          <button
            onClick={() => onAction('schedule')}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 disabled:opacity-50 transition-colors"
          >
            Schedule 3 AM
          </button>
          <button
            onClick={() => onAction('skip')}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-500 disabled:opacity-50 transition-colors"
          >
            Skip 30d
          </button>
        </div>
      )}
      {status === 'auto_approved' && (
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-blue-400">Auto-updating at 3:47 AM</span>
          <button
            onClick={() => onAction('update_now')}
            disabled={loading}
            className="text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 disabled:opacity-50"
          >
            Update Now
          </button>
          <button
            onClick={() => onAction('skip')}
            disabled={loading}
            className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-500 disabled:opacity-50"
          >
            Skip
          </button>
        </div>
      )}
      {status === 'skipped' && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => onAction('update_now')}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
          >
            Update Now
          </button>
          <button
            onClick={() => onAction('schedule')}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 disabled:opacity-50"
          >
            Schedule 3 AM
          </button>
        </div>
      )}
    </div>
  )
}

function ActionBtn({ label, icon, onClick, disabled, color, title }: {
  label: string; icon: string; onClick: (e: React.MouseEvent) => void; disabled: boolean; color?: string; title: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-colors disabled:opacity-30 ${color ?? 'text-zinc-400 hover:bg-zinc-700'}`}
    >
      {icon}
    </button>
  )
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
