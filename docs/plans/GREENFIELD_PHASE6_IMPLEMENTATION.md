# Phase 6: existing male reference atlas

Baseline 1325eb1; branch work/MiServeRDC-greenfield-phase01. No main merge/push.

Build a reproducible metadata catalog from the five existing hash-pinned GLBs.
Keep their bytes/credits unchanged and expose source identity and unresolved
subcomponent licensing. Do not create/relicense derivative anatomy or invent a
missing optic sheath. Each indexed structure names the exact source node and its
actual mesh descendants. Curated functional bindings remain context associations,
not evidence of observation at every mesh.

Extend the owned session to accept explicit source-node mappings for these legacy
files (which have no ARES extras). Clone selected static meshes only. Preserve
per-part asset/node identity for precise anchors. Use indexed display batching to
avoid triangle expansion: measure this against the existing 64 MB owned-geometry
budget rather than raising the budget. Load one anatomical system at a time; show
an explicit budget failure if a configuration cannot fit.

Ship a real reference viewer at /anatomy with five system selectors, search,
selection/detail, isolate/show-all/hide controls and source metadata. Adapt camera
framing to actual bounds. Pointer/touch ray selection and DOM keyboard selection
must resolve the same IDs. Coordinate notes bind to exact model revision, asset,
source node and point; persist locally with explicit failure handling and no
clinical execution claim. Missing geometry/physiology remains missing.

Use current telemetry hook/view model to show only supported channel values and
source/model status in the detail panel. Selection and clinical navigation do not
change What-If/sex. Provide a validated deep link into the cockpit for supported
regions; kidney/lung remain references without invented backend regions.

Qualification: real decode/hash/node and geometry tests across all five systems;
soleus/calcaneus, IJV/external jugular, optic nerve/sheath distinctions; real browser
selection/isolation/notes/keyboard/touch, null clinical channels, offline build and
failure fallback; resource ownership on repeated switches. Keep source licensing
and focused expert anatomical review explicitly unfinished where unresolved.
