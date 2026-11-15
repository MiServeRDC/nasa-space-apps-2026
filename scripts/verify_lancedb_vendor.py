#!/usr/bin/env python3
"""Verify the local LanceDB source and its single permitted upstream patch offline."""
import difflib
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENDOR = ROOT / 'vendor/lancedb'
DOCS = ROOT / 'docs/dependencies'
manifest = json.loads((DOCS / 'lancedb-0.40.0-source.json').read_text())
expected = {**manifest['original_files'], **manifest['patched_files']}
expected.update({p: item['sha256'] for p, item in manifest['supplemental_files'].items()})
actual = {p.relative_to(VENDOR).as_posix() for p in VENDOR.rglob('*') if p.is_file()}
if actual != set(expected):
    raise SystemExit(f'Vendor file set mismatch: missing={set(expected) - actual}, extra={actual - set(expected)}')
for relative, digest in expected.items():
    p = VENDOR / relative
    if p.is_symlink() or hashlib.sha256(p.read_bytes()).hexdigest() != digest:
        raise SystemExit(f'Vendor source mismatch: {relative}')
patched = (VENDOR / 'src/job.rs').read_text()
http_arm = '            #[cfg(feature = "remote")]\n            Some(request_id) => Error::Http {'
if patched.count(http_arm) != 2 or patched.count('            _ => Error::Runtime {') != 2:
    raise SystemExit('The two gated typed-job error arms have changed')
original = patched.replace(manifest['modification_notices']['src/job.rs'], '', 1).replace(http_arm, '            Some(request_id) => Error::Http {').replace(
    '            _ => Error::Runtime {', '            None => Error::Runtime {')
if hashlib.sha256(original.encode()).hexdigest() != manifest['original_files']['src/job.rs']:
    raise SystemExit('The patch does not reconstruct the original published job.rs')
delta = ''.join(difflib.unified_diff(original.splitlines(keepends=True), patched.splitlines(keepends=True),
    fromfile='a/src/job.rs', tofile='b/src/job.rs'))
if delta != (DOCS / 'lancedb-0.40.0-local-only.patch').read_text():
    raise SystemExit('The recorded patch differs from the actual source delta')
for relative, replacements in manifest.get('documentation_normalizations', {}).items():
    original_doc = (VENDOR / relative).read_text().replace(manifest['modification_notices'][relative], '', 1)
    for item in replacements:
        if original_doc.count(item['after']) != 1:
            raise SystemExit(f'Documentation normalization differs: {relative}')
        original_doc = original_doc.replace(item['after'], item['before'], 1)
    if hashlib.sha256(original_doc.encode()).hexdigest() != manifest['original_files'][relative]:
        raise SystemExit(f'Documentation delta does not reconstruct the original: {relative}')
print(f'Verified {len(expected)} vendor files; only the documented HTTP arm guards and documentation normalization differ.')
