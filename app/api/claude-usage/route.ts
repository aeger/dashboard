import { NextResponse } from 'next/server'
import { getClaudeUsage } from '@/lib/claude-usage'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(await getClaudeUsage())
  } catch {
    return NextResponse.json({ available: false, error: true }, { status: 200 })
  }
}
