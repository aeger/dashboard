#!/usr/bin/env python3
"""
Auto-apply container updates based on risk threshold policy.
Run from systemd timer during maintenance window (default 03:00-04:00 UTC).

Behavior by risk:
  patch/rebuild  → auto-apply during maintenance window (or if status=scheduled)
  minor/unknown  → send Discord notification once, set status=notified
  major          → skip entirely (use "Flag for Wren" button in dashboard)
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

UPDATES_FILE = Path('/home/almty1/azlab/services/dashboard/data/updates.json')
STATE_FILE   = Path('/home/almty1/azlab/services/dashboard/data/update_state.json')

DISCORD_TOKEN   = os.environ.get('DISCORD_BOT_TOKEN', '')
DISCORD_CHANNEL = os.environ.get('DISCORD_CHANNEL_ID', '')

RISK_ORDER = ['patch', 'rebuild', 'minor', 'major', 'unknown']


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def in_maintenance_window(policy: dict) -> bool:
    now = utcnow()
    def parse(t): return list(map(int, t.split(':')))
    sh, sm = parse(policy.get('auto_update_window_start', '03:00'))
    eh, em = parse(policy.get('auto_update_window_end',   '04:00'))
    cur = now.hour * 60 + now.minute
    return (sh * 60 + sm) <= cur < (eh * 60 + em)


def risk_within_threshold(risk: str, threshold: str) -> bool:
    try:
        return RISK_ORDER.index(risk) <= RISK_ORDER.index(threshold)
    except ValueError:
        return False


def discord(msg: str) -> None:
    if not DISCORD_TOKEN or not DISCORD_CHANNEL:
        print(f'[discord] {msg}')
        return
    subprocess.run(
        ['curl', '-s', '-X', 'POST',
         f'https://discord.com/api/v10/channels/{DISCORD_CHANNEL}/messages',
         '-H', f'Authorization: Bot {DISCORD_TOKEN}',
         '-H', 'Content-Type: application/json',
         '-d', json.dumps({'content': msg})],
        capture_output=True,
    )


def apply_update(container: str, image: str) -> tuple[bool, str, str | None, str | None]:
    """Pull + recreate via podman-compose. `podman restart` keeps the old image
    binding, so a true update requires recreating the container.
    Returns (success, old_digest, new_digest, error)."""
    r = subprocess.run(['podman', 'inspect', container, '--format', '{{.Image}}'],
                       capture_output=True, text=True)
    old_digest = (r.stdout.strip() or 'unknown')[:16]

    r = subprocess.run(['podman', 'inspect', container, '--format', '{{json .Config.Labels}}'],
                       capture_output=True, text=True)
    if r.returncode != 0:
        return False, old_digest, None, f'Inspect failed: {r.stderr.strip()}'
    try:
        labels = json.loads(r.stdout) or {}
    except json.JSONDecodeError as e:
        return False, old_digest, None, f'Could not parse labels: {e}'

    working_dir = labels.get('com.docker.compose.project.working_dir')
    service     = labels.get('com.docker.compose.service')
    if not working_dir or not service:
        return False, old_digest, None, 'Container missing compose labels — cannot recreate'

    r = subprocess.run(['podman-compose', 'pull', service],
                       capture_output=True, text=True, timeout=300, cwd=working_dir)
    if r.returncode != 0:
        return False, old_digest, None, f'Pull failed: {(r.stderr or r.stdout).strip()[:300]}'

    r = subprocess.run(
        ['podman-compose', 'up', '-d', '--no-deps', '--force-recreate', service],
        capture_output=True, text=True, timeout=180, cwd=working_dir,
    )
    if r.returncode != 0:
        return False, old_digest, None, f'Recreate failed: {(r.stderr or r.stdout).strip()[:300]}'

    r = subprocess.run(['podman', 'inspect', container, '--format', '{{.Image}}'],
                       capture_output=True, text=True)
    new_digest = (r.stdout.strip() or 'unknown')[:16] if r.returncode == 0 else None

    r = subprocess.run(['podman', 'inspect', container, '--format', '{{.State.Status}}'],
                       capture_output=True, text=True)
    status = r.stdout.strip() if r.returncode == 0 else 'unknown'
    if status != 'running':
        return False, old_digest, new_digest, f'Container not running after update (status: {status})'

    if new_digest and new_digest == old_digest:
        return False, old_digest, new_digest, 'Image digest unchanged after recreate — pull may have hit cached tag'

    return True, old_digest, new_digest, None


def main() -> None:
    if not UPDATES_FILE.exists():
        print('No updates.json, exiting.')
        return

    updates_data = json.loads(UPDATES_FILE.read_text())
    state_data   = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() \
                   else {'containers': {}, 'global_policy': {}}

    policy    = state_data.get('global_policy', {})
    threshold = policy.get('auto_risk_threshold', 'patch')
    in_window = in_maintenance_window(policy)

    print(f'Maintenance window: {"YES" if in_window else "NO"} | threshold: {threshold}')

    containers_with_updates = {
        c['name']: c
        for c in updates_data.get('containers', [])
        if c.get('has_update')
    }

    applied  : list[str] = []
    notified : list[str] = []

    for name, info in containers_with_updates.items():
        state       = state_data['containers'].get(name, {})
        user_status = state.get('status', 'pending_review')
        risk        = state.get('risk', 'unknown')
        image       = info.get('image', '')

        # Skip if already handled
        if user_status in ('ignored', 'completed', 'wren_flagged', 'failed'):
            print(f'  {name}: skipping (status={user_status})')
            continue

        # "Update Now" — explicit user request, apply immediately regardless of window or risk
        if user_status == 'requested':
            print(f'  {name}: user-requested update, applying now...', flush=True)
            start  = utcnow()
            ok, old_d, new_d, err = apply_update(name, image)
            elapsed = (utcnow() - start).total_seconds()
            state_data['containers'][name] = {
                **state,
                'status':      'completed' if ok else 'failed',
                'started_at':  start.isoformat(),
                **({'completed_at': utcnow().isoformat()} if ok else {'failed_at': utcnow().isoformat()}),
                'last_result': {
                    'success':          ok,
                    'old_digest':       old_d,
                    'new_digest':       new_d,
                    'duration_seconds': round(elapsed, 1),
                    'error':            err,
                },
            }
            if ok:
                print(f'    ✓ done in {elapsed:.1f}s')
                applied.append(name)
                discord(f'✅ **Updated** `{name}` (user-requested)\nDuration: {elapsed:.1f}s')
            else:
                print(f'    ✗ failed: {err}')
                discord(f'❌ **Update failed** — `{name}`\nError: {err}')
            continue

        # "Schedule overnight" — user explicitly approved, apply during the
        # maintenance window regardless of risk (the schedule click IS the
        # approval). Without this branch, scheduled containers with
        # risk=minor/unknown fall through to the notify branch below and
        # silently get reset to status=notified, so the schedule never fires.
        if user_status == 'scheduled':
            sched_str = state.get('scheduled_time')
            sched_ready = True
            if sched_str:
                try:
                    sched_dt = datetime.fromisoformat(sched_str.replace('Z', '+00:00'))
                    sched_ready = utcnow() >= sched_dt - timedelta(minutes=15)
                except ValueError:
                    pass
            if not (in_window and sched_ready):
                print(f'  {name}: scheduled, waiting (window={in_window}, ready={sched_ready})')
                continue
            print(f'  {name}: applying scheduled update...', flush=True)
            start  = utcnow()
            ok, old_d, new_d, err = apply_update(name, image)
            elapsed = (utcnow() - start).total_seconds()
            state_data['containers'][name] = {
                **state,
                'status':      'completed' if ok else 'failed',
                'started_at':  start.isoformat(),
                **({'completed_at': utcnow().isoformat()} if ok else {'failed_at': utcnow().isoformat()}),
                'last_result': {
                    'success':          ok,
                    'old_digest':       old_d,
                    'new_digest':       new_d,
                    'duration_seconds': round(elapsed, 1),
                    'error':            err,
                },
            }
            if ok:
                print(f'    ✓ done in {elapsed:.1f}s')
                applied.append(name)
                discord(f'✅ **Updated** `{name}` (scheduled)\nDuration: {elapsed:.1f}s')
            else:
                print(f'    ✗ failed: {err}')
                discord(f'❌ **Scheduled update failed** — `{name}`\nError: {err}')
            continue

        # Major: skip — dashboard "Flag for Wren" button handles these
        if risk == 'major':
            print(f'  {name}: major risk, skipping (use Flag for Wren)')
            continue

        # Minor / unknown: notify Jeff once
        if risk in ('minor', 'unknown'):
            print(f'  {name}: {risk} risk — sending notification')
            target_ver = state.get('target_version', 'unknown')
            discord(
                f'⚠️ **Container update needs review** — `{name}` ({risk.upper()} risk)\n'
                f'Image: `{image}`  |  New version: `{target_ver}`\n'
                f'Approve or schedule in the dashboard: https://home.az-lab.dev/lab/containers'
            )
            state_data['containers'][name] = {
                **state,
                'status': 'notified',
                'notified_at': utcnow().isoformat(),
            }
            notified.append(name)
            continue

        # Patch / rebuild: auto-apply during window
        if risk_within_threshold(risk, threshold):
            if in_window:
                print(f'  {name}: applying {risk} update...', flush=True)
                start   = utcnow()
                ok, old_d, new_d, err = apply_update(name, image)
                elapsed = (utcnow() - start).total_seconds()

                state_data['containers'][name] = {
                    **state,
                    'status':       'completed' if ok else 'failed',
                    'started_at':   start.isoformat(),
                    **(  {'completed_at': utcnow().isoformat()} if ok
                       else {'failed_at': utcnow().isoformat()} ),
                    'last_result': {
                        'success':           ok,
                        'old_digest':        old_d,
                        'new_digest':        new_d,
                        'duration_seconds':  round(elapsed, 1),
                        'error':             err,
                    },
                }
                if ok:
                    print(f'    ✓ done in {elapsed:.1f}s')
                    applied.append(name)
                else:
                    print(f'    ✗ failed: {err}')
                    discord(f'❌ **Auto-update failed** — `{name}`\nError: {err}')
            else:
                print(f'  {name}: outside window, skipping')
        else:
            print(f'  {name}: risk {risk} exceeds threshold {threshold}, skipping')

    STATE_FILE.write_text(json.dumps(state_data, indent=2) + '\n')

    # Mark applied containers as has_update=false in updates.json so the UI
    # stops counting them in the "needs update" totals immediately, instead of
    # waiting for the next daily check-updates run to refresh the snapshot.
    if applied:
        applied_set = set(applied)
        for c in updates_data.get('containers', []):
            if c.get('name') in applied_set:
                c['has_update'] = False
        UPDATES_FILE.write_text(json.dumps(updates_data, indent=2) + '\n')

    if applied:
        discord(
            f'✅ **Auto-updated {len(applied)} container(s)** during maintenance window:\n'
            + '\n'.join(f'• `{n}`' for n in applied)
        )
    if notified:
        print(f'Notified Jeff about {len(notified)} updates needing review.')

    print(f'\nDone: {len(applied)} applied, {len(notified)} notified.')


if __name__ == '__main__':
    main()
