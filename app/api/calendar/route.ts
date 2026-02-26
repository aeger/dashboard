import { NextResponse } from 'next/server'
import { fetchCalendarEvents } from '@/lib/rss'

export const revalidate = 3600 // 1 hour

export async function GET() {
  const icalUrl = process.env.GOOGLE_CALENDAR_ICAL_URL ?? ''

  try {
    const events = await fetchCalendarEvents(icalUrl)
    return NextResponse.json({ events })
  } catch {
    return NextResponse.json({ events: [] })
  }
}
