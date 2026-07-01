import { NextResponse } from 'next/server'
import { fetchUptimeKuma } from '@/lib/uptime-kuma'

// Live data — never cache/prerender (stale-widget fix 2026-07-01).
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const monitors = await fetchUptimeKuma()
    return NextResponse.json({ monitors })
  } catch {
    return NextResponse.json({ monitors: [] })
  }
}
