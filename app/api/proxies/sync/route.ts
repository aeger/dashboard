import { NextRequest, NextResponse } from 'next/server'
import { listProxies } from '@/lib/traefik-proxies'
import { listRewrites, upsertRewrite } from '@/lib/adguard'
import { verifyAutheliaSession } from '@/lib/authelia'

const LAN_ANSWER = '192.168.1.181'

/**
 * One-shot reconcile: ensure every page-managed proxy has an AdGuard rewrite
 * pointing at Traefik. Backfills proxies created before AdGuard sync existed.
 */
export async function POST(req: NextRequest) {
  if (!(await verifyAutheliaSession(req.headers.get('cookie')))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const proxies = listProxies()
  const rewriteMap = new Map((await listRewrites()).map((r) => [r.domain, r.answer]))

  const added: string[] = []
  const fixed: string[] = []
  const ok: string[] = []
  const failed: string[] = []

  for (const p of proxies) {
    const current = rewriteMap.get(p.hostname)
    if (current === LAN_ANSWER) {
      ok.push(p.hostname)
      continue
    }
    const success = await upsertRewrite(p.hostname, LAN_ANSWER)
    if (!success) failed.push(p.hostname)
    else if (current) fixed.push(p.hostname)
    else added.push(p.hostname)
  }

  return NextResponse.json({ success: failed.length === 0, added, fixed, ok, failed })
}
