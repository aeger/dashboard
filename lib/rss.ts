import Parser from 'rss-parser'

export interface RssItem {
  title: string
  link: string
  pubDate: string
  source: string
}

const parser = new Parser({ timeout: 8000 })

export async function fetchRssFeeds(feeds: { url: string; name: string }[], limit = 10): Promise<RssItem[]> {
  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const parsed = await parser.parseURL(feed.url)
      return (parsed.items ?? []).slice(0, limit).map((item) => ({
        title: item.title ?? '',
        link: item.link ?? '',
        pubDate: item.pubDate ?? item.isoDate ?? '',
        source: feed.name,
      }))
    })
  )

  const items: RssItem[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value)
    }
  }

  // Sort by date descending
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
