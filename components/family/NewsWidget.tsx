'use client'

import { useEffect, useState } from 'react'

interface NewsItem {
  title: string
  link: string
  pubDate: string
  source: string
}

export default function NewsWidget() {
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/news?type=family')
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
    </div>
  )

  if (items.length === 0) return (
    <div className="text-zinc-500 text-sm text-center py-8">No news available</div>
  )

  return (
    <ul className="space-y-2">
      {items.slice(0, 8).map((item, i) => (
        <li key={i}>
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block group"
          >
            <div className="text-sm text-zinc-200 group-hover:text-white transition-colors line-clamp-2">
              {item.title}
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              {item.source} · {formatDate(item.pubDate)}
            </div>
          </a>
        </li>
      ))}
    </ul>
  )
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = (now.getTime() - d.getTime()) / 1000 / 60
    if (diff < 60) return `${Math.round(diff)}m ago`
    if (diff < 1440) return `${Math.round(diff / 60)}h ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}
