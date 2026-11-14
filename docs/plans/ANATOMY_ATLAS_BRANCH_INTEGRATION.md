# Detailed anatomy integration on work/MiServeRDC

Baseline: main `08b055a`, synchronized into the user's working branch before implementation. The user approved the local anatomical preview and requested publishing that version on their branch. Their final choice is one male reference geometry for both profiles, with FEMALE changing existing scenario parameters only.

## Implementation

1. Port the approved `BodyHeatmap`, `AtlasBody` and manual injury-marker types into the current cockpit. Keep the latest App, validated telemetry/IPC transports, pure-replay availability gates, provenance inspector and OS shell.
2. Add local GLB layers for skeleton, muscles, cardiovascular system, viscera and nerves. Retain separate CC BY-SA geometry attribution and a SHA-256 source manifest; do not import the rejected female model, experimental source, standalone atlas page, dependencies or temporary screenshots.
3. Use mesh-derived landmark anchors and localized scenario colors. Keep detail-panel navigation, manual marker add/resolve, local photo attachment, layer presets, opacity and the original-renderer comparison. Label the male geometry independently from the selected scenario profile.
4. Add App state for manual notes and release associated object URLs when notes are replaced, resolved or the App unmounts. Photo attachment remains manual, without an AI diagnostic/confidence claim.
5. Update cockpit documentation and Memory Bank. Verify frontend lint/build and local browser interactions, the pure-replay gate and same-model/different-parameter profile behavior. Run the required local fast probe before commit. Hosted Actions remain disabled.
6. Commit and push only to `work/MiServeRDC`; no merge to main is requested.

The atlas is a generic anatomical reference, not a patient scan. Existing scenario coefficients and medical policy are outside this task. Deferred issue #13 work in the older temporary clone is excluded.

## Verification results

- `npm run lint` and `npm run build`: passed. The existing large JavaScript chunk warning remains; no chunk-size limit was raised.
- `bash scripts/agent_probe.sh --fast`: passed, including production panic scan, schema/dataset hashes, workspace check, strict all-target Clippy and required Memory Bank files.
- Browser verification on the updated cockpit: five local GLBs render; FEMALE changes IJV scenario value from 4.80 to 5.10 dyn/cm2 while retaining the male reference geometry; no female GLB is requested. Detail navigation, original/detailed renderer switching and a manually attached knee photo followed by resolution passed. The photo object URL was released and no page errors occurred.
- A live-stream simulation using the committed pure-BIDMC fixture retained the existing unavailable heatmap gate and made zero GLB requests.
- All five asset SHA-256 hashes match the pinned upstream commit `236f3a183108bcccc1f95fda1558be19d7486d00`. Total geometry payload: 26,755,532 bytes. Source/license records accompany the binary assets.
- This task does not claim new clinical validation, complete system certification or a backend test-suite rerun. Hosted Actions were verified disabled.
