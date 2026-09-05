#!/usr/bin/env bash
# Deploy dashboard: rebuild image and restart container, in place.
# ~/dashboard is the single source-of-truth + build context (consolidated
# 2026-06-23; the old rsync to ~/azlab/services/dashboard was removed).
# data/ is a bind-mounted runtime dir (./data), not rebuilt here.
set -euo pipefail

cd "$HOME/dashboard"

img() { podman images localhost/az-dashboard:latest --format '{{.ID}}' 2>/dev/null | head -1; }

before="$(img)"

echo "[deploy] Building image..."
# podman compose build can exit 0 without producing a new image (observed
# 2026-08-21: deploy reported Done while the container kept running a
# three-week-old image, so the fix appeared deployed but was not). The image ID
# check below is the actual pass/fail signal — never trust the exit code alone.
podman compose build --no-cache

after="$(img)"
if [ -z "$after" ]; then
  echo "[deploy] FAILED: no localhost/az-dashboard:latest image after build" >&2
  exit 1
fi
if [ -n "$before" ] && [ "$before" = "$after" ]; then
  echo "[deploy] FAILED: build exited 0 but the image ID did not change ($after)." >&2
  echo "[deploy] The old image is still deployed. Re-run the build and check its output." >&2
  exit 1
fi
echo "[deploy] Image $before -> $after"

echo "[deploy] Restarting container..."
# Output goes to a root-only log, NOT the terminal or journal: podman-compose
# echoes the full `podman run` line for every service, including every -e
# secret (API keys, tokens, DB creds).
LOG="${TMPDIR:-/tmp}/dashboard-deploy.log"
umask 077
podman compose down  >"$LOG" 2>&1
podman compose up -d >>"$LOG" 2>&1

running="$(podman ps --filter name=az-dashboard --format '{{.ImageID}}' | head -1)"
if [ "${running:0:12}" != "${after:0:12}" ]; then
  echo "[deploy] FAILED: container is running image ${running:-none}, expected $after" >&2
  echo "[deploy] compose output: $LOG" >&2
  exit 1
fi

echo "[deploy] Done — az-dashboard running $after (compose output: $LOG)"
