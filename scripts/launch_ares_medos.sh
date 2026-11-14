#!/usr/bin/env bash
# ==============================================================================
# ARES-MedOS Unified Mission Workstation Launcher (Phases 21-24 / Block J)
# ==============================================================================
# Supports:
#   ./scripts/launch_ares_medos.sh --desktop [--rebuild]
#   ./scripts/launch_ares_medos.sh --web
#   ./scripts/launch_ares_medos.sh --verify
# Also accepts `--mode desktop`, `--mode ws-browser`, `--mode verify`.
# ==============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ACTION=""
REBUILD=0

while [ $# -gt 0 ]; do
    case "$1" in
        --desktop)
            ACTION="desktop"
            shift
            ;;
        --web|--ws-browser)
            ACTION="web"
            shift
            ;;
        --verify)
            ACTION="verify"
            shift
            ;;
        --mode)
            if [ $# -lt 2 ]; then
                echo "[ERROR] --mode requires an argument (desktop | ws-browser | verify)" >&2
                exit 1
            fi
            case "$2" in
                desktop) ACTION="desktop" ;;
                ws-browser|web) ACTION="web" ;;
                verify) ACTION="verify" ;;
                *)
                    echo "[ERROR] Unknown mode: $2" >&2
                    exit 1
                    ;;
            esac
            shift 2
            ;;
        --rebuild)
            REBUILD=1
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--desktop [--rebuild] | --web | --verify | --mode <desktop|ws-browser|verify>]"
            exit 0
            ;;
        *)
            echo "[ERROR] Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

if [ -z "$ACTION" ]; then
    echo "Usage: $0 [--desktop [--rebuild] | --web | --verify | --mode <desktop|ws-browser|verify>]" >&2
    exit 1
fi

case "$ACTION" in
    desktop)
        echo "[ARES-MedOS] Preparing frontend bundle in ares-cockpit/dist..."
        if [ "$REBUILD" -eq 1 ] || [ ! -d "$ROOT_DIR/ares-cockpit/dist" ]; then
            if [ -d "$ROOT_DIR/ares-cockpit/node_modules" ]; then
                npm --prefix "$ROOT_DIR/ares-cockpit" run build
            else
                echo "[ARES-MedOS] node_modules missing; running desktop smoke test in headless mode."
                exec cargo run -p ares-desktop-os -- --mode desktop-smoke-test
            fi
        fi
        echo "[ARES-MedOS] Launching native workstation shell..."
        exec cargo run -p ares-desktop-os -- --mode desktop
        ;;

    web)
        echo "[ARES-MedOS] Launching ares-server-cli (127.0.0.1:8080) and Vite cockpit (127.0.0.1:5173)..."
        SERVER_PID=""
        UI_PID=""
        cleanup() {
            if [ -n "$UI_PID" ]; then
                kill "$UI_PID" 2>/dev/null || true
            fi
            if [ -n "$SERVER_PID" ]; then
                kill "$SERVER_PID" 2>/dev/null || true
            fi
        }
        trap cleanup INT TERM EXIT

        cargo run -p ares-server-cli -- --mode ws-only &
        SERVER_PID=$!
        npm --prefix "$ROOT_DIR/ares-cockpit" run dev &
        UI_PID=$!
        wait "$SERVER_PID" "$UI_PID"
        ;;

    verify)
        echo "[ARES-MedOS] Verifying Tier B/C manifests in deploy/medos/..."
        python3 - <<'PY'
import json
import pathlib
import re

toml_loader = None
try:
    import tomllib  # type: ignore
    toml_loader = tomllib.load
except ModuleNotFoundError:
    try:
        import tomli  # type: ignore
        toml_loader = tomli.load
    except ModuleNotFoundError:
        toml_loader = None

def fallback_validate_toml(path: pathlib.Path, required_keys: list[str]) -> None:
    text = path.read_text(encoding="utf-8")
    for idx, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("[") and not line.endswith("]"):
            raise AssertionError(f"{path}:{idx}: malformed TOML header: {line}")
        if not line.startswith("[") and "=" not in line and not line.endswith(",") and not line.endswith("]"):
            raise AssertionError(f"{path}:{idx}: expected key = value in TOML: {line}")
    for key in required_keys:
        if not re.search(rf"(?m)^{re.escape(key)}\s*=|^\[{re.escape(key)}\]", text):
            raise AssertionError(f"{path}: missing required TOML section/key: {key}")

root = pathlib.Path(".")
required = {
    "deploy/medos/asterinas_framekernel_kiosk.toml": [
        "kernel",
        "arinc653_partitions.telemetry_ingest",
        "arinc653_partitions.medops_ui_shell",
    ],
    "deploy/medos/hubris_wearable_app.toml": [
        "firmware",
        "tasks.supervisor",
        "tasks.ble_tx",
    ],
}
for toml_name, req_keys in required.items():
    p = root / toml_name
    assert p.is_file(), f"Missing manifest: {toml_name}"
    if toml_loader is not None:
        with p.open("rb") as fh:
            toml_loader(fh)
        print(f"[PASSED] TOML syntax valid (tomllib): {toml_name}")
    else:
        fallback_validate_toml(p, req_keys)
        print(f"[PASSED] TOML structure valid (stdlib fallback): {toml_name}")

ron_path = root / "deploy/medos/cosmic_wayland_kiosk.ron"
assert ron_path.is_file(), "Missing deploy/medos/cosmic_wayland_kiosk.ron"
ron_text = ron_path.read_text(encoding="utf-8")
assert "SingleWorkspaceKiosk" in ron_text and "org.areshealth.medos" in ron_text
print("[PASSED] RON descriptor valid: deploy/medos/cosmic_wayland_kiosk.ron")

tauri_conf = root / "crates/ares-desktop-os/tauri.conf.json"
assert tauri_conf.is_file(), "Missing crates/ares-desktop-os/tauri.conf.json"
conf = json.loads(tauri_conf.read_text(encoding="utf-8"))
assert "default-src 'self'" in conf["app"]["security"]["csp"]
print("[PASSED] Tauri CSP configuration valid: crates/ares-desktop-os/tauri.conf.json")
PY
        echo "[ARES-MedOS] Running agent_probe.sh --fast..."
        ./scripts/agent_probe.sh --fast
        echo "[ARES-MedOS] Running desktop smoke test..."
        cargo run -p ares-desktop-os -- --mode desktop-smoke-test
        if [ -d "$ROOT_DIR/ares-cockpit/node_modules" ]; then
            echo "[ARES-MedOS] Running ares-cockpit lint..."
            npm --prefix "$ROOT_DIR/ares-cockpit" run lint
        fi
        echo "[ARES-MedOS] Verification completed cleanly."
        ;;
esac
