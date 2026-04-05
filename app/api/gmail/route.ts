import { NextRequest, NextResponse } from 'next/server'
import { listInbox, isConfigured, GmailAuthError } from '@/lib/gmail'

export async function GET(req: NextRequest) {
  // Check Authelia session
  const cookie = req.headers.get('cookie') || ''
  if (!cookie.includes('authelia_session')) {
    return NextResponse.json({ authenticated: false })
  }

  // Verify user is actually authenticated via Authelia
  try {
    const authRes = await fetch('https://auth.az-lab.dev/api/state', {
      headers: { cookie },
    })
    const authData = await authRes.json()
    if (!(authData.data?.authentication_level > 0 && authData.data?.username)) {
      return NextResponse.json({ authenticated: false })
    }
  } catch {
    return NextResponse.json({ authenticated: false })
  }

  if (!isConfigured()) {
    return NextResponse.json({ messages: [], configured: false, authenticated: true })
  }

  try {
    const { searchParams } = req.nextUrl
    const max = Math.min(parseInt(searchParams.get('max') || '15', 10), 30)
    const messages = await listInbox(max)
    return NextResponse.json({ messages, configured: true, authenticated: true })
  } catch (error) {
    if (error instanceof GmailAuthError) {
      return NextResponse.json(
        { messages: [], reauth_required: true, configured: true, authenticated: true },
        { status: 200 },
      )
    }
    console.error('Gmail fetch error:', error)
    return NextResponse.json(
      { messages: [], error: 'Failed to fetch mail', configured: true, authenticated: true },
      { status: 500 },
    )
  }
}
