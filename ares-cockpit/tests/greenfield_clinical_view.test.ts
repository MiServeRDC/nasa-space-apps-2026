import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Test rendered TSX using the installed Vite transformer, not source patterns.
test('Phase 1: rendered clinical data preserves missingness, channel and source', async (t) => {
  const vite = await createServer({ root: path.resolve(import.meta.dirname, '..'), configFile: false,
    server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom',
    logLevel: 'error', esbuild: { jsx: 'automatic' } });
  try {
    const [evaluation, gather, forecast, scenarioModule, validator] = await Promise.all([
      '/src/workbench/PhaseEvaluateDeck.tsx', '/src/workbench/PhaseGatherDeck.tsx',
      '/src/instruments/QuantileConeChart.tsx', '/src/lib/scenario.ts', '/src/lib/telemetryValidation.ts',
    ].map(p => vite.ssrLoadModule(p)));
    const scenario = scenarioModule.evaluate(scenarioModule.DEFAULT_WHATIF);
    const raw = { timestamp_ms: 1794700000000, relative_recording_time_s: 42,
      source_record_id: 'bidmc_01', astronaut_id: 'BIDMC-SUBJECT-01',
      model_validation_status: 'ILLUSTRATIVE_UNVALIDATED',
      provenance_manifest: { biometrics_source: 'RECORDED_TERRESTRIAL_BIDMC_CSV',
        biometrics_native_rate_hz: 1, ui_refresh_rate_hz: 20, scenario_overlay_mode: 'NONE_PURE_REPLAY' },
      biometrics: { heart_rate_bpm: 72, pulse_rate_bpm: 72, respiration_rate_brpm: 14,
        spo2_percent: 98, hrv_rmssd_ms: null, hrv_unavailable_reason: 'BEAT_INTERVALS_NOT_AVAILABLE' },
      safety_margins: { provenance: 'DERIVED_FROM_RECORDED_BIDMC', med_stl_rho_robustness: null,
        mission_readiness_index: null, alarm_level: 'DATA_DEGRADED_MISSING_CHANNELS' },
      nqs_stl: { rho_tau_w: -0.37, rho_ared: 0.63, rho_sost: 0.27, rho_rmssd: null, rho_sans: 0.18 },
      environment: null, hemodynamics: null, musculoskeletal: null };
    const packet = validator.normalizeTelemetryPacket(raw); assert.ok(packet);
    const render = (c: Parameters<typeof createElement>[0], p: object) => renderToStaticMarkup(createElement(c, p));
    const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    await t.test('null MRI/rho cannot become scenario numbers', () => {
      const html = render(evaluation.PhaseEvaluateLeftContext, { packet, scenario });
      assert.match(html, /data-clinical-field="mri"[^>]*data-availability="UNAVAILABLE"/);
      assert.match(html, /data-clinical-field="rhoGlobal"[^>]*data-availability="UNAVAILABLE"/);
    });
    await t.test('nested backend predicate margins survive normalization', () => {
      assert.equal(packet.safety_margins.per_predicate_rho?.tau_w, -0.37);
      const html = render(evaluation.PhaseEvaluateLeftContext, { packet, scenario });
      assert.match(text(html), /-0\.37/); assert.match(text(html), /0\.63/);
    });
    await t.test('absent habitat data is unavailable, never nominal O2/background dose', () => {
      const html = render(gather.PhaseGatherLeftContext, { packet, scenario });
      assert.doesNotMatch(text(html), /21\.3|NORMOXIC|0\.45/);
      assert.match(html, /data-clinical-field="cabinO2"[^>]*data-availability="UNAVAILABLE"/);
    });
    await t.test('HR-only cones cannot render under rho', () => {
      const q = { q05: 70, q50: 80, q95: 90 };
      const html = render(forecast.QuantileConeChart, { channelId: 'rho_global', unit: 'rho',
        timestralSummary: { channel_cones: [{ channel_name: 'heart_rate_bpm', horizon_15m: q, horizon_1h: q, horizon_6h: q, horizon_24h: q }] } });
      assert.match(text(html), /Forecast unavailable/); assert.doesNotMatch(html, /<svg/);
    });
    await t.test('no forecast cannot fabricate a cone from currentRho', () => {
      const html = render(forecast.QuantileConeChart, { channelId: 'rho_global', unit: 'rho', currentRho: 0.42 });
      assert.match(text(html), /Forecast unavailable/); assert.doesNotMatch(html, /<svg/);
    });
    await t.test('incompatible channel/unit fails closed', () => {
      const q = { q05: 0.1, q50: 0.2, q95: 0.3 };
      const html = render(forecast.QuantileConeChart, { channelId: 'rho_global', unit: 'bpm',
        timestralSummary: { channel_cones: [{ channel_name: 'rho_global', horizon_15m: q, horizon_1h: q, horizon_6h: q, horizon_24h: q }] } });
      assert.match(text(html), /Forecast unavailable/); assert.doesNotMatch(html, /<svg/);
    });
    await t.test('hardware source passes actual payload validation', () => {
      assert.equal(validator.isValidTelemetryPayload({ ...raw, provenance_manifest: {
        ...raw.provenance_manifest, biometrics_source: 'HARDWARE_WEARABLE' } }), true);
    });
    const [imaging, horizon, adapter, dagLens, catalog, store] = await Promise.all([
      '/src/lenses/DiagnosticImagingLens.tsx', '/src/workbench/HorizonBar.tsx',
      '/src/lib/clinicalViewModel.ts', '/src/lenses/BranchedPlaybookDagLens.tsx',
      '/src/lib/playbookCatalog.ts', '/src/stores/workbenchStore.ts',
    ].map(p => vite.ssrLoadModule(p)));
    await t.test('zero survives; NaN and explicit unavailable provenance do not', () => {
      const vm = adapter.buildClinicalViewModel({ ...packet, safety_margins: {
        ...packet.safety_margins, mission_readiness_index: 0, med_stl_rho_robustness: NaN } });
      assert.equal(vm.mri.value, 0); assert.equal(vm.rhoGlobal.value, null);
      const unavailable = adapter.buildClinicalViewModel({ ...packet, safety_margins: {
        ...packet.safety_margins, provenance: 'UNAVAILABLE', mission_readiness_index: 95 } });
      assert.equal(unavailable.mri.value, null);
    });
    await t.test('an explicit null predicate map is not imputed from a second source', () => {
      const p = validator.normalizeTelemetryPacket({ ...raw, safety_margins: {
        ...raw.safety_margins, per_predicate_rho: null } });
      assert.ok(p); assert.equal(p.safety_margins.per_predicate_rho, undefined);
    });
    await t.test('matching short HR forecast renders only published horizons', () => {
      const q = { q05: 70, q50: 80, q95: 90 };
      const html = render(forecast.QuantileConeChart, { channelId: 'heart_rate_bpm', unit: 'bpm',
        timestralSummary: { short_horizon_cones: [{ channel_name: 'heart_rate_bpm', horizon_10s: q,
          horizon_30s: q, horizon_60s: q }] } });
      assert.match(html, /data-forecast-availability="AVAILABLE"/);
      assert.match(text(html), /\+10s/); assert.doesNotMatch(text(html), /\+15m|\+24h/);
    });
    await t.test('rho forecast is withheld when backend abstains without certificate', () => {
      const q = { q05: -0.1, q50: 0.2, q95: 0.4 };
      const html = render(forecast.QuantileConeChart, { channelId: 'rho_global', unit: 'rho',
        timestralSummary: { confidence_state: 'ABSTAINED_FALLBACK_DETERMINISTIC',
          channel_cones: [{ channel_name: 'rho_global', horizon_15m: q }] } });
      assert.match(text(html), /Forecast unavailable/); assert.doesNotMatch(html, /<svg/);
    });
    await t.test('missing imaging values produce no fabricated ultrasound canvas', () => {
      const html = render(imaging.DiagnosticImagingLens, { packet, scenario, thrombusConfirmed: null,
        onChangeThrombusConfirmed() {} });
      assert.match(html, /data-imaging-availability="UNAVAILABLE"/);
      assert.doesNotMatch(html, /<canvas/); assert.match(text(html), /Procedural anatomy illustration/);
    });
    await t.test('hardware and local preview are identified by the actual packet', () => {
      const props = { telemetryStatus: { isStale: false, heldSample: false }, transportMode: 'BROWSER_WEBSOCKET' };
      const hardware = { ...packet, provenance_manifest: { ...packet.provenance_manifest, biometrics_source: 'HARDWARE_WEARABLE' } };
      const html = render(horizon.HorizonBar, { ...props, packet: hardware });
      assert.match(text(html), /HARDWARE TELEMETRY/); assert.doesNotMatch(text(html), /DELTA SIMULATED|EMPIRICAL OBSERVED/);
      const preview = render(horizon.HorizonBar, { ...props, packet: { ...hardware, is_local_simulation: true } });
      assert.match(text(preview), /LOCAL SCENARIO PREVIEW/);
    });
    await t.test('absorbed radiation stays mGy; no equivalent dose is inferred', () => {
      const p = validator.normalizeTelemetryPacket({ ...raw, environment: { provenance: 'SIMULATED_SCENARIO_INPUT',
        cumulative_radiation_mgy: 12, ambient_dose_rate_ugy_h: 30 } });
      assert.ok(p); const vm = adapter.buildClinicalViewModel(p);
      assert.equal(vm.radiationDose.value, null); assert.equal(vm.cumulativeRadiation.value, 12);
      assert.equal(vm.cumulativeRadiation.unit, 'mGy');
    });
    await t.test('all 15 playbooks resolve and render against the integrated contract', () => {
      assert.equal(catalog.ALL_CRYSTALLIZED_PLAYBOOK_LIST.length, 15);
      for (const entry of catalog.ALL_CRYSTALLIZED_PLAYBOOK_LIST) {
        store.useWorkbenchStore.setState({ selectedPlaybookId: entry.playbook_id });
        const p = { ...packet, active_playbook: { playbook_id: entry.playbook_id,
          title: entry.title, current_step: 1, total_steps: 1, step_instruction: '',
          safety_gates: { anticoagulant_lock_active: true, lbnp_auto_vent_armed: true,
            eva_suit_damping_active: false }, actions: entry.default_actions } };
        const resolved = dagLens.resolvePlaybookSafetyDag(p, scenario, scenarioModule.DEFAULT_WHATIF, null, entry.playbook_id);
        assert.equal(resolved.playbookId, entry.playbook_id);
        const html = render(dagLens.BranchedPlaybookDagLens, { packet: p, scenario,
          whatIf: scenarioModule.DEFAULT_WHATIF, thrombusConfirmed: null, onChangeWhatIf() {} });
        assert.ok(text(html).includes(text(render('span', { children: entry.title }))), `${entry.playbook_id} must render its own title`);
        assert.doesNotMatch(html, /NaN|undefined/);
      }
      store.useWorkbenchStore.setState({ selectedPlaybookId: null });
    });
    await t.test('short forecast honors its own abstention certificate', () => {
      const q = { q05: 70, q50: 80, q95: 90 };
      const html = render(forecast.QuantileConeChart, { channelId: 'heart_rate_bpm', unit: 'bpm',
        timestralSummary: { short_horizon_abstention: { abstained: true, status: 'ABSTAINED_FALLBACK_DETERMINISTIC',
          reason: 'Insufficient residual history', adaptive_alpha_t: 0.1, sqi_score: 0.8 },
          short_horizon_cones: [{ channel_name: 'heart_rate_bpm', horizon_10s: q }] } });
      assert.match(text(html), /Insufficient residual history/); assert.doesNotMatch(html, /<svg/);
    });
    await t.test('valid rho remains on its own physical axis', () => {
      const q = { q05: -0.1, q50: 0.2, q95: 0.4 };
      const html = render(forecast.QuantileConeChart, { channelId: 'rho_global', unit: 'rho',
        timestralSummary: { confidence_state: 'HEURISTIC_GATE_ACCEPTED',
          channel_cones: [{ channel_name: 'rho_global', horizon_15m: q, horizon_1h: q }] } });
      assert.match(html, /data-forecast-availability="AVAILABLE"/);
      assert.match(text(html), /RHO_GLOBAL/); assert.doesNotMatch(text(html), /70|80|90/);
    });
    await t.test('explicit null ONSD cannot inherit a second source measurement', () => {
      const p = validator.normalizeTelemetryPacket({ ...raw, hemodynamics: { provenance: 'DERIVED_COMPUTED',
        onsd_mm: null }, sans_ocular: { onsd_mm: 6.1 } });
      assert.ok(p); assert.equal(p.hemodynamics.onsd_mm, null);
    });
    await t.test('published imaging scalars remain illustrative without invented uncertainty', () => {
      const p = validator.normalizeTelemetryPacket({ ...raw, hemodynamics: { provenance: 'DERIVED_COMPUTED',
        ijv_csa_cm2: 0.83, ijv_velocity_max_cm_s: 5.2, wall_shear_stress_dyn_cm2: 0.9 } });
      assert.ok(p);
      const html = render(imaging.DiagnosticImagingLens, { packet: p, scenario, thrombusConfirmed: null,
        onChangeThrombusConfirmed() {} });
      assert.match(text(html), /CSA 0.83/); assert.match(text(html), /PROCEDURAL ILLUSTRATION/);
      assert.doesNotMatch(text(html), /EMPIRICAL - BIDMC|95%/);
    });
  } finally { await vite.close(); }
});
