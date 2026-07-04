import { NextResponse } from 'next/server'
import WebSocket from 'ws'
import { getConfig } from '@/lib/config'

/**
 * Live Home Assistant dashboard/view discovery — so the HA page editor can
 * offer "pick what exists" instead of demanding exact /dashboard-x/N paths.
 *
 * Uses HA's websocket API (lovelace/dashboards/list + per-dashboard
 * lovelace/config) with the long-lived HA_ACCESS_TOKEN. Strategy-generated
 * dashboards have no stored config — they come back with views: [].
 */

export const dynamic = 'force-dynamic'

interface HAView {
  title: string
  path: string // full iframe path e.g. /dashboard-test/cameras or /dashboard-test/0
}
interface HADiscovered {
  title: string
  url_path: string
  views: HAView[]
}

function wsQuery(wsUrl: string, token: string): Promise<HADiscovered[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { handshakeTimeout: 6000 })
    const timer = setTimeout(() => { ws.terminate(); reject(new Error('HA websocket timeout')) }, 12000)
    let nextId = 0
    const pending = new Map<number, (result: unknown, ok: boolean) => void>()

    const send = (type: string, extra: Record<string, unknown> = {}) =>
      new Promise<unknown>((res) => {
        const id = ++nextId
        pending.set(id, (result, ok) => res(ok ? result : null))
        ws.send(JSON.stringify({ id, type, ...extra }))
      })

    ws.on('error', (e) => { clearTimeout(timer); reject(e) })
    ws.on('message', async (buf) => {
      const m = JSON.parse(buf.toString())
      if (m.type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: token }))
      } else if (m.type === 'auth_invalid') {
        clearTimeout(timer)
        ws.terminate()
        reject(new Error('HA token rejected'))
      } else if (m.type === 'auth_ok') {
        try {
          const list = ((await send('lovelace/dashboards/list')) as
            { title: string; url_path: string }[] | null) ?? []
          // The default dashboard isn't in the list — include it explicitly.
          const dashboards = [{ title: 'Overview (default)', url_path: 'lovelace' }, ...list]
          const out: HADiscovered[] = []
          for (const d of dashboards) {
            const cfg = (await send('lovelace/config',
              d.url_path === 'lovelace' ? {} : { url_path: d.url_path })) as
              { views?: { title?: string; path?: string }[] } | null
            const views: HAView[] = (cfg?.views ?? []).map((v, i) => ({
              title: v.title ?? `View ${i + 1}`,
              path: `/${d.url_path}/${v.path ?? i}`,
            }))
            out.push({ title: d.title, url_path: d.url_path, views })
          }
          clearTimeout(timer)
          ws.close()
          resolve(out)
        } catch (e) {
          clearTimeout(timer)
          ws.terminate()
          reject(e)
        }
      } else if (m.type === 'result') {
        pending.get(m.id)?.(m.result, m.success !== false)
        pending.delete(m.id)
      }
    })
  })
}

export async function GET() {
  const token = process.env.HA_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'HA_ACCESS_TOKEN not configured' }, { status: 503 })

  const haUrl = getConfig().homeassistant?.url ?? process.env.HA_URL ?? 'https://ha.az-lab.dev'
  const wsUrl = haUrl.replace(/^http/, 'ws') + '/api/websocket'

  try {
    const dashboards = await wsQuery(wsUrl, token)
    return NextResponse.json({ dashboards })
  } catch (e) {
    return NextResponse.json({ error: `HA discovery failed: ${String(e)}` }, { status: 502 })
  }
}
