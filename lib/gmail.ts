const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1'

let _cachedToken: { token: string; expires: number } | null = null

async function getAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _cachedToken.expires) {
    return _cachedToken.token
  }

  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail OAuth credentials not configured')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status}`)
  }

  const data = await res.json()
  _cachedToken = {
    token: data.access_token,
    expires: Date.now() + (data.expires_in - 60) * 1000,
  }
  return _cachedToken.token
}

async function apiGet(path: string, params?: Record<string, string | string[]>) {
  const token = await getAccessToken()
  const url = new URL(`${GMAIL_API}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(k, item)
      } else {
        url.searchParams.set(k, v)
      }
    }
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Gmail API ${res.status}: ${await res.text()}`)
  return res.json()
}

// ── Public Types ─────────────────────────────────────────────────────────────

export interface GmailMessage {
  id: string
  threadId: string
  from: string
  subject: string
  snippet: string
  date: string
  unread: boolean
  labels: string[]
}

// ── Public Functions ─────────────────────────────────────────────────────────

export function isConfigured(): boolean {
  return !!(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN
  )
}

export async function getProfile(): Promise<{ email: string }> {
  const data = await apiGet('/users/me/profile')
  return { email: data.emailAddress }
}

export async function listInbox(maxResults = 15): Promise<GmailMessage[]> {
  const data = await apiGet('/users/me/messages', {
    maxResults: String(maxResults),
    q: 'in:inbox',
  })

  if (!data.messages?.length) return []

  // Batch fetch message details — metadataHeaders must be repeated params
  const messages = await Promise.allSettled(
    data.messages.map((m: { id: string }) =>
      apiGet(`/users/me/messages/${m.id}`, {
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      })
    ),
  )

  return messages
    .filter((r): r is PromiseFulfilledResult<Record<string, unknown>> => r.status === 'fulfilled')
    .map((r) => {
      const msg = r.value
      const headers = (msg.payload as Record<string, unknown>)?.headers as { name: string; value: string }[] || []
      const getHeader = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || ''
      const labelIds = (msg.labelIds || []) as string[]

      return {
        id: msg.id as string,
        threadId: msg.threadId as string,
        from: getHeader('From'),
        subject: getHeader('Subject') || '(No subject)',
        snippet: msg.snippet as string || '',
        date: getHeader('Date'),
        unread: labelIds.includes('UNREAD'),
        labels: labelIds,
      }
    })
}
