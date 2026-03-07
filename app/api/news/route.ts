import { NextResponse } from 'next/server'
import { fetchRssFeeds } from '@/lib/rss'
import { getCachedNews } from '@/lib/news-cache'
import { getFeeds } from '@/lib/feeds'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') === 'lab' ? 'lab' : 'family'

  const feeds = getFeeds(type)

  try {
    const { items, cachedAt } = await getCachedNews(type, () => fetchRssFeeds(feeds, 8))
    return NextResponse.json({ items, cachedAt })
  } catch {
    return NextResponse.json({ items: [], cachedAt: null })
  }
}
