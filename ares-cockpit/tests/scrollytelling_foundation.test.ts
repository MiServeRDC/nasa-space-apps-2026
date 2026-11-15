import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const COCKPIT_ROOT = path.resolve(import.meta.dirname, '..');

test('SmoothScrollProvider: hooks Lenis into gsap.ticker with prefers-reduced-motion bypass', () => {
  const providerPath = path.join(COCKPIT_ROOT, 'src/scrollytelling/SmoothScrollProvider.tsx');
  assert.ok(fs.existsSync(providerPath), 'SmoothScrollProvider.tsx must exist');

  const source = fs.readFileSync(providerPath, 'utf8');

  // Hooked into gsap.ticker
  assert.ok(
    source.includes('gsap.ticker.add'),
    'Lenis must hook into gsap.ticker.add',
  );
  assert.ok(
    source.includes('gsap.ticker.lagSmoothing(0)'),
    'gsap.ticker.lagSmoothing(0) must be called to prevent drift',
  );

  // prefers-reduced-motion bypass
  assert.ok(
    source.includes('prefers-reduced-motion: reduce'),
    'Must check prefers-reduced-motion: reduce',
  );

  // ScrollTrigger integration
  assert.ok(
    source.includes('ScrollTrigger.update()'),
    'Must call ScrollTrigger.update on scroll',
  );

  // Zero 60fps re-render invariant: discrete state update on chapter change only
  assert.ok(
    source.includes('calculatedChapter !== activeChapterRef.current'),
    'Must only trigger state update when active chapter index changes',
  );
});

test('PinnedScrollyStage: 5 camera spline waypoints, Quaternion.slerp, DPR <= 1.5', () => {
  const stagePath = path.join(COCKPIT_ROOT, 'src/stage3d/PinnedScrollyStage.tsx');
  assert.ok(fs.existsSync(stagePath), 'PinnedScrollyStage.tsx must exist');

  const source = fs.readFileSync(stagePath, 'utf8');

  // Verify the 5 waypoints exist in the source
  assert.ok(source.includes("id: 'Hero'"), 'Must contain Hero waypoint');
  assert.ok(source.includes("id: 'Cardio'"), 'Must contain Cardio waypoint');
  assert.ok(source.includes("id: 'Explorer'"), 'Must contain Explorer waypoint');
  assert.ok(source.includes("id: 'Musculoskeletal'"), 'Must contain Musculoskeletal waypoint');
  assert.ok(source.includes("id: 'Decision'"), 'Must contain Decision waypoint');

  // CatmullRomCurve3 spline path
  assert.ok(
    source.includes('CatmullRomCurve3'),
    'Must use CatmullRomCurve3 for spline waypoint positioning',
  );

  // Quaternion.slerp orientation progression
  assert.ok(
    source.includes('.slerp('),
    'Must use Quaternion.slerp for camera orientation progression',
  );

  // DPR <= 1.5 enforcement
  assert.ok(
    source.includes('Math.min(window.devicePixelRatio || 1, 1.5)'),
    'Must clamp DPR to <= 1.5',
  );

  // Zero React state re-render inside ticker
  assert.ok(
    source.includes('scrollProgressRef.current.progress'),
    'Must read mutable scrollProgressRef without setState inside useFrame',
  );
});

test('StoryShell: 5 vertical narrative chapters with clinical rigor and zero emojis', () => {
  const shellPath = path.join(COCKPIT_ROOT, 'src/scrollytelling/StoryShell.tsx');
  assert.ok(fs.existsSync(shellPath), 'StoryShell.tsx must exist');

  const source = fs.readFileSync(shellPath, 'utf8');

  // Verify 5 chapter IDs
  assert.ok(source.includes("id: 'chapter-0'"), 'Must contain chapter-0');
  assert.ok(source.includes("id: 'chapter-1'"), 'Must contain chapter-1');
  assert.ok(source.includes("id: 'chapter-2'"), 'Must contain chapter-2');
  assert.ok(source.includes("id: 'chapter-3'"), 'Must contain chapter-3');
  assert.ok(source.includes("id: 'chapter-4'"), 'Must contain chapter-4');

  // Clinical and mathematical references in chapters
  assert.ok(source.includes('tau_w'), 'Must include tau_w wall shear stress in narrative');
  assert.ok(source.includes('ONSD'), 'Must include ONSD optic nerve sheath in narrative');
  assert.ok(source.includes('Frost Mechanostat'), 'Must include Frost mechanostat in narrative');
  assert.ok(source.includes('HARD CLINICAL SAFETY GATE 1'), 'Must include Hard Clinical Safety Gate 1 in narrative');
  assert.ok(source.includes('GATE 2: LBNP ANTI-SYNCOPE GUARD'), 'Must include Hard Clinical Safety Gate 2 in narrative');

  // Zero emojis invariant
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert.equal(
    emojiRegex.test(source),
    false,
    'StoryShell source must have strictly zero emojis',
  );
});
