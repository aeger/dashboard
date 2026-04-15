'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import SoundSettings, { useSoundSettings } from './SoundSettings'
import { getSoundEngine } from '@/lib/soundEngine'

type Urgency = 'critical' | 'high' | 'medium' | 'low'
type NotifStatus = 'unread' | 'read' | 'dismissed'

interface Notification {
  id: string
  source: string
  category: string
  urgency: Urgency
  severity: string
  status: NotifStatus
  title: string
  body: string
  timestamp: string
  receivedAt: string
  readAt?: string
  metadata?: Record<string, unknown>
}

interface NotifResponse {
  notifications: Notification[]
  unreadCount: number
  criticalCount: number
}

const URGENCY_COLOR: Record<Urgency, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#71717a',
}

const URGENCY_BADGE_BG: Record<Urgency, string> = {
  critical: 'rgba(239,68,68,0.15)',
  high: 'rgba(249,115,22,0.15)',
  medium: 'rgba(234,179,8,0.15)',
  low: 'rgba(113,113,122,0.12)',
}

const URGENCY_LABEL: Record<Urgency, string> = {
  critical: 'CRIT',
  high: 'HIGH',
  medium: 'MED',
  low: 'LOW',
}

const URGENCY_ORDER: Record<Urgency, number> = {
  critical: 4, high: 3, medium: 2, low: 1,
}

const SOURCE_EMOJI: Record<string, string> = {
  task_queue: '📋',
  services: '🔧',
  home_assistant: '🏡',
  discord: '💬',
  grafana: '📊',
  containers: '🐳',
}

function categoryLabel(category: string): string {
  return category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function bellBadgeBg(criticalCount: number, unreadCount: number): string {
  if (criticalCount > 0) return '#ef4444'
  if (unreadCount > 0) return '#f97316'
  return '#22c55e'
}

function normalizeUrgency(n: Notification): Urgency {
  const u = n.urgency || (n.severity as Urgency) || 'low'
  if (u === 'warning' as string) return 'high'
  if (u === 'info' as string) return 'low'
  return u as Urgency
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [soundPanelOpen, setSoundPanelOpen] = useState(false)
  const [data, setData] = useState<NotifResponse>({ notifications: [], unreadCount: 0, criticalCount: 0 })
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Sound system
  const { settings: soundSettings } = useSoundSettings()
  const seenIds = useRef<Set<string>>(new Set())
  const initialLoad = useRef(true)
  const interacted = useRef(false)

  // Mark audio context ready on first user interaction
  const handleInteraction = useCallback(() => {
    if (!interacted.current) {
      interacted.current = true
      getSoundEngine().resume()
    }
  }, [])

  useEffect(() => {
    document.addEventListener('click', handleInteraction, { once: true })
    return () => document.removeEventListener('click', handleInteraction)
  }, [handleInteraction])

  const playAlertsForNew = useCallback((notifications: Notification[]) => {
    if (initialLoad.current) {
      // On first load, seed seen IDs without playing sounds
      notifications.forEach(n => seenIds.current.add(n.id))
      initialLoad.current = false
      return
    }

    const newNotifs = notifications.filter(
      n => n.status === 'unread' && !seenIds.current.has(n.id)
    )
    if (newNotifs.length === 0) return

    // Add to seen
    newNotifs.forEach(n => seenIds.current.add(n.id))

    // Find highest urgency notification
    const sorted = [...newNotifs].sort(
      (a, b) => URGENCY_ORDER[normalizeUrgency(b)] - URGENCY_ORDER[normalizeUrgency(a)]
    )
    const top = sorted[0]
    const urgency = normalizeUrgency(top)
    const cfg = soundSettings[urgency]

    if (!cfg?.enabled || !interacted.current) return

    const engine = getSoundEngine()

    if (cfg.sound.startsWith('custom:')) {
      const customId = cfg.sound.slice(7)
      const req = indexedDB.open('sentinel-sounds', 1)
      req.onsuccess = (e) => {
        const db = (e.target as IDBOpenDBRequest).result
        const tx = db.transaction('custom-sounds', 'readonly')
        const getReq = tx.objectStore('custom-sounds').get(customId)
        getReq.onsuccess = async (e2) => {
          const record = (e2.target as IDBRequest).result
          if (record?.data) await engine.playBuffer(record.data, cfg.volume)
        }
      }
    } else {
      engine.play(cfg.sound, cfg.volume)
    }

    // TTS for critical
    if (urgency === 'critical' && cfg.tts) {
      setTimeout(() => engine.speakTTS(top.title, cfg.volume), 600)
    }
  }, [soundSettings])

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=10&status=unread')
      if (res.ok) {
        const d: NotifResponse = await res.json()
        setData(d)
        playAlertsForNew(d.notifications)
      }
    } catch { /* sentinel may be down */ }
  }, [playAlertsForNew])

  // Initial load + interval polling
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30_000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: 'POST' })
    setData(prev => ({
      ...prev,
      notifications: prev.notifications.filter(n => n.id !== id),
      unreadCount: Math.max(0, prev.unreadCount - 1),
      criticalCount: prev.notifications.find(n => n.id === id)?.urgency === 'critical'
        ? Math.max(0, prev.criticalCount - 1)
        : prev.criticalCount,
    }))
  }

  async function markAllRead() {
    setLoading(true)
    await fetch('/api/notifications/read-all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    setData({ notifications: [], unreadCount: 0, criticalCount: 0 })
    setLoading(false)
  }

  const { notifications, unreadCount, criticalCount } = data
  const badgeColor = bellBadgeBg(criticalCount, unreadCount)
  const showBadge = unreadCount > 0

  return (
    <>
      <div ref={dropdownRef} className="relative">
        {/* Bell button */}
        <button
          onClick={() => setOpen(o => !o)}
          className="relative flex items-center justify-center transition-all duration-200 select-none"
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            background: open ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${open ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'}`,
            cursor: 'pointer',
            color: showBadge ? badgeColor : '#71717a',
          }}
          title={`${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`}
        >
          <span style={{ fontSize: '16px', lineHeight: 1 }}>🔔</span>
          {showBadge && (
            <span
              className="absolute flex items-center justify-center font-bold"
              style={{
                top: '-4px',
                right: '-4px',
                minWidth: '16px',
                height: '16px',
                padding: '0 3px',
                borderRadius: '8px',
                background: badgeColor,
                color: '#fff',
                fontSize: '9px',
                lineHeight: '16px',
                boxShadow: `0 0 6px ${badgeColor}80`,
                animation: criticalCount > 0 ? 'pulse 2s infinite' : 'none',
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Dropdown */}
        {open && typeof document !== 'undefined' && createPortal(
          <div
            className="fixed rounded-xl border overflow-hidden"
            style={{
              top: '72px',
              right: '12px',
              width: '360px',
              maxHeight: '520px',
              zIndex: 99999,
              background: 'rgba(9,9,11,0.97)',
              backdropFilter: 'blur(20px)',
              borderColor: 'rgba(255,255,255,0.08)',
              boxShadow: '0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div className="flex items-center gap-2">
                <span style={{ fontSize: '14px' }}>🔔</span>
                <span className="text-sm font-semibold text-zinc-200">Notifications</span>
                {unreadCount > 0 && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: badgeColor + '25', color: badgeColor }}
                  >
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Sound settings trigger */}
                <button
                  onClick={() => { setSoundPanelOpen(true); setOpen(false) }}
                  className="text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors"
                  title="Sound settings"
                >
                  🔊
                </button>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    disabled={loading}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Mark all read
                  </button>
                )}
                <Link
                  href="/notifications"
                  onClick={() => setOpen(false)}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors no-underline"
                >
                  View all →
                </Link>
              </div>
            </div>

            {/* Notification list */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <span style={{ fontSize: '28px', marginBottom: '8px' }}>✅</span>
                  <p className="text-sm text-zinc-500">All clear — no unread alerts</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const urgency = normalizeUrgency(n)
                  const color = URGENCY_COLOR[urgency]
                  const emoji = SOURCE_EMOJI[n.source] || '🔔'
                  return (
                    <div
                      key={n.id}
                      className="flex gap-3 px-4 py-3 transition-colors group"
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        borderLeft: `3px solid ${color}`,
                        background: n.status === 'unread' ? 'rgba(255,255,255,0.02)' : 'transparent',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                      onMouseLeave={e => (e.currentTarget.style.background = n.status === 'unread' ? 'rgba(255,255,255,0.02)' : 'transparent')}
                    >
                      <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '2px' }}>{emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className="text-sm font-medium leading-tight"
                            style={{ color: n.status === 'unread' ? '#e4e4e7' : '#71717a' }}
                          >
                            {n.title}
                          </p>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span
                              className="px-1 py-0.5 rounded text-[9px] font-bold"
                              style={{
                                background: URGENCY_BADGE_BG[urgency],
                                color: color,
                              }}
                            >
                              {URGENCY_LABEL[urgency]}
                            </span>
                            <button
                              onClick={() => markRead(n.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-zinc-300 text-xs"
                              title="Mark read"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        {n.body && (
                          <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2 leading-relaxed">
                            {n.body}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-zinc-700">{categoryLabel(n.category)}</span>
                          <span className="text-zinc-800">·</span>
                          <span className="text-[10px] text-zinc-700">{timeAgo(n.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-between px-4 py-2 flex-shrink-0"
              style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
            >
              <span className="text-[10px] text-zinc-700">
                {criticalCount > 0 ? (
                  <span style={{ color: '#ef4444' }}>⚠ {criticalCount} critical</span>
                ) : (
                  'JeffSentinel v2'
                )}
              </span>
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors no-underline"
              >
                Full history →
              </Link>
            </div>
          </div>,
          document.body
        )}
      </div>

      {/* Sound Settings Modal */}
      <SoundSettings open={soundPanelOpen} onClose={() => setSoundPanelOpen(false)} />
    </>
  )
}
