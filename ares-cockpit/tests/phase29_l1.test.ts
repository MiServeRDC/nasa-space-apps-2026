import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CRYSTALLIZED_PLAYBOOK_LIST,
  deriveOfflineActivePlaybook,
  enforceHardSafetyGatesOnActions,
  getCatalogEntry,
  isAnticoagulantAction,
} from '../src/lib/playbookCatalog.ts';
import {
  computeLogHorizonXi,
  normalizeConformalGateStatus,
  normalizeHypergraphSpatial,
  normalizeModelValidationStatus,
  normalizeTelemetryPacket,
  normalizeTimestralQuantiles,
  parseMonotoneQuantileTriplet,
} from '../src/lib/telemetryValidation.ts';
import {
  decodeBinaryTelemetryFrame,
  encodeTestBinaryTelemetryFrame,
  FLAG_BEAT_INTERVALS_NOT_AVAILABLE,
  FLAG_CONFORMAL_ABSTAINED,
  FLAG_GATE1_ANTICOAG_LOCK,
  FLAG_GATE2_LBNP_VENT,
  FLAG_GATE3_EVA_DAMPING,
  FLAG_TERRESTRIAL_BENCHMARKED_ONLY,
  mergeBinaryFrameIntoPacket,
} from '../src/lib/binaryTelemetryDecoder.ts';
import {
  CANONICAL_CONDUCTION_EDGES,
  CANONICAL_REGIONS,
  CANONICAL_UBERON_CURIES,
  computeCellColorStatus,
  isValidCanonicalUberonCurie,
  projectHypergraphTo3D,
  projectNormalizedCentroidToR3f,
} from '../src/modules/body-3d-heatmap/uberonSpatialMapping.ts';
import {
  GLTF_BINARY_MAGIC_LE,
  hasValidGlbMagicHeader,
  parseGlbManifest,
} from '../src/modules/body-3d-heatmap/glbHeaderGuard.ts';
import type { TelemetryPacket } from '../src/types/telemetry.ts';

function makeMinimalPacket(): TelemetryPacket {
  return {
    timestamp_ms: 1_700_000_000_000,
    relative_recording_time_s: 12,
    source_record_id: 'BIDMC_01',
    mission_elapsed_days: 0,
    astronaut_id: 'ASTRO-01',
    provenance_manifest: {
      biometrics_source: 'RECORDED_TERRESTRIAL_BIDMC_CSV',
      biometrics_native_rate_hz: 1,
      ui_refresh_rate_hz: 20,
      scenario_overlay_mode: 'NONE_PURE_REPLAY',
      dataset_provenance: 'PHYSIONET_BIDMC_V1_0_0',
      manifest_sha256_verified: true,
    },
    biometrics: {
      heart_rate_bpm: 72,
      pulse_rate_bpm: 72,
      respiration_rate_brpm: 16,
      spo2_percent: 98,
      rr_interval_ms: null,
      hrv_rmssd_ms: null,
      hrv_unavailable_reason: 'BEAT_INTERVALS_NOT_AVAILABLE',
      core_temp_celsius: null,
      sqi_score: 0.92,
      missing_channels: ['rr_interval_ms', 'hrv_rmssd_ms'],
      quality_flags: ['BEAT_INTERVALS_NOT_AVAILABLE'],
    },
    hemodynamics: null,
    musculoskeletal: null,
    environment: {
      provenance: 'UNAVAILABLE',
      cabin_co2_ppm: null,
      cabin_o2_kpa: null,
      ambient_radiation_rate_ugy_h: null,
      cumulative_radiation_mgy: null,
    },
    safety_margins: {
      provenance: 'DERIVED_FROM_RECORDED_BIDMC',
      med_stl_rho_robustness: null,
      time_to_violation_days: null,
      mission_readiness_index: null,
      alarm_level: 'NOMINAL',
    },
    active_playbook: null,
    quality_flags: ['BEAT_INTERVALS_NOT_AVAILABLE'],
    is_local_simulation: false,
  };
}

describe('Phase 29 L1: playbookCatalog', () => {
  it('exposes all 5 canonical crystallized MedOps playbooks #01..#05', () => {
    assert.equal(CRYSTALLIZED_PLAYBOOK_LIST.length, 5);
    assert.equal(getCatalogEntry('#01')?.playbook_id, 'PLAYBOOK_01_VENOUS_STASIS_LBNP');
    assert.equal(getCatalogEntry('#02')?.playbook_id, 'PLAYBOOK_02_CONFIRMED_IJV_THROMBUS');
    assert.equal(getCatalogEntry('#03')?.playbook_id, 'PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED');
    assert.equal(getCatalogEntry('#04')?.playbook_id, 'PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION');
    assert.equal(getCatalogEntry('#05')?.playbook_id, 'PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS');
  });

  it('enforces Gate 1 anticoagulant lock, Gate 2 LBNP auto-vent, and Gate 3 0.38g EVA damping', () => {
    const pb2 = getCatalogEntry('#02');
    assert.ok(pb2);
    assert.ok(pb2.default_actions.some((a) => isAnticoagulantAction(a)));

    // Locked Gate 1 strips anticoagulant actions; Gate 2 adds emergency vent; Gate 3 adds EVA damping
    const gated = enforceHardSafetyGatesOnActions(
      pb2.default_actions,
      {
        anticoagulant_lock_active: true,
        lbnp_auto_vent_armed: true,
        eva_suit_damping_active: true,
      },
      { lbnpActive: true, sbpDropMmhg: 18, hrBpm: 92, gaiPct: 14.2 },
    );
    assert.equal(gated.some((a) => isAnticoagulantAction(a)), false);
    assert.equal(gated[0].action_id, 'ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG');
    assert.equal(gated[gated.length - 1].action_id, 'ACT_EVA_SUIT_ANKLE_DAMPING_038G');

    // Unlocked Gate 1 (POCUS thrombus confirmed) preserves anticoagulant actions
    const pbOfflineConfirmed = deriveOfflineActivePlaybook({
      rhoTauW: -0.1,
      rhoSans: 0.3,
      gaiPct: 13.0,
      thrombusConfirmed: true,
    });
    assert.equal(pbOfflineConfirmed.playbook_id, 'PLAYBOOK_02_CONFIRMED_IJV_THROMBUS');
    assert.equal(pbOfflineConfirmed.safety_gates?.anticoagulant_lock_active, false);
    assert.equal(pbOfflineConfirmed.safety_gates?.eva_suit_damping_active, true);
    assert.ok(pbOfflineConfirmed.actions?.some((a) => isAnticoagulantAction(a)));
  });
});

describe('Phase 29 L1: telemetryValidation quantiles, gates & validation statuses', () => {
  it('validates parseMonotoneQuantileTriplet monotonicity and finiteness', () => {
    assert.deepEqual(parseMonotoneQuantileTriplet({ q05: 62, q50: 71, q95: 84 }), {
      q05: 62,
      q50: 71,
      q95: 84,
    });
    assert.equal(parseMonotoneQuantileTriplet({ q05: 75, q50: 70, q95: 84 }), null);
    assert.equal(parseMonotoneQuantileTriplet({ q05: 62, q50: 88, q95: 84 }), null);
    assert.equal(parseMonotoneQuantileTriplet({ q05: 62, q50: Number.NaN, q95: 84 }), null);
  });

  it('normalizes Rust PascalCase and SCREAMING_SNAKE ConformalGateStatus & ModelValidationStatus', () => {
    assert.equal(
      normalizeConformalGateStatus('AbstainedFallbackDeterministic'),
      'ABSTAINED_FALLBACK_DETERMINISTIC',
    );
    assert.equal(
      normalizeConformalGateStatus('ABSTAINED_FALLBACK'),
      'ABSTAINED_FALLBACK_DETERMINISTIC',
    );
    assert.equal(
      normalizeConformalGateStatus('HeuristicGateAccepted'),
      'HEURISTIC_GATE_ACCEPTED',
    );
    assert.equal(
      normalizeModelValidationStatus('IllustrativeUnvalidated'),
      'ILLUSTRATIVE_UNVALIDATED',
    );
    assert.equal(
      normalizeModelValidationStatus('InternallyBenchmarkedTerrestrial'),
      'INTERNALLY_BENCHMARKED_TERRESTRIAL',
    );
  });

  it('maps log-horizon xi strictly monotone in [0, 1] across 0s..86400s (+15m..+24h)', () => {
    assert.ok(Math.abs(computeLogHorizonXi(0) - 0) < 1e-6);
    assert.ok(Math.abs(computeLogHorizonXi(86400) - 1) < 1e-6);
    assert.ok(computeLogHorizonXi(900) > 0 && computeLogHorizonXi(900) < computeLogHorizonXi(3600));
    assert.ok(computeLogHorizonXi(3600) < computeLogHorizonXi(21600));
    assert.ok(computeLogHorizonXi(21600) < computeLogHorizonXi(86400));
  });

  it('enforces Issue #11 in normalizeTimestralQuantiles when rmssd_ms is absent', () => {
    const tq = normalizeTimestralQuantiles(
      {
        model_validation_status: 'InternallyBenchmarkedTerrestrial',
        conformal_status: 'AbstainedFallbackDeterministic',
        abstention_certificate: {
          abstained: true,
          status: 'AbstainedFallbackDeterministic',
          reason: 'OOD_COHORT_RESIDUAL',
          empirical_coverage_error: 0.12,
          adaptive_alpha_t: 0.1,
          interval_width: 8.5,
          sqi_score: 0.92,
          missing_ratio: 0.25,
          timestamp_s: 120,
        },
        heart_rate_bpm_cone: { q05: 64, q50: 72, q95: 80 },
        rmssd_ms_cone: { q05: 10, q50: 25, q95: 40 },
        rho_global_cone: { q05: -0.2, q50: 0.1, q95: 0.4 },
        ttv_hours_cone: { q05: 12, q50: 24, q95: 48 },
        channel_cones: [
          {
            channel_name: 'hr_bpm',
            horizon_15m: { q05: 68, q50: 72, q95: 76 },
            horizon_1h: { q05: 66, q50: 72, q95: 78 },
            horizon_6h: { q05: 64, q50: 72, q95: 80 },
            horizon_24h: { q05: 62, q50: 72, q95: 82 },
          },
          {
            channel_name: 'rmssd_ms',
            horizon_15m: { q05: 15, q50: 20, q95: 25 },
            horizon_1h: { q05: 14, q50: 20, q95: 26 },
            horizon_6h: { q05: 12, q50: 20, q95: 28 },
            horizon_24h: { q05: 10, q50: 20, q95: 30 },
          },
        ],
      },
      { hrvUnavailableReason: 'BEAT_INTERVALS_NOT_AVAILABLE', hrvRmssdMs: null },
    );

    assert.ok(tq);
    assert.equal(tq.model_validation_status, 'INTERNALLY_BENCHMARKED_TERRESTRIAL');
    assert.equal(tq.conformal_status, 'ABSTAINED_FALLBACK_DETERMINISTIC');
    assert.deepEqual(tq.heart_rate_bpm_cone, { q05: 64, q50: 72, q95: 80 });
    assert.equal(tq.rmssd_ms_cone, null);
    assert.equal(tq.rho_global_cone, null);
    assert.equal(tq.ttv_hours_cone, null);
    assert.equal(tq.channel_cones?.length, 1);
    assert.equal(tq.channel_cones?.[0].channel_name, 'hr_bpm');
  });

  it('normalizes full Rust WireTelemetryPacket JSON without dropping Phase 29 fields', () => {
    const packet = normalizeTelemetryPacket({
      timestamp_ms: 1700000005000,
      relative_recording_time_s: 5,
      source_record_id: 'BIDMC_01',
      astronaut_id: 'ASTRO-01',
      alert_severity: 'ADVISORY',
      model_validation_status: 'IllustrativeUnvalidated',
      provenance_manifest: {
        biometrics_source: 'RECORDED_TERRESTRIAL_BIDMC_CSV',
        biometrics_native_rate_hz: 1,
        ui_refresh_rate_hz: 20,
        scenario_overlay_mode: 'NONE_PURE_REPLAY',
      },
      biometrics: {
        heart_rate_bpm: 74,
        pulse_rate_bpm: 74,
        respiration_rate_brpm: 15,
        spo2_percent: 98,
        hrv_rmssd_ms: null,
        hrv_unavailable_reason: 'BEAT_INTERVALS_NOT_AVAILABLE',
        sqi_score: 0.95,
      },
      nqs_stl: {
        rho_global: 0.35,
        mri_pct: 78,
        ttv_hours: 120,
        ttv_interval_kind: 'IllustrativeScenarioRange',
      },
      active_playbook: {
        playbook_id: 'PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION',
        current_step: 2,
        total_steps: 3,
        actions: [
          {
            action_id: 'ACT_LBNP_EVENING',
            label: 'Evening LBNP -20 mmHg',
            category: 'MECHANICAL',
            delta_rho_per_hour: 0.12,
          },
        ],
        safety_gates: {
          anticoagulant_lock_active: true,
          lbnp_auto_vent_armed: true,
          eva_suit_damping_active: false,
        },
      },
    });

    assert.ok(packet);
    assert.equal(packet.model_validation_status, 'ILLUSTRATIVE_UNVALIDATED');
    assert.equal(packet.safety_margins.ttv_interval_kind, 'ILLUSTRATIVE_SCENARIO_RANGE');
    assert.equal(packet.active_playbook?.actions?.length, 1);
    assert.equal(packet.biometrics.hrv_rmssd_ms, null);
    assert.equal(packet.biometrics.hrv_unavailable_reason, 'BEAT_INTERVALS_NOT_AVAILABLE');
  });
});

describe('Phase 29 L1: binaryTelemetryDecoder playbook/gate merge & Issue #11/#12', () => {
  it('constructs full active_playbook for binary IDs 1..5 even when prev.active_playbook is null', () => {
    const prev = makeMinimalPacket();
    assert.equal(prev.active_playbook, null);

    const frameBytes = encodeTestBinaryTelemetryFrame({
      active_playbook_id: 2,
      quality_flags_mask:
        FLAG_BEAT_INTERVALS_NOT_AVAILABLE |
        FLAG_GATE1_ANTICOAG_LOCK |
        FLAG_GATE2_LBNP_VENT |
        FLAG_GATE3_EVA_DAMPING |
        FLAG_CONFORMAL_ABSTAINED |
        FLAG_TERRESTRIAL_BENCHMARKED_ONLY,
      rmssd_ms: 30, // must be forced to null by FLAG_BEAT_INTERVALS_NOT_AVAILABLE
    });

    const decoded = decodeBinaryTelemetryFrame(frameBytes);
    const merged = mergeBinaryFrameIntoPacket(prev, decoded);

    assert.equal(merged.biometrics.hrv_rmssd_ms, null);
    assert.equal(merged.biometrics.hrv_unavailable_reason, 'BEAT_INTERVALS_NOT_AVAILABLE');
    assert.equal(merged.model_validation_status, 'INTERNALLY_BENCHMARKED_TERRESTRIAL');
    assert.equal(merged.timestral_quantiles?.conformal_status, 'ABSTAINED_FALLBACK_DETERMINISTIC');
    assert.equal(merged.active_playbook?.playbook_id, 'PLAYBOOK_02_CONFIRMED_IJV_THROMBUS');
    assert.equal(merged.active_playbook?.safety_gates?.anticoagulant_lock_active, true);
    assert.equal(merged.active_playbook?.safety_gates?.lbnp_auto_vent_armed, true);
    assert.equal(merged.active_playbook?.safety_gates?.eva_suit_damping_active, true);
    assert.ok((merged.active_playbook?.actions?.length ?? 0) >= 1);
  });
});

describe('Phase 29 L1: uberonSpatialMapping CURIEs, affine Phi, Issue #11 & 6 arcs', () => {
  it('enforces the 5 canonical UBERON CURIEs and rejects UBERON:0001585', () => {
    assert.equal(CANONICAL_REGIONS.length, 5);
    for (const curie of CANONICAL_UBERON_CURIES) {
      assert.equal(isValidCanonicalUberonCurie(curie), true);
    }
    assert.equal(isValidCanonicalUberonCurie('UBERON:0001585'), false);
    assert.equal(isValidCanonicalUberonCurie('UBERON:0001586'), true);
  });

  it('projects normalized centroids onto R3F frame and builds 6 directed conduction arcs', () => {
    const eyeWorld = projectNormalizedCentroidToR3f([0.0, 0.82, 0.05]);
    assert.deepEqual(eyeWorld, [0, 1.5524, 0.075]);

    const normalized = normalizeHypergraphSpatial({
      hottest_region: 'InternalJugularVein',
      habitat_zone: 'LBNP_CHAMBER',
      violates_policy: false,
      rho_current_location: 0.42,
      biokg_clause: 'IJV_stasis -> thrombosis_risk',
      cells: [
        {
          region: 'InternalJugularVein',
          key: 'ijv',
          uberon_curie: 'UBERON:0001586',
          centroid: [-0.06, 0.62, 0.04],
          local_intensity: 0.8,
          propagated_intensity: 0.8,
          observed: true,
        },
        {
          region: 'HeartCardioAutonomic',
          key: 'heart',
          uberon_curie: 'UBERON:0000948',
          centroid: [0.0, 0.3, 0.02],
          local_intensity: 0.0,
          propagated_intensity: 0.02,
          observed: false,
        },
      ],
    });

    const scene = projectHypergraphTo3D(normalized);
    assert.equal(scene.nodes.length, 5);
    assert.equal(scene.arcs.length, CANONICAL_CONDUCTION_EDGES.length);
    assert.equal(scene.arcs.length, 6);
    assert.equal(scene.hottestRegion, 'InternalJugularVein');
    assert.equal(scene.nodesByRegion.InternalJugularVein.color, '#f43f5e');

    // Issue #11: unobserved node with <0.05 propagation MUST be neutral gray UNOBSERVED_NO_RR, never cyan
    assert.equal(scene.nodesByRegion.HeartCardioAutonomic.color, '#6b7280');
    assert.equal(
      scene.nodesByRegion.HeartCardioAutonomic.observationState,
      'UNOBSERVED_NO_RR',
    );
    assert.notEqual(scene.nodesByRegion.HeartCardioAutonomic.color, '#22d3ee');

    // Propagated-only unobserved node (>=0.05) maps to amber PROPAGATED_ONLY
    assert.deepEqual(computeCellColorStatus(0, 0.25, false), {
      color: '#facc15',
      observationState: 'PROPAGATED_ONLY',
    });
  });
});

describe('Phase 29 L1: GLTF_BINARY_MAGIC_LE & air-gapped GLB manifest guard', () => {
  it('accepts valid glTF 2.0 binary headers and rejects HTML/corrupt payloads', () => {
    assert.equal(GLTF_BINARY_MAGIC_LE, 0x46546c67);

    const validGlb = new ArrayBuffer(12);
    const dv = new DataView(validGlb);
    dv.setUint32(0, GLTF_BINARY_MAGIC_LE, true);
    dv.setUint32(4, 2, true);
    dv.setUint32(8, 12, true);
    assert.equal(hasValidGlbMagicHeader(validGlb), true);

    const htmlFallback = new TextEncoder().encode('<!doctype html><html></html>');
    assert.equal(hasValidGlbMagicHeader(htmlFallback), false);

    const wrongVersion = new ArrayBuffer(12);
    const dvWrong = new DataView(wrongVersion);
    dvWrong.setUint32(0, GLTF_BINARY_MAGIC_LE, true);
    dvWrong.setUint32(4, 1, true);
    assert.equal(hasValidGlbMagicHeader(wrongVersion), false);
  });

  it('rejects external CDN URLs and keeps local same-origin /models/ entries', () => {
    const manifest = parseGlbManifest({
      version: 1,
      assets: [
        {
          id: 'local_ok',
          label: 'Local Suit',
          url: '/models/nasa_eva_suit.glb',
          target_uberon: ['UBERON:0000948'],
          default_visible: false,
          scale: [1, 1, 1],
          offset: [0, 0, 0],
        },
        {
          id: 'remote_blocked',
          label: 'External CDN Blocked',
          url: 'https://cdn.example.com/suit.glb',
          target_uberon: ['UBERON:0000948'],
          default_visible: false,
          scale: [1, 1, 1],
          offset: [0, 0, 0],
        },
      ],
    });

    assert.ok(manifest);
    assert.equal(manifest.assets.length, 1);
    assert.equal(manifest.assets[0].id, 'local_ok');
  });
});
