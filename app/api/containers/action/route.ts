import { NextRequest, NextResponse } from 'next/server'
import { containerAction, type ContainerAction } from '@/lib/portainer'

const VALID_ACTIONS: ContainerAction[] = ['start', 'stop', 'restart']

export async function POST(req: NextRequest) {
  try {
    const { endpointId, containerId, action } = await req.json()

    if (!endpointId || !containerId || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const ok = await containerAction(endpointId, containerId, action)
    if (!ok) {
      return NextResponse.json({ error: 'Action failed' }, { status: 502 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
