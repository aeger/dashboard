import { NextResponse } from 'next/server'
import { fetchRssFeeds } from '@/lib/rss'
import { getConfig } from '@/lib/config'

export const revalidate = 900 // 15 min

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') // 'family' or 'lab'

  const config = getConfig()
  const feeds = type === 'lab' ? config.lab.tech_news_feeds : config.family.news_feeds

  try {
    const items = await fetchRssFeeds(feeds, 8)
    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] })
  }
}
