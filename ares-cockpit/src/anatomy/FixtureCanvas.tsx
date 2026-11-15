import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { pickSemantic, type SemanticBatch, type SemanticHit } from './semanticGeometry';
import type { MissingStructureOverlay } from './missingOverlays';

export interface FixtureCanvasProps {
  keyboardPicking?: boolean;
  autoFrame?: boolean;
  label?: string;
  selectedId?: string | null;
  batches: readonly SemanticBatch[];
  missingOverlays?: readonly MissingStructureOverlay[];
  onSelect: (id: string, point: [number, number, number], hit: SemanticHit) => void;
  onSelectMissingOverlay?: (structureId: string) => void;
  onOpenMissingProvenance?: () => void;
  onUnavailable: (message: string | null) => void;
  onMemory: (count: number) => void;
}

function createDiagonalHatchTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, 32, 32);
  ctx.fillStyle = 'rgba(245, 158, 11, 0.14)';
  ctx.fillRect(0, 0, 32, 32);
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.72)';
  ctx.lineWidth = 3;
  for (let offset = -32; offset <= 64; offset += 8) {
    ctx.beginPath();
    ctx.moveTo(offset, 32);
    ctx.lineTo(offset + 32, 0);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.needsUpdate = true;
  return texture;
}

function disposeOverlayGroup(group: THREE.Group | null): void {
  if (!group) return;
  group.traverse((obj) => {
    const withGeo = obj as { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
    if (withGeo.geometry) withGeo.geometry.dispose();
    const mats = Array.isArray(withGeo.material) ? withGeo.material : withGeo.material ? [withGeo.material] : [];
    for (const mat of mats) {
      const basic = mat as THREE.MeshBasicMaterial;
      if (basic.map) basic.map.dispose();
      mat.dispose();
    }
  });
  group.clear();
  group.removeFromParent();
}

function buildOverlayGroup(
  overlays: readonly MissingStructureOverlay[],
  selectedId: string | null,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ARES_MISSING_BOUNDING_HALOS';
  const hatchTexture = createDiagonalHatchTexture();

  for (const overlay of overlays) {
    const isSelected = overlay.structureId === selectedId;
    const strokeColor = isSelected ? 0xfbbf24 : 0xf59e0b;
    const fillOpacity = isSelected ? 0.34 : 0.12;
    const lineOpacity = isSelected ? 0.95 : 0.62;

    for (const box of overlay.boxes) {
      const boxGeo = new THREE.BoxGeometry(box.size[0], box.size[1], box.size[2]);
      const edgesGeo = new THREE.EdgesGeometry(boxGeo);

      const fillMat = new THREE.MeshBasicMaterial({
        color: strokeColor,
        map: hatchTexture ?? undefined,
        transparent: true,
        opacity: fillOpacity,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const fillMesh = new THREE.Mesh(boxGeo, fillMat);
      fillMesh.position.set(box.center[0], box.center[1], box.center[2]);
      fillMesh.name = `MISSING_HALO_FILL_${overlay.canonicalKey}_${box.side}`;

      const lineMat = new THREE.LineDashedMaterial({
        color: strokeColor,
        dashSize: 0.01,
        gapSize: 0.006,
        transparent: true,
        opacity: lineOpacity,
        depthWrite: false,
      });
      const lineSegs = new THREE.LineSegments(edgesGeo, lineMat);
      lineSegs.computeLineDistances();
      lineSegs.position.set(box.center[0], box.center[1], box.center[2]);
      lineSegs.name = `MISSING_HALO_DASH_${overlay.canonicalKey}_${box.side}`;

      group.add(fillMesh);
      group.add(lineSegs);
    }
  }
  return group;
}

export default function FixtureCanvas({
  batches,
  missingOverlays = [],
  onSelect,
  onSelectMissingOverlay,
  onOpenMissingProvenance,
  onUnavailable,
  onMemory,
  autoFrame = false,
  label = 'Synthetic reference model',
  selectedId = null,
  keyboardPicking = false,
}: FixtureCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const renderRef = useRef<(() => void) | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const overlayGroupRef = useRef<THREE.Group | null>(null);
  const frameRef = useRef<((boxOverride?: THREE.Box3) => void) | null>(null);
  const memoryRef = useRef(onMemory);
  memoryRef.current = onMemory;
  const batchesRef = useRef(batches);
  const selectRef = useRef(onSelect);
  const missingRef = useRef(missingOverlays);
  const selectedIdRef = useRef(selectedId);
  batchesRef.current = batches;
  selectRef.current = onSelect;
  missingRef.current = missingOverlays;
  selectedIdRef.current = selectedId;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      onUnavailable('3D unavailable; use structure buttons.');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    camera.position.set(0, 0, 4);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;

    const frame = (boxOverride?: THREE.Box3) => {
      if (!autoFrame) return;
      const box = boxOverride ? boxOverride.clone() : new THREE.Box3();
      if (!boxOverride) {
        for (const b of batchesRef.current) box.expandByObject(b.mesh);
      }
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.length() / 2, 0.001);
      const distance =
        (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(camera.aspect, 1)) * 1.12;
      controls.target.copy(center);
      camera.position.copy(center).add(new THREE.Vector3(0, 0, distance));
      camera.near = Math.max(distance / 1000, 0.00001);
      camera.far = distance + radius * 10;
      camera.updateProjectionMatrix();
      controls.update();
    };
    frameRef.current = frame;

    const render = () => {
      if (!renderer.getContext().isContextLost()) renderer.render(scene, camera);
      memoryRef.current(renderer.info.memory.geometries);
    };
    renderRef.current = render;

    const resize = () => {
      const w = Math.max(el.clientWidth, 1);
      const h = Math.max(el.clientHeight, 1);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      frame();
      render();
    };

    let moved = false;
    const down = () => {
      moved = false;
    };
    const change = () => {
      moved = true;
      render();
    };

    const keyPick = (event: KeyboardEvent) => {
      if (!keyboardPicking || event.key !== 'Enter') return;
      event.preventDefault();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(0, 0), camera);
      const hit = pickSemantic(batchesRef.current, ray);
      if (hit) selectRef.current(hit.structureId, hit.point.toArray() as [number, number, number], hit);
    };

    if (keyboardPicking) {
      renderer.domElement.tabIndex = 0;
      renderer.domElement.setAttribute(
        'aria-label',
        '3D reference viewport. Arrow keys pan, Control and arrow keys rotate, Enter selects an actual surface at the viewport center.',
      );
      controls.listenToKeyEvents(renderer.domElement);
      renderer.domElement.addEventListener('keydown', keyPick);
    }

    const up = (event: PointerEvent) => {
      if (moved) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hit = pickSemantic(batchesRef.current, ray);
      if (hit) selectRef.current(hit.structureId, hit.point.toArray() as [number, number, number], hit);
    };

    const lost = (event: Event) => {
      event.preventDefault();
      onUnavailable('3D context lost; structure buttons remain available.');
    };
    const restored = () => {
      onUnavailable(null);
      render();
    };

    renderer.domElement.addEventListener('webglcontextrestored', restored);
    renderer.domElement.addEventListener('pointerdown', down);
    renderer.domElement.addEventListener('pointerup', up);
    renderer.domElement.addEventListener('webglcontextlost', lost);
    controls.addEventListener('change', change);
    const observer = new ResizeObserver(resize);
    observer.observe(el);

    for (const b of batchesRef.current) scene.add(b.mesh);
    if (batchesRef.current.length > 0 && missingRef.current.length > 0) {
      const group = buildOverlayGroup(missingRef.current, selectedIdRef.current);
      overlayGroupRef.current = group;
      scene.add(group);
    }
    resize();

    return () => {
      renderer.domElement.removeEventListener('keydown', keyPick);
      observer.disconnect();
      controls.removeEventListener('change', change);
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextrestored', restored);
      renderer.domElement.removeEventListener('pointerdown', down);
      renderer.domElement.removeEventListener('pointerup', up);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      // Geometry/material ownership of SemanticBatches belongs to the session, never dispose it twice here.
      disposeOverlayGroup(overlayGroupRef.current);
      overlayGroupRef.current = null;
      scene.clear();
      sceneRef.current = null;
      renderRef.current = null;
      frameRef.current = null;
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    disposeOverlayGroup(overlayGroupRef.current);
    overlayGroupRef.current = null;
    scene.clear();
    for (const b of batches) scene.add(b.mesh);
    // Keep WebGL scene strictly empty (0 GPU geometries) when no real system chunk is loaded.
    if (batches.length > 0 && missingRef.current.length > 0) {
      const group = buildOverlayGroup(missingRef.current, selectedIdRef.current);
      overlayGroupRef.current = group;
      scene.add(group);
    }
    frameRef.current?.();
    renderRef.current?.();
  }, [batches]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const hadOverlay = overlayGroupRef.current !== null;
    if (!hadOverlay && missingOverlays.length === 0) return;

    disposeOverlayGroup(overlayGroupRef.current);
    if (overlayGroupRef.current) {
      scene.remove(overlayGroupRef.current);
      overlayGroupRef.current = null;
    }

    if (batchesRef.current.length > 0 && missingOverlays.length > 0) {
      const group = buildOverlayGroup(missingOverlays, selectedId);
      overlayGroupRef.current = group;
      scene.add(group);
    }

    const selectedOverlay = missingOverlays.find((o) => o.structureId === selectedId);
    if (batchesRef.current.length > 0 && selectedOverlay) {
      const focusBox = new THREE.Box3();
      for (const b of selectedOverlay.boxes) {
        const half = new THREE.Vector3(b.size[0] / 2 + 0.04, b.size[1] / 2 + 0.04, b.size[2] / 2 + 0.04);
        const c = new THREE.Vector3(b.center[0], b.center[1], b.center[2]);
        focusBox.expandByPoint(c.clone().sub(half));
        focusBox.expandByPoint(c.clone().add(half));
      }
      frameRef.current?.(focusBox);
    }
    renderRef.current?.();
  }, [missingOverlays, selectedId]);

  return (
    <div className="relative h-[380px] w-full min-h-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-oled)] lg:h-full">
      {keyboardPicking ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 font-mono text-sm text-[var(--color-ink-display)]"
        >
          +
        </span>
      ) : null}

      <div
        ref={host}
        className="h-full w-full"
        data-anatomy-canvas="true"
        aria-label={`${label}; use the labelled structure buttons for keyboard selection`}
        data-selected-id={selectedId ?? 'none'}
      />

      {batches.length === 0 && missingOverlays.length > 0 ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4"
          data-missing-empty-overlay="true"
        >
          <div className="ares-missing-hatch pointer-events-auto max-w-md rounded-[var(--radius-md)] p-4 text-xs text-[var(--color-ink-display)]">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--color-status-caution)]">
              UNRESOLVED NATIVE FEMALE GEOMETRY · 0 MALE SUBSTITUTION
            </p>
            <p className="mt-1 text-[var(--color-ink-body)]">
              No native female geometry loaded in this frame. Translucent anchor bounds remain non-clickable until original female STL/GLB sources are verified.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {missingOverlays.map((overlay) => (
                <button
                  key={overlay.structureId}
                  type="button"
                  onClick={() => onSelectMissingOverlay?.(overlay.structureId)}
                  data-missing-overlay-id={overlay.structureId}
                  data-canonical-target={overlay.canonicalKey}
                  data-male-substitution="false"
                  className={`ares-interactive rounded border px-2 py-1 font-mono text-[10px] ${
                    selectedId === overlay.structureId
                      ? 'border-[var(--color-status-caution)] bg-[oklch(0.78_0.16_75/0.20)] text-[var(--color-ink-display)]'
                      : 'border-[oklch(0.78_0.16_75/0.35)] bg-[var(--color-surface-l1)] text-[var(--color-status-caution)]'
                  }`}
                >
                  {overlay.label}
                </button>
              ))}
            </div>
            {onOpenMissingProvenance ? (
              <button
                type="button"
                onClick={onOpenMissingProvenance}
                className="mt-2.5 font-mono text-[10px] text-[var(--color-accent-spatial)] underline"
              >
                Inspect source provenance &amp; Denver STL runbook
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {batches.length > 0 && missingOverlays.length > 0 ? (
        <div
          className="pointer-events-none absolute inset-x-2 bottom-2 z-10 flex flex-wrap items-center justify-between gap-1.5"
          data-missing-overlays="true"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1 rounded-[var(--radius-md)] border border-[oklch(0.78_0.16_75/0.35)] bg-[oklch(0.08_0.006_250/0.88)] px-2 py-1">
            <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-[var(--color-status-caution)]">
              Halo Anchors (v1.10 · 0 Male Sub):
            </span>
            {missingOverlays.map((overlay) => (
              <button
                key={overlay.structureId}
                type="button"
                onClick={() => onSelectMissingOverlay?.(overlay.structureId)}
                data-missing-overlay-id={overlay.structureId}
                data-canonical-target={overlay.canonicalKey}
                data-male-substitution="false"
                className={`ares-interactive rounded-full border px-2 py-0.5 font-mono text-[9.5px] ${
                  selectedId === overlay.structureId
                    ? 'border-[var(--color-status-caution)] bg-[oklch(0.78_0.16_75/0.22)] text-[var(--color-ink-display)]'
                    : 'border-[oklch(0.78_0.16_75/0.35)] bg-[oklch(0.12_0.008_250)] text-[var(--color-status-caution)]'
                }`}
              >
                {overlay.canonicalKey}
              </button>
            ))}
            {onOpenMissingProvenance ? (
              <button
                type="button"
                onClick={onOpenMissingProvenance}
                className="ml-1 font-mono text-[9.5px] text-[var(--color-accent-spatial)] underline"
              >
                Provenance
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
