# LanceDB local-only compilation repair

Baseline: main e39312f. Work branch: fix/lancedb-local-build. Local checks only.

## Problem and evidence

`lancedb 0.40.0` unconditionally constructs `Error::Http` in two typed-job decode
branches, while the variant and its dependency types exist only with `remote`.
ARES intentionally uses `default-features = false`. Enabling remote would add an
unneeded cloud transport surface; changing global rustc flags or registry files
would be non-reproducible. Crates.io offers no 0.40.x patch release. Current
0.41 documentation still explicitly enables remote for its local Rust example,
so a broad Arrow/Lance upgrade is not evidence of a local-only repair.

## Implementation and review

1. Reproduce and retain the compiler error outside the repository.
2. Preserve the published 0.40.0 crate in a clearly isolated vendor directory,
   verify the original archive SHA-256 against Cargo.lock, retain its license,
   and document exact upstream commit and a minimal reviewable source diff.
   Normalize the single decorative-icon doc-comment line to the repository
   formatting rule, recording and verifying that separate nonfunctional delta.
3. Patch the two HTTP-only match arms with their existing remote feature gate;
   use the existing runtime-error fallback otherwise. Keep dependency features
   disabled. Register a root Cargo patch and exclude vendor from workspace
   membership. Do not modify the Cargo registry or enable external services.
4. Verify vendor provenance and the allowed source delta deterministically.
   Exercise actual local database creation, a real write, reopening and direct
   reading of persisted records; reject remote paths in the ARES adapter.
5. Compile/test/lint the feature-enabled workspace and the default workspace.
   Add a local command for repeating the optional build check. Preserve existing
   clinical behavior and default Arrow backend.
6. Record any adapter limitations independently: compile success must not imply
   that currently stubbed adapter read/search/flush/restart methods are complete.
   Do not silently substitute empty query results as evidence of persistence.
7. Update Memory Bank and the qualification report; run the required local fast
   probe, commit the isolated correction, and report scope and remaining limits.

Sources: published lancedb 0.40.0 src/job.rs and src/error.rs;
https://github.com/lancedb/lancedb/tree/b1b080b97c3edd2fd9f2aae8a3b71ff19487b1f8/rust/lancedb
and https://github.com/lancedb/lancedb/blob/v0.41.0/docs/web-tests/blob-v2/README.md.
