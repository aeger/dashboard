import type { AgentMessage } from '../route'

// SSE stream of agent_messages — clone of app/api/agent-activity/stream/route.ts
// (server-side Supabase polling pushed to the browser; deliberately no
// browser<->Supabase WebSocket, see Relay plan 2026-08-29).

const SELECT = 'id,from_agent,to_agent,kind,body,task_id,thread_id,created_at,delivered_at,acked_at,meta'

async function fetchSince(url: string, key: string, since: string | null, limit: number): Promise<AgentMessage[]> {
  let endpoint = `${url}/rest/v1/agent_messages?select=${SELECT}&order=created_at.asc&limit=${limit}`
  if (since) endpoint += `&created_at=gt.${encodeURIComponent(since)}`
  const res = await fetch(endpoint, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: 'no-store',
  })
  if (!res.ok) return []
  return res.json()
}

export async function GET(req: Request) {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !supabaseKey) {
    return new Response('Supabase not configured', { status: 503 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let since: string | null = null

      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // client disconnected
        }
      }

      // Initial load — last 100 rows (desc then reverse). Always send init,
      // even when empty — the client uses it to flip to "connected".
      try {
        const initEndpoint = `${supabaseUrl}/rest/v1/agent_messages?select=${SELECT}&order=created_at.desc&limit=100`
        const initRes = await fetch(initEndpoint, {
          headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
          cache: 'no-store',
        })
        const initRows: AgentMessage[] = initRes.ok ? (await initRes.json()).reverse() : []
        if (initRows.length > 0) since = initRows[initRows.length - 1].created_at
        send({ rows: initRows, type: 'init' })
      } catch {
        send({ rows: [], type: 'init' })
      }

      const interval = setInterval(async () => {
        try {
          const rows = await fetchSince(supabaseUrl, supabaseKey, since, 50)
          if (rows.length > 0) {
            since = rows[rows.length - 1].created_at
            send({ rows, type: 'delta' })
          }
        } catch {
          // ignore transient errors
        }
      }, 2000)

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'))
        } catch {
          clearInterval(keepalive)
          clearInterval(interval)
        }
      }, 15000)

      req.signal.addEventListener('abort', () => {
        clearInterval(interval)
        clearInterval(keepalive)
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
