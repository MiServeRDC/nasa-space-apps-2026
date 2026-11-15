#!/bin/sh
# No development runtime is needed once this script is inside the native bundle.
set -eu
ARES_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ARES_BINARY="$ARES_ROOT/bin/ares-server-cli"
ARES_FRONTEND="$ARES_ROOT/frontend"
ARES_PORT=${ARES_PORT:-18080}
case "$ARES_PORT" in ''|*[!0-9]*) echo 'ARES_PORT must be numeric' >&2; exit 2 ;; esac
if [ "$ARES_PORT" -lt 1 ] || [ "$ARES_PORT" -gt 65535 ]; then echo 'Invalid port' >&2; exit 2; fi
if [ ! -x "$ARES_BINARY" ] || [ ! -f "$ARES_FRONTEND/index.html" ]; then
    echo 'This launcher belongs in a built judges bundle. See docs/submission/JUDGES_START_HERE.md.' >&2
    exit 2
fi
if curl --silent --max-time 1 "http://127.0.0.1:$ARES_PORT/healthz" >/dev/null 2>&1; then
    echo "Port $ARES_PORT is already in use; choose another ARES_PORT." >&2; exit 1
fi
ARES_LOG_DIR=$(mktemp -d "${TMPDIR:-/tmp}/ares-judge.XXXXXX")
ARES_CHILD_PID=
cleanup() {
    if [ -n "$ARES_CHILD_PID" ]; then kill -INT "$ARES_CHILD_PID" 2>/dev/null || true; wait "$ARES_CHILD_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT
trap 'exit 0' INT TERM
"$ARES_BINARY" --mode ws-only --bind "127.0.0.1:$ARES_PORT" --source recorded-replay \
    --data-dir "$ARES_ROOT/data/bidmc" --frontend-dir "$ARES_FRONTEND" > "$ARES_LOG_DIR/server.log" 2>&1 &
ARES_CHILD_PID=$!
ARES_ATTEMPT=0
until curl --fail --silent --max-time 1 "http://127.0.0.1:$ARES_PORT/healthz" > /dev/null; do
    if ! kill -0 "$ARES_CHILD_PID" 2>/dev/null; then cat "$ARES_LOG_DIR/server.log" >&2; exit 1; fi
    ARES_ATTEMPT=$((ARES_ATTEMPT + 1))
    if [ "$ARES_ATTEMPT" -gt 100 ]; then echo "Startup timed out; see $ARES_LOG_DIR/server.log" >&2; exit 1; fi
    sleep 0.1
done
printf 'ARES-Health: http://127.0.0.1:%s\nKeep this window open. Press Ctrl+C to stop. Logs: %s/server.log\n' "$ARES_PORT" "$ARES_LOG_DIR"
if [ "${ARES_NO_BROWSER:-0}" != 1 ] && command -v open >/dev/null 2>&1; then open "http://127.0.0.1:$ARES_PORT"; fi
wait "$ARES_CHILD_PID"
