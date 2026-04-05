import { NextRequest, NextResponse } from 'next/server'

// Initiates Gmail OAuth flow — sends user to Google consent screen
// Must be called from a browser (redirects).
export async function GET(req: NextRequest) {
  // Authelia check
  const cookie = req.headers.get('cookie') || ''
  try {
    const authRes = await fetch('https://auth.az-lab.dev/api/state', {
      headers: { cookie },
    })
    const authData = await authRes.json()
    if (!(authData.data?.authentication_level > 0 && authData.data?.username)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } catch {
    return NextResponse.json({ error: 'Auth check failed' }, { status: 500 })
  }

  const clientId = process.env.GMAIL_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'GMAIL_CLIENT_ID not configured' }, { status: 500 })
  }

  const origin = req.nextUrl.origin
  const redirectUri = `${origin}/api/gmail/auth/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline',
    prompt: 'consent', // forces refresh_token to be issued
    state: 'gmail-reauth',
  })

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  )
}
