// Resilient fetch wrapper for Supabase REST calls.
//
// The dashboard runs as a rootless-podman container whose DNS goes through
// aardvark-dns. aardvark (1.4.0) intermittently returns empty responses, which
// surfaces in Node as `TypeError: fetch failed` with a cause of
// `getaddrinfo EAI_AGAIN <supabase-host>`. ~2-5% of lookups fail, so a single
// retry almost always succeeds. This wraps fetch with a small retry on transient
// DNS/connection errors so server-side routes don't return "Server error" on a
// blip. See project memory dashboard_task_create_dns_failure_20260530.
export const runtime = 'nodejs'

const TRANSIENT_DNS_CODES = new Set([
  'EAI_AGAIN',   // temporary name resolution failure (the aardvark empty-response case)
  'ENOTFOUND',   // name not resolved — transient when DNS proxy drops a packet
  'ECONNRESET',  // connection reset mid-flight
  'ETIMEDOUT',   // connection timed out
  'UND_ERR_CONNECT_TIMEOUT', // undici connect timeout
])

// Walk the error + its `cause` chain looking for a transient network/DNS code.
function isTransientNetworkError(err: unknown): boolean {
  let e: unknown = err
  for (let depth = 0; e && depth < 5; depth++) {
    const code = (e as { code?: string })?.code
    if (code && TRANSIENT_DNS_CODES.has(code)) return true
    e = (e as { cause?: unknown })?.cause
  }
  return false
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))

export interface SupaFetchOptions extends RequestInit {
  // Max attempts including the first try (default 3).
  retries?: number
  // Base backoff in ms; doubles each attempt (default 150).
  backoffMs?: number
}

// Drop-in replacement for fetch() for Supabase REST calls. Retries only on
// transient DNS/connection errors; real HTTP responses (incl. 4xx/5xx) are
// returned to the caller unchanged on the first try.
export async function supaFetch(
  url: string,
  opts: SupaFetchOptions = {},
): Promise<Response> {
  const { retries = 3, backoffMs = 150, ...init } = opts
  let lastErr: unknown
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetch(url, init)
    } catch (err) {
      lastErr = err
      if (!isTransientNetworkError(err) || attempt === retries) throw err
      await sleep(backoffMs * 2 ** (attempt - 1))
    }
  }
  // Unreachable, but satisfies the type checker.
  throw lastErr
}
