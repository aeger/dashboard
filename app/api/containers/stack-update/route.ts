import { NextRequest, NextResponse } from 'next/server'
import { sshExec } from '@/lib/ssh-exec'

// Stack = one compose directory that contains multiple dependent services
export const STACK_DEFINITIONS: Record<string, { path: string; containers: string[]; label: string }> = {
  immich: {
    path: '/home/almty1/azlab/services/immich',
    label: 'Immich',
    containers: ['immich-server', 'immich-machine-learning', 'immich-redis', 'immich-postgres'],
  },
  monitoring: {
    path: '/home/almty1/azlab/services/monitoring',
    label: 'Monitoring',
    containers: ['prometheus', 'grafana', 'node_exporter', 'cadvisor', 'blackbox', 'snmp_exporter', 'podman_exporter'],
  },
  rustdesk: {
    path: '/home/almty1/azlab/services/rustdesk',
    label: 'RustDesk',
    containers: ['hbbs', 'hbbr'],
  },
  dashboard: {
    path: '/home/almty1/dashboard',
    label: 'Dashboard',
    containers: ['az-dashboard', 'uptime-kuma'],
  },
}

// This route runs inside az-dashboard, which is itself part of the `dashboard`
// stack. Recreating that stack kills the process serving this request, so it is
// dispatched detached and reported as "started" rather than awaited.
const SELF_STACK = 'dashboard'

// Return which stack a container belongs to (null if standalone)
export function getContainerStack(name: string): string | null {
  for (const [stackName, def] of Object.entries(STACK_DEFINITIONS)) {
    if (def.containers.includes(name)) return stackName
  }
  return null
}

export async function GET() {
  return NextResponse.json({ stacks: STACK_DEFINITIONS })
}

type ContainerOutcome = {
  name: string
  outcome: 'updated' | 'unchanged' | 'failed' | 'absent'
  oldImage?: string
  newImage?: string
  state?: string
}

/**
 * Build the host-side update script.
 *
 * `podman-compose up -d` alone CANNOT apply an image update. podman-compose
 * 1.0.6 decides whether to recreate by comparing the compose file's YAML hash
 * against each container's io.podman.compose.config-hash label — a freshly
 * pulled image does not change the YAML, so the hashes match, nothing is torn
 * down, the subsequent `podman run` fails on "name already in use", and it
 * falls back to `start` on the OLD container. Exit code 0, zero change.
 *
 * The working method (same one scripts/apply-updates.py uses per container) is
 * to remove the containers first, then let `up -d` create them against the new
 * image — and then to VERIFY by image ID rather than trusting the exit code.
 */
function buildUpdateScript(path: string, containers: string[]): string {
  const names = containers.join(' ')
  return [
    'set -u',
    // Non-interactive SSH does not set this, and rootless podman + `systemctl
    // --user` both need it.
    'export XDG_RUNTIME_DIR="/run/user/$(id -u)"',
    `cd '${path}' || { echo "ERR cd-failed"; exit 20; }`,
    // Only touch containers that actually exist; a stack definition may list
    // services that are not deployed on this host.
    'present=""',
    `for c in ${names}; do podman container exists "$c" && present="$present $c"; done`,
    'for c in $present; do echo "PRE $c $(podman inspect "$c" --format \'{{.Image}}\' 2>/dev/null | cut -c1-12)"; done',
    // podman-compose echoes the full `podman run` invocation — including -e
    // secrets — to stdout. Its output must never leave the host.
    'podman-compose pull >/dev/null 2>&1 || echo "WARN pull-nonzero"',
    'if [ -n "$present" ]; then podman rm -f --depend $present >/dev/null 2>&1; fi',
    'podman-compose up -d >/dev/null 2>&1; rc=$?',
    `for c in ${names}; do`,
    '  id=$(podman inspect "$c" --format \'{{.Image}}\' 2>/dev/null | cut -c1-12)',
    '  st=$(podman inspect "$c" --format \'{{.State.Status}}\' 2>/dev/null)',
    '  echo "POST $c $id|$st"',
    'done',
    'echo "RC $rc"',
    // Refresh updates.json so the widget stops advertising an update that has
    // just been applied, instead of waiting up to 6h for the next timer run.
    'systemctl --user --no-block start dashboard-update-check.service >/dev/null 2>&1 || true',
  ].join('\n')
}

function parseOutcomes(output: string, containers: string[]): { results: ContainerOutcome[]; rc: number } {
  const pre = new Map<string, string>()
  const post = new Map<string, { id: string; state: string }>()
  let rc = -1

  for (const line of output.split('\n')) {
    const t = line.trim()
    if (t.startsWith('PRE ')) {
      const [, name, id] = t.split(' ')
      if (name) pre.set(name, id || '')
    } else if (t.startsWith('POST ')) {
      const [, name, rest] = t.split(' ')
      const [id, state] = (rest || '').split('|')
      if (name) post.set(name, { id: id || '', state: state || '' })
    } else if (t.startsWith('RC ')) {
      rc = parseInt(t.slice(3), 10)
    }
  }

  const results: ContainerOutcome[] = containers.map((name) => {
    const before = pre.get(name)
    const after = post.get(name)
    if (!before && !after?.id) return { name, outcome: 'absent' }
    if (!after?.id || after.state !== 'running') {
      return { name, outcome: 'failed', oldImage: before, newImage: after?.id, state: after?.state || 'missing' }
    }
    if (before && after.id !== before) {
      return { name, outcome: 'updated', oldImage: before, newImage: after.id, state: after.state }
    }
    return { name, outcome: 'unchanged', oldImage: before, newImage: after.id, state: after.state }
  })

  return { results, rc }
}

export async function POST(req: NextRequest) {
  try {
    const { stackName } = await req.json()

    if (!stackName || typeof stackName !== 'string' || !/^[a-z0-9-]+$/.test(stackName)) {
      return NextResponse.json({ error: 'Invalid stack name' }, { status: 400 })
    }

    const stack = STACK_DEFINITIONS[stackName]
    if (!stack) {
      return NextResponse.json({ error: `Unknown stack: ${stackName}` }, { status: 404 })
    }

    const script = buildUpdateScript(stack.path, stack.containers)
    // base64 so the script survives the SSH command line without quoting games
    const b64 = Buffer.from(script, 'utf-8').toString('base64')
    const scriptPath = `/tmp/stack-update-${stackName}.sh`
    const stage = `echo '${b64}' | base64 -d > ${scriptPath}`

    if (stackName === SELF_STACK) {
      // Detach: this stack contains the container serving the request, so the
      // response could never be delivered if we waited for it.
      try {
        // Stage in the foreground, then detach — `A && B &` would background the
        // staging too and leave the script racing its own file.
        await sshExec(
          `${stage} && (setsid nohup bash ${scriptPath} >/dev/null 2>&1 </dev/null &) ; echo STARTED`,
          30_000,
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ error: `Stack update failed to start: ${msg}` }, { status: 500 })
      }
      return NextResponse.json({
        success: true,
        detached: true,
        stack: stackName,
        message: 'Dashboard stack is recreating — this page will drop briefly.',
      })
    }

    let output: string
    try {
      output = await sshExec(`${stage} && bash ${scriptPath}`, 480_000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: `Stack update failed: ${msg}` }, { status: 500 })
    }

    const { results, rc } = parseOutcomes(output, stack.containers)
    const updated = results.filter((r) => r.outcome === 'updated')
    const failed = results.filter((r) => r.outcome === 'failed')
    const unchanged = results.filter((r) => r.outcome === 'unchanged')

    // rc is podman-compose's own exit code; a non-zero rc with every container
    // back up is not worth failing the request over, but a down container is.
    const success = failed.length === 0
    const summary = failed.length
      ? `${updated.length} updated, ${failed.length} failed to come back up`
      : updated.length
        ? `${updated.length} updated, ${unchanged.length} already current`
        : `No new images — all ${unchanged.length} already current`

    return NextResponse.json(
      {
        success,
        stack: stackName,
        summary,
        rc,
        results,
        containers: stack.containers,
      },
      { status: success ? 200 : 500 },
    )
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
