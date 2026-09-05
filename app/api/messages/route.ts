import { NextRequest, NextResponse } from 'next/server'
import { supaFetch } from '@/lib/supabase-fetch'

// Relay message API — reads/writes public.agent_messages (migration 146).
// GET  ?since=<iso>&limit=<n>&agent=<name>  — recent messages, ascending
// POST { to_agent|null, kind, body }        — sends as from_agent='jeff'

export interface AgentMessage {
  id: string
  from_agent: string
  to_agent: string | null
  kind: 'chat' | 'task' | 'status' | 'system'
  body: string
  task_id: string | null
  thread_id: string | null
  created_at: string
  delivered_at: string | null
  acked_at: string | null
  meta: Record<string, unknown>
}

const SELECT = 'id,from_agent,to_agent,kind,body,task_id,thread_id,created_at,delivered_at,acked_at,meta'
const KINDS = new Set(['chat', 'task', 'status', 'system'])
const AGENTS = new Set(['wren', 'atlas', 'iris', 'volt', 'jeff', 'system'])

function env(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  return url && key ? { url, key } : null
}

const headers = (key: string) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
})

export async function GET(req: NextRequest) {
  const cfg = env()
  if (!cfg) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })

  const { searchParams } = new URL(req.url)
  const since = searchParams.get('since')
  const limit = Math.min(Number(searchParams.get('limit') ?? 100), 500)

  let endpoint = `${cfg.url}/rest/v1/agent_messages?select=${SELECT}&order=created_at.desc&limit=${limit}`
  if (since) endpoint += `&created_at=gt.${encodeURIComponent(since)}`

  const res = await supaFetch(endpoint, { headers: headers(cfg.key), cache: 'no-store' })
  if (!res.ok) return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  const rows: AgentMessage[] = await res.json()
  return NextResponse.json({ messages: rows.reverse() })
}

export async function POST(req: NextRequest) {
  const cfg = env()
  if (!cfg) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })

  let body: { to_agent?: string | null; kind?: string; body?: string; thread_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const text = (body.body ?? '').trim()
  if (!text) return NextResponse.json({ error: 'Empty message' }, { status: 400 })
  const kind = body.kind && KINDS.has(body.kind) ? body.kind : 'chat'
  const to = body.to_agent && AGENTS.has(body.to_agent) ? body.to_agent : null

  const row: Record<string, unknown> = {
    from_agent: 'jeff',
    to_agent: to,
    kind,
    body: text,
    meta: { via: 'dashboard' },
  }
  if (body.thread_id) row.thread_id = body.thread_id

  const res = await supaFetch(`${cfg.url}/rest/v1/agent_messages`, {
    method: 'POST',
    headers: { ...headers(cfg.key), Prefer: 'return=representation' },
    body: JSON.stringify(row),
  })
  if (!res.ok) {
    const detail = await res.text()
    return NextResponse.json({ error: 'Failed to send', detail }, { status: 500 })
  }
  const rows: AgentMessage[] = await res.json()
  return NextResponse.json({ ok: true, message: rows[0] ?? null })
}
