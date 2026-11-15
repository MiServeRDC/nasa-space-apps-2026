# Repository-first judging handoff

## Problem

Judges will receive the GitHub repository, not a hosted application. The README
currently places architecture before runnable instructions, and the walkthrough
assumes a native archive that is not attached to the repository. Some backend
diagnostics are still Italian. Historical internal documents use mixed languages.

## Changes

1. Put a complete source-build launch path at the top of README: prerequisites,
   clone/download, locked dependency installation, production build and one Rust
   process serving the cockpit. Include URL, shutdown, baseline wait and expected
   missing indicators. Keep development and packaging as secondary paths.
2. Make the judge walkthrough source-first and correct repository/package paths.
   Clarify private-repository access and explicitly distinguish source delivery
   from public hosting. Do not change visibility or create slides/video.
3. Translate remaining CLI/help and core ingestion/security diagnostic strings
   into English, preserving enum identities, format fields and runtime behavior.
4. Record detected Italian prose in a language audit; retain historical material
   and source attribution rather than rewriting scientific or third-party texts.
5. Verify local links, actual launch commands, translated CLI output and the
   required local Rust checks. Update memory, commit to a dedicated branch and
   integrate through a pull request. No hosted Actions.

## Acceptance

A reviewer starting at README can run recorded replay without guessing startup
order or installing inference weights. The source command serves HTML and ready
API from the same origin. Language findings and platform/access limits are explicit.
