#!/usr/bin/env bash
# ==============================================================================
# AGENT PROBE: Deterministic Verification Harness for ARES-Health (NASA Space Apps 2026)
# ==============================================================================
# Usage:
#   ./scripts/agent_probe.sh          # Default: fast checks (unwraps + JSON schema + docs + cargo if present)
#   ./scripts/agent_probe.sh --fast   # Fast checks
#   ./scripts/agent_probe.sh --test   # Fast checks + full test suite
#   ./scripts/agent_probe.sh --docs   # Verify Memory Bank, Dataset Traceability & Clean Root
#   ./scripts/agent_probe.sh --all    # Full battery of checks
# ==============================================================================

set -eo pipefail

MODE="fast"
if [ "${1:-}" == "--test" ]; then
    MODE="test"
elif [ "${1:-}" == "--docs" ]; then
    MODE="docs"
elif [ "${1:-}" == "--all" ]; then
    MODE="all"
elif [ "${1:-}" == "--fast" ] || [ -z "${1:-}" ]; then
    MODE="fast"
else
    echo "[ERROR] Unknown option: $1"
    echo "Usage: $0 [--fast|--test|--docs|--all]"
    exit 1
fi

echo "===================================================================="
echo "[Agent Probe] Executing ARES-Health Verification Probe (Mode: ${MODE})"
echo "===================================================================="

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ERRORS=0

# ------------------------------------------------------------------------------
# 1. Zero-Panic Strict Invariant Scan (Production Rust code in crates/*/src)
# ------------------------------------------------------------------------------
echo "[Probe 1/4] Scanning for prohibited .unwrap() and .expect() in production Rust code..."

if [ -d "crates" ]; then
    UNWRAP_VIOLATIONS=$(python3 -c "
import os
violations = []
for root, _, files in os.walk('crates'):
    parts = root.split(os.sep)
    if 'tests' in parts or 'benches' in parts or 'examples' in parts:
        continue
    if 'src' not in parts:
        continue
    for f in files:
        if f.endswith('.rs') and not f.endswith('_tests.rs') and not f.endswith('_test.rs'):
            path = os.path.join(root, f)
            with open(path) as fl:
                in_test = False
                for idx, line in enumerate(fl, 1):
                    if '#[cfg(test)]' in line or 'mod tests {' in line or '#[test]' in line:
                        in_test = True
                    if not in_test:
                        stripped = line.strip()
                        if ('.unwrap()' in stripped or '.expect(' in stripped) and not stripped.startswith('//'):
                            violations.append(f'{path}:{idx}: {stripped}')
for v in violations:
    print(v)
")
    if [ -n "$UNWRAP_VIOLATIONS" ]; then
        echo "[FAILED] Prohibited .unwrap() or .expect() found in production Rust crates:"
        echo "$UNWRAP_VIOLATIONS"
        ERRORS=$((ERRORS + 1))
    else
        echo "[PASSED] Zero .unwrap() or .expect() in crates/ production code."
    fi
fi

# ------------------------------------------------------------------------------
# 2. Single Source of Truth Telemetry Contract & BIDMC Dataset Checksum Validation
# ------------------------------------------------------------------------------
echo "[Probe 2/4] Validating contracts/telemetry_schema.json and data/bidmc/MANIFEST.json..."
if python3 -c "
import json, hashlib, os
schema = json.load(open('contracts/telemetry_schema.json'))
assert 'provenance_manifest' in schema['properties'], 'Missing provenance_manifest in telemetry_schema.json'
manifest = json.load(open('data/bidmc/MANIFEST.json'))
for rec in manifest['records']:
    path = os.path.join('data/bidmc', rec['file'])
    h = hashlib.sha256(open(path, 'rb').read()).hexdigest()
    assert h == rec['sha256'], f'SHA256 mismatch for {path}'
" 2>/dev/null; then
    echo "[PASSED] contracts/telemetry_schema.json and data/bidmc/ (3 CSVs + SHA-256 checksums) verified."
else
    echo "[FAILED] contracts/telemetry_schema.json or data/bidmc/ SHA-256 verification failed."
    ERRORS=$((ERRORS + 1))
fi

# ------------------------------------------------------------------------------
# 3. Cargo Workspace Check / Clippy / Tests (runs automatically once Cargo.toml exists)
# ------------------------------------------------------------------------------
if [ -d "vendor/lancedb" ]; then
    echo "[Probe] Verifying pinned LanceDB source and local-only patch..."
    if ! python3 scripts/verify_lancedb_vendor.py; then
        ERRORS=$((ERRORS + 1))
    fi
fi

if [ -f "Cargo.toml" ] && { [ "$MODE" == "fast" ] || [ "$MODE" == "test" ] || [ "$MODE" == "all" ]; }; then
    echo "[Probe 3/4] Running cargo check & clippy --workspace..."
    if ! cargo check --workspace --quiet; then
        echo "[FAILED] cargo check failed."
        ERRORS=$((ERRORS + 1))
    elif ! cargo clippy --quiet --workspace --all-targets -- -D warnings; then
        echo "[FAILED] cargo clippy reported warnings or errors."
        ERRORS=$((ERRORS + 1))
    else
        echo "[PASSED] Cargo check and Clippy passed with 0 warnings."
    fi

    if [ "$MODE" == "test" ] || [ "$MODE" == "all" ]; then
        echo "[Probe Test] Running cargo test --workspace..."
        if ! cargo test --workspace --quiet; then
            echo "[FAILED] Cargo test suite failed."
            ERRORS=$((ERRORS + 1))
        else
            echo "[PASSED] All Rust unit and integration tests passed."
        fi
    fi
else
    echo "[Probe 3/4] Cargo.toml not yet initialized (Design/Blueprint phase OK)."
fi

# ------------------------------------------------------------------------------
# 4. Memory Bank, Multi-Agency Dataset Dossier & Clean Root Verification
# ------------------------------------------------------------------------------
echo "[Probe 4/4] Verifying Memory Bank, Team Governance & NASA Dossier Integrity..."
REQUIRED_FILES=(
    "README.md"
    "AGENTS.md"
    "CLAUDE.md"
    "CONTRIBUTING.md"
    "LICENSE"
    "ARES_Health_Master_Architecture.md"
    "PANORAMICA_GENERALE_PROGETTO.md"
    "01_Medical_Physiological_Deep_Space_Foundations.md"
    "02_System_Architecture_and_Metrics.md"
    "03_Backend_Engine_and_Technology_Tradeoff.md"
    "04_Frontend_Astronaut_Cockpit_UX.md"
    "05_Official_NASA_Challenge_Brief_and_Resources.md"
    "11_Official_Submission_Guide_and_Ready_To_Paste_Form.md"
    "contracts/telemetry_schema.json"
    "docs/REFERENCES.md"
    "docs/architecture/CRATES_AND_MODULES_BLUEPRINT.md"
    "docs/team/TEAM_COORDINATION_AND_OWNERSHIP.md"
    "crates/README.md"
    "memory-bank/projectbrief.md"
    "memory-bank/systemPatterns.md"
    "memory-bank/techContext.md"
    "memory-bank/activeContext.md"
    "memory-bank/progress.md"
    "memory-bank/issuesBacklog.md"
    "memory-bank/experienceLog.md"
    ".agents/rules/rust-architecture.md"
    ".agents/rules/clinical-safety-and-privacy.md"
    ".agents/tool_guidance.md"
    ".github/CODEOWNERS"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo "[FAILED] Missing required governance or memory file: $file"
        ERRORS=$((ERRORS + 1))
    fi
done

if [ "$ERRORS" -eq 0 ]; then
    echo "[PASSED] All 29 required Memory Bank, Governance, and NASA Dossier files verified."
    echo "===================================================================="
    echo "[Agent Probe] ALL PROBES PASSED! Workspace is clean, safe, and ready."
    echo "===================================================================="
    exit 0
else
    echo "===================================================================="
    echo "[Agent Probe] FAILED with $ERRORS error(s). Fix before committing!"
    echo "===================================================================="
    exit 1
fi
