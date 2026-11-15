#!/usr/bin/env bash
# ==============================================================================
# scripts/build_submission_docs.sh
# Phase 34 (L6): Deterministic Typst Compiler & 6-Gate Submission CI Verifier
# Zero network calls. Zero emojis. Compatible with macOS & Linux CI.
# ==============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-1794670800}"
TYPST_BIN="${TYPST_BIN:-/opt/homebrew/bin/typst}"
if [ ! -x "$TYPST_BIN" ]; then
    TYPST_BIN="$(command -v typst || true)"
fi
if [ -z "$TYPST_BIN" ] || [ ! -x "$TYPST_BIN" ]; then
    echo "[FAILED] Gate L6-01: typst binary not found at /opt/homebrew/bin/typst or PATH." >&2
    exit 1
fi

# Determine clinical validation status from optional Phase 33 (L5) manifest
EVIDENCE_STATUS="ILLUSTRATIVE_UNVALIDATED"
for manifest_candidate in \
    "data/calibration/phase_33_validation_manifest.json" \
    "data/calibration/validation_manifest.json"
do
    if [ -f "$manifest_candidate" ]; then
        EVIDENCE_STATUS="$(python3 - "$manifest_candidate" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as fh:
    m = json.load(fh)
if m.get("all_gates_passed") is True and m.get("status") == "QUALIFIED_CALIBRATED":
    print("QUALIFIED_CALIBRATED")
else:
    print("ILLUSTRATIVE_UNVALIDATED")
PY
)"
        break
    fi
done

echo "[L6-01] Verifying zero-network Typst sources and compiling deterministic PDFs (status=${EVIDENCE_STATUS})..."
for typ_file in docs/submission/NASA_2026_7_SLIDE_DECK.typ docs/submission/PANORAMICA_GENERALE_PROGETTO.typ; do
    if grep -Eq '#import[[:space:]]+"@preview/' "$typ_file"; then
        echo "[FAILED] Gate L6-01: prohibited remote @preview/ import found in $typ_file" >&2
        exit 1
    fi
done

"$TYPST_BIN" compile \
    --root "$ROOT_DIR" \
    --creation-timestamp "$SOURCE_DATE_EPOCH" \
    --input "evidence_status=${EVIDENCE_STATUS}" \
    docs/submission/NASA_2026_7_SLIDE_DECK.typ \
    docs/submission/NASA_2026_7_SLIDE_DECK.pdf

"$TYPST_BIN" compile \
    --root "$ROOT_DIR" \
    --creation-timestamp "$SOURCE_DATE_EPOCH" \
    --input "evidence_status=${EVIDENCE_STATUS}" \
    docs/submission/PANORAMICA_GENERALE_PROGETTO.typ \
    PANORAMICA_GENERALE_PROGETTO.pdf

echo "[PASSED] Gate L6-01: Offline Typst compilation succeeded."

DECK_QUERY_JSON="$("$TYPST_BIN" query \
    --root "$ROOT_DIR" \
    --input "evidence_status=${EVIDENCE_STATUS}" \
    docs/submission/NASA_2026_7_SLIDE_DECK.typ "<deck-meta>" \
    --field value 2>/dev/null)"

echo "[L6-02..L6-06] Running 5-gate Python 3 stdlib verification suite..."
python3 - "$ROOT_DIR" "$EVIDENCE_STATUS" "$DECK_QUERY_JSON" <<'PY'
import json
import pathlib
import re
import sys
import urllib.parse
import zlib

root = pathlib.Path(sys.argv[1]).resolve()
evidence_status = sys.argv[2]
deck_query = json.loads(sys.argv[3])

# ------------------------------------------------------------------------------
# Gate L6-02: Dual-Oracle Exact 7-Page Assertion on NASA_2026_7_SLIDE_DECK.pdf
# ------------------------------------------------------------------------------
assert len(deck_query) == 7 and all(item.get("total_pages") == 7 for item in deck_query), (
    f"Gate L6-02 FAILED (Typst metadata oracle): expected 7 pages, got {deck_query}"
)

def count_pdf_pages_stdlib(pdf_path: pathlib.Path) -> int:
    raw = pdf_path.read_bytes()
    assert raw.startswith(b"%PDF-1.") or raw.startswith(b"%PDF-2."), f"Invalid PDF header in {pdf_path}"
    assert len(raw) > 0, f"Empty PDF: {pdf_path}"
    corpus = [raw]
    for m in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", raw, flags=re.DOTALL):
        chunk = m.group(1)
        try:
            corpus.append(zlib.decompress(chunk))
        except zlib.error:
            pass
    joined = b"\n".join(corpus)
    leaf_pages = len(re.findall(rb"/Type\s*/Page\b(?!s)", joined))
    counts = [
        int(val)
        for pair in re.findall(
            rb"/Type\s*/Pages\b[^>]*?/Count\s+(\d+)|/Count\s+(\d+)\s+[^>]*?/Type\s*/Pages\b",
            joined,
        )
        for val in pair
        if val
    ]
    root_count = max(counts) if counts else leaf_pages
    assert leaf_pages == root_count, (
        f"PDF page tree mismatch in {pdf_path}: leaf={leaf_pages}, count={root_count}"
    )
    return leaf_pages

deck_pages = count_pdf_pages_stdlib(root / "docs/submission/NASA_2026_7_SLIDE_DECK.pdf")
assert deck_pages == 7, f"Gate L6-02 FAILED (Binary PDF oracle): expected 7 pages, got {deck_pages}"
panoramica_pages = count_pdf_pages_stdlib(root / "PANORAMICA_GENERALE_PROGETTO.pdf")
assert panoramica_pages >= 3, (
    f"Gate L6-02 FAILED: PANORAMICA_GENERALE_PROGETTO.pdf too short ({panoramica_pages} pages)"
)
print(
    f"[PASSED] Gate L6-02: NASA_2026_7_SLIDE_DECK.pdf == {deck_pages} pages (dual oracle); "
    f"PANORAMICA_GENERALE_PROGETTO.pdf == {panoramica_pages} pages."
)

# ------------------------------------------------------------------------------
# Gate L6-03: SubRip (.srt) Timecode Syntax, Strict Monotonicity & Upper Bounds
# ------------------------------------------------------------------------------
TC_RE = re.compile(r"^(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})$")

def to_ms(h: str, m: str, s: str, ms: str) -> int:
    h_i, m_i, s_i, ms_i = int(h), int(m), int(s), int(ms)
    assert m_i < 60 and s_i < 60 and ms_i < 1000, f"Malformed timecode component: {h}:{m}:{s},{ms}"
    return ((h_i * 3600) + (m_i * 60) + s_i) * 1000 + ms_i

def verify_srt(path: pathlib.Path, max_ms: int) -> tuple[int, int]:
    text = path.read_text(encoding="utf-8")
    assert not text.startswith("\ufeff"), f"{path}: UTF-8 BOM forbidden in .srt"
    blocks = [b.strip() for b in re.split(r"\n\s*\n", text.strip()) if b.strip()]
    assert len(blocks) >= 5, f"{path}: expected >= 5 subtitle cues, got {len(blocks)}"
    prev_end = 0
    for expected_idx, block in enumerate(blocks, start=1):
        lines = block.splitlines()
        assert len(lines) >= 2, f"{path} cue #{expected_idx}: missing text lines"
        assert lines[0].strip() == str(expected_idx), f"{path}: expected index {expected_idx}, got {lines[0]!r}"
        m = TC_RE.match(lines[1].strip())
        assert m is not None, f"{path} cue #{expected_idx}: invalid SRT timecode {lines[1]!r}"
        t_start = to_ms(*m.groups()[:4])
        t_end = to_ms(*m.groups()[4:])
        assert prev_end <= t_start < t_end <= max_ms, (
            f"{path} cue #{expected_idx}: timecode violation prev_end={prev_end} start={t_start} end={t_end} max={max_ms}"
        )
        caption_lines = lines[2:]
        assert 1 <= len(caption_lines) <= 2, f"{path} cue #{expected_idx}: max 2 lines per subtitle"
        assert all(0 < len(ln.strip()) <= 48 for ln in caption_lines), (
            f"{path} cue #{expected_idx}: line length out of bounds (>48 chars)"
        )
        prev_end = t_end
    return len(blocks), prev_end

cues_30s, end_30s = verify_srt(root / "docs/submission/PITCH_30S_SUBTITLES_EN.srt", 30_000)
cues_180s, end_180s = verify_srt(root / "docs/submission/WALKTHROUGH_180S_SUBTITLES_EN.srt", 180_000)
print(
    f"[PASSED] Gate L6-03: SRT monotonicity & caps verified "
    f"(30s: {cues_30s} cues, end={end_30s} ms <= 30000 ms; "
    f"180s: {cues_180s} cues, end={end_180s} ms <= 180000 ms)."
)

# ------------------------------------------------------------------------------
# Gate L6-04: Strict Zero-Emoji Invariant Scan
# ------------------------------------------------------------------------------
EMOJI_RE = re.compile(
    "["
    "\U0001F300-\U0001F5FF"
    "\U0001F600-\U0001F64F"
    "\U0001F680-\U0001F6FF"
    "\U0001F700-\U0001F77F"
    "\U0001F780-\U0001F7FF"
    "\U0001F800-\U0001F8FF"
    "\U0001F900-\U0001F9FF"
    "\U0001FA00-\U0001FAFF"
    "\U00002600-\U000027BF"
    "\U0001F1E6-\U0001F1FF"
    "]"
)

submission_text_files = sorted((root / "docs/submission").glob("*.*")) + [
    root / "PANORAMICA_GENERALE_PROGETTO.md",
    root / "scripts/build_submission_docs.sh",
]
scanned_count = 0
for fpath in submission_text_files:
    if fpath.suffix.lower() in {".pdf", ".mp4", ".mp3", ".png", ".jpg", ".jpeg"}:
        continue
    content = fpath.read_text(encoding="utf-8")
    hit = EMOJI_RE.search(content)
    assert hit is None, f"Gate L6-04 FAILED: prohibited emoji U+{ord(hit.group(0)):04X} in {fpath}"
    scanned_count += 1
print(f"[PASSED] Gate L6-04: Zero Unicode emojis across {scanned_count} submission files.")

# ------------------------------------------------------------------------------
# Gate L6-05: Internal Link Integrity & Zero file:// URIs in Portal Document
# ------------------------------------------------------------------------------
LINK_RE = re.compile(r"\[[^\]]+\]\(([^)\s]+)\)")
md_targets = sorted((root / "docs/submission").glob("*.md")) + [
    root / "PANORAMICA_GENERALE_PROGETTO.md",
    root / "README.md",
]
checked_links = 0
for md_file in md_targets:
    md_text = md_file.read_text(encoding="utf-8")
    if md_file.name == "NASA_SUBMISSION_PORTAL_READY.md":
        assert "file://" not in md_text, "Gate L6-05 FAILED: Portal copy-paste file must not contain local file:// URIs"
    for raw_target in LINK_RE.findall(md_text):
        if raw_target.startswith(("http://", "https://", "mailto:", "conversation://", "#")):
            continue
        clean = raw_target.split("#", 1)[0]
        if clean.startswith("file://"):
            parsed_path = pathlib.Path(urllib.parse.unquote(urllib.parse.urlparse(clean).path))
        else:
            parsed_path = (md_file.parent / clean).resolve()
        assert parsed_path.exists(), f"Gate L6-05 FAILED: broken link {raw_target!r} in {md_file} -> {parsed_path}"
        checked_links += 1
print(f"[PASSED] Gate L6-05: {checked_links} internal links verified; 0 file:// URIs in NASA_SUBMISSION_PORTAL_READY.md.")

# ------------------------------------------------------------------------------
# Gate L6-06: MODEL_EVIDENCE_AUDIT.md / Issue #12 Unqualified Claims Scan
# ------------------------------------------------------------------------------
FORBIDDEN_UNQUALIFIED_RE = re.compile(
    r"(?<!not\s)(?<!never\s)(?<!non\s)\b("
    r"clinically\s+certified|fda-cleared|flight-certified|certified\s+for\s+flight|"
    r"95%\s*ci|calibrated\s+probability|calibrated\s+95%\s+confidence|guaranteed\s+worst-case|"
    r"certificato\s+clinicamente"
    r")\b",
    flags=re.IGNORECASE,
)

if evidence_status == "ILLUSTRATIVE_UNVALIDATED":
    audit_targets = sorted(
        p for p in (root / "docs/submission").glob("*.*") if p.suffix.lower() in {".typ", ".md", ".srt"}
    ) + [root / "PANORAMICA_GENERALE_PROGETTO.md"]

    for must_have_token_file in [
        root / "docs/submission/NASA_2026_7_SLIDE_DECK.typ",
        root / "docs/submission/NASA_SUBMISSION_PORTAL_READY.md",
        root / "docs/submission/PANORAMICA_GENERALE_PROGETTO.typ",
        root / "PANORAMICA_GENERALE_PROGETTO.md",
    ]:
        txt = must_have_token_file.read_text(encoding="utf-8")
        assert "ILLUSTRATIVE_UNVALIDATED" in txt, (
            f"Gate L6-06 FAILED: missing ILLUSTRATIVE_UNVALIDATED in {must_have_token_file}"
        )
        assert "BEAT_INTERVALS_NOT_AVAILABLE" in txt, (
            f"Gate L6-06 FAILED: missing BEAT_INTERVALS_NOT_AVAILABLE in {must_have_token_file}"
        )

    for txt_file in audit_targets:
        txt = txt_file.read_text(encoding="utf-8")
        bad = FORBIDDEN_UNQUALIFIED_RE.search(txt)
        assert bad is None, (
            f"Gate L6-06 FAILED: prohibited unqualified clinical claim {bad.group(0)!r} in {txt_file}"
        )

print(f"[PASSED] Gate L6-06: Evidence-audit honesty contract verified across {len(audit_targets) if evidence_status == 'ILLUSTRATIVE_UNVALIDATED' else 0} files (mode={evidence_status}).")
PY
