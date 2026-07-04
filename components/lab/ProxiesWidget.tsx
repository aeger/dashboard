'use client'

import { useEffect, useState, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

interface ProxyConfig {
  name: string
  hostname: string
  backendUrl: string
  lanOnly: boolean
  auth: boolean
  tls: boolean
  staticIp: string
  /** AdGuard split-DNS rewrite state (server-computed on GET). */
  adguardOk?: boolean
  adguardAnswer?: string | null
}

interface SyncResult {
  success: boolean
  added: string[]
  fixed: string[]
  ok: string[]
  failed: string[]
}

type Tab = 'list' | 'create' | 'edit'

const EMPTY_FORM: Omit<ProxyConfig, 'name'> & { name: string } = {
  name: '',
  hostname: '',
  backendUrl: '',
  lanOnly: true,
  auth: false,
  tls: true,
  staticIp: '',
}

// ── Tab button ─────────────────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
        active ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {children}
    </button>
  )
}

// ── Toggle ─────────────────────────────────────────────────────────────────

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        className={`w-8 h-4 rounded-full transition-colors relative ${checked ? 'bg-indigo-500' : 'bg-zinc-700'}`}
        onClick={() => onChange(!checked)}
      >
        <div
          className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </div>
      <span className="text-xs text-zinc-400">{label}</span>
    </label>
  )
}

// ── Field ──────────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-500 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  )
}

// ── Proxy form ─────────────────────────────────────────────────────────────

function ProxyForm({
  initial,
  isEdit,
  onSave,
  onCancel,
}: {
  initial: ProxyConfig
  isEdit: boolean
  onSave: (cfg: ProxyConfig) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<ProxyConfig>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dnsStatus, setDnsStatus] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [adguardStatus, setAdguardStatus] = useState<'idle' | 'ok' | 'fail'>('idle')

  function set<K extends keyof ProxyConfig>(key: K, value: ProxyConfig[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit() {
    setError('')
    setSaving(true)
    setDnsStatus('idle')
    try {
      const url = isEdit ? `/api/proxies/${form.name}` : '/api/proxies'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Save failed')
        return
      }
      setDnsStatus(data.dns ? 'ok' : 'fail')
      setAdguardStatus(data.adguard ? 'ok' : 'fail')
      setTimeout(() => {
        onSave(form)
      }, 800)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          label="Name (used as filename)"
          value={form.name}
          onChange={(v) => set('name', v.toLowerCase())}
          placeholder="my-service"
          disabled={isEdit}
        />
        <Field
          label="Hostname"
          value={form.hostname}
          onChange={(v) => set('hostname', v)}
          placeholder="my-service.az-lab.dev"
        />
        <div className="sm:col-span-2">
          <Field
            label="Backend URL"
            value={form.backendUrl}
            onChange={(v) => set('backendUrl', v)}
            placeholder="http://192.168.1.x:PORT"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-2">DNS A record (Cloudflare)</label>
        <div className="flex flex-wrap gap-3">
          {[
            { ip: '', label: 'None', sub: 'LAN only — no external DNS' },
            { ip: '70.167.221.51', label: '70.167.221.51', sub: 'services' },
            { ip: '70.167.221.52', label: '70.167.221.52', sub: 'game DMZ' },
          ].map(({ ip, label, sub }) => (
            <label key={ip || 'none'} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="staticIp"
                value={ip}
                checked={form.staticIp === ip}
                onChange={() => set('staticIp', ip)}
                className="accent-indigo-500"
              />
              <span className="text-xs text-zinc-300">{label}</span>
              <span className="text-xs text-zinc-600">({sub})</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 pt-1">
        <Toggle label="LAN only" checked={form.lanOnly} onChange={(v) => set('lanOnly', v)} />
        <Toggle label="Require auth (Authelia)" checked={form.auth} onChange={(v) => set('auth', v)} />
        <Toggle label="TLS (Let's Encrypt)" checked={form.tls} onChange={(v) => set('tls', v)} />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {dnsStatus === 'ok' && (
        <p className="text-xs text-green-400">DNS record created/updated ✓</p>
      )}
      {dnsStatus === 'fail' && (
        <p className="text-xs text-yellow-400">Proxy saved — Cloudflare record may need manual creation</p>
      )}
      {adguardStatus === 'ok' && (
        <p className="text-xs text-green-400">AdGuard LAN rewrite in place ✓</p>
      )}
      {adguardStatus === 'fail' && (
        <p className="text-xs text-yellow-400">AdGuard rewrite failed — use Sync DNS on the list tab</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="px-4 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-md transition-colors"
        >
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Proxy'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Proxy list ─────────────────────────────────────────────────────────────

function ProxyList({
  proxies,
  onEdit,
  onDelete,
}: {
  proxies: ProxyConfig[]
  onEdit: (cfg: ProxyConfig) => void
  onDelete: (name: string) => void
}) {
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteDns, setDeleteDns] = useState(true)
  const [confirmName, setConfirmName] = useState<string | null>(null)

  async function handleDelete(name: string) {
    setDeleting(name)
    try {
      await fetch(`/api/proxies/${name}?deleteDns=${deleteDns}`, { method: 'DELETE' })
      onDelete(name)
    } finally {
      setDeleting(null)
      setConfirmName(null)
    }
  }

  if (proxies.length === 0) {
    return <p className="text-xs text-zinc-600 py-4">No managed proxies yet. Create one to get started.</p>
  }

  return (
    <div className="space-y-2">
      {proxies.map((p) => (
        <div
          key={p.name}
          className="flex items-start justify-between gap-3 bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2.5"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-white">{p.name}</span>
              {p.lanOnly && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-800/50">
                  LAN
                </span>
              )}
              {p.auth && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-300 border border-purple-800/50">
                  Auth
                </span>
              )}
              {p.tls && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-900/40 text-green-300 border border-green-800/50">
                  TLS
                </span>
              )}
              {p.adguardOk === false && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300 border border-amber-800/50"
                  title={p.adguardAnswer
                    ? `AdGuard rewrite points at ${p.adguardAnswer} — use Sync DNS to fix`
                    : 'No AdGuard rewrite — LAN clients resolve via Cloudflare and hairpin. Use Sync DNS.'}
                >
                  no LAN DNS
                </span>
              )}
            </div>
            <div className="text-xs text-indigo-400 mt-0.5 truncate">
              <a href={`https://${p.hostname}`} target="_blank" rel="noreferrer" className="hover:underline">
                {p.hostname}
              </a>
            </div>
            <div className="text-xs text-zinc-500 truncate">{p.backendUrl}</div>
          </div>

          <div className="flex gap-1.5 flex-shrink-0 items-center">
            {confirmName === p.name ? (
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-[10px] text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteDns}
                    onChange={(e) => setDeleteDns(e.target.checked)}
                    className="accent-red-500"
                  />
                  delete DNS
                </label>
                <button
                  onClick={() => handleDelete(p.name)}
                  disabled={deleting === p.name}
                  className="text-[10px] px-2 py-1 bg-red-700 hover:bg-red-600 text-white rounded transition-colors disabled:opacity-50"
                >
                  {deleting === p.name ? '…' : 'Confirm'}
                </button>
                <button
                  onClick={() => setConfirmName(null)}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => onEdit(p)}
                  className="text-[10px] px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => setConfirmName(p.name)}
                  className="text-[10px] px-2 py-1 bg-zinc-800 hover:bg-red-900/60 text-zinc-400 hover:text-red-300 rounded transition-colors border border-zinc-700"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main widget ────────────────────────────────────────────────────────────

export default function ProxiesWidget() {
  const [tab, setTab] = useState<Tab>('list')
  const [proxies, setProxies] = useState<ProxyConfig[]>([])
  const [external, setExternal] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<ProxyConfig | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/proxies')
      const data = await res.json()
      setProxies(data.proxies ?? [])
      setExternal(data.externalHostnames ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  async function syncDns() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await fetch('/api/proxies/sync', { method: 'POST' })
      const data: SyncResult & { error?: string } = await res.json()
      if (!res.ok) {
        setSyncMsg(data.error || 'Sync failed')
      } else {
        const parts: string[] = []
        if (data.added.length) parts.push(`${data.added.length} added`)
        if (data.fixed.length) parts.push(`${data.fixed.length} fixed`)
        if (data.failed.length) parts.push(`${data.failed.length} FAILED`)
        setSyncMsg(parts.length ? `AdGuard rewrites: ${parts.join(', ')}` : 'AdGuard rewrites already in sync ✓')
      }
      await load()
    } catch {
      setSyncMsg('Sync failed — network error')
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    load()
  }, [load])

  function handleEdit(cfg: ProxyConfig) {
    setEditTarget(cfg)
    setTab('edit')
  }

  function handleDelete(name: string) {
    setProxies((prev) => prev.filter((p) => p.name !== name))
  }

  function handleSaved() {
    setEditTarget(null)
    setTab('list')
    load() // server recomputes AdGuard/DNS state
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-0.5 border-b border-zinc-800 mb-4 pb-1">
        <TabBtn active={tab === 'list'} onClick={() => { setTab('list'); setEditTarget(null) }}>
          Proxies ({proxies.length})
        </TabBtn>
        <TabBtn active={tab === 'create'} onClick={() => { setTab('create'); setEditTarget(null) }}>
          + New
        </TabBtn>
        {tab === 'edit' && editTarget && (
          <TabBtn active={true} onClick={() => {}}>
            Editing: {editTarget.name}
          </TabBtn>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={syncDns}
            disabled={syncing}
            className="text-[11px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
            title="Ensure every managed proxy has an AdGuard split-DNS rewrite"
          >
            {syncing ? 'Syncing…' : 'Sync DNS'}
          </button>
          <button
            onClick={load}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors px-2 py-1"
            title="Refresh"
          >
            ↺
          </button>
        </div>
      </div>

      {/* Content */}
      {tab === 'list' && (
        loading ? (
          <p className="text-xs text-zinc-600">Loading…</p>
        ) : (
          <>
            {syncMsg && <p className="text-xs text-zinc-400 mb-2">{syncMsg}</p>}
            <ProxyList proxies={proxies} onEdit={handleEdit} onDelete={handleDelete} />
            {external.length > 0 && (
              <div className="mt-4 pt-3 border-t border-zinc-800/60">
                <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1.5">
                  Also routed by Traefik — managed elsewhere (compose labels / infra files)
                </div>
                <div className="flex flex-wrap gap-1">
                  {external.map((h) => (
                    <a
                      key={h}
                      href={`https://${h}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800/60 text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      {h}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )
      )}

      {tab === 'create' && (
        <ProxyForm
          initial={{ ...EMPTY_FORM }}
          isEdit={false}
          onSave={handleSaved}
          onCancel={() => setTab('list')}
        />
      )}

      {tab === 'edit' && editTarget && (
        <ProxyForm
          initial={editTarget}
          isEdit={true}
          onSave={handleSaved}
          onCancel={() => { setTab('list'); setEditTarget(null) }}
        />
      )}
    </div>
  )
}
