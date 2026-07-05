import { NextResponse } from 'next/server'
import { grafanaBoards, type BoardSpec, type SeriesSpec, type Tone, type Unit } from '@/lib/grafana-boards'

// Live Prometheus data — never cache/prerender (matches /api/metrics).
export const dynamic = 'force-dynamic'

const MAX_SERIES_PER_PANEL = 14

interface PromResult {
  metric: Record<string, string>
  value?: [number, string]
  values?: [number, string][]
}

async function prom(
  baseUrl: string,
  path: 'query' | 'query_range',
  params: Record<string, string>,
): Promise<PromResult[]> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.data?.result ?? []
  } catch {
    return []
  }
}

/** Resolve a "{{label}}" legend template from series labels, then relabel map. */
function legend(template: string, labels: Record<string, string>, relabel?: Record<string, string>): string {
  let out = template.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_, l) => labels[l] ?? '')
  if (relabel) {
    for (const [from, to] of Object.entries(relabel)) out = out.split(from).join(to)
  }
  return out.trim() || 'value'
}

export interface ApiSeries {
  name: string
  color?: string
  points: [number, number][]
}
export interface ApiStat {
  title: string
  value: number | null
  unit: Unit
  decimals?: number
  tone?: Tone
}
export type ApiPanel =
  | { kind: 'timeseries'; title: string; unit: Unit; stack?: boolean; wide?: boolean; series: ApiSeries[] }
  | { kind: 'bargauge'; title: string; unit: Unit; tone?: Tone; rows: { name: string; value: number }[] }
  | {
      kind: 'table'
      title: string
      columns: { title: string; unit: Unit; tone?: Tone }[]
      rows: { name: string; values: (number | null)[] }[]
    }

export async function GET(_req: Request, { params }: { params: Promise<{ board: string }> }) {
  const { board: boardName } = await params
  const board: BoardSpec | undefined = grafanaBoards[boardName]
  if (!board) return NextResponse.json({ error: 'unknown board' }, { status: 404 })

  const baseUrl = process.env.PROMETHEUS_URL
  if (!baseUrl) return NextResponse.json({ error: 'prometheus not configured' }, { status: 503 })

  const end = Math.floor(Date.now() / 1000)
  const start = end - board.range
  const rangeParams = { start: String(start), end: String(end), step: String(board.step) }

  // ── Stats (instant) ──
  const statsP = Promise.all(
    board.stats.map(async (s) => {
      const rows = await prom(baseUrl, 'query', { query: s.expr })
      const v = rows.length ? parseFloat(rows[0].value?.[1] ?? 'NaN') : NaN
      return {
        title: s.title,
        value: Number.isFinite(v) ? v : null,
        unit: s.unit,
        decimals: s.decimals,
        tone: s.tone,
      } satisfies ApiStat
    }),
  )

  // ── Panels ──
  const panelsP = Promise.all(
    board.panels.map(async (p): Promise<ApiPanel> => {
      if (p.kind === 'timeseries') {
        const groups = await Promise.all(
          p.series.map(async (spec: SeriesSpec) => {
            const rows = await prom(baseUrl, 'query_range', { query: spec.expr, ...rangeParams })
            return rows.map((r) => ({
              name: legend(spec.legend, r.metric, board.relabel),
              color: spec.color,
              points: (r.values ?? []).map(([t, v]) => [t * 1000, parseFloat(v)] as [number, number]),
            }))
          }),
        )
        let series = groups.flat().filter((s) => s.points.length > 1)
        if (series.length > MAX_SERIES_PER_PANEL) {
          // Keep the biggest movers — sorted by mean, like Grafana's topk habit.
          series = series
            .map((s) => ({ s, mean: s.points.reduce((a, [, v]) => a + (Number.isFinite(v) ? v : 0), 0) / s.points.length }))
            .sort((a, b) => b.mean - a.mean)
            .slice(0, MAX_SERIES_PER_PANEL)
            .map((x) => x.s)
        }
        return { kind: 'timeseries', title: p.title, unit: p.unit, stack: p.stack, wide: p.wide, series }
      }

      if (p.kind === 'bargauge') {
        const rows = await prom(baseUrl, 'query', { query: p.expr })
        const out = rows
          .map((r) => ({ name: legend(p.legend, r.metric, board.relabel), value: parseFloat(r.value?.[1] ?? 'NaN') }))
          .filter((r) => Number.isFinite(r.value))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10)
        return { kind: 'bargauge', title: p.title, unit: p.unit, tone: p.tone, rows: out }
      }

      // table — run each column instant query, join rows on joinLabels
      const colResults = await Promise.all(p.columns.map((c) => prom(baseUrl, 'query', { query: c.expr })))
      const rowMap = new Map<string, { name: string; values: (number | null)[] }>()
      colResults.forEach((rows, ci) => {
        for (const r of rows) {
          const key = p.joinLabels.map((l) => r.metric[l] ?? '').join('|')
          let row = rowMap.get(key)
          if (!row) {
            row = { name: legend(p.nameLegend, r.metric, board.relabel), values: p.columns.map(() => null) }
            rowMap.set(key, row)
          }
          const v = parseFloat(r.value?.[1] ?? 'NaN')
          row.values[ci] = Number.isFinite(v) ? v : null
        }
      })
      return {
        kind: 'table',
        title: p.title,
        columns: p.columns.map((c) => ({ title: c.title, unit: c.unit, tone: c.tone })),
        rows: [...rowMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
      }
    }),
  )

  const [stats, panels] = await Promise.all([statsP, panelsP])
  return NextResponse.json({ title: board.title, range: board.range, stats, panels })
}
