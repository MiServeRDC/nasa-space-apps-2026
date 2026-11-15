#!/bin/sh
set -eu
case "${PORT:-8080}" in ''|*[!0-9]*) echo 'PORT must be numeric' >&2; exit 2 ;; esac
exec /app/bin/ares-server-cli --mode ws-only --bind "0.0.0.0:${PORT:-8080}" \
  --frontend-dir /app/frontend --data-dir /app/data/bidmc --source recorded-replay
