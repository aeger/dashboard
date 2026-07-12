import fs from 'fs'

// ── Phase 2: Claude spend accounting — two sources ─────────────────────────
// (A) Broker log ~/.local/state/claude-spend/usage.jsonl — one row per LLM call
//     from ~/claude/lib/claude_call.py (the shared 3-tier fallback module).
//     Row shape: { ts, tier, tier_name, model, ok, input_tokens, output_tokens }
// (B) Claude Code native transcripts ~/.claude/projects/**/*.jsonl — the real
//     interactive + agent usage. Every assistant message carries message.usage
//     (input/output + cache tokens). This is the bulk of actual spend and never
//     routed through the broker, so the widget looked frozen without it.
//
// Tiers: 0 (oauth-max) draws the Max plan's $100/mo *programmatic* bucket.
//        1 (api-key) pay-as-you-go API credits. 2 (nemoclaw) local/free.
//        3 (claude-code) interactive/agent Max usage — priced at notional API
//        rates for a "real usage" figure, but does NOT draw the $100 bucket.

const SPEND_LOG = process.env.CLAUDE_SPEND_LOG || '/app/spend/usage.jsonl'
// Root of Claude Code's per-session transcripts (mounted RO into the container).
const TRANSCRIPTS_DIR = process.env.CLAUDE_TRANSCRIPTS_DIR || '/app/transcripts'
// Only account transcript activity newer than this — bounds the scan as the
// corpus grows. Comfortably covers MTD + the 14-day sparkline window.
const WINDOW_DAYS = 45
export const BUCKET_LIMIT_USD = 100 // Max 5x monthly programmatic bucket

// Per-million-token rates (USD). Keyed by model-id prefix, longest match wins.
// Sourced from the Claude API model catalog (2026-07). NemoClaw is local → free.
const PRICING: { prefix: string; in: number; out: number }[] = [
  { prefix: 'claude-opus-4-8', in: 5, out: 25 },
  { prefix: 'claude-opus-4-7', in: 5, out: 25 },
  { prefix: 'claude-opus-4-6', in: 5, out: 25 },
  { prefix: 'claude-opus', in: 5, out: 25 },
  { prefix: 'claude-fable-5', in: 10, out: 50 },
  { prefix: 'claude-sonnet-5', in: 3, out: 15 },
  { prefix: 'claude-sonnet-4', in: 3, out: 15 },
  { prefix: 'claude-sonnet', in: 3, out: 15 },
  { prefix: 'claude-haiku-4-5', in: 1, out: 5 },
  { prefix: 'claude-haiku', in: 1, out: 5 },
]

function rate(model: string): { in: number; out: number } {
  const m = (model || '').toLowerCase()
  // longest prefix first — PRICING is ordered most-specific-first per family
  for (const p of PRICING) if (m.startsWith(p.prefix)) return { in: p.in, out: p.out }
  return { in: 0, out: 0 } // nemotron / unknown → treat as free
}

// Cache multipliers (Anthropic): 5m write = 1.25× input, 1h write = 2× input,
// cache read = 0.1× input. Output billed at the normal output rate.
function costOf(
  model: string,
  inTok: number,
  outTok: number,
  cacheWrite5m = 0,
  cacheWrite1h = 0,
  cacheRead = 0,
): number {
  const r = rate(model)
  return (
    (inTok * r.in +
      outTok * r.out +
      cacheWrite5m * r.in * 1.25 +
      cacheWrite1h * r.in * 2 +
      cacheRead * r.in * 0.1) /
    1_000_000
  )
}

function rowCost(r: Row): number {
  return costOf(
    r.model,
    r.input_tokens,
    r.output_tokens,
    r.cacheWrite5m || 0,
    r.cacheWrite1h || 0,
    r.cacheRead || 0,
  )
}

interface Row {
  ts: string
  tier: number
  tier_name: string
  model: string
  ok?: boolean
  input_tokens: number
  output_tokens: number
  cacheWrite5m?: number
  cacheWrite1h?: number
  cacheRead?: number
  reqId?: string // dedup key for transcript rows (Claude Code requestId)
}

export interface TierBreakdown {
  tier: number
  name: string
  calls: number
  inputTokens: number
  outputTokens: number
  cost: number
}

export interface ModelBreakdown {
  model: string
  calls: number
  inputTokens: number
  outputTokens: number
  cost: number
}

export interface ClaudeSpend {
  available: boolean
  monthLabel: string // e.g. "2026-07"
  bucketLimit: number
  bucketSpend: number // Tier 0 cost this month — counts against the bucket
  apiSpend: number // Tier 1 cost this month — pay-as-you-go
  freeCalls: number // Tier 2 (NemoClaw) calls this month
  bucketPct: number
  // Real usage this month — notional $ across every priced tier (broker + the
  // Claude Code interactive/agent transcripts). This is the headline number.
  realSpend: number
  realCalls: number
  realInputTokens: number
  realOutputTokens: number
  mtdCalls: number
  totalCalls: number
  tiers: TierBreakdown[]
  models: ModelBreakdown[]
  daily: { date: string; cost: number }[] // last 14 calendar days, bucket+api
  lastTs: string | null
  // Hours since the newest logged call (server-computed so the "stale" badge
  // does not depend on the browser clock). null when nothing is logged yet.
  staleHours: number | null
}

const TIER_NAMES: Record<number, string> = {
  0: 'oauth-max',
  1: 'api-key',
  2: 'nemoclaw',
  3: 'claude-code',
}

function parseRows(): Row[] {
  let raw: string
  try {
    raw = fs.readFileSync(SPEND_LOG, 'utf8')
  } catch {
    return []
  }
  const rows: Row[] = []
  for (const line of raw.split('\n')) {
    const s = line.trim()
    if (!s) continue
    try {
      const r = JSON.parse(s)
      if (typeof r.ts === 'string') {
        rows.push({
          ts: r.ts,
          tier: Number(r.tier ?? -1),
          tier_name: r.tier_name || TIER_NAMES[r.tier] || 'unknown',
          model: r.model || 'unknown',
          ok: r.ok,
          input_tokens: Number(r.input_tokens || 0),
          output_tokens: Number(r.output_tokens || 0),
          // newer broker rows also log cache tokens; treat creation as 5m writes
          cacheWrite5m: Number(r.cache_creation_input_tokens || 0),
          cacheRead: Number(r.cache_read_input_tokens || 0),
        })
      }
    } catch {
      // skip malformed line
    }
  }
  return rows
}

// ── Source B: Claude Code native transcripts ───────────────────────────────
// Each *.jsonl is a session transcript; assistant lines carry message.usage.
// We cache parsed rows per file keyed by (mtime,size) so steady-state requests
// only re-read the handful of sessions that actually grew.
interface FileCache {
  mtimeMs: number
  size: number
  rows: Row[]
}
const transcriptCache = new Map<string, FileCache>()

function listTranscripts(dir: string): string[] {
  let out: string[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = `${dir}/${e.name}`
    if (e.isDirectory()) out = out.concat(listTranscripts(p))
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p)
  }
  return out
}

function parseTranscriptFile(path: string): Row[] {
  let raw: string
  try {
    raw = fs.readFileSync(path, 'utf8')
  } catch {
    return []
  }
  const rows: Row[] = []
  for (const line of raw.split('\n')) {
    const s = line.trim()
    if (!s || s[0] !== '{') continue
    let d: { message?: Record<string, unknown>; timestamp?: string; requestId?: string; uuid?: string }
    try {
      d = JSON.parse(s)
    } catch {
      continue
    }
    const msg = d.message as
      | { role?: string; model?: string; id?: string; usage?: Record<string, number | Record<string, number>> }
      | undefined
    const u = msg?.usage
    if (!msg || msg.role !== 'assistant' || !u || typeof d.timestamp !== 'string') continue
    // Claude Code injects <synthetic> assistant turns (interrupts, local notices)
    // with placeholder usage — not real billable spend.
    if (msg.model === '<synthetic>') continue
    const cc = (u.cache_creation as Record<string, number> | undefined) || {}
    const creation = Number(u.cache_creation_input_tokens || 0)
    rows.push({
      ts: d.timestamp,
      tier: 3,
      tier_name: 'claude-code',
      model: (msg.model as string) || 'unknown',
      ok: true,
      input_tokens: Number(u.input_tokens || 0),
      output_tokens: Number(u.output_tokens || 0),
      // prefer the 5m/1h breakdown; fall back to treating all creation as 5m
      cacheWrite5m: Number(cc.ephemeral_5m_input_tokens ?? creation),
      cacheWrite1h: Number(cc.ephemeral_1h_input_tokens ?? 0),
      cacheRead: Number(u.cache_read_input_tokens || 0),
      reqId: d.requestId || msg.id || d.uuid,
    })
  }
  return rows
}

function readTranscriptRows(): Row[] {
  const windowStart = Date.now() - WINDOW_DAYS * 86400_000
  const seen = new Set<string>() // dedup retries/duplicate lines by requestId
  const rows: Row[] = []
  for (const path of listTranscripts(TRANSCRIPTS_DIR)) {
    let st: fs.Stats
    try {
      st = fs.statSync(path)
    } catch {
      continue
    }
    if (st.mtimeMs < windowStart) {
      transcriptCache.delete(path)
      continue
    }
    let fc = transcriptCache.get(path)
    if (!fc || fc.mtimeMs !== st.mtimeMs || fc.size !== st.size) {
      fc = { mtimeMs: st.mtimeMs, size: st.size, rows: parseTranscriptFile(path) }
      transcriptCache.set(path, fc)
    }
    for (const r of fc.rows) {
      const key = r.reqId || `${r.ts}|${r.output_tokens}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(r)
    }
  }
  return rows
}

export function getClaudeSpend(): ClaudeSpend {
  // Merge the broker log with the Claude Code transcripts. reqId dedup inside
  // readTranscriptRows() keeps a request from double-counting; broker rows have
  // no reqId so the two sources never collide.
  const rows = [...parseRows(), ...readTranscriptRows()]
  const now = new Date()
  const monthLabel = now.toISOString().slice(0, 7) // YYYY-MM (UTC, matches log ts)

  // 14-day sparkline window
  const daily = new Map<string, number>()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400_000)
    daily.set(d.toISOString().slice(0, 10), 0)
  }

  const tiers = new Map<number, TierBreakdown>()
  const models = new Map<string, ModelBreakdown>()
  let bucketSpend = 0
  let apiSpend = 0
  let freeCalls = 0
  let realSpend = 0
  let realInputTokens = 0
  let realOutputTokens = 0
  let mtdCalls = 0
  let lastTs: string | null = null

  for (const r of rows) {
    if (!lastTs || r.ts > lastTs) lastTs = r.ts
    const day = r.ts.slice(0, 10)
    const cost = rowCost(r)

    // per-day (priced tiers only — free tier has no $ impact)
    if (daily.has(day) && r.tier !== 2) daily.set(day, (daily.get(day) || 0) + cost)

    // month-to-date aggregates
    if (r.ts.startsWith(monthLabel)) {
      mtdCalls++
      if (r.tier === 0) bucketSpend += cost
      else if (r.tier === 1) apiSpend += cost
      else if (r.tier === 2) freeCalls++
      // real usage = every priced tier (broker bucket/api + Claude Code)
      if (r.tier !== 2) {
        realSpend += cost
        realInputTokens += r.input_tokens
        realOutputTokens += r.output_tokens
      }

      const t = tiers.get(r.tier) || {
        tier: r.tier,
        name: r.tier_name,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
      }
      t.calls++
      t.inputTokens += r.input_tokens
      t.outputTokens += r.output_tokens
      t.cost += cost
      tiers.set(r.tier, t)

      const m = models.get(r.model) || {
        model: r.model,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
      }
      m.calls++
      m.inputTokens += r.input_tokens
      m.outputTokens += r.output_tokens
      m.cost += cost
      models.set(r.model, m)
    }
  }

  return {
    available: rows.length > 0,
    monthLabel,
    bucketLimit: BUCKET_LIMIT_USD,
    bucketSpend,
    apiSpend,
    freeCalls,
    bucketPct: Math.min(100, (bucketSpend / BUCKET_LIMIT_USD) * 100),
    realSpend,
    realCalls: mtdCalls - freeCalls,
    realInputTokens,
    realOutputTokens,
    mtdCalls,
    totalCalls: rows.length,
    tiers: [...tiers.values()].sort((a, b) => a.tier - b.tier),
    models: [...models.values()].sort((a, b) => b.cost - a.cost || b.calls - a.calls),
    daily: [...daily.entries()].map(([date, cost]) => ({ date, cost })),
    lastTs,
    staleHours: lastTs ? Math.max(0, (now.getTime() - new Date(lastTs).getTime()) / 3_600_000) : null,
  }
}
