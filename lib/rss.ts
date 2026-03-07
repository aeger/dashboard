import Parser from 'rss-parser'

export interface RssItem {
  title: string
  link: string
  pubDate: string
  source: string
}

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'AZ-Lab-Dashboard/1.0 (homelab monitoring; self-hosted)',
    'Accept': 'application/rss+xml, application/xml, text/xml',
  },
})

function isRedditUrl(url: string): boolean {
  return /reddit\.com\/r\//i.test(url)
}

// Reddit's JSON API is more reliable than their RSS for automated clients
async function fetchRedditJson(url: string, name: string, limit: number): Promise<RssItem[]> {
  const match = url.match(/reddit\.com\/r\/([^/.]+)/i)
  if (!match) throw new Error('Could not parse subreddit from URL')

  const subreddit = match[1]
  const jsonUrl = `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`

  const res = await fetch(jsonUrl, {
    headers: { 'User-Agent': 'AZ-Lab-Dashboard/1.0 (homelab monitoring; self-hosted)' },
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) throw new Error(`Reddit JSON API returned ${res.status}`)

  const data = await res.json()
  return (data.data?.children ?? [])
    .filter((c: { data: { stickied: boolean } }) => !c.data?.stickied)
    .slice(0, limit)
    .map((c: { data: { title: string; permalink: string; created_utc: number } }) => ({
      title: c.data.title,
      link: `https://www.reddit.com${c.data.permalink}`,
      pubDate: new Date(c.data.created_utc * 1000).toISOString(),
      source: name,
    }))
}

async function fetchOneFeed(feed: { url: string; name: string }, limit: number): Promise<RssItem[]> {
  if (isRedditUrl(feed.url)) {
    return fetchRedditJson(feed.url, feed.name, limit)
  }
  const parsed = await parser.parseURL(feed.url)
  return (parsed.items ?? []).slice(0, limit).map((item) => ({
    title: item.title ?? '',
    link: item.link ?? '',
    pubDate: item.pubDate ?? item.isoDate ?? '',
    source: feed.name,
  }))
}

export async function fetchRssFeeds(feeds: { url: string; name: string }[], limit = 10): Promise<RssItem[]> {
  const results = await Promise.allSettled(feeds.map((feed) => fetchOneFeed(feed, limit)))

  const items: RssItem[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value)
    }
  }

  return items
    .filter((i) => i.title && i.link)
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, limit * feeds.length)
}

export interface CalendarEvent {
  title: string
  start: string
  end: string
  allDay: boolean
  location?: string
}

export async function fetchCalendarEvents(icalUrl: string): Promise<CalendarEvent[]> {
  if (!icalUrl) return []

  try {
    const ical = await import('node-ical')
    const data = await ical.async.fromURL(icalUrl)
    const now = new Date()
    const oneWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const events: CalendarEvent[] = []

    for (const event of Object.values(data)) {
      if (!event || event.type !== 'VEVENT') continue

      const e = event as {
        summary?: string
        start?: Date
        end?: Date
        datetype?: string
        location?: string
      }

      if (!e.start) continue

      const start = new Date(e.start)
      if (start < now || start > oneWeek) continue

      events.push({
        title: e.summary ?? 'Event',
        start: start.toISOString(),
        end: e.end ? new Date(e.end).toISOString() : start.toISOString(),
        allDay: e.datetype === 'date',
        location: e.location,
      })
    }

    return events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  } catch {
    return []
  }
}
