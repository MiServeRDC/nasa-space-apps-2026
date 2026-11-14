---
name: rust-pro
description: Advanced Safe Rust systems engineering, zero-copy concurrency patterns, strict memory safety, lifetime management, Tokio asynchronous runtime, and lock-free data structures.
triggers:
  - rust memory safety
  - zero-copy optimization
  - crossbeam lock-free
  - tokio async thread isolation
  - avoid clones in rust
  - high-performance rust
  - cargo clippy
---

# Rust Pro: Memory Safety, Zero-Copy & Concurrency Patterns

This skill equips the agent with idiomatic, high-performance systems engineering practices for Rust (2021/2024 edition). It guarantees that real-time telemetry buffers, mathematical graphs, and Signal Temporal Logic monitors operate without memory leaks, lock contention, or unnecessary heap allocations.

## 1. Core Directives & Memory Safety Invariants

### A. Zero-Copy & Telemetry Ingestion
- **Never Clone Raw Byte Payloads:** Forbids `Vec::clone` or `.to_vec()` on high-frequency waveform buffers or telemetry streams.
- **Atomic Reference Counting (`Arc`):** Pass read-only continuous memory blocks wrapped in `Arc<RwLock<MissionState>>`.
- **Preallocated Memory Pools:** Use lock-free circular ring buffers to recycle memory blocks rather than repeatedly calling allocation routines.
- **Zero-Copy Conversions:** Convert between slices and boxed arrays using zero-copy transfers (`into_boxed_slice()` and `Box::into_vec()`).

### B. Concurrency & Thread Isolation
- **Lock-Free Passing:** Use bounded crossbeam channels or atomics for inter-thread communication.
- **Never Block Tokio Worker Threads:**
  - Fast async I/O, network sockets, and JSON-RPC run on `tokio`.
  - Heavy CPU-bound computations (differential equation integration, ODE solvers) must run inside `tokio::task::spawn_blocking` or dedicated background workers.
- **Minimal Lock Scopes:** Prefer `parking_lot::RwLock` or short-lived read locks over `std::sync::Mutex` to prevent lock poisoning and reduce latency overhead.

### C. Error Handling Rigor
- **Zero Panics in Production Pipeline:**
  - Forbidden: `.unwrap()`, `.expect()`, `panic!()` in production modules (`telemetry`, `graph`, `stl`, `playbooks`, `mcp`).
  - Allowed: Exclusively inside unit tests (`#[cfg(test)]`).
- **Typed Domain Errors:** Use `thiserror` for library modules and internal crates.
- **Binary Context:** Use `anyhow::Result` and `.context("...")` in CLI binaries and server entry points.

## 2. Clippy & Compiler Verification Workflow
Whenever generating or refactoring Rust code, verify with:
```bash
cargo check --workspace
cargo test --workspace -- --nocapture
cargo clippy --workspace -- -D warnings
```
