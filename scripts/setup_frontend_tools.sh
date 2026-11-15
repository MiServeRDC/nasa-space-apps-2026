#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "[ARES Frontend Setup] Root: $ROOT_DIR"

if ! command -v node >/dev/null 2>&1 || ! command -v npx >/dev/null 2>&1; then
  echo "[ERROR] Node.js and npx are required (v20+ recommended)." >&2
  exit 1
fi

if [[ "$(uname -s)" == "Darwin" ]]; then
  if [[ ! -d "/Applications/Google Chrome.app" ]]; then
    if command -v brew >/dev/null 2>&1; then
      echo "[Setup] Installing Google Chrome via Homebrew..."
      brew install --cask google-chrome
    else
      echo "[WARN] Google Chrome not found in /Applications and Homebrew unavailable." >&2
    fi
  else
    echo "[OK] Google Chrome detected in /Applications/Google Chrome.app"
  fi
fi

echo "[Setup] Installing ares-cockpit npm dependencies..."
(cd "$ROOT_DIR/ares-cockpit" && npm install)

echo "[Setup] Linting DESIGN.md with @google/design.md..."
npx -y @google/design.md lint "$ROOT_DIR/DESIGN.md"

echo "[Setup] Pre-warming MCP packages (chrome-devtools-mcp, shadcn, @magicuidesign/mcp)..."
npx -y chrome-devtools-mcp@latest --help >/dev/null 2>&1 || true
npx -y shadcn@latest --help >/dev/null 2>&1 || true
npx -y @magicuidesign/mcp@latest --help >/dev/null 2>&1 || true

echo "[OK] Frontend developer & agentic tools ready."
echo "     Antigravity plugin: .agents/plugins/frontend-design-kit/"
echo "     Cross-IDE MCP config: .mcp.json"
