#!/usr/bin/env bash
# ==============================================================================
# Local Verification Script for ARES-Health (NASA Space Apps 2026)
# ==============================================================================
# Usage:
#   ./scripts/check_local.sh quick [crate]
#   ./scripts/check_local.sh full [crate]
# ==============================================================================

set -euo pipefail

MODE="${1:-}"
CRATE="${2:-}"

if [ -z "$MODE" ] || { [ "$MODE" != "quick" ] && [ "$MODE" != "full" ]; }; then
    echo "Usage: $0 {quick|full} [crate]"
    exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

run_safety_audit() {
    local target_glob="$1"
    python3 - "$target_glob" <<'PY'
import glob
import pathlib
import sys

pattern = sys.argv[1]
bad = []
for path_str in sorted(glob.glob(pattern, recursive=True)):
    p = pathlib.Path(path_str)
    if not p.is_file():
        continue
    txt = p.read_text(encoding="utf-8")
    prod = txt.split("#[cfg(test)]")[0]
    if "unsafe " in prod and "#![forbid(unsafe_code)]" not in txt:
        bad.append((path_str, "missing #![forbid(unsafe_code)] or raw unsafe"))
    for tok in (".unwrap()", ".expect("):
        for idx, line in enumerate(prod.splitlines(), 1):
            stripped = line.strip()
            if tok in stripped and not stripped.startswith("//"):
                bad.append((f"{path_str}:{idx}", f"forbidden {tok} in production code"))
if bad:
    print("[FAILED] Safety audit failed:")
    for loc, msg in bad:
        print(f"  {loc}: {msg}")
    sys.exit(1)
print(f"[PASSED] Zero-panic & safe-Rust audit passed for {pattern}")
PY
}

if [ "$MODE" = "quick" ]; then
    if [ -n "$CRATE" ]; then
        echo "[check_local] quick: $CRATE"
        cargo check -p "$CRATE" --all-targets
        cargo test -p "$CRATE" --lib
    else
        echo "[check_local] quick: workspace"
        cargo check --workspace --all-targets
        cargo test --workspace --lib
    fi
elif [ "$MODE" = "full" ]; then
    if [ -n "$CRATE" ]; then
        echo "[check_local] full: $CRATE"
        cargo clippy -p "$CRATE" --all-targets -- -D warnings
        cargo test -p "$CRATE" --no-fail-fast
        run_safety_audit "crates/$CRATE/src/**/*.rs"
    else
        echo "[check_local] full: workspace"
        cargo clippy --workspace --all-targets -- -D warnings
        cargo test --workspace --no-fail-fast
        run_safety_audit "crates/*/src/**/*.rs"
    fi
fi
