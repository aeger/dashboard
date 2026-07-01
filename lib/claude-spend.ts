import fs from 'fs'

// ── Phase 2: Claude programmatic-spend accounting ──────────────────────────
// Source: ~/.local/state/claude-spend/usage.jsonl, one JSON row per LLM call,
// written by ~/claude/lib/claude_call.py (the shared 3-tier fallback module).
// Row shape: { ts, tier, tier_name, model, ok, input_tokens, output_tokens }
//
// Tier 0 (oauth-max) draws the Max plan's $100/mo programmatic bucket.
// Tier 1 (api-key) is pay-as-you-go API credits. Tier 2 (nemoclaw) is local/free.

const SPEND_LOG = process.env.CLAUDE_SPEND_LOG || '/app/spend/usage.jsonl'
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

function costOf(model: string, inTok: number, outTok: number): number {
  const r = rate(model)
  return (inTok * r.in + outTok * r.out) / 1_000_000
}

interface Row {
  ts: string
  tier: number
  tier_name: string
  model: string
  ok?: boolean
  input_tokens: number
  output_tokens: number
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
  mtdCalls: number
  totalCalls: number
  tiers: TierBreakdown[]
  models: ModelBreakdown[]
  daily: { date: string; cost: number }[] // last 14 calendar days, bucket+api
  lastTs: string | null
}

const TIER_NAMES: Record<number, string> = {
  0: 'oauth-max',
  1: 'api-key',
  2: 'nemoclaw',
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
        })
      }
    } catch {
      // skip malformed line
    }
  }
  return rows
}

export function getClaudeSpend(): ClaudeSpend {
  const rows = parseRows()
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
  let mtdCalls = 0
  let lastTs: string | null = null

  for (const r of rows) {
    if (!lastTs || r.ts > lastTs) lastTs = r.ts
    const day = r.ts.slice(0, 10)
    const cost = costOf(r.model, r.input_tokens, r.output_tokens)

    // per-day (bucket + api only — free tier has no $ impact)
    if (daily.has(day) && r.tier !== 2) daily.set(day, (daily.get(day) || 0) + cost)

    // month-to-date aggregates
    if (r.ts.startsWith(monthLabel)) {
      mtdCalls++
      if (r.tier === 0) bucketSpend += cost
      else if (r.tier === 1) apiSpend += cost
      else if (r.tier === 2) freeCalls++

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
    mtdCalls,
    totalCalls: rows.length,
    tiers: [...tiers.values()].sort((a, b) => a.tier - b.tier),
    models: [...models.values()].sort((a, b) => b.cost - a.cost || b.calls - a.calls),
    daily: [...daily.entries()].map(([date, cost]) => ({ date, cost })),
    lastTs,
  }
}
