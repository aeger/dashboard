import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const DATA_FILE = join(process.cwd(), 'data', 'rustdesk_remotes.json')

export interface RustDeskRemote {
  id: string        // internal UUID
  peerId: string    // RustDesk peer ID (numeric string)
  name: string      // friendly name
  password?: string // optional saved password (never returned to clients)
  group?: string    // tag / category
  note?: string
}

/** Client-facing shape — the password never leaves the server. */
export type RustDeskRemotePublic = Omit<RustDeskRemote, 'password'> & { hasPassword: boolean }

export function readRemotes(): RustDeskRemote[] {
  if (!existsSync(DATA_FILE)) return []
  try { return JSON.parse(readFileSync(DATA_FILE, 'utf-8')) } catch { return [] }
}

export function writeRemotes(remotes: RustDeskRemote[]) {
  writeFileSync(DATA_FILE, JSON.stringify(remotes, null, 2) + '\n')
}

export function toPublic(r: RustDeskRemote): RustDeskRemotePublic {
  const { password: _password, ...rest } = r
  return { ...rest, hasPassword: Boolean(r.password) }
}
