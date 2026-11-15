# Anatomical geometry attribution

These five GLB geometry files are external anatomical assets, distributed separately from the application's MIT / Apache-2.0 code licence.

## Sources and credits

- **Z-Anatomy**, derived from BodyParts3D: https://github.com/Z-Anatomy/Models-of-human-anatomy and https://github.com/LluisV/Z-Anatomy . Credits include Gauthier Kervyn (design, 3D, anatomy), Marcin Zielinski (Blender add-on), Lluis Vinent and upstream contributors. Z-Anatomy distributes its anatomical models under Creative Commons Attribution-ShareAlike 4.0 International.
- **BodyParts3D**, Kousaku Okubo / Database Center for Life Science (DBCLS): https://lifesciencedb.jp/bp3d/ and https://dbarchive.biosciencedbc.jp/en/bodyparts3d/ . Original dataset attribution and licence: CC BY-SA 2.1 Japan, https://creativecommons.org/licenses/by-sa/2.1/jp/ . Publication: Mitsuhashi et al., *BodyParts3D: 3D structure database for anatomical concepts*, Nucleic Acids Research 37 (2009), D782-D785.
- **atlas-proto** GLB derivatives: https://github.com/pernelluvsya/atlas-proto . Upstream converts FBX to GLB, applies Meshopt compression, removes helper meshes/unused texture coordinates and supplies lighter simplified geometry. Its attribution releases these modified GLBs under CC BY-SA 4.0.

## Included files

`SkeletalSystem100.glb`, `MuscularSystem100.glb`, `CardioVascular41.glb`, `VisceralSystem100.glb`, `NervousSystem100.glb`.

The files are copied unchanged from the pinned source commit recorded in `MANIFEST.json`. That manifest contains source URLs, file sizes and verified SHA-256 hashes. The viewer applies display colors, opacity, uniform scaling and mesh-derived marker placement at runtime.

## Licence

The supplied GLB derivatives retain **CC BY-SA 4.0**: https://creativecommons.org/licenses/by-sa/4.0/ . A copy of its legal text is included in `LICENSE-CC-BY-SA-4.0.txt`. Keep these credits and licence information with redistributed geometry and respect the upstream share-alike terms for adaptations. The application code licence does not relicense the anatomical assets.

These are generic reference assets, historically shared by both scenario profiles.
The visceral file also contains explicitly `VH_F`-labelled female supplements;
therefore a male source filename is not evidence of a single male donor or of
source sex for every node. The phase 6 reference viewer excludes those labelled
supplements and descendants, lists their exclusion, and leaves source sex
unverified. It does not provide a reviewed female atlas or an individual body
scan. The source projects do not endorse this application.


## Subcomponent provenance review (2026-11-15)

The pinned derivative's umbrella declaration above is not evidence that every
upstream contribution has been individually cleared. The official
[Z-Anatomy attribution](https://github.com/Z-Anatomy/Models-of-human-anatomy/blob/master/License.txt)
also lists an inner-ear contribution under CC BY-NC-SA 4.0 and a kidney contribution
under CC BY-NC 4.0. The exact correspondence between those contributions and our
pinned nervous/visceral GLB nodes is unresolved. Preserve all credits and flag these
assets for provenance review before new redistribution or commercial packaging;
do not assume an umbrella CC BY-SA declaration overrides component restrictions.
See `docs/anatomy/SOURCE_DECISIONS.json` and `COVERAGE_MATRIX.md` in the repository.
The newer direct BodyParts3D terms do not relicense these existing derivatives.

## Phase 6 development reference viewer

`reference-catalog.json` is a reproducible metadata-only node index. Original GLB
bytes, license declarations and credits are unchanged. Display labels for unnamed
mesh nodes include the nearest named source ancestor and exact node index; source
groups may contain tributaries or other descendants. These labels are provenance,
not anatomical certification or an ontology crosswalk. Non-degenerate static
parts are displayed; invalid parts are quarantined with per-node reasons. Runtime
geometry validation does not validate anatomy. The optic sheath is not supplied
by substituting the eye or optic nerve.
