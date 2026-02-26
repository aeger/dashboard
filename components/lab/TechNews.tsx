'use client'

import { useEffect, useState } from 'react'

interface NewsItem {
  title: string
  link: string
  pubDate: string
  source: string
}

export default function TechNews() {
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/news?type=lab')
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-24">
      <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
    </div>
  )

  if (items.length === 0) return (
    <div className="text-zinc-500 text-sm text-center py-6">No tech news available</div>
  )

  return (
    <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
      {items.map((item, i) => (
        <li key={i}>
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group block"
          >
            <div className="flex items-start gap-2">
              <span className="text-xs text-zinc-600 mt-0.5 flex-shrink-0 font-mono">{item.source.replace('r/', '')}</span>
              <span className="text-sm text-zinc-300 group-hover:text-white transition-colors line-clamp-2">{item.title}</span>
            </div>
          </a>
        </li>
      ))}
    </ul>
  )
}
