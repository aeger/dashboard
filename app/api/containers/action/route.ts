import { NextRequest, NextResponse } from 'next/server'
import { containerAction, type ContainerAction } from '@/lib/portainer'

const VALID_ACTIONS: ContainerAction[] = ['start', 'stop', 'restart']
const CONTAINER_ID_RE = /^[a-f0-9]{12,64}$/

async function isAuthenticated(req: NextRequest): Promise<boolean> {
  const cookie = req.headers.get('cookie') || ''
  if (!cookie.includes('authelia_session')) return false
  try {
    const res = await fetch('https://auth.az-lab.dev/api/state', { headers: { cookie } })
    const data = await res.json()
    return (data.data?.authentication_level ?? 0) > 0
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { endpointId, containerId, action } = await req.json()

    if (typeof endpointId !== 'number' || !Number.isInteger(endpointId) || endpointId < 1) {
      return NextResponse.json({ error: 'Invalid endpointId' }, { status: 400 })
    }

    if (typeof containerId !== 'string' || !CONTAINER_ID_RE.test(containerId)) {
      return NextResponse.json({ error: 'Invalid containerId' }, { status: 400 })
    }

    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
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
