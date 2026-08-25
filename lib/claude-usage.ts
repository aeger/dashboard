import fs from 'fs'

// ── Claude plan usage / rate-limit windows ─────────────────────────────────
// Source: Anthropic's OAuth usage endpoint — the same data Claude Code's
// /usage screen renders: the 5-hour session window, the weekly all-models
// window, model-scoped weekly windows (e.g. Fable), and extra-usage credits.
// Auth is the Claude Code OAuth access token from ~/.claude/.credentials.json
// (mounted RO into the container). We only ever READ the token — no refresh
// attempts here: refresh-token rotation would race Claude Code itself. When
// the token has expired the widget says so; any Claude Code activity on the
// host refreshes it.

const CREDS_FILE = process.env.CLAUDE_CREDENTIALS_FILE || '/app/claude-home/.credentials.json'
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
// Serve from cache for this long — widgets poll every 30-60s across browsers;
// no reason to hit the upstream endpoint more than once a minute.
const CACHE_TTL_MS = 60_000
// On upstream failure keep serving the last good payload up to this long.
const STALE_OK_MS = 5 * 60_000

export interface UsageLimit {
  kind: string // 'session' | 'weekly_all' | 'weekly_scoped' | future kinds
  label: string // display label, e.g. 'Session', 'Week · Fable'
  percent: number // 0-100 utilization of the window
  severity: string // upstream severity hint ('normal', 'warning', ...)
  resetsAt: string | null // ISO timestamp the window resets
  isActive: boolean // upstream marks the currently governing limit
}

export interface ExtraUsage {
  enabled: boolean
  usedUsd: number
  limitUsd: number
  percent: number
  spendLimitReached: boolean
}

export interface ClaudeUsage {
  available: boolean
  reason?: 'no_credentials' | 'token_expired' | 'upstream_error'
  limits: UsageLimit[]
  extra: ExtraUsage | null
  fetchedAt: string | null
}

interface RawLimit {
  kind?: string
  percent?: number
  severity?: string
  resets_at?: string | null
  is_active?: boolean
  scope?: { model?: { display_name?: string | null } | null; surface?: string | null } | null
}

function labelFor(l: RawLimit): string {
  const model = l.scope?.model?.display_name
  switch (l.kind) {
    case 'session':
      return 'Session'
    case 'weekly_all':
      return 'Week · all models'
    case 'weekly_scoped':
      return model ? `Week · ${model}` : 'Week · scoped'
    default:
      // future-proof: prettify unknown kinds ("weekly_opus" → "weekly opus")
      return (l.kind || 'unknown').replace(/_/g, ' ')
  }
}

function readAccessToken(): string | null {
  try {
    const raw = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'))
    return raw?.claudeAiOauth?.accessToken || null
  } catch {
    return null
  }
}

let cache: { at: number; data: ClaudeUsage } | null = null

export async function getClaudeUsage(): Promise<ClaudeUsage> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.data

  const token = readAccessToken()
  if (!token) {
    return { available: false, reason: 'no_credentials', limits: [], extra: null, fetchedAt: null }
  }

  let res: Response
  try {
    res = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
  } catch {
    if (cache && now - cache.at < STALE_OK_MS) return cache.data
    return { available: false, reason: 'upstream_error', limits: [], extra: null, fetchedAt: null }
  }

  if (!res.ok) {
    if (res.status === 401) {
      // Expired access token — cleared the moment any Claude Code turn runs on
      // the host (it refreshes credentials itself). Don't serve stale numbers.
      return { available: false, reason: 'token_expired', limits: [], extra: null, fetchedAt: null }
    }
    if (cache && now - cache.at < STALE_OK_MS) return cache.data
    return { available: false, reason: 'upstream_error', limits: [], extra: null, fetchedAt: null }
  }

  const body = (await res.json()) as {
    limits?: RawLimit[]
    extra_usage?: {
      is_enabled?: boolean
      monthly_limit?: number
      used_credits?: number
      utilization?: number
      spend_limit_reached?: boolean
      decimal_places?: number
    } | null
  }

  const limits: UsageLimit[] = (body.limits || []).map((l) => ({
    kind: l.kind || 'unknown',
    label: labelFor(l),
    percent: Math.max(0, Math.min(100, Number(l.percent ?? 0))),
    severity: l.severity || 'normal',
    resetsAt: l.resets_at || null,
    isActive: Boolean(l.is_active),
  }))

  // Extra-usage credits are reported in minor units (cents at decimal_places 2).
  const eu = body.extra_usage
  const div = Math.pow(10, eu?.decimal_places ?? 2)
  const extra: ExtraUsage | null = eu?.is_enabled
    ? {
        enabled: true,
        usedUsd: Number(eu.used_credits || 0) / div,
        limitUsd: Number(eu.monthly_limit || 0) / div,
        percent: Math.max(0, Math.min(100, Number(eu.utilization ?? 0))),
        spendLimitReached: Boolean(eu.spend_limit_reached),
      }
    : null

  const data: ClaudeUsage = {
    available: limits.length > 0,
    limits,
    extra,
    fetchedAt: new Date(now).toISOString(),
  }
  cache = { at: now, data }
  return data
}
