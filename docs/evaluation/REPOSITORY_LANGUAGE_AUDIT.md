# Repository language review — 2026-11-15

## Judge entry points

The README launch path, judge walkthrough, packaging instructions and submission
copy are English. No Italian prose was detected in cockpit `src/` by the keyword
scan below. This is a targeted text review, not a language-recognition guarantee.
Names (for example, Università di Bologna and Carolina Bonafè), anatomy source
labels and historical filenames are not translated as application copy.

Translated 49 distinct CLI/help/error/log messages in five Rust source files:
core domain errors, BIDMC/wearable ingestion, DSP validation, audit mutex failures
and CLI startup/evaluation/smoke-test context. Error variants, JSON identities,
placeholders, algorithms and clinical rules are unchanged.

## Remaining Italian

The repository is **not entirely English**. Historical plans, project notes and
some Rust documentation comments still contain Italian. These are retained and
are not prerequisites for running the demo. In particular:

- `PANORAMICA_GENERALE_PROGETTO.md` is the legacy Italian project overview;
  its root `.typ`/`.pdf` and submission `.typ` counterparts are historical exports.
- `memory-bank/activeContext.md`, `progress.md` and other internal notes mix English
  with Italian historical entries.
- Many `docs/plans/phase_*.md` documents use Italian prose/headings.
- Some Rust module comments still say `Fase`, `Blocco` or describe internals in Italian.
- Older generated PDFs/media have not been retranslated or recreated. Existing
  slide/video assets are historical, not newly prepared submission deliverables.

## Targeted inventory

Scanned tracked first-party Markdown, Rust, TS/TSX, shell/Python/JS, Typst,
subtitles, JSON and configuration text for distinctive Italian words, including
`Fase`, `Blocco`, `della`, `questo`, `avvio`, `errore`, `sicurezza`, `dati` and
`verifica`. Third-party/vendor and agent-skill directories (including `skills/`), lockfiles and binary
assets were excluded. A hit indicates Italian or mixed-language text and can
include quoted source labels or historical filenames; it is not a whole-file
language classification. Binary PDFs/audio/video were not text-extracted.
This report is excluded from its own inventory.

| Area | Files with keyword hits |
| --- | ---: |
| Historical plans | 42 |
| Memory bank | 3 |
| Other first-party text | 16 |
| Rust source/comments | 17 |

### Files to consult for remaining prose

#### Historical plans

- [docs/plans/BLOCK_K_SYSTEM_TESTING_ARCHITECTURE.md](../plans/BLOCK_K_SYSTEM_TESTING_ARCHITECTURE.md) — first keyword hit at line 3; 1 matching lines.
- [docs/plans/BLOCK_N_CARBON_FORMAL_REVIEW.md](../plans/BLOCK_N_CARBON_FORMAL_REVIEW.md) — first keyword hit at line 4; 24 matching lines.
- [docs/plans/BLOCK_N_CLINICAL_MEDICINE_ARCHITECTURE.md](../plans/BLOCK_N_CLINICAL_MEDICINE_ARCHITECTURE.md) — first keyword hit at line 4; 70 matching lines.
- [docs/plans/RUST_ENGINE_PHASED_MASTER_PLAN.md](../plans/RUST_ENGINE_PHASED_MASTER_PLAN.md) — first keyword hit at line 1; 185 matching lines.
- [docs/plans/phase_01_A1_core_telemetry_contracts_and_provenance_plan.md](../plans/phase_01_A1_core_telemetry_contracts_and_provenance_plan.md) — first keyword hit at line 1; 29 matching lines.
- [docs/plans/phase_02_A2_nasa_std_3001_constants_errors_and_security_traits_plan.md](../plans/phase_02_A2_nasa_std_3001_constants_errors_and_security_traits_plan.md) — first keyword hit at line 1; 23 matching lines.
- [docs/plans/phase_03_B1_bidmc_reproducible_csv_replayer_and_null_handling_plan.md](../plans/phase_03_B1_bidmc_reproducible_csv_replayer_and_null_handling_plan.md) — first keyword hit at line 1; 17 matching lines.
- [docs/plans/phase_04_B2_shannon_spectral_entropy_sqi_and_scenario_overlay_plan.md](../plans/phase_04_B2_shannon_spectral_entropy_sqi_and_scenario_overlay_plan.md) — first keyword hit at line 1; 17 matching lines.
- [docs/plans/phase_05_C1_frost_hargens_rk4_sclerostin_mqi_and_gai_plan.md](../plans/phase_05_C1_frost_hargens_rk4_sclerostin_mqi_and_gai_plan.md) — first keyword hit at line 1; 16 matching lines.
- [docs/plans/phase_06_C2_jugular_shear_stress_lbnp_dose_response_and_sans_plan.md](../plans/phase_06_C2_jugular_shear_stress_lbnp_dose_response_and_sans_plan.md) — first keyword hit at line 1; 15 matching lines.
- [docs/plans/phase_07_C3_adhg_causal_petgraph_and_two_stage_bayesian_pocus_plan.md](../plans/phase_07_C3_adhg_causal_petgraph_and_two_stage_bayesian_pocus_plan.md) — first keyword hit at line 1; 15 matching lines.
- [docs/plans/phase_08_D1_nqs_stl_normalizer_and_lemire_o1_sliding_window_plan.md](../plans/phase_08_D1_nqs_stl_normalizer_and_lemire_o1_sliding_window_plan.md) — first keyword hit at line 1; 19 matching lines.
- [docs/plans/phase_09_D2_ewma_ols_ttv_predictor_and_mission_readiness_index_plan.md](../plans/phase_09_D2_ewma_ols_ttv_predictor_and_mission_readiness_index_plan.md) — first keyword hit at line 1; 13 matching lines.
- [docs/plans/phase_10_E1_type1_crystallized_medops_playbooks_dag_plan.md](../plans/phase_10_E1_type1_crystallized_medops_playbooks_dag_plan.md) — first keyword hit at line 1; 14 matching lines.
- [docs/plans/phase_11_E2_three_hard_clinical_safety_gates_state_machine_plan.md](../plans/phase_11_E2_three_hard_clinical_safety_gates_state_machine_plan.md) — first keyword hit at line 1; 14 matching lines.
- [docs/plans/phase_12_F1_role_based_crew_privacy_sha256_audit_and_aead_plan.md](../plans/phase_12_F1_role_based_crew_privacy_sha256_audit_and_aead_plan.md) — first keyword hit at line 1; 17 matching lines.
- [docs/plans/phase_13_G1_axum_20hz_websocket_and_sub_ms_stress_test_api_plan.md](../plans/phase_13_G1_axum_20hz_websocket_and_sub_ms_stress_test_api_plan.md) — first keyword hit at line 1; 10 matching lines.
- [docs/plans/phase_14_G2_fastmcp_stdio_jsonrpc_context_mode_server_plan.md](../plans/phase_14_G2_fastmcp_stdio_jsonrpc_context_mode_server_plan.md) — first keyword hit at line 1; 13 matching lines.
- [docs/plans/phase_15_H1_timestral_patch_scaler_rope_backbone.md](../plans/phase_15_H1_timestral_patch_scaler_rope_backbone.md) — first keyword hit at line 1; 24 matching lines.
- [docs/plans/phase_16_H2_dhf_monotone_quantiles_conformal_gate.md](../plans/phase_16_H2_dhf_monotone_quantiles_conformal_gate.md) — first keyword hit at line 1; 18 matching lines.
- [docs/plans/phase_17_H3_async_1hz_forecaster_nqs_stl_bridge.md](../plans/phase_17_H3_async_1hz_forecaster_nqs_stl_bridge.md) — first keyword hit at line 1; 17 matching lines.
- [docs/plans/phase_18_I1_welford_longitudinal_compaction_spatial_deontic.md](../plans/phase_18_I1_welford_longitudinal_compaction_spatial_deontic.md) — first keyword hit at line 1; 17 matching lines.
- [docs/plans/phase_19_I2_biokg_16byte_descriptor_epistemic_reasoner.md](../plans/phase_19_I2_biokg_16byte_descriptor_epistemic_reasoner.md) — first keyword hit at line 1; 19 matching lines.
- [docs/plans/phase_20_I3_unified_dataset_graph_builder_graphify_mcp.md](../plans/phase_20_I3_unified_dataset_graph_builder_graphify_mcp.md) — first keyword hit at line 1; 12 matching lines.
- [docs/plans/phase_21_J1_zero_copy_binary_ipc_shm_protocol.md](../plans/phase_21_J1_zero_copy_binary_ipc_shm_protocol.md) — first keyword hit at line 1; 24 matching lines.
- [docs/plans/phase_22_J2_ares_desktop_os_tauri_native_shell.md](../plans/phase_22_J2_ares_desktop_os_tauri_native_shell.md) — first keyword hit at line 1; 19 matching lines.
- [docs/plans/phase_23_J3_os_chrome_fastmcp_palette_dual_transport.md](../plans/phase_23_J3_os_chrome_fastmcp_palette_dual_transport.md) — first keyword hit at line 1; 18 matching lines.
- [docs/plans/phase_24_J4_asterinas_framekernel_hubris_wearable_targets.md](../plans/phase_24_J4_asterinas_framekernel_hubris_wearable_targets.md) — first keyword hit at line 1; 21 matching lines.
- [docs/plans/phase_25_K1_property_based_numerical_ode_stl_verification.md](../plans/phase_25_K1_property_based_numerical_ode_stl_verification.md) — first keyword hit at line 1; 30 matching lines.
- [docs/plans/phase_26_K2_clinical_chaos_sensor_dropout_seu_fault_injection.md](../plans/phase_26_K2_clinical_chaos_sensor_dropout_seu_fault_injection.md) — first keyword hit at line 1; 27 matching lines.
- [docs/plans/phase_27_K3_full_stack_contract_cockpit_ipc_mcp_e2e.md](../plans/phase_27_K3_full_stack_contract_cockpit_ipc_mcp_e2e.md) — first keyword hit at line 1; 26 matching lines.
- [docs/plans/phase_28_K4_nasa_std_3001_compliance_latency_memory_benchmark.md](../plans/phase_28_K4_nasa_std_3001_compliance_latency_memory_benchmark.md) — first keyword hit at line 1; 21 matching lines.
- [docs/plans/phase_29_L1_cockpit_live_bindings_3d_cones.md](../plans/phase_29_L1_cockpit_live_bindings_3d_cones.md) — first keyword hit at line 1; 52 matching lines.
- [docs/plans/phase_30_L2_tauri_native_window_iceoryx2_ipc.md](../plans/phase_30_L2_tauri_native_window_iceoryx2_ipc.md) — first keyword hit at line 1; 45 matching lines.
- [docs/plans/phase_30_M1_connected_web_portal_and_cockpit_enhancement_plan.md](../plans/phase_30_M1_connected_web_portal_and_cockpit_enhancement_plan.md) — first keyword hit at line 1; 48 matching lines.
- [docs/plans/phase_31_L3_gather_radar_vocal_waveform_dsp.md](../plans/phase_31_L3_gather_radar_vocal_waveform_dsp.md) — first keyword hit at line 1; 66 matching lines.
- [docs/plans/phase_31_M2_rotatable_dual_gender_3d_anatomical_twin_plan.md](../plans/phase_31_M2_rotatable_dual_gender_3d_anatomical_twin_plan.md) — first keyword hit at line 1; 42 matching lines.
- [docs/plans/phase_32_L4_edge_llm_voice_copilot_safetensors.md](../plans/phase_32_L4_edge_llm_voice_copilot_safetensors.md) — first keyword hit at line 1; 68 matching lines.
- [docs/plans/phase_33_L5_clinical_calibration_24dataset_parquet.md](../plans/phase_33_L5_clinical_calibration_24dataset_parquet.md) — first keyword hit at line 1; 72 matching lines.
- [docs/plans/phase_34_L6_nasa_submission_pitch_slides_pdf.md](../plans/phase_34_L6_nasa_submission_pitch_slides_pdf.md) — first keyword hit at line 1; 63 matching lines.
- [docs/plans/phase_40_N3_mars_sol_circadian_cognitive_immune_viral.md](../plans/phase_40_N3_mars_sol_circadian_cognitive_immune_viral.md) — first keyword hit at line 50; 1 matching lines.
- [docs/plans/phase_41_N4_multiorgan_pocus_playbooks10_15_gate4.md](../plans/phase_41_N4_multiorgan_pocus_playbooks10_15_gate4.md) — first keyword hit at line 55; 3 matching lines.

#### Memory bank

- [memory-bank/activeContext.md](../../memory-bank/activeContext.md) — first keyword hit at line 572; 9 matching lines.
- [memory-bank/progress.md](../../memory-bank/progress.md) — first keyword hit at line 365; 89 matching lines.
- [memory-bank/systemPatterns.md](../../memory-bank/systemPatterns.md) — first keyword hit at line 67; 9 matching lines.

#### Other first-party text

- [00_Executive_Summary_and_Challenge.md](../../00_Executive_Summary_and_Challenge.md) — first keyword hit at line 24; 2 matching lines.
- [05_Official_NASA_Challenge_Brief_and_Resources.md](../../05_Official_NASA_Challenge_Brief_and_Resources.md) — first keyword hit at line 55; 1 matching lines.
- [09_NASA_Space_Apps_Official_Rules_and_Judging_Guide.md](../../09_NASA_Space_Apps_Official_Rules_and_Judging_Guide.md) — first keyword hit at line 24; 4 matching lines.
- [10_Gemini_Argon_Review_and_Validation_Prompt.md](../../10_Gemini_Argon_Review_and_Validation_Prompt.md) — first keyword hit at line 7; 20 matching lines.
- [PANORAMICA_GENERALE_PROGETTO.md](../../PANORAMICA_GENERALE_PROGETTO.md) — first keyword hit at line 1; 29 matching lines.
- [PANORAMICA_GENERALE_PROGETTO.typ](../../PANORAMICA_GENERALE_PROGETTO.typ) — first keyword hit at line 20; 49 matching lines.
- [crates/ares-security-privacy/Cargo.toml](../../crates/ares-security-privacy/Cargo.toml) — first keyword hit at line 5; 1 matching lines.
- [docs/ARES_HEALTH_FULL_PROJECT_SNAPSHOT_AND_ARCHITECTURE.md](../ARES_HEALTH_FULL_PROJECT_SNAPSHOT_AND_ARCHITECTURE.md) — first keyword hit at line 2; 112 matching lines.
- [docs/architecture/IMPLEMENTATION_STACK.md](../architecture/IMPLEMENTATION_STACK.md) — first keyword hit at line 32; 57 matching lines.
- [docs/architecture/TIMESTRAL_INTEGRATION_STUDY.md](../architecture/TIMESTRAL_INTEGRATION_STUDY.md) — first keyword hit at line 3; 34 matching lines.
- [docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md](../architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md) — first keyword hit at line 595; 1 matching lines.
- [docs/issues/ISSUE_CONNECTED_PORTAL_AND_3D_TWIN.md](../issues/ISSUE_CONNECTED_PORTAL_AND_3D_TWIN.md) — first keyword hit at line 4; 30 matching lines.
- [docs/scientific_references.md](../scientific_references.md) — first keyword hit at line 1; 134 matching lines.
- [docs/submission/PANORAMICA_GENERALE_PROGETTO.typ](../submission/PANORAMICA_GENERALE_PROGETTO.typ) — first keyword hit at line 17; 18 matching lines.
- [generate_diagrams.py](../../generate_diagrams.py) — first keyword hit at line 119; 5 matching lines.
- [make_typst.py](../../make_typst.py) — first keyword hit at line 25; 49 matching lines.

#### Rust source/comments

- [crates/ares-causal-graph/src/biokg_reasoner.rs](../../crates/ares-causal-graph/src/biokg_reasoner.rs) — first keyword hit at line 1; 1 matching lines.
- [crates/ares-causal-graph/src/dataset_graph.rs](../../crates/ares-causal-graph/src/dataset_graph.rs) — first keyword hit at line 1; 1 matching lines.
- [crates/ares-causal-graph/src/error.rs](../../crates/ares-causal-graph/src/error.rs) — first keyword hit at line 1; 1 matching lines.
- [crates/ares-causal-graph/src/hypergraph_spatial.rs](../../crates/ares-causal-graph/src/hypergraph_spatial.rs) — first keyword hit at line 1; 1 matching lines.
- [crates/ares-causal-graph/src/lib.rs](../../crates/ares-causal-graph/src/lib.rs) — first keyword hit at line 3; 1 matching lines.
- [crates/ares-causal-graph/src/parquet_adapters.rs](../../crates/ares-causal-graph/src/parquet_adapters.rs) — first keyword hit at line 1; 1 matching lines.
- [crates/ares-core-types/src/binary_ipc.rs](../../crates/ares-core-types/src/binary_ipc.rs) — first keyword hit at line 1; 1 matching lines.
- [crates/ares-core-types/src/lib.rs](../../crates/ares-core-types/src/lib.rs) — first keyword hit at line 4; 1 matching lines.
- [crates/ares-nqs-stl/src/calibration_harness.rs](../../crates/ares-nqs-stl/src/calibration_harness.rs) — first keyword hit at line 1; 1 matching lines.
- [crates/ares-nqs-stl/src/mri_index.rs](../../crates/ares-nqs-stl/src/mri_index.rs) — first keyword hit at line 19; 1 matching lines.
- [crates/ares-nqs-stl/src/timestral_backbone.rs](../../crates/ares-nqs-stl/src/timestral_backbone.rs) — first keyword hit at line 1; 1 matching lines.
- [crates/ares-nqs-stl/src/timestral_bridge.rs](../../crates/ares-nqs-stl/src/timestral_bridge.rs) — first keyword hit at line 1; 1 matching lines.
- [crates/ares-nqs-stl/src/timestral_quantiles.rs](../../crates/ares-nqs-stl/src/timestral_quantiles.rs) — first keyword hit at line 1; 1 matching lines.
- [crates/ares-nqs-stl/src/timestral_safetensors.rs](../../crates/ares-nqs-stl/src/timestral_safetensors.rs) — first keyword hit at line 1; 1 matching lines.
- [crates/ares-security-privacy/src/sanitizer.rs](../../crates/ares-security-privacy/src/sanitizer.rs) — first keyword hit at line 1; 2 matching lines.
- [crates/ares-telemetry-ingest/src/lib.rs](../../crates/ares-telemetry-ingest/src/lib.rs) — first keyword hit at line 3; 1 matching lines.
- [crates/ares-telemetry-ingest/src/vocal_acoustic_dsp.rs](../../crates/ares-telemetry-ingest/src/vocal_acoustic_dsp.rs) — first keyword hit at line 1; 1 matching lines.

