#!/usr/bin/env bash
# ==============================================================================
# Verification probe for run_all_test_tiers.sh failure reporting and trap
# ==============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

REPORT_PATH="$TMP_DIR/TEST_REPORT.md"

# 1. Create a dummy initial PASSED report
cat << 'EOF' > "$REPORT_PATH"
# ARES-Health Master Test Execution & Software Verification Report
- **Verification Status:** ALL 7 TIERS PASSED (100% Deterministic Air-Gapped Verification)
EOF

# 2. Run a sandboxed copy of run_all_test_tiers.sh that fails at preflight exit 42
SANDBOX_RUNNER="$TMP_DIR/runner.sh"
cp "$ROOT_DIR/scripts/run_all_test_tiers.sh" "$SANDBOX_RUNNER"
chmod +x "$SANDBOX_RUNNER"

# In the sandbox script, point REPORT_MD to our test report and force an error at preflight
sed -i.bak "s|REPORT_MD=.*|REPORT_MD=\"$REPORT_PATH\"|" "$SANDBOX_RUNNER"
sed -i.bak "s|\./scripts/agent_probe.sh --fast|exit 42|" "$SANDBOX_RUNNER"

# Run sandbox runner expecting failure exit 42
set +e
bash "$SANDBOX_RUNNER" > /dev/null 2>&1
EXIT_CODE=$?
set -e

if [ $EXIT_CODE -ne 42 ]; then
    echo "ERROR: Expected sandbox runner to exit with 42, got $EXIT_CODE"
    exit 1
fi

# 3. Assert that the report was overwritten with FAILED status and exit code 42
if ! grep -q "Verification Status:\*\* FAILED" "$REPORT_PATH"; then
    echo "ERROR: Report still contains stale status!"
    cat "$REPORT_PATH"
    exit 1
fi

if ! grep -q "exited with code 42" "$REPORT_PATH"; then
    echo "ERROR: Report does not mention exit code 42!"
    cat "$REPORT_PATH"
    exit 1
fi

echo "PASS: Test runner lifecycle correctly records failure status and purges stale reports."
