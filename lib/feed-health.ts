import fs from 'fs'
import path from 'path'

const HEALTH_PATH = path.join(process.cwd(), 'data', 'feed-health.json')

export interface FeedHealth {
  ok: boolean
  checkedAt: string
  itemCount?: number
  error?: string
}

type HealthMap = Record<string, FeedHealth>

function read(): HealthMap {
  try { return JSON.parse(fs.readFileSync(HEALTH_PATH, 'utf-8')) }
  catch { return {} }
}

function write(map: HealthMap) {
  try {
    fs.mkdirSync(path.dirname(HEALTH_PATH), { recursive: true })
    fs.writeFileSync(HEALTH_PATH, JSON.stringify(map, null, 2))
  } catch {}
}

export function recordFeedResult(url: string, ok: boolean, itemCount?: number, error?: string) {
  const map = read()
  map[url] = { ok, checkedAt: new Date().toISOString(), ...(itemCount !== undefined && { itemCount }), ...(error && { error }) }
  write(map)
}

export function getFeedHealth(): HealthMap {
  return read()
}
