'use client'

import { useEffect, useState } from 'react'

interface CalendarEvent {
  title: string
  start: string
  end: string
  allDay: boolean
  location?: string
}

export default function CalendarWidget() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/calendar')
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
    </div>
  )

  if (events.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-3xl mb-2">📅</div>
        <div className="text-sm text-zinc-500">
          {process.env.NEXT_PUBLIC_CALENDAR_CONFIGURED === 'false'
            ? 'Calendar not configured'
            : 'Nothing in the next 7 days'}
        </div>
      </div>
    )
  }

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <ul className="space-y-2">
      {events.map((event, i) => {
        const start = new Date(event.start)
        return (
          <li key={i} className="flex gap-3 items-start">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/30 flex flex-col items-center justify-center">
              <div className="text-xs text-blue-400 font-medium">{DAYS[start.getDay()]}</div>
              <div className="text-sm text-blue-300 font-semibold leading-tight">{start.getDate()}</div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-zinc-200 truncate">{event.title}</div>
              <div className="text-xs text-zinc-500">
                {event.allDay ? 'All day' : start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                {event.location && ` · ${event.location}`}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
