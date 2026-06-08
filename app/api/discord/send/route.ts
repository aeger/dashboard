import { NextRequest, NextResponse } from 'next/server'
import { postViaDashboard } from '@/lib/discord-notify'

async function checkAuth(req: NextRequest): Promise<string | null> {
  const cookie = req.headers.get('cookie') || ''
  if (!cookie.includes('authelia_session')) return null
  try {
    const authRes = await fetch('https://auth.az-lab.dev/api/state', {
      headers: { cookie },
    })
    const authData = await authRes.json()
    if (authData.data?.authentication_level > 0 && authData.data?.username) {
      return authData.data.username as string
    }
    return null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const username = await checkAuth(req)
  if (!username) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  const hasWebhook = !!process.env.DISCORD_WEBHOOK_URL
  const hasBot = !!(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CHANNEL_ID)
  if (!hasWebhook && !hasBot) {
    return NextResponse.json({ error: 'Discord not configured' }, { status: 503 })
  }

  let content: string
  try {
    const body = await req.json()
    content = (body.content ?? '').trim()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!content) {
    return NextResponse.json({ error: 'Message content required' }, { status: 400 })
  }
  if (content.length > 2000) {
    return NextResponse.json({ error: 'Message too long (max 2000 chars)' }, { status: 400 })
  }

  // Posts via the "Dashboard" webhook, sub-labelled with the dashboard username
  // so the human origin is clear (e.g. "Dashboard · jeff"). wait:true returns the id.
  try {
    const result = await postViaDashboard(
      { content },
      { username: `Dashboard · ${username}`, wait: true },
    )
    if (!result.ok) {
      console.error('Discord send error via dashboard webhook/bot')
      return NextResponse.json({ error: 'Discord API error' }, { status: 502 })
    }
    return NextResponse.json({ ok: true, id: result.id })
  } catch {
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
