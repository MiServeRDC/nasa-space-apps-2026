import React, { Component, useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  GLTF_BINARY_MAGIC_LE,
  hasValidGlbMagicHeader,
  parseGlbManifest,
  type GlbAssetManifest,
  type GlbManifestAsset,
} from './glbHeaderGuard';

export { GLTF_BINARY_MAGIC_LE, hasValidGlbMagicHeader, parseGlbManifest };
export type { GlbAssetManifest, GlbManifestAsset };

export type GlbLoadStatus =
  | 'OFF'
  | 'LOADING'
  | 'LOADED'
  | 'FALLBACK_MISSING_LOCAL_GLB';

interface GlbBoundaryProps {
  children: React.ReactNode;
  onFallback?: () => void;
}

interface GlbBoundaryState {
  hasError: boolean;
}

/**
 * Prevents any WebGL/GLTF parsing fault inside the optional local `.glb` overlay
 * from tearing down the primary anatomical HSI canvas.
 */
export class GlbAssetErrorBoundary extends Component<GlbBoundaryProps, GlbBoundaryState> {
  constructor(props: GlbBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): GlbBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(): void {
    this.props.onFallback?.();
  }

  override render(): React.ReactNode {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

interface LoadedGlbEntry {
  asset: GlbManifestAsset;
  scene: THREE.Group;
}

interface NasaGlbAssetLayerProps {
  enabled: boolean;
  onStatusChange?: (status: GlbLoadStatus, detail: string) => void;
}

function GlbInnerOverlay({
  enabled,
  onStatusChange,
}: NasaGlbAssetLayerProps): React.ReactElement | null {
  const [loaded, setLoaded] = useState<LoadedGlbEntry[]>([]);

  useEffect(() => {
    if (!enabled) {
      onStatusChange?.('OFF', 'Procedural anatomical silhouette active');
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    onStatusChange?.('LOADING', 'Checking /models/manifest.json (air-gapped)');

    async function loadAirGappedAssets() {
      try {
        const res = await fetch('/models/manifest.json', { signal: controller.signal });
        if (!res.ok) {
          if (!cancelled) {
            setLoaded([]);
            onStatusChange?.(
              'FALLBACK_MISSING_LOCAL_GLB',
              'manifest.json unavailable; using procedural mesh',
            );
          }
          return;
        }

        const rawJson: unknown = await res.json();
        const manifest = parseGlbManifest(rawJson);
        if (!manifest || manifest.assets.length === 0) {
          if (!cancelled) {
            setLoaded([]);
            onStatusChange?.(
              'FALLBACK_MISSING_LOCAL_GLB',
              'No valid same-origin GLB entries in manifest.json',
            );
          }
          return;
        }

        const loader = new GLTFLoader();
        const nextEntries: LoadedGlbEntry[] = [];

        for (const asset of manifest.assets) {
          const binRes = await fetch(asset.url, { signal: controller.signal });
          if (!binRes.ok) {
            continue;
          }
          const arrayBuffer = await binRes.arrayBuffer();
          // Guard against Vite SPA fallback returning text/html with HTTP 200
          if (!hasValidGlbMagicHeader(arrayBuffer)) {
            continue;
          }

          const parsedScene = await new Promise<THREE.Group>((resolve, reject) => {
            loader.parse(
              arrayBuffer,
              '/models/',
              (gltf) => resolve(gltf.scene),
              (err) => reject(err),
            );
          });

          // Apply translucent wireframe-friendly OLED silhouette styling
          parsedScene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.material = new THREE.MeshStandardMaterial({
                color: '#38bdf8',
                transparent: true,
                opacity: 0.14,
                wireframe: true,
              });
            }
          });

          nextEntries.push({ asset, scene: parsedScene });
        }

        if (cancelled) return;
        setLoaded(nextEntries);
        if (nextEntries.length > 0) {
          onStatusChange?.(
            'LOADED',
            `Loaded ${nextEntries.length} local GLB overlay(s)`,
          );
        } else {
          onStatusChange?.(
            'FALLBACK_MISSING_LOCAL_GLB',
            'Optional .glb binary absent (magic 0x46546c67 not found); procedural mesh fallback active',
          );
        }
      } catch {
        if (!cancelled) {
          setLoaded([]);
          onStatusChange?.(
            'FALLBACK_MISSING_LOCAL_GLB',
            'Local GLB unavailable; procedural mesh fallback active',
          );
        }
      }
    }

    void loadAirGappedAssets();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, onStatusChange]);

  if (!enabled || loaded.length === 0) return null;

  return (
    <group>
      {loaded.map((entry) => (
        <primitive
          key={entry.asset.id}
          object={entry.scene}
          position={entry.asset.offset}
          scale={entry.asset.scale}
        />
      ))}
    </group>
  );
}

export function NasaGlbAssetLayer(props: NasaGlbAssetLayerProps): React.ReactElement {
  return (
    <GlbAssetErrorBoundary
      onFallback={() =>
        props.onStatusChange?.(
          'FALLBACK_MISSING_LOCAL_GLB',
          'GLB overlay fault caught cleanly; procedural mesh fallback active',
        )
      }
    >
      <GlbInnerOverlay {...props} />
    </GlbAssetErrorBoundary>
  );
}
