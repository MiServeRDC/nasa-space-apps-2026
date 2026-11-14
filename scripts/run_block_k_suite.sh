#!/usr/bin/env bash
set -euo pipefail

# ARES-MedOS Block K System Verification & NASA-STD-3001 Certification Runner
# Zero emojis allowed in script or output.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ares_block_k.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

WS_LOG="$TMP_DIR/workspace_tests.log"
BENCH_LOG="$TMP_DIR/release_bench.log"

echo "=================================================================="
echo "ARES-MedOS Block K Certification Suite (Phases 25-28)"
echo "Workspace: $ROOT_DIR"
echo "=================================================================="

echo ""
echo "[1/5] Running Deterministic Probe (--fast)..."
./scripts/agent_probe.sh --fast

echo ""
echo "[2/5] Running Full Workspace Test Suite (RUST_TEST_THREADS=1)..."
RUST_TEST_THREADS=1 cargo test --workspace -- --nocapture | tee "$WS_LOG"

echo ""
echo "[3/5] Running Phase 28 Release-Mode Latency & Memory Certification..."
RUST_TEST_THREADS=1 cargo test --release -p ares-desktop-os --test phase_28_k4_nasa_std_3001_bench -- --nocapture | tee "$BENCH_LOG"

echo ""
echo "[4/5] Running ARES-MedOS Launch & Packaging Verification..."
./scripts/launch_ares_medos.sh --verify

echo ""
echo "[5/5] Running Cockpit Frontend Lint & Production Build..."
npm --prefix ares-cockpit run lint
npm --prefix ares-cockpit run build

echo ""
echo "=================================================================="
echo "Block K Certification Summary"
echo "=================================================================="

python3 - "$WS_LOG" "$BENCH_LOG" <<'PY'
import re
import sys

ws_log_path, bench_log_path = sys.argv[1], sys.argv[2]

with open(ws_log_path, "r", encoding="utf-8", errors="replace") as f:
    ws_text = f.read()

with open(bench_log_path, "r", encoding="utf-8", errors="replace") as f:
    bench_text = f.read()

result_re = re.compile(
    r"test result: (\w+)\. (\d+) passed; (\d+) failed; (\d+) ignored; (\d+) measured; (\d+) filtered out"
)
matches = result_re.findall(ws_text)
total_passed = sum(int(m[1]) for m in matches)
total_failed = sum(int(m[2]) for m in matches)
total_ignored = sum(int(m[3]) for m in matches)
suites_count = len(matches)

print(f"Workspace Test Suites Executed : {suites_count}")
print(f"Workspace Tests Passed         : {total_passed}")
print(f"Workspace Tests Failed         : {total_failed}")
print(f"Workspace Tests Ignored        : {total_ignored}")

print("")
print("Phase 28 Release-Mode Latency & Memory Metrics:")
for line in bench_text.splitlines():
    idx = line.find("[RELEASE]")
    if idx != -1:
        print(f"  {line[idx:].strip()}")

if total_failed > 0 or suites_count == 0:
    sys.exit(1)
PY

echo ""
echo "Block K Certification Suite PASSED."
