# LanceDB 0.40.0 local-only build patch

The optional `lancedb-warm` adapter depends on the embedded SDK with
`default-features = false`. In the published 0.40.0 package, `src/job.rs` constructs
`Error::Http` in two typed-result decoding arms even though that variant, reqwest
error conversion and HTTP status type are gated on `remote` in `src/error.rs`.
This fails before ARES itself can compile.

## Chosen correction

The workspace patches crates.io `lancedb` to `vendor/lancedb`, which is excluded
from workspace membership. The dependency version and all its existing Cargo
feature settings remain unchanged; no cloud, embeddings or remote transport
features are enabled. The exact published crate is preserved, with two
`#[cfg(feature = "remote")]` arm guards and `None` to `_` fallbacks in `src/job.rs`.
A doc-comment line in `src/lib.rs` also removes decorative icons to follow the
repository formatting rule; its library/integration names are unchanged and its
original contents/hashes remain recorded as escaped JSON.
The existing Runtime errors handle the local build. When `remote` is enabled by
a separate consumer, the original HTTP branch still precedes the fallback.

Modified files carry explicit ARES modification notices; original SPDX attribution
is retained.

The small executable-source diff is
[lancedb-0.40.0-local-only.patch](lancedb-0.40.0-local-only.patch).
The full package is kept so Cargo builds from a stable, reviewable local source.
Git marks it as vendored and preserves its original whitespace; hashes, rather
than ARES formatting rules, verify unchanged upstream bytes. The separate patch
file retains standard unified-diff context spaces.
We do not edit `~/.cargo/registry`, inject global rustc flags or run a patch script
as an implicit build step. Removing the root `[patch.crates-io]` and vendor source
returns to the published dependency. Do that only after an upstream release has
been checked to compile without remote and preserve Arrow/Lance compatibility.

Once the SDK compiles, the ARES adapter also needs explicit
`Box<dyn RecordBatchReader + Send>` coercion for both table-create and append
operations: `Scannable` is implemented for that trait object, not a generic
`Box<RecordBatchIterator<_>>`. Both telemetry and POCUS write paths use it.

## Provenance and license

- Published package:
  [lancedb 0.40.0](https://crates.io/crates/lancedb/0.40.0).
- Verified package SHA-256 (from the pre-patch Cargo.lock):
  `078c80d326ec656d53247ca8647222dab4707b623e795a4a2de1d1063ff78e88`.
- Upstream commit recorded in the package's `.cargo_vcs_info.json`:
  [b1b080b97c3edd2fd9f2aae8a3b71ff19487b1f8](https://github.com/lancedb/lancedb/tree/b1b080b97c3edd2fd9f2aae8a3b71ff19487b1f8/rust/lancedb).
- Upstream license is **Apache-2.0**, not an ARES relicense. The archive does not
  include its root LICENSE; `vendor/lancedb/LICENSE` is the original repository
  LICENSE retrieved at that exact commit. Source SPDX headers remain intact.
- `lancedb-0.40.0-source.json` records the original file hashes, patched job hash,
  license origin/hash and package checksum. `scripts/verify_lancedb_vendor.py`
  checks every file, rejects unexpected/missing files and verifies that reversing
  the recorded delta reconstructs the original published job.rs.

The crates.io version list has no 0.40.x patch release. Simply upgrading is not an
established fix: the
[0.41 Rust local example documentation](https://github.com/lancedb/lancedb/blob/v0.41.0/docs/web-tests/blob-v2/README.md)
explicitly requests `remote` to compile that checkout. This narrowly scoped patch
avoids coupling the build repair to an unrelated dependency-stack migration.

## Repeat local verification

```bash
export CARGO_TARGET_DIR="$PWD/target"
python3 scripts/verify_lancedb_vendor.py
cargo check -p ares-storage-lsah --features lancedb-warm --locked
cargo test -p ares-storage-lsah --features lancedb-warm --test lancedb_local_build --locked
cargo test --workspace --all-features --locked -- --test-threads=1
cargo clippy --workspace --all-features --all-targets --locked -- -D warnings
bash scripts/agent_probe.sh --fast
```

Inspect activated SDK features with `cargo tree -e features -p ares-storage-lsah
--features lancedb-warm --locked`. The vendor is a dependency, not a workspace
member: local workspace lint policies are not retroactively imposed on all
upstream sources. Upstream local-only dead-code warnings may be emitted.

## Scope boundary

This repairs compilation and qualifies real local writes/reopen reads through the
SDK. The default mission runtime still opens Arrow IPC/Zstd/HNSW; enabling a Cargo
feature does not silently replace the runtime backend. The optional LanceDB adapter
is **experimental, not production parity**: its trait-level telemetry reads and
POCUS search currently return empty vectors, flush is a no-op, sequence tracking
resets on reopen, byte counts are estimates, and POCUS writes append rather than
replace an existing signature ID. These pre-existing adapter limitations are not
fixed or concealed by this compilation repair. The regression test reads persisted
rows directly through the SDK so a stub cannot make it pass accidentally.
