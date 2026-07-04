/**
 * Real Authelia session verification for mutating API routes.
 *
 * Replaces the old `cookie.includes('authelia_session')` substring test, which
 * accepted any forged cookie value. This forwards the cookie to Authelia and
 * only trusts an actual authenticated session (same pattern as /api/discord/send
 * and server.js).
 */
const AUTHELIA_STATE_URL = process.env.AUTHELIA_STATE_URL || 'https://auth.az-lab.dev/api/state'

/** Returns the authenticated username, or null. */
export async function verifyAutheliaSession(cookie: string | null): Promise<string | null> {
  if (!cookie || !cookie.includes('authelia_session')) return null
  try {
    const res = await fetch(AUTHELIA_STATE_URL, {
      headers: { cookie },
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.data?.authentication_level > 0 && data.data?.username) {
      return data.data.username as string
    }
    return null
  } catch {
    return null
  }
}
