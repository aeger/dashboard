#!/usr/bin/env bash
# Deploy dashboard: rebuild image and restart container, in place.
# ~/dashboard is the single source-of-truth + build context (consolidated
# 2026-06-23; the old rsync to ~/azlab/services/dashboard was removed).
# data/ is a bind-mounted runtime dir (./data), not rebuilt here.
set -e

cd "$HOME/dashboard"

echo "[deploy] Building image..."
podman compose build --no-cache

echo "[deploy] Restarting container..."
podman compose down
podman compose up -d

echo "[deploy] Done."
