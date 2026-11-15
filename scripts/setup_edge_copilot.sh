#!/usr/bin/env bash
#
# setup_edge_copilot.sh - Provision the local Edge LLM for the ARES-Health copilot.
#
# The ARES copilot (`/api/copilot/ask`, `/api/copilot/stream`) talks to a LOCAL
# Ollama (or llama.cpp) server over loopback. No cloud, fully air-gapped. If the
# server is unreachable, the engine falls back cleanly to the deterministic
# OfflineTemplateCopilot, so this script only needs to run when you want real
# LLM answers.
#
# Usage:
#   scripts/setup_edge_copilot.sh                 # pull default model + verify
#   ARES_LLM_MODEL=qwen2.5:3b-instruct-q4_K_M scripts/setup_edge_copilot.sh
#
# Env overrides honored by the engine (crates/ares-server-cli edge_llm_bridge.rs):
#   MACMINI_LLM_URL      endpoint URL        (default http://127.0.0.1:11434)
#   ARES_LLM_MODEL       model tag to pull   (default llama3.2:3b-instruct-q4_K_M)
#   ARES_LLM_PROTOCOL    ollama | llamacpp   (default ollama)
#   ARES_ALLOW_HABITAT_LAN=1  allow an RFC1918 LAN endpoint (e.g. Mac mini node)

set -euo pipefail

MODEL="${ARES_LLM_MODEL:-llama3.2:3b-instruct-q4_K_M}"
URL="${MACMINI_LLM_URL:-http://127.0.0.1:11434}"

echo "ARES Edge Copilot setup"
echo "  endpoint : ${URL}"
echo "  model    : ${MODEL}"
echo

if ! command -v ollama >/dev/null 2>&1; then
  echo "ERROR: 'ollama' not found on PATH."
  echo "Install it (https://ollama.com/download), e.g.:"
  echo "  curl -fsSL https://ollama.com/install.sh | sh"
  exit 1
fi

# Ensure the daemon is up (loopback only).
if ! curl -fsS "${URL}/api/tags" >/dev/null 2>&1; then
  echo "Ollama daemon not responding at ${URL}; starting 'ollama serve' in background..."
  nohup ollama serve >/tmp/ares_ollama.log 2>&1 &
  for _ in $(seq 1 30); do
    curl -fsS "${URL}/api/tags" >/dev/null 2>&1 && break
    sleep 1
  done
fi

echo "Pulling model '${MODEL}' (one-time download)..."
ollama pull "${MODEL}"

echo
echo "Smoke test..."
curl -fsS "${URL}/api/chat" \
  -H 'Content-Type: application/json' \
  --data-binary "$(printf '{"model":"%s","messages":[{"role":"user","content":"reply with the single word READY"}],"stream":false}' "${MODEL}")" \
  | grep -qi "ready" && echo "OK: model responded." || {
    echo "WARN: model did not return expected content; check /tmp/ares_ollama.log"
  }

echo
echo "Done. Start the engine so it uses this model:"
echo "  ARES_LLM_MODEL=${MODEL} cargo run --bin ares-server-cli"
echo "The cockpit copilot (OsCommandPalette / voice) will now hit ${URL} via /api/copilot/ask."
