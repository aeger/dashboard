import { NextRequest, NextResponse } from 'next/server'
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import { createHash } from 'crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const CACHE_DIR = join(process.cwd(), 'data', 'articles')
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h

interface ArticleCache {
  url: string
  title: string
  byline: string | null
  content: string
  textContent: string
  readingTime: number
  excerpt: string | null
  siteName: string | null
  cachedAt: string
}

function urlHash(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 32)
}

function getCachePath(hash: string): string {
  return join(CACHE_DIR, `${hash}.json`)
}

function readCache(hash: string): ArticleCache | null {
  try {
    const raw = readFileSync(getCachePath(hash), 'utf8')
    const data: ArticleCache = JSON.parse(raw)
    const age = Date.now() - new Date(data.cachedAt).getTime()
    if (age > CACHE_TTL_MS) return null
    return data
  } catch {
    return null
  }
}

function writeCache(hash: string, data: ArticleCache) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(getCachePath(hash), JSON.stringify(data), 'utf8')
  } catch {}
}

function estimateReadingTime(text: string): number {
  const words = text.trim().split(/\s+/).length
  return Math.max(1, Math.ceil(words / 200))
}

// Rewrite image src attributes to go through proxy
function proxyImages(html: string, baseUrl: string): string {
  // Resolve relative URLs and rewrite all img src to /api/proxy-image?url=...
  return html.replace(
    /<img([^>]*)\ssrc=["']([^"']+)["']([^>]*)>/gi,
    (match, before, src, after) => {
      try {
        const absolute = new URL(src, baseUrl).href
        const proxied = `/api/proxy-image?url=${encodeURIComponent(absolute)}`
        return `<img${before} src="${proxied}"${after}>`
      } catch {
        return match
      }
    }
  )
}

function buildFromFallback(url: string, fallbackHtml: string, title: string | null): ArticleCache {
  const text = fallbackHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return {
    url,
    title: title ?? '',
    byline: null,
    content: proxyImages(fallbackHtml, url),
    textContent: text,
    readingTime: estimateReadingTime(text),
    excerpt: text.slice(0, 200) || null,
    siteName: 'from feed',
    cachedAt: new Date().toISOString(),
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    return extract(body.url, body.fallbackHtml ?? null, body.title ?? null)
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

export async function GET(req: NextRequest) {
  return extract(req.nextUrl.searchParams.get('url'), null, null)
}

async function extract(url: string | null, fallbackHtml: string | null, fallbackTitle: string | null) {
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }
  // Full-text feeds make scraping unnecessary — but prefer the scraped page
  // when it works (canonical formatting); the feed HTML is the safety net.
  const fallbackUsable = !!fallbackHtml && fallbackHtml.replace(/<[^>]*>/g, ' ').trim().length > 300

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  const hash = urlHash(url)

  // Return cached if fresh
  const cached = readCache(hash)
  if (cached) {
    return NextResponse.json(cached)
  }

  // Fetch article HTML server-side
  let html: string
  try {
    const res = await fetch(url, {
      headers: {
        // Real-browser UA — many sites 403 obvious bot strings.
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      if (fallbackUsable) {
        const result = buildFromFallback(url, fallbackHtml!, fallbackTitle)
        writeCache(hash, result)
        return NextResponse.json(result)
      }
      return NextResponse.json(
        { error: `Fetch failed: ${res.status} ${res.statusText}` },
        { status: 502 }
      )
    }
    // Cap to keep jsdom memory reasonable — 500KB truncated many modern pages
    // mid-DOM and broke extraction; 2MB covers nearly everything.
    const CAP = 2 * 1024 * 1024
    const buffer = await res.arrayBuffer()
    html = new TextDecoder().decode(buffer.byteLength > CAP ? buffer.slice(0, CAP) : buffer)
  } catch (err) {
    if (fallbackUsable) {
      const result = buildFromFallback(url, fallbackHtml!, fallbackTitle)
      writeCache(hash, result)
      return NextResponse.json(result)
    }
    return NextResponse.json(
      { error: `Failed to fetch article: ${String(err)}` },
      { status: 502 }
    )
  }

  // Parse with jsdom + Readability
  let article: ReturnType<Readability['parse']>
  try {
    const dom = new JSDOM(html, { url: parsedUrl.href })
    const reader = new Readability(dom.window.document)
    article = reader.parse()
  } catch (err) {
    if (fallbackUsable) {
      const result = buildFromFallback(url, fallbackHtml!, fallbackTitle)
      writeCache(hash, result)
      return NextResponse.json(result)
    }
    return NextResponse.json(
      { error: `Extraction failed: ${String(err)}` },
      { status: 500 }
    )
  }

  const thin = !article || (article.textContent ?? '').trim().length < 400
  if (thin && fallbackUsable) {
    const result = buildFromFallback(url, fallbackHtml!, fallbackTitle)
    writeCache(hash, result)
    return NextResponse.json(result)
  }
  if (!article) {
    return NextResponse.json(
      { error: 'Could not extract article content (paywall or unsupported format)' },
      { status: 422 }
    )
  }

  const content = proxyImages(article.content ?? '', parsedUrl.href)

  const result: ArticleCache = {
    url,
    title: article.title ?? '',
    byline: article.byline ?? null,
    content,
    textContent: article.textContent ?? '',
    readingTime: estimateReadingTime(article.textContent ?? ''),
    excerpt: article.excerpt ?? null,
    siteName: article.siteName ?? null,
    cachedAt: new Date().toISOString(),
  }

  writeCache(hash, result)

  return NextResponse.json(result)
}
