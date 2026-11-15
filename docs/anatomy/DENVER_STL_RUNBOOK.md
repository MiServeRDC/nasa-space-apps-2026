# Andreassen 2023 Denver VHF Lower-Limb STL Acquisition & Registration Runbook

Date: 2026-11-15. Status: **Manual browser-assisted acquisition required** (Cloudflare anti-bot gate on institutional endpoint).

## 1. Source Provenance & Legal Scope

- **Dataset:** University of Denver Visible Human Female (VHF) Final 3D STL Models (`87.8 MB`) + Metadata (`55 KB`)
- **Authors:** Thor E. Andreassen, Donald R. Hume, Landon D. Hamilton, Karen E. Walker, Sean E. Higinbotham, Kevin B. Shelburne (2023)
- **Paper DOI:** `https://doi.org/10.1038/s41597-022-01905-2` (*Scientific Data*)
- **Dataset DOI:** `https://doi.org/10.56902/COB.vh.2022.1`
- **License:** `CC-BY-4.0`
- **Landing Page:** `https://digitalcommons.du.edu/visiblehuman/1/`
- **Direct Archive Endpoint:** `https://digitalcommons.du.edu/cgi/viewcontent.cgi?filename=3&article=1001&context=visiblehuman&type=additional`
- **Direct Metadata Endpoint:** `https://digitalcommons.du.edu/cgi/viewcontent.cgi?filename=11&article=1001&context=visiblehuman&type=additional`
- **Target Structures:** Bilateral `soleus` (`soleus_L`, `soleus_R`) and bilateral `calcaneus` (`calcaneus_L`, `calcaneus_R`) — **never substitute male Z-Anatomy meshes**.

## 2. Why Automated Download Halts

Automated CLI / headless HTTP probes receive `HTTP/2 403` with `cf-mitigated: challenge` (`https://challenges.cloudflare.com`). Per repository policy, automated agents must never attempt to solve or bypass Cloudflare Turnstile or anti-bot challenges. A human operator must complete the download in a normal interactive browser session and keep raw STL files strictly outside git (`~/.cache/ares-anatomy-phase7/`).

## 3. Step-by-Step Browser-Assisted Cache Population

1. Create the external cache directory outside the git repository:
   ```bash
   mkdir -p ~/.cache/ares-anatomy-phase7/denver-vhf-final-stl
   ```
2. Open `https://digitalcommons.du.edu/visiblehuman/1/` in a regular browser session and complete any human verification prompt interactively.
3. Download both artifacts:
   - **Final 3D STL Models (87.8 MB)** -> save or extract into `~/.cache/ares-anatomy-phase7/denver-vhf-final-stl/`
   - **Metadata (55 KB)** -> save to `~/.cache/ares-anatomy-phase7/denver-vhf-metadata.csv` (or `.xlsx`/`.pdf` as published)
4. Verify SHA-256 digests and inspect extracted STL file names (never invent or guess units/laterality):
   ```bash
   shasum -a 256 ~/.cache/ares-anatomy-phase7/denver-vhf-final-stl/*
   python3 scripts/acquire_female_anatomy.py --verify-denver
   ```
5. Record the exact archive SHA-256, extracted STL filenames, coordinate axes, and units in:
   - `docs/anatomy/FEMALE_SOURCE_LOCK.json`
   - `docs/anatomy/SOURCE_DECISIONS.json`

## 4. Landmark Authoring & Registration (`>= 4` Fit + `>= 3` Check Landmarks)

Before converting STL meshes into the `hra-female-v1.10` world frame (metres, `GLTF_Y_UP_RIGHT_HANDED`), author an independent anatomical correspondence file (`~/.cache/ares-anatomy-phase7/denver-to-hra-v110-landmarks.json`) following `docs/anatomy/FEMALE_REGISTRATION_REVIEW.md`:

- **Minimum fit set:** `>= 4` non-coplanar, non-collinear landmarks spanning left/right/midline bony prominences shared between the Denver VHF lower-limb/pelvis frame and `hra-v1.10`.
- **Minimum check set:** `>= 3` independent check landmarks (distinct IDs, coordinates, and surface locations from fit landmarks; no reused points).
- **Mandatory invariants enforced by `scripts/register_anatomy.mjs`:**
  - Matching anatomical landmark names and laterality (`LEFT`, `RIGHT`, `MIDLINE`)
  - Verified SHA-256 binding against raw source and target files
  - Positive proper-rotation determinant (`det > 0`; reflections rejected)
  - Separate fit and independent-check RMS/max residuals in metres (`COMPUTED_UNREVIEWED`)

Run the registration solver:
```bash
node scripts/register_anatomy.mjs \
  ~/.cache/ares-anatomy-phase7/denver-to-hra-v110-landmarks.json \
  ~/.cache/ares-anatomy-phase7/denver-vhf-final-stl/<selected-source-file> \
  ~/.cache/ares-anatomy-phase7/hra-v1.10.glb \
  ~/.cache/ares-anatomy-phase7/denver-registration-report.json
```

## 5. STL-to-Meshopt GLB Conversion & Verification

Once the registration report (`denver-registration-report.json`) and exact `soleus` (`L`/`R`) + `calcaneus` (`L`/`R`) STL paths are verified:

```bash
node --experimental-strip-types ares-cockpit/scripts/buildDenverLowerLimb.mjs \
  --spec ~/.cache/ares-anatomy-phase7/denver-extraction-spec.json \
  --report ~/.cache/ares-anatomy-phase7/denver-registration-report.json \
  --out /tmp/ares-denver-out
```

Then run the anatomical review checklist in `docs/anatomy/FEMALE_REGISTRATION_REVIEW.md` before integrating into `buildFemaleReference.mjs`, updating `review.json`, and re-running:
```bash
npm --prefix ares-cockpit run anatomy:female:verify
npm --prefix ares-cockpit test
```
