# LanceDB local-only build qualification

Date: 2026-11-15. Baseline: main `e39312f`; branch `fix/lancedb-local-build`.
This follow-up resolves the optional compilation blocker recorded in
[the frontend/backend qualification](FINAL_INTEGRATION_QUALIFICATION.md).
All verification ran locally on macOS Apple Silicon, without hosted Actions.

## Diagnosis and correction

The baseline build reproduced two E0599 errors in published LanceDB 0.40.0:
`src/job.rs:102,112` used `Error::Http` even though `remote` was off. A checked-in
patch gates those two arms and uses the existing Runtime fallback locally. It does
not enable remote/cloud SDK features or change dependency versions. Crates.io
LanceDB is replaced with its verified published source plus this small patch;
original checksums, exact delta, upstream attribution and Apache-2.0 license are
recorded in [the dependency note](../dependencies/LANCEDB_LOCAL_PATCH.md).
One upstream doc-comment line also has decorative icons removed to comply with
repository formatting. Both modified files carry explicit modification notices.

After the SDK could compile, four E0277 errors exposed an ARES adapter problem:
LanceDB's `Scannable` requires `Box<dyn RecordBatchReader + Send>`, while the adapter
passed a boxed concrete iterator. Both telemetry and POCUS create/append paths now
perform that explicit type erasure. No physical/model constants or clinical
policies changed.

The fast probe now verifies the vendor file set, hashes, recorded source delta and
reconstruction of both modified original files. There are no edits to the Cargo
registry, global compiler overrides or implicit patching at build time.

## Results

| Local check | Outcome |
| --- | --- |
| Original optional dependency build | Failed as reproduced: 2 E0599 errors |
| New local-only persistence regression tests | 3 passed |
| Same 3 tests under a macOS sandbox denying all network operations | 3 passed |
| Workspace tests with all ARES features, serial execution | 334 passed; 0 failed/ignored |
| Clippy, workspace/all features/all targets, warnings denied for workspace crates | Passed |
| Default workspace tests, serial execution | 326 passed; 0 failed/ignored |
| Vendor verification / required fast probe | Passed |

`cargo tree` confirmed `lancedb 0.40.0 features=[]` and `lance 13.0.0 features=[]`
when ARES `lancedb-warm` is enabled. Vendor remains a dependency rather than a
workspace member, as with the original registry crate. Application `--all-features`
does not activate all upstream SDK features.

The new tests use actual temporary local directories and the real SDK/adapter:

1. Write nullable telemetry, drop/reopen the connection and read it directly with
   the SDK. Append through a reopened adapter and confirm both rows remain.
   The HRV Arrow null bitmap remains intact; HR is present.
2. Refuse remote storage URI roots before connection.
3. Create and append a POCUS table and directly read the rows, preserving
   `PROCEDURAL_BMODE_SIMULATION` and `ILLUSTRATIVE_UNVALIDATED` provenance.

Direct SDK reads are intentional: existing adapter read/search placeholders must
not make persistence verification pass accidentally. The network-denied run used
`/usr/bin/sandbox-exec` with `(version 1)(allow default)(deny network*)` against the
compiled regression-test executable. It exercised all three tests successfully.

## Reproduction and artifacts

Use the commands in [the dependency note](../dependencies/LANCEDB_LOCAL_PATCH.md).
The three regressions are in
`crates/ares-storage-lsah/tests/lancedb_local_build.rs`; they compile only when the
optional feature is enabled. The verifier is `scripts/verify_lancedb_vendor.py`.
For an offline rerun after dependencies are cached, add `--offline --locked`.

Machine-local logs stay outside git under `/tmp/ares-lancedb-qualification/`:
`baseline-build.log`, `all-features-tests.log`, `all-features-clippy.log`,
`default-tests.log`, `network-denied-test.log`, `features.txt` and `fast-probe.log`.
No telemetry databases or debug executables are committed.

## Remaining boundaries

- Default production runtime still uses Arrow IPC/Zstd/HNSW. Optional feature
  compilation does not change backend selection or complete the experimental
  LanceDB adapter: trait-level reads/search, durability reporting, restart-safe
  sequence metadata and actual replacement/upsert semantics need their own work.
- The upstream local-only build emits 15 dead-code warnings. They are not
  suppressed or confused with failures of workspace Clippy. On this Mac, linking
  the large debug regression executable also emitted an `__eh_frame` compact-unwind
  size warning; tests ran successfully. This is not a release size/performance
  qualification or a fix for the earlier load-sensitive 150-us timing test.
- Tests establish build compatibility and actual local persistence for the covered
  write paths. They do not certify clinical models, acquisition hardware, the
  native GUI, long-duration storage behavior or compatibility of future SDK
  upgrades. The default Arrow runtime qualification remains separate.
