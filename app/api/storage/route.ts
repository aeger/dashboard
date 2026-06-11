import { NextResponse } from 'next/server'
import { fetchStoragePools } from '@/lib/prometheus'

export const dynamic = 'force-dynamic'

export async function GET() {
  const pools = await fetchStoragePools()
  return NextResponse.json({ pools })
}
