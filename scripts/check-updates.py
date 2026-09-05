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
SSH_KEY_MIKROTIK = Path.home() / '.ssh' / 'id_ed25519_mikrotik'

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

def _ros_ssh(ip, command):
    """Run one RouterOS command over SSH. Returns stdout, or None if it failed."""
    result = subprocess.run(
        ['ssh', '-i', str(SSH_KEY_MIKROTIK), '-o', 'ConnectTimeout=5',
         '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no',
         f'Claude@{ip}', command],
        capture_output=True, text=True, timeout=20
    )
    return result.stdout if result.returncode == 0 else None


def _ros_field(text, key):
    """Pull `key: value` out of RouterOS print output."""
    for line in (text or '').splitlines():
        if f'{key}:' in line:
            return line.split(f'{key}:', 1)[1].strip()
    return None


def check_routeros_firmware():
    """Read RouterOS firmware over SSH (key: id_ed25519_mikrotik).

    Both MikroTiks accept the same ed25519 key. The previous implementation only
    TCP-probed API port 8728 and reported 'unreachable' on BOTH branches, so a
    healthy router and a dead one produced the same verdict and no version was
    ever recovered. `/system/package/update/print` gives installed vs latest, so
    the router does the upgrade-available comparison for us.
    """
    devices = []
    for device_info in [
        {'device': 'RB5009UPr+S+in', 'ip': '192.168.1.1'},
        {'device': 'CRS309-1G-8S+in', 'ip': '192.168.99.248'},
    ]:
        entry = {'device': device_info['device'], 'ip': device_info['ip']}
        try:
            upd = _ros_ssh(device_info['ip'], '/system/package/update/print')
            if upd is None:
                entry.update({'status': 'unreachable',
                              'error': 'SSH failed (host down or key not authorized)'})
                devices.append(entry)
                continue

            installed = _ros_field(upd, 'installed-version')
            latest = _ros_field(upd, 'latest-version')

            if not installed:
                res = _ros_ssh(device_info['ip'], '/system/resource/print')
                installed = (_ros_field(res, 'version') or '').split()[0] or None

            if not installed:
                entry.update({'status': 'error',
                              'error': 'SSH ok but version not parsed from RouterOS output'})
            else:
                entry['current_version'] = installed
                entry['method'] = 'ssh'
                if latest and latest != installed:
                    entry['latest_version'] = latest
                    entry['status'] = 'update'
                else:
                    entry['status'] = 'current'
            devices.append(entry)
        except subprocess.TimeoutExpired:
            entry.update({'status': 'unreachable', 'error': 'SSH timeout'})
            devices.append(entry)
        except Exception as e:
            entry.update({'status': 'error', 'error': str(e)})
            devices.append(entry)
    return devices

def check_unifi_firmware():
    """Report UniFi device firmware state.

    These APs expose only SSH (dropbear) to this host — 80/443/8443/8843 are all
    closed, so the old `https://IP:8443/api/system` probe could never have
    succeeded and its 'HTTPS API not responding' reason was misleading. UniFi
    firmware is served by the Network controller, not by the AP itself, and no
    controller credentials exist here. Distinguish "device down" from "device up,
    no queryable API" so the reason stays true.
    """
    devices = []
    for device_info in [
        {'device': 'U7 Pro XGS', 'ip': '192.168.1.246'},
        {'device': 'UniFi Express 7', 'ip': '192.168.1.194'},
    ]:
        entry = {'device': device_info['device'], 'ip': device_info['ip']}
        try:
            up = subprocess.run(['ping', '-c', '1', '-W', '2', device_info['ip']],
                                capture_output=True, text=True, timeout=8).returncode == 0
            if up:
                entry.update({
                    'status': 'unknown',
                    'error': 'Device reachable but exposes no queryable API '
                             '(SSH only); firmware requires UniFi controller credentials',
                })
            else:
                entry.update({'status': 'unreachable', 'error': 'No response to ping'})
            devices.append(entry)
        except Exception as e:
            entry.update({'status': 'error', 'error': str(e)})
            devices.append(entry)
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
    fw_updates = [d for d in device_results['devices'] if d['status'] == 'update']
    if fw_updates:
        print(f"  {len(fw_updates)} device firmware updates available: "
              f"{[d['device'] for d in fw_updates]}")
    unreachable = [d for d in device_results['devices'] if d['status'] in ('unreachable', 'error')]
    if unreachable:
        print(f"  {len(unreachable)} devices unreachable for firmware check")
    unknown = [d for d in device_results['devices'] if d['status'] == 'unknown']
    if unknown:
        print(f"  {len(unknown)} devices up but not queryable: {[d['device'] for d in unknown]}")

if __name__ == '__main__':
    main()
