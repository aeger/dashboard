import { NextResponse } from 'next/server'
import { fetchContainers } from '@/lib/portainer'

// Live data — never cache/prerender (stale-widget fix 2026-07-01).
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const containers = await fetchContainers()
    return NextResponse.json({ containers })
  } catch {
    return NextResponse.json({ containers: [] })
  }
}
