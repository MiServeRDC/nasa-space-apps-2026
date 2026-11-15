# Air-Gapped Local 3D Assets (`public/models/`)

`ares-cockpit` runs strictly offline under `connect-src 'self'` with zero external network calls or remote CDNs.

Optional local binary `.glb` overlays (for example NASA 3D Resources EVA suit or ISS/transit habitat reference shells) may be placed inside this directory and registered in `manifest.json`.

- All URLs in `manifest.json` must remain same-origin relative paths (`/models/<asset>.glb`).
- Before passing any fetched `ArrayBuffer` into `GLTFLoader.parse`, `NasaGlbAssetLayer.tsx` verifies the 12-byte glTF 2.0 binary magic header (`0x46546c67`, version `2`) so missing optional assets (HTML 404 / Vite SPA fallback pages) never crash the 3D scene and cleanly fall back to the built-in procedural anatomical geometry.
- Draco-compressed meshes requiring remote WASM CDNs are unsupported in air-gapped mode; export uncompressed or meshopt-free glTF 2.0 `.glb` files.
