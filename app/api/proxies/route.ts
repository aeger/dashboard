import { NextRequest, NextResponse } from 'next/server'
import {
  listProxies,
  writeProxy,
  proxyExists,
  isValidName,
  isValidHostname,
  isValidUrl,
  type ProxyConfig,
} from '@/lib/traefik-proxies'
import { upsertDnsRecord } from '@/lib/cloudflare-dns'
import { listRewrites, upsertRewrite } from '@/lib/adguard'
import { verifyAutheliaSession } from '@/lib/authelia'

const LAN_ANSWER = '192.168.1.181' // Traefik on svc-podman-01 — split-DNS target

/**
 * All hostnames Traefik currently serves, from its per-cert metric. This
 * includes label-managed routes the proxies page can't see (e.g.
 * traefik.az-lab.dev → api@internal), so the UI can show them read-only and
 * the POST guard can reject duplicate Host() rules instead of silently
 * creating a colliding router.
 */
async function fetchRoutedHostnames(): Promise<string[]> {
  const baseUrl = process.env.PROMETHEUS_URL
  if (!baseUrl) return []
  try {
    const res = await fetch(`${baseUrl}/api/v1/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ query: 'traefik_tls_certs_not_after{job="traefik"}' }),
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = await res.json()
    const hosts = new Set<string>()
    for (const r of data.data?.result ?? []) {
      for (const h of (r.metric?.sans ?? '').split(',')) {
        const host = h.trim()
        if (host && !host.startsWith('*')) hosts.add(host)
      }
    }
    return [...hosts].sort()
  } catch {
    return []
  }
}

export async function GET() {
  const proxies = listProxies()
  const [rewrites, routedHostnames] = await Promise.all([listRewrites(), fetchRoutedHostnames()])
  const rewriteMap = new Map(rewrites.map((r) => [r.domain, r.answer]))

  const managed = new Set(proxies.map((p) => p.hostname))
  const withDns = proxies.map((p) => ({
    ...p,
    adguardAnswer: rewriteMap.get(p.hostname) ?? null,
    adguardOk: rewriteMap.get(p.hostname) === LAN_ANSWER,
  }))

  return NextResponse.json({
    proxies: withDns,
    lanAnswer: LAN_ANSWER,
    // Routed by Traefik but not managed here (compose labels / infra files) —
    // shown read-only so nobody tries to re-create e.g. traefik.az-lab.dev.
    externalHostnames: routedHostnames.filter((h) => !managed.has(h)),
  })
}

export async function POST(req: NextRequest) {
  const username = await verifyAutheliaSession(req.headers.get('cookie'))
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { name, hostname, backendUrl, lanOnly, auth, tls, staticIp } = body as Partial<ProxyConfig>

    if (!name || !isValidName(name)) {
      return NextResponse.json({ error: 'Invalid name — use lowercase letters, numbers, and hyphens' }, { status: 400 })
    }
    if (!hostname || !isValidHostname(hostname)) {
      return NextResponse.json({ error: 'Invalid hostname' }, { status: 400 })
    }
    if (!backendUrl || !isValidUrl(backendUrl)) {
      return NextResponse.json({ error: 'Invalid backend URL' }, { status: 400 })
    }
    if (proxyExists(name)) {
      return NextResponse.json({ error: `Proxy "${name}" already exists` }, { status: 409 })
    }

    // Duplicate Host() rules make Traefik routing ambiguous — reject rather
    // than fight a label-managed router (this is what broke traefik.az-lab.dev).
    const routed = await fetchRoutedHostnames()
    const managedHostnames = new Set(listProxies().map((p) => p.hostname))
    if (routed.includes(hostname) && !managedHostnames.has(hostname)) {
      return NextResponse.json(
        { error: `"${hostname}" is already routed by Traefik (label-managed or infra route) — it can't be re-created here` },
        { status: 409 },
      )
    }

    const cfg: ProxyConfig = {
      name,
      hostname,
      backendUrl,
      lanOnly: lanOnly ?? true,
      auth: auth ?? false,
      tls: tls ?? true,
      staticIp: staticIp || '70.167.221.51',
    }

    writeProxy(cfg)

    // DNS both ways: Cloudflare (public path) + AdGuard rewrite (LAN split-DNS).
    // Non-fatal — the proxy file is written; the UI surfaces sync state.
    let dnsOk = false
    let adguardOk = false
    try {
      dnsOk = await upsertDnsRecord(hostname, cfg.staticIp)
    } catch {}
    try {
      adguardOk = await upsertRewrite(hostname, LAN_ANSWER)
    } catch {}

    return NextResponse.json({ success: true, dns: dnsOk, adguard: adguardOk })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
