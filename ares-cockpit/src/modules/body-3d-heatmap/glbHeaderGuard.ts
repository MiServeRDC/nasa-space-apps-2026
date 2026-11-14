// Pure TypeScript GLB binary magic header & air-gapped manifest guard.
// Zero runtime framework imports so Node `--experimental-strip-types` can test it directly.

/** ASCII `'glTF'` encoded in little-endian u32 (`0x67, 0x6C, 0x54, 0x46`). */
export const GLTF_BINARY_MAGIC_LE = 0x46546c67;

export interface GlbManifestAsset {
  id: string;
  label: string;
  url: string;
  target_uberon: string[];
  default_visible: boolean;
  scale: [number, number, number];
  offset: [number, number, number];
  license: string;
}

export interface GlbAssetManifest {
  version: number;
  assets: GlbManifestAsset[];
}

function isFiniteTriple(v: unknown): v is [number, number, number] {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

/** Ensures asset URL is strictly same-origin relative (CSP `connect-src 'self'`). */
export function isLocalSameOriginAssetUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed.startsWith('/')) return false;
  if (trimmed.startsWith('//')) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false;
  return true;
}

/**
 * Verifies the 12-byte glTF 2.0 binary header:
 * - bytes 0..4: `0x46546c67` (`'glTF'` little-endian)
 * - bytes 4..8: glTF binary container version `2`
 * Rejects HTML 404/Vite SPA fallback pages or truncated buffers before invoking `GLTFLoader`.
 */
export function hasValidGlbMagicHeader(buffer: ArrayBuffer | Uint8Array): boolean {
  const view =
    buffer instanceof Uint8Array
      ? new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      : new DataView(buffer);
  if (view.byteLength < 12) return false;
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  return magic === GLTF_BINARY_MAGIC_LE && version === 2;
}

export function parseGlbManifest(raw: unknown): GlbAssetManifest | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.assets)) return null;

  const assets: GlbManifestAsset[] = [];
  for (const item of obj.assets) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    if (
      typeof rec.id !== 'string' ||
      typeof rec.label !== 'string' ||
      typeof rec.url !== 'string' ||
      !isLocalSameOriginAssetUrl(rec.url) ||
      !Array.isArray(rec.target_uberon) ||
      !isFiniteTriple(rec.scale) ||
      !isFiniteTriple(rec.offset)
    ) {
      continue;
    }
    assets.push({
      id: rec.id,
      label: rec.label,
      url: rec.url,
      target_uberon: rec.target_uberon.filter((u): u is string => typeof u === 'string'),
      default_visible: rec.default_visible === true,
      scale: rec.scale,
      offset: rec.offset,
      license: typeof rec.license === 'string' ? rec.license : 'Public Domain (NASA 3D Resources)',
    });
  }

  return {
    version: typeof obj.version === 'number' && Number.isFinite(obj.version) ? obj.version : 1,
    assets,
  };
}
