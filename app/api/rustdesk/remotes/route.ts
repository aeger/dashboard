import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { readRemotes, writeRemotes, toPublic, type RustDeskRemote } from '@/lib/rustdesk-remotes'
import { verifyAutheliaSession } from '@/lib/authelia'

export type { RustDeskRemote, RustDeskRemotePublic } from '@/lib/rustdesk-remotes'

// The list is not sensitive; the passwords are. Strip them so an
// unauthenticated LAN curl can't harvest saved RustDesk passwords.
export async function GET() {
  return NextResponse.json(readRemotes().map(toPublic))
}

export async function POST(req: NextRequest) {
  if (!(await verifyAutheliaSession(req.headers.get('cookie')))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { peerId, name, password, group, note } = body

    if (!peerId || typeof peerId !== 'string' || !/^\d+$/.test(peerId.trim())) {
      return NextResponse.json({ error: 'Invalid peer ID — must be numeric' }, { status: 400 })
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const remotes = readRemotes()
    if (remotes.some((r) => r.peerId === peerId.trim())) {
      return NextResponse.json({ error: 'Peer ID already exists' }, { status: 409 })
    }

    const remote: RustDeskRemote = {
      id: randomUUID(),
      peerId: peerId.trim(),
      name: name.trim(),
      ...(password ? { password } : {}),
      ...(group ? { group: group.trim() } : {}),
      ...(note ? { note: note.trim() } : {}),
    }
    remotes.push(remote)
    writeRemotes(remotes)
    return NextResponse.json(toPublic(remote), { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
