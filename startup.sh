#!/usr/bin/env bash
# SENTINEL startup — starts FastAPI + 3 pollers with auto-restart
#
# Usage:
#   export NASA_FIRMS_MAP_KEY=...
#   export PALANTIR_HOST=...
#   export PALANTIR_TOKEN=...
#   ./startup.sh
#
# Optional overrides:
#   PORT=8000           FastAPI listen port (default: 8000)
#   LOG_DIR=/var/log/sentinel
#   PYTHON=python3

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────────
PORT="${PORT:-8000}"
LOG_DIR="${LOG_DIR:-/var/log/sentinel}"
PYTHON="${PYTHON:-python3}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESTART_DELAY=5

# ── Setup ──────────────────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"
export PYTHONPATH="$REPO_DIR"
export PORT

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] SENTINEL starting (PORT=$PORT, LOG_DIR=$LOG_DIR)"

# Warn about missing env vars (don't abort — backend stubs handle missing keys)
for var in NASA_FIRMS_MAP_KEY PALANTIR_HOST PALANTIR_TOKEN; do
    if [[ -z "${!var:-}" ]]; then
        echo "WARNING: $var is not set" >&2
    fi
done

# ── Auto-restart wrapper ───────────────────────────────────────────────────────
# Runs <cmd...> in a loop; restarts after RESTART_DELAY seconds on exit/crash.
# All output (stdout + stderr) is tee'd to $LOG_DIR/<name>.log.
run_forever() {
    local name="$1"
    shift
    local logfile="$LOG_DIR/${name}.log"

    while true; do
        echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [$name] Starting: $*" | tee -a "$logfile"
        "$@" >> "$logfile" 2>&1 || true
        echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [$name] Exited. Restarting in ${RESTART_DELAY}s..." \
            | tee -a "$logfile"
        sleep "$RESTART_DELAY"
    done
}

# ── Wait for FastAPI to be ready ───────────────────────────────────────────────
wait_for_api() {
    local max_attempts=60  # 60 s total
    local attempt=0
    until curl -sf "http://localhost:${PORT}/api/status" > /dev/null 2>&1; do
        attempt=$((attempt + 1))
        if [[ $attempt -ge $max_attempts ]]; then
            echo "FastAPI did not become ready within ${max_attempts}s — aborting pollers" >&2
            exit 1
        fi
        sleep 1
    done
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] FastAPI ready on :${PORT}"
}

# ── Launch services ────────────────────────────────────────────────────────────

# 1. FastAPI (includes DB init via lifespan)
run_forever fastapi \
    "$PYTHON" -m uvicorn backend.main:app \
    --host 0.0.0.0 \
    --port "$PORT" \
    --workers 1 \
    --log-level info &

# 2. Pollers — start only after FastAPI accepts requests
(
    wait_for_api

    run_forever firms-poller "$PYTHON" -m backend.pollers.firms &
    run_forever usgs-poller  "$PYTHON" -m backend.pollers.usgs  &
    run_forever wind-poller  "$PYTHON" -m backend.pollers.wind  &

    # Wait for all 3 poller loops (runs until parent is killed)
    wait
) &

# ── Keep parent alive (traps SIGINT/SIGTERM for clean shutdown) ────────────────
trap 'echo "SENTINEL shutting down..."; kill 0; exit 0' SIGINT SIGTERM

wait
