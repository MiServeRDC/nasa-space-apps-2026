---
name: context7
description: Real-time API documentation retrieval for fast-evolving Rust crates and frontend libraries (axum, tokio, petgraph, serde, three.js, react-three-fiber, MCP SDK). Prevents hallucinations of deprecated methods.
triggers:
  - fetch documentation
  - check crate API
  - axum websocket docs
  - petgraph docs
  - react-three-fiber docs
  - context7 query
  - verify function signature
---

# Context7: Real-Time API Documentation Lookup (ARES-Health)

Use this skill whenever working with fast-evolving Rust crates (`axum`, `tokio`, `petgraph`, `serde_json`, `thiserror`, `chacha20poly1305`) or frontend packages (`@react-three/fiber`, `@react-three/drei`, `three`, `tailwindcss`) to verify exact method signatures and struct fields without guessing.

## 1. Quick Reference Workflow

The `ctx7` CLI is invoked via `npx ctx7`:

### Step 1: Resolve Library Identifier
```bash
npx ctx7 library axum "websocket upgrade handler"
npx ctx7 library petgraph "directed graph node weight edge weight"
npx ctx7 library react-three-fiber "useFrame mesh material"
```

### Step 2: Query Targeted Documentation
```bash
npx ctx7 docs /tokio-rs/axum "extract ws WebSocketUpgrade"
npx ctx7 docs /petgraph/petgraph "Graph StableGraph add_node add_edge"
```

## 2. Best Practices for Coding Agents
1. **Never Guess Unstable APIs:** If a method signature in `axum` (e.g., `axum::extract::ws::Message`) or `petgraph` fails to compile, query `npx ctx7` or local `cargo doc` immediately rather than trying random variations.
2. **Offline Fallback:** If running in an offline environment, inspect local crate docs via `cargo doc --no-deps --open` or inspect `~/.cargo/registry/src/`.
