import { NextResponse } from 'next/server'
import { getClaudeSpend } from '@/lib/claude-spend'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(getClaudeSpend())
  } catch {
    return NextResponse.json({ available: false, error: true }, { status: 200 })
  }
}
