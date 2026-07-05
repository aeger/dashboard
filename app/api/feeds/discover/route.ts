import { NextResponse } from 'next/server'
import Parser from 'rss-parser'

/**
 * Feed autodiscovery — paste ANY url (site homepage, article, or feed) and
 * get back working feed candidates with titles, so adding a feed doesn't
 * require hunting for the RSS link by hand.
 *
 * Order: try the URL as a feed directly → parse the page's
 * <link rel="alternate"> tags → probe common feed paths.
 */

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const COMMON_PATHS = ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/index.xml', '/feeds/posts/default']

export interface FeedCandidate {
  url: string
  title: string
  itemCount: number
  latest: string | null
}

const parser = new Parser({ timeout: 8000, headers: { 'User-Agent': UA } })

async function tryFeed(url: string): Promise<FeedCandidate | null> {
  try {
    const parsed = await parser.parseURL(url)
    const items = parsed.items ?? []
    if (!items.length) return null
    return {
      url,
      title: (parsed.title ?? '').trim() || new URL(url).hostname,
      itemCount: items.length,
      latest: items[0]?.title ?? null,
    }
  } catch {
    return null
  }
}

function extractAlternateLinks(html: string, baseUrl: string): string[] {
  const out: string[] = []
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? []
  for (const tag of linkTags) {
    if (!/rel=["']?alternate["']?/i.test(tag)) continue
    if (!/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1]
    if (!href) continue
    try {
      out.push(new URL(href, baseUrl).href)
    } catch {}
  }
  return out
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  let raw = (searchParams.get('url') ?? '').trim()
  if (!raw) return NextResponse.json({ error: 'url param required' }, { status: 400 })
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`

  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  // 1) Maybe it's already a feed.
  const direct = await tryFeed(target.href)
  if (direct) return NextResponse.json({ candidates: [direct] })

  // 2) Fetch the page and read its advertised feeds.
  const candidateUrls = new Set<string>()
  try {
    const res = await fetch(target.href, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    })
    if (res.ok) {
      const html = (await res.text()).slice(0, 300 * 1024)
      for (const u of extractAlternateLinks(html, res.url || target.href)) candidateUrls.add(u)
    }
  } catch {}

  // 3) Common paths on the site root as a fallback sweep.
  if (candidateUrls.size === 0) {
    for (const p of COMMON_PATHS) candidateUrls.add(new URL(p, target.origin).href)
  }

  const results = await Promise.all([...candidateUrls].slice(0, 8).map(tryFeed))
  const seen = new Set<string>()
  const candidates = results
    .filter((c): c is FeedCandidate => c !== null)
    .filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)))
    .sort((a, b) => b.itemCount - a.itemCount)
    .slice(0, 4)

  if (!candidates.length) {
    return NextResponse.json({
      candidates: [],
      error: 'No feed found — the site may not publish RSS/Atom, or it blocks bots. Try the exact feed URL if you know it.',
    })
  }
  return NextResponse.json({ candidates })
}
