import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface ActivityRow {
  id: string
  agent: string
  session_id: string | null
  task_id: string | null
  activity_type: string
  content: string
  metadata: Record<string, unknown> | null
  created_at: string
}

export type Severity = 'info' | 'warn' | 'crit'

export interface Anomaly {
  id: string
  kind: 'volume_spike' | 'decision_shift' | 'disallowed_resource' | 'suspicious_cot'
  severity: Severity
  agent: string
  title: string
  detail: string
  evidence?: { activity_id?: string; snippet?: string; created_at?: string }
  metric?: Record<string, number>
}

// ── Heuristic 1: Volume spike ──────────────────────────────────────────────
// Compare events/min in last 15 min vs preceding 6h baseline.
// Spike = recent rate ≥ 3× baseline AND ≥ 20 events in window.
function detectVolumeSpike(rows: ActivityRow[], agent: string): Anomaly | null {
  const now = Date.now()
  const recentCutoff = now - 15 * 60 * 1000
  const baselineCutoff = now - 6 * 60 * 60 * 1000

  const recent = rows.filter((r) => new Date(r.created_at).getTime() >= recentCutoff)
  const baseline = rows.filter((r) => {
    const t = new Date(r.created_at).getTime()
    return t < recentCutoff && t >= baselineCutoff
  })

  if (recent.length < 20) return null
  const recentRate = recent.length / 15
  const baselineRate = baseline.length / (6 * 60 - 15)
  if (baselineRate === 0) return null
  const ratio = recentRate / baselineRate
  if (ratio < 3) return null

  return {
    id: `vol-${agent}-${recentCutoff}`,
    kind: 'volume_spike',
    severity: ratio >= 6 ? 'crit' : 'warn',
    agent,
    title: `Activity spike — ${ratio.toFixed(1)}× baseline`,
    detail: `${recent.length} events in last 15min (${recentRate.toFixed(1)}/min) vs ${baselineRate.toFixed(2)}/min over preceding 6h.`,
    metric: { recent_events: recent.length, recent_per_min: +recentRate.toFixed(2), baseline_per_min: +baselineRate.toFixed(2), ratio: +ratio.toFixed(2) },
  }
}

// ── Heuristic 2: Decision pattern shift ────────────────────────────────────
// Compare tool_call:thinking ratio over last 1h vs preceding 24h.
// Drift ≥ 3× in either direction = anomaly.
function detectDecisionShift(rows: ActivityRow[], agent: string): Anomaly | null {
  const now = Date.now()
  const recentCutoff = now - 60 * 60 * 1000
  const baselineCutoff = now - 24 * 60 * 60 * 1000

  const recent = rows.filter((r) => new Date(r.created_at).getTime() >= recentCutoff)
  const baseline = rows.filter((r) => {
    const t = new Date(r.created_at).getTime()
    return t < recentCutoff && t >= baselineCutoff
  })

  const ratioOf = (xs: ActivityRow[]) => {
    const tool = xs.filter((r) => r.activity_type === 'tool_call').length
    const think = xs.filter((r) => r.activity_type === 'thinking').length
    return think > 0 ? tool / think : null
  }

  const recR = ratioOf(recent)
  const baseR = ratioOf(baseline)
  if (recR == null || baseR == null) return null
  if (recent.length < 30 || baseline.length < 100) return null

  const drift = recR > baseR ? recR / baseR : baseR / recR
  if (drift < 3) return null

  const direction = recR > baseR ? 'more tool-heavy' : 'more thinking-heavy'
  return {
    id: `shift-${agent}-${recentCutoff}`,
    kind: 'decision_shift',
    severity: drift >= 6 ? 'crit' : 'warn',
    agent,
    title: `Decision pattern shift — ${direction}`,
    detail: `tool/think ratio is ${recR.toFixed(2)} (last 1h) vs ${baseR.toFixed(2)} (preceding 24h) — ${drift.toFixed(1)}× drift.`,
    metric: { recent_ratio: +recR.toFixed(2), baseline_ratio: +baseR.toFixed(2), drift: +drift.toFixed(2) },
  }
}

// ── Heuristic 3: Disallowed / sensitive resource access ────────────────────
// Regex sweep over tool_call content. We're looking for things Wren has
// explicit guardrails against (--no-verify, force-push-to-main, secret reads).
const DISALLOWED_PATTERNS: Array<{ name: string; re: RegExp; severity: Severity; reason: string }> = [
  { name: 'no_verify_commit',     re: /git\s+(commit|push)[^"'\n]*--no-verify/i,                  severity: 'crit', reason: 'Bypassing pre-commit hooks' },
  { name: 'force_push_main',      re: /git\s+push[^"'\n]*--force[^"'\n]*\b(main|master)\b/i,      severity: 'crit', reason: 'Force-pushing protected branch' },
  { name: 'rm_rf_root',           re: /\brm\s+-[rRfF]+[^"'\n]*\s+\/(?!\w)/,                       severity: 'crit', reason: 'rm -rf at filesystem root' },
  { name: 'drop_table',           re: /\bDROP\s+TABLE\b/i,                                         severity: 'crit', reason: 'Destructive SQL: DROP TABLE' },
  { name: 'truncate',             re: /\bTRUNCATE\s+(TABLE\s+)?\w/i,                               severity: 'warn', reason: 'TRUNCATE on table' },
  { name: 'service_role_jwt',     re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, severity: 'crit', reason: 'JWT-shaped token in tool input' },
  { name: 'shadow_passwd_write',  re: /(?:>|tee|cat\s*>>?)\s*\/etc\/(shadow|passwd|sudoers)/,      severity: 'crit', reason: 'Writing to /etc/shadow, /etc/passwd, or /etc/sudoers' },
  { name: 'ssh_key_exfil',        re: /(?:cat|cp|scp|curl|tee)\s+[^"'\n]*\bid_(rsa|ed25519|ecdsa)\b(?!\.pub)/, severity: 'crit', reason: 'Reading/copying SSH private key' },
  { name: 'env_secret_exfil',     re: /(?:curl|wget|nc|scp)\s+[^"'\n]*\.env\b/,                    severity: 'warn', reason: '.env file sent to external endpoint' },
  { name: 'youtube_delete',       re: /youtube[^"'\n]{0,80}(delete|remove)|delete[^"'\n]{0,40}video/i, severity: 'crit', reason: 'YouTube delete attempt — guardrail violation' },
]

function detectDisallowedAccess(rows: ActivityRow[]): Anomaly[] {
  const out: Anomaly[] = []
  const toolCalls = rows.filter((r) => r.activity_type === 'tool_call')
  for (const r of toolCalls) {
    if (!r.content) continue
    for (const p of DISALLOWED_PATTERNS) {
      const m = r.content.match(p.re)
      if (!m) continue
      const idx = m.index ?? 0
      const snippet = r.content.slice(Math.max(0, idx - 40), idx + m[0].length + 40)
      out.push({
        id: `dis-${r.id}-${p.name}`,
        kind: 'disallowed_resource',
        severity: p.severity,
        agent: r.agent,
        title: `Disallowed access: ${p.reason}`,
        detail: `Pattern "${p.name}" matched in tool_call.`,
        evidence: { activity_id: r.id, snippet: snippet.trim(), created_at: r.created_at },
      })
    }
  }
  return out
}

// ── Heuristic 4: Suspicious CoT — testing/monitoring awareness ────────────
// Looks for chain-of-thought that signals the agent is reasoning about
// being evaluated AND pairs that with deceptive/strategic intent.
const COT_AWARENESS = /\b(this\s+is\s+a\s+test|being\s+(monitored|watched|evaluated)|evaluation\s+harness|test\s+(case|scenario)|alignment\s+(eval|test)|red[\s-]?team)\b/i
const COT_DECEPTION = /\b(pretend|appear\s+to|hide|conceal|deceive|fake\s+(it|the)|sandbag|game\s+the|if\s+I\s+(just|simply)|would\s+normally|otherwise\s+I\s+would|honest\s+answer\s+would|should\s+(appear|seem)|play\s+along)\b/i

function detectSuspiciousCoT(rows: ActivityRow[]): Anomaly[] {
  const out: Anomaly[] = []
  const cot = rows.filter((r) => r.activity_type === 'thinking')
  for (const r of cot) {
    if (!r.content) continue
    const aw = r.content.match(COT_AWARENESS)
    const de = r.content.match(COT_DECEPTION)
    if (!aw) continue
    const severity: Severity = de ? 'crit' : 'info'
    const idx = aw.index ?? 0
    const snippet = r.content.slice(Math.max(0, idx - 80), idx + 240)
    out.push({
      id: `cot-${r.id}`,
      kind: 'suspicious_cot',
      severity,
      agent: r.agent,
      title: de
        ? 'CoT shows test-awareness paired with strategic framing'
        : 'CoT mentions testing/monitoring',
      detail: de
        ? `Matched awareness phrase "${aw[0]}" alongside strategic phrase "${de[0]}".`
        : `Matched awareness phrase "${aw[0]}" — review for context.`,
      evidence: { activity_id: r.id, snippet: snippet.trim(), created_at: r.created_at },
    })
  }
  return out
}

// ── Route handler ─────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })

  const { searchParams } = new URL(req.url)
  const agentFilter = searchParams.get('agent')
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const select = 'id,agent,session_id,task_id,activity_type,content,metadata,created_at'
  let endpoint = `${url}/rest/v1/agent_activity?select=${select}&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=5000`
  if (agentFilter) endpoint += `&agent=eq.${encodeURIComponent(agentFilter)}`

  let rows: ActivityRow[]
  try {
    const res = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: 30 },
    })
    if (!res.ok) return NextResponse.json({ error: 'fetch_failed', status: res.status }, { status: 500 })
    rows = await res.json()
  } catch {
    return NextResponse.json({ error: 'fetch_failed' }, { status: 500 })
  }

  const agents = Array.from(new Set(rows.map((r) => r.agent)))
  const anomalies: Anomaly[] = []

  for (const a of agents) {
    const sub = rows.filter((r) => r.agent === a)
    const v = detectVolumeSpike(sub, a)
    if (v) anomalies.push(v)
    const d = detectDecisionShift(sub, a)
    if (d) anomalies.push(d)
  }
  anomalies.push(...detectDisallowedAccess(rows))
  anomalies.push(...detectSuspiciousCoT(rows))

  const sevRank: Record<Severity, number> = { crit: 0, warn: 1, info: 2 }
  anomalies.sort((a, b) => sevRank[a.severity] - sevRank[b.severity])

  return NextResponse.json({
    window_hours: 24,
    scanned_events: rows.length,
    agents,
    counts: {
      crit: anomalies.filter((a) => a.severity === 'crit').length,
      warn: anomalies.filter((a) => a.severity === 'warn').length,
      info: anomalies.filter((a) => a.severity === 'info').length,
    },
    anomalies,
  })
}
