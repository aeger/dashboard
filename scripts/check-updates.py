#!/usr/bin/env python3
"""
Check running podman containers for image updates AND network device firmware.
Writes results to data/updates.json for the dashboard widget.
Skips locally-built images (localhost/ prefix).
"""
import json, subprocess, sys, os
from datetime import datetime, timezone
from pathlib import Path

OUTPUT = Path('/home/almty1/dashboard/data/updates.json')
STATE_FILE = Path('/home/almty1/dashboard/data/update_state.json')
SSH_KEY_PROXMOX = Path.home() / '.ssh' / 'id_ed25519_proxmox'

# Containers to skip (locally built, no registry to check)
SKIP_PREFIXES = ('localhost/',)

def get_running_containers():
    result = subprocess.run(
        ['podman', 'ps', '--format', 'json'],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        return []
    containers = json.loads(result.stdout)
    return [
        {'name': c['Names'][0], 'image': c['Image']}
        for c in containers
        if not any(c['Image'].startswith(p) for p in SKIP_PREFIXES)
    ]

def get_local_digest(image):
    result = subprocess.run(
        ['podman', 'image', 'inspect', image, '--format', '{{index .RepoDigests 0}}'],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        return None
    digest = result.stdout.strip()
    return digest if '@sha256:' in digest else None

def get_remote_digest(image):
    """Pull image manifest without downloading layers using podman manifest inspect."""
    result = subprocess.run(
        ['podman', 'manifest', 'inspect', image],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode == 0:
        try:
            data = json.loads(result.stdout)
            # For manifest lists, get the first platform digest
            if 'manifests' in data:
                return data['manifests'][0].get('digest')
            return data.get('config', {}).get('digest')
        except Exception:
            pass
    return None

def check_update_via_pull(container_name, image):
    """
    Pull the image and compare the new ID with the running container's image ID.
    Returns True if an update was pulled.
    """
    # Get current image ID of running container
    result = subprocess.run(
        ['podman', 'inspect', container_name, '--format', '{{.Image}}'],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        return False
    current_id = result.stdout.strip()

    # Pull latest
    result = subprocess.run(
        ['podman', 'pull', '--quiet', image],
        capture_output=True, text=True, timeout=120
    )
    if result.returncode != 0:
        return False
    new_id = result.stdout.strip()

    return bool(new_id) and new_id != current_id

def check_proxmox_firmware():
    """Read Proxmox version via SSH. Returns dict with status and details."""
    try:
        result = subprocess.run(
            ['ssh', '-i', str(SSH_KEY_PROXMOX), '-o', 'ConnectTimeout=5',
             '-o', 'StrictHostKeyChecking=no', 'root@192.168.1.182',
             'pveversion -v | head -3'],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            lines = result.stdout.strip().split('\n')
            if lines:
                first = lines[0]
                if 'proxmox-ve:' in first:
                    version = first.split(':')[1].strip().split()[0]
                    return {
                        'device': 'MS-01 Proxmox',
                        'ip': '192.168.1.182',
                        'current_version': version,
                        'status': 'current',
                        'method': 'pveversion'
                    }
        return {
            'device': 'MS-01 Proxmox',
            'ip': '192.168.1.182',
            'status': 'error',
            'error': f'SSH returned {result.returncode}'
        }
    except subprocess.TimeoutExpired:
        return {
            'device': 'MS-01 Proxmox',
            'ip': '192.168.1.182',
            'status': 'unreachable',
            'error': 'SSH timeout'
        }
    except Exception as e:
        return {
            'device': 'MS-01 Proxmox',
            'ip': '192.168.1.182',
            'status': 'error',
            'error': str(e)
        }

def check_routeros_firmware():
    """Attempt to read RouterOS firmware via API port 8728. Returns list of devices."""
    devices = []
    for device_info in [
        {'device': 'RB5009UPr+S+in', 'ip': '192.168.1.1'},
        {'device': 'CRS309-1G-8S+in', 'ip': '192.168.99.248'},
    ]:
        try:
            result = subprocess.run(
                ['timeout', '3', 'bash', '-c',
                 f'exec 3<>/dev/tcp/{device_info["ip"]}/8728 && echo "ok" && exec 3>&-'],
                capture_output=True, text=True
            )
            if result.returncode == 0:
                devices.append({
                    'device': device_info['device'],
                    'ip': device_info['ip'],
                    'status': 'unreachable',
                    'error': 'API handshake timeout (auth required, credentials not accessible)'
                })
            else:
                devices.append({
                    'device': device_info['device'],
                    'ip': device_info['ip'],
                    'status': 'unreachable',
                    'error': 'Port 8728 not responding'
                })
        except Exception as e:
            devices.append({
                'device': device_info['device'],
                'ip': device_info['ip'],
                'status': 'error',
                'error': str(e)
            })
    return devices

def check_unifi_firmware():
    """Attempt to read UniFi device firmware. Returns list of devices."""
    devices = []
    for device_info in [
        {'device': 'U7 Pro XGS', 'ip': '192.168.1.246'},
        {'device': 'UniFi Express 7', 'ip': '192.168.1.194'},
    ]:
        try:
            result = subprocess.run(
                ['timeout', '3', 'curl', '-s', '-k',
                 f'https://{device_info["ip"]}:8443/api/system'],
                capture_output=True, text=True
            )
            if result.returncode == 0 and result.stdout:
                devices.append({
                    'device': device_info['device'],
                    'ip': device_info['ip'],
                    'status': 'current',
                    'method': 'unifi_controller'
                })
            else:
                devices.append({
                    'device': device_info['device'],
                    'ip': device_info['ip'],
                    'status': 'unreachable',
                    'error': 'HTTPS API not responding'
                })
        except Exception as e:
            devices.append({
                'device': device_info['device'],
                'ip': device_info['ip'],
                'status': 'error',
                'error': str(e)
            })
    return devices

def check_all_devices():
    """Check firmware versions on all network devices. Returns results dict."""
    devices = []
    print("Checking firmware on network devices...", flush=True)

    print("  Proxmox MS-01...", end=' ', flush=True)
    proxmox = check_proxmox_firmware()
    print(proxmox.get('status', 'error'))
    devices.append(proxmox)

    print("  RouterOS devices...", end=' ', flush=True)
    ros_devices = check_routeros_firmware()
    print(f"{len(ros_devices)} checked")
    devices.extend(ros_devices)

    print("  UniFi devices...", end=' ', flush=True)
    unifi_devices = check_unifi_firmware()
    print(f"{len(unifi_devices)} checked")
    devices.extend(unifi_devices)

    return {
        'checked_at': datetime.now(timezone.utc).isoformat(),
        'devices': devices
    }

def reconcile_flagged(results):
    """Clear `wren_flagged` once the update it was raised for is actually gone.

    Flagging a container hands it to Wren via the task queue, but nothing ever
    wrote the state back when that task completed — so the widget kept showing
    "flagged, not done" after the update had landed (traefik, 2026-08-21: two
    flags, two completed tasks, badge still red), and apply-updates.py skips any
    container in `wren_flagged`, quietly excluding it from future auto-updates
    as well.

    has_update here is ground truth: it is a real pull + image-ID comparison,
    not a claim. If it is False, whatever was flagged has been applied.
    """
    if not STATE_FILE.exists():
        return
    try:
        state = json.loads(STATE_FILE.read_text())
    except (json.JSONDecodeError, OSError) as e:
        print(f"  state reconcile skipped: {e}")
        return

    current = {r['name'] for r in results if not r['has_update']}
    cleared = []
    for name, entry in (state.get('containers') or {}).items():
        if entry.get('status') == 'wren_flagged' and name in current:
            entry['status'] = 'completed'
            entry['reconciled_at'] = datetime.now(timezone.utc).isoformat()
            entry['reconcile_note'] = 'Flag cleared: no update pending (image matches newest tag).'
            cleared.append(name)

    if cleared:
        STATE_FILE.write_text(json.dumps(state, indent=2) + '\n')
        print(f"  cleared stale wren_flagged: {cleared}")


def main():
    containers = get_running_containers()
    print(f"Checking {len(containers)} containers for updates...", flush=True)

    results = []
    for c in containers:
        name = c['name']
        image = c['image']
        print(f"  {name} ({image})...", end=' ', flush=True)
        try:
            has_update = check_update_via_pull(name, image)
            status = 'UPDATE' if has_update else 'current'
            print(status)
        except subprocess.TimeoutExpired:
            has_update = False
            print('timeout')
        except Exception as e:
            has_update = False
            print(f'error: {e}')

        results.append({
            'name': name,
            'image': image,
            'has_update': has_update,
        })

    device_results = check_all_devices()

    output = {
        'checked_at': datetime.now(timezone.utc).isoformat(),
        'containers': results,
        'devices': device_results['devices'],
        'devices_checked_at': device_results['checked_at'],
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, 'w') as f:
        json.dump(output, f, indent=2)

    reconcile_flagged(results)

    updates = [r for r in results if r['has_update']]
    print(f"\nDone. {len(updates)} container updates available: {[u['name'] for u in updates]}")
    unreachable = [d for d in device_results['devices'] if d['status'] in ('unreachable', 'error')]
    if unreachable:
        print(f"  {len(unreachable)} devices unreachable for firmware check")

if __name__ == '__main__':
    main()
