import { NextRequest, NextResponse } from 'next/server'
import { readRemotes, writeRemotes, toPublic, type RustDeskRemote } from '@/lib/rustdesk-remotes'
import { verifyAutheliaSession } from '@/lib/authelia'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAutheliaSession(req.headers.get('cookie')))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  try {
    const body = await req.json()
    const { peerId, name, password, group, note, clearPassword } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (peerId && (typeof peerId !== 'string' || !/^\d+$/.test(peerId.trim()))) {
      return NextResponse.json({ error: 'Invalid peer ID — must be numeric' }, { status: 400 })
    }

    const remotes = readRemotes()
    const idx = remotes.findIndex((r) => r.id === id)
    if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Password semantics: blank = keep existing (the client never sees it),
    // clearPassword = remove, non-empty = replace.
    const updated: RustDeskRemote = {
      ...remotes[idx],
      name: name.trim(),
      ...(peerId && typeof peerId === 'string' ? { peerId: peerId.trim() } : {}),
      ...(password ? { password } : {}),
      ...(group ? { group: group.trim() } : {}),
      ...(note ? { note: note.trim() } : {}),
    }
    if (clearPassword) delete updated.password
    if (!group) delete updated.group
    if (!note) delete updated.note
    remotes[idx] = updated
    writeRemotes(remotes)
    return NextResponse.json(toPublic(updated))
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAutheliaSession(req.headers.get('cookie')))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const remotes = readRemotes()
  const idx = remotes.findIndex((r) => r.id === id)
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  remotes.splice(idx, 1)
  writeRemotes(remotes)
  return NextResponse.json({ success: true })
}
