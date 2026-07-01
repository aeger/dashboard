'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface WidgetData<T> {
  /** Parsed payload, or null until the first successful fetch. */
  data: T | null
  /** True only until the first fetch settles (success or failure). */
  loading: boolean
  /** True when the most recent fetch failed. Stale `data` is preserved. */
  error: boolean
  /** Manually re-fetch now (does not reset `loading`). */
  refresh: () => Promise<void>
}

export interface UseWidgetDataOptions<T> {
  /** Poll interval in ms. 0 disables polling (fetch once). Default 30000. */
  intervalMs?: number
  /** Map the raw JSON response into the shape the widget wants. */
  select?: (raw: unknown) => T
}

/**
 * Shared data-source hook for lab widgets — see docs/widgets.md.
 *
 * Encapsulates the fetch-on-mount + fixed-interval poll + loading/error
 * lifecycle that every lab tile previously reimplemented by hand. A widget
 * declares its endpoint (the registry's `endpoint` field is the contract) and
 * gets back a stable `{ data, loading, error, refresh }`.
 *
 * `select` is read via a ref so passing an inline function does NOT restart the
 * poll timer — the effect only re-runs when `endpoint` or `intervalMs` change.
 */
export function useWidgetData<T = unknown>(
  endpoint: string,
  options: UseWidgetDataOptions<T> = {},
): WidgetData<T> {
  const { intervalMs = 30000, select } = options

  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Keep the latest `select` without making it a fetch dependency.
  const selectRef = useRef(select)
  selectRef.current = select

  const load = useCallback(async () => {
    try {
      const res = await fetch(endpoint)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw = await res.json()
      const map = selectRef.current
      setData(map ? map(raw) : (raw as T))
      setError(false)
    } catch {
      setError(true)
    }
  }, [endpoint])

  useEffect(() => {
    let alive = true
    const run = () =>
      load().finally(() => {
        if (alive) setLoading(false)
      })

    run()
    if (intervalMs > 0) {
      const id = setInterval(run, intervalMs)
      return () => {
        alive = false
        clearInterval(id)
      }
    }
    return () => {
      alive = false
    }
  }, [load, intervalMs])

  return { data, loading, error, refresh: load }
}
