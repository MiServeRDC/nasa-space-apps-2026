# Edge Copilot: Local LLM Setup (Point 2)

The ARES copilot runs **fully offline** against a local LLM over loopback. There is
no cloud dependency. If no local server is reachable, the engine falls back to the
deterministic `OfflineTemplateCopilot` (`< 400 us`), so the cockpit never blocks.

## Data path

```
cockpit (OsCommandPalette / voice)
   -> POST http://127.0.0.1:8080/api/copilot/ask   (ares-server-cli, axum)
      -> execute_edge_copilot_turn (edge_llm_bridge.rs)
         -> StrictMcpSanitizer -> <=2 FastMCP tool rounds (8 read-only tools)
            -> POST {MACMINI_LLM_URL}/api/chat       (Ollama)  [default]
               or /v1/chat/completions               (llama.cpp)
         -> Gate 1-3 + Issue #11 post-generation verification
```

## Configuration (env, read by `EdgeLlmConfig::default`)

| Variable | Default | Meaning |
| :--- | :--- | :--- |
| `MACMINI_LLM_URL` | `http://127.0.0.1:11434` | LLM endpoint URL |
| `ARES_LLM_MODEL` | `llama3.2:3b-instruct-q4_K_M` | model tag the copilot requests |
| `ARES_LLM_PROTOCOL` | `ollama` | `ollama` or `llamacpp` wire protocol |
| `ARES_ALLOW_HABITAT_LAN` | `0` | allow an RFC1918 LAN endpoint (e.g. Mac mini node) |

Hard limits enforced in code: end-to-end turn `<= 2500 ms`, max 2 tool rounds,
closed allowlist of 8 read-only tools, loopback-only unless LAN is explicitly allowed.

## Quick start (Ollama)

```bash
# one-time: install + pull model + smoke test
scripts/setup_edge_copilot.sh

# or a different model
ARES_LLM_MODEL=qwen2.5:3b-instruct-q4_K_M scripts/setup_edge_copilot.sh

# run the engine so the copilot uses it
ARES_LLM_MODEL=qwen2.5:3b-instruct-q4_K_M cargo run --bin ares-server-cli
```

Manual equivalent:

```bash
curl -fsSL https://ollama.com/install.sh | sh     # install
ollama serve &                                    # start daemon (127.0.0.1:11434)
ollama pull llama3.2:3b-instruct-q4_K_M           # download weights
cargo run --bin ares-server-cli                   # start ARES engine
```

## Alternative: llama.cpp (OpenAI-compatible)

```bash
# start llama-server on a port, serving a GGUF model
llama-server -m ./your-model.gguf --host 127.0.0.1 --port 8081

ARES_LLM_PROTOCOL=llamacpp \
MACMINI_LLM_URL=http://127.0.0.1:8081 \
ARES_LLM_MODEL=your-model \
  cargo run --bin ares-server-cli
```

## Dedicated LAN compute node (habitat Mac mini)

```bash
ARES_ALLOW_HABITAT_LAN=1 \
MACMINI_LLM_URL=http://192.168.1.50:11434 \
ARES_LLM_MODEL=llama3.2:3b-instruct-q4_K_M \
  cargo run --bin ares-server-cli
```

## Verify end-to-end

```bash
curl -fsS http://127.0.0.1:8080/api/copilot/ask \
  -H 'Content-Type: application/json' \
  --data-binary '{"query":"summarize current crew cardiovascular status","role":"Cmo"}'
```

A non-template answer with populated tool evidence confirms the local LLM path is
live. If the LLM is down, the response is still valid (deterministic template) and
the cockpit keeps working.
