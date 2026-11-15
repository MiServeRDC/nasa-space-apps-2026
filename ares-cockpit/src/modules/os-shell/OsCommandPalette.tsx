import { CloseButton } from '../ui-primitives/CloseButton';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TelemetryPacket } from '../../types/telemetry';
import type { WhatIf } from '../../lib/scenario';
import {
  IS_ARES_DESKTOP_SHELL,
  type OsStatusBarState,
  type TransportMode,
} from './OsSystemStatusBar';

export interface FastMcpToolDef {
  index: number;
  rpcName: string;
  displayAlias?: string;
  title: string;
  description: string;
  normativeClauses: string[];
  hasQueryArg?: boolean;
  hasPathArgs?: boolean;
}

export const FASTMCP_TOOLS: FastMcpToolDef[] = [
  {
    index: 1,
    rpcName: 'query_dataset_graph',
    title: 'Search research sources',
    description: 'Find a study or dataset used by ARES. Try BIDMC or an identifier such as OSD-818.',
    normativeClauses: ['NASA-STD-3001 [V1 3002]', '[V1 3003]', '[V1 4001]'],
    hasQueryArg: true,
  },
  {
    index: 2,
    rpcName: 'explain_biomarker_path',
    title: 'Trace a research link',
    description: 'Enter two references to see how the research catalog links them.',
    normativeClauses: ['NASA-STD-3001 [V1 3003]', 'Biolink v4 / SPOKE'],
    hasPathArgs: true,
  },
  {
    index: 3,
    rpcName: 'get_timestral_quantile_cones',
    title: 'Review forecast ranges',
    description: 'See the prediction bands available for the current session and which estimates are unavailable.',
    normativeClauses: ['NASA-STD-3001 [V1 3006]', '[V2 10022]'],
  },
  {
    index: 4,
    rpcName: 'get_hypergraph_spatial_status',
    title: 'Inspect body and habitat status',
    description: 'See the flagged body region, current habitat zone and any operating restrictions in the model.',
    normativeClauses: ['NASA-STD-3001 [V1 4001]', '[V2 10005]'],
  },
  {
    index: 5,
    rpcName: 'get_crew_health_summary',
    displayAlias: 'get_astronaut_health_summary',
    title: 'Summarize crew readings',
    description: 'See the current measurements, readiness and any missing readings together.',
    normativeClauses: ['NASA-STD-3001 [V1 3001]', '[V1 3003]'],
  },
  {
    index: 6,
    rpcName: 'explain_causal_anomaly',
    displayAlias: 'query_causal_biomarker_state',
    title: 'Explain a flagged reading',
    description: 'See the measurements and modeled relationships behind the current alert.',
    normativeClauses: ['NASA-STD-3001 [V1 3003]', 'OCHMO-MTB-007'],
  },
  {
    index: 7,
    rpcName: 'simulate_countermeasure_impact',
    displayAlias: 'evaluate_stl_safety_margins',
    title: 'Compare scenario responses',
    description: 'Preview how changes to the selected countermeasure could affect the modeled safety margins.',
    normativeClauses: ['NASA-STD-3001 [V1 3002]', '[V2 10022]'],
  },
  {
    index: 8,
    rpcName: 'get_medops_playbook',
    displayAlias: 'get_active_medops_playbook',
    title: 'Show the active procedure',
    description: 'See which procedure the system has selected and the state of its safety checks.',
    normativeClauses: ['NASA-STD-3001 [V2 10023]', '[V2 10027]'],
  },
];

interface DatasetCatalogEntry {
  id: string;
  code: string;
  category: string;
  curie: string;
  neighbors: string[];
  clauses: string[];
}

const OFFLINE_24_DATASET_CATALOG: DatasetCatalogEntry[] = [
  { id: 'ds_01_osd_51', code: 'OSD-51', category: 'Dataset', curie: 'OSDR:OSD-51', neighbors: ['hgnc_sost', 'uberon_soleus', 'pheno_osteopenia'], clauses: ['V1 3002'] },
  { id: 'ds_02_osd_195', code: 'OSD-195', category: 'Dataset', curie: 'OSDR:OSD-195', neighbors: ['hgnc_acta1', 'uberon_soleus', 'pheno_sarcopenia'], clauses: ['V1 3002'] },
  { id: 'ds_03_osd_818', code: 'OSD-818', category: 'Dataset', curie: 'OSDR:OSD-818', neighbors: ['uberon_optic_nerve', 'bm_hr', 'pheno_sans'], clauses: ['V1 3003'] },
  { id: 'ds_04_osd_570', code: 'OSD-570', category: 'Dataset', curie: 'OSDR:OSD-570', neighbors: ['hgnc_il6', 'bm_hr', 'uberon_heart'], clauses: ['V1 4001'] },
  { id: 'ds_05_osd_635', code: 'OSD-635', category: 'Dataset', curie: 'OSDR:OSD-635', neighbors: ['hgnc_icam1', 'uberon_ijv', 'pheno_ijv_stasis'], clauses: ['V1 3003'] },
  { id: 'ds_06_nasa_0000100', code: 'NASA-0000100', category: 'Dataset', curie: 'NASA:0000100', neighbors: ['bm_gai', 'cm_pb03_ared'], clauses: ['V1 3002'] },
  { id: 'ds_07_csa_cans', code: 'CSA CANS', category: 'Dataset', curie: 'CSA:CANS-2026', neighbors: ['bm_radiation', 'cm_pb05_shelter'], clauses: ['V1 4001'] },
  { id: 'ds_08_bidmc_v1', code: 'BIDMC v1.0.0', category: 'Dataset', curie: 'PHYSIONET:BIDMC', neighbors: ['bm_hr', 'bm_spo2', 'bm_resp'], clauses: ['V1 3003'] },
  { id: 'ds_09_mit_bih', code: 'MIT-BIH Arrhythmia', category: 'Dataset', curie: 'PHYSIONET:MITDB', neighbors: ['bm_hr', 'bm_rmssd'], clauses: ['V1 3003'] },
  { id: 'ds_10_hirid_icu', code: 'HiRID ICU', category: 'Dataset', curie: 'PHYSIONET:HIRID', neighbors: ['bm_hr', 'bm_spo2'], clauses: ['V1 3006'] },
  { id: 'ds_11_mesa_sleep', code: 'MESA Sleep', category: 'Dataset', curie: 'NSRR:MESA', neighbors: ['bm_spo2', 'bm_hr'], clauses: ['V2 6001'] },
  { id: 'ds_12_shhs', code: 'SHHS', category: 'Dataset', curie: 'NSRR:SHHS', neighbors: ['bm_resp', 'bm_hr'], clauses: ['V2 6001'] },
  { id: 'ds_13_mars_500', code: 'MARS-500', category: 'Dataset', curie: 'ESA:MARS-500', neighbors: ['uberon_brain', 'cm_pb05_shelter'], clauses: ['V1 3006'] },
  { id: 'ds_14_sirius_19_21', code: 'SIRIUS-19/21', category: 'Dataset', curie: 'HRP:SIRIUS', neighbors: ['uberon_brain', 'bm_hr'], clauses: ['V1 3006'] },
  { id: 'ds_15_esa_hdbr', code: 'ESA Head-Down BedRest', category: 'Dataset', curie: 'ESA:HDBR', neighbors: ['uberon_soleus', 'cm_pb01_lbnp'], clauses: ['V1 3002'] },
  { id: 'ds_16_look_ahead', code: 'Look AHEAD', category: 'Dataset', curie: 'NIDDK:LOOK-AHEAD', neighbors: ['uberon_heart', 'pheno_osteopenia'], clauses: ['V1 3001'] },
  { id: 'ds_17_gtea', code: 'GTEA', category: 'Dataset', curie: 'GATECH:GTEA', neighbors: ['cm_pb02_pocus'], clauses: ['V2 10001'] },
  { id: 'ds_18_ptb_xl', code: 'PTB-XL', category: 'Dataset', curie: 'PHYSIONET:PTBXL', neighbors: ['bm_hr', 'uberon_heart'], clauses: ['V1 3003'] },
  { id: 'ds_19_mimic_iv_demo', code: 'MIMIC-IV Demo', category: 'Dataset', curie: 'PHYSIONET:MIMIC-IV', neighbors: ['uberon_ijv', 'cm_pb02_pocus'], clauses: ['OCHMO-MTB-007'] },
  { id: 'ds_20_physionet_tilt', code: 'PhysioNet Tilt Table', category: 'Dataset', curie: 'PHYSIONET:TILT', neighbors: ['uberon_ijv', 'bm_hr'], clauses: ['V1 3003'] },
  { id: 'ds_21_osdr_rr', code: 'OSDR Rodent Research RR-1..RR-10', category: 'Dataset', curie: 'OSDR:RR-1-10', neighbors: ['hgnc_sost', 'uberon_soleus'], clauses: ['V1 3002'] },
  { id: 'ds_22_lsah', code: 'LSAH Longitudinal', category: 'Dataset', curie: 'NASA:LSAH', neighbors: ['pheno_osteopenia', 'uberon_soleus'], clauses: ['V2 6026'] },
  { id: 'ds_23_nsrl_gcr', code: 'NSRL Galactic Cosmic Ray', category: 'Dataset', curie: 'BNL:NSRL-GCR', neighbors: ['uberon_brain', 'bm_radiation'], clauses: ['V1 4001'] },
  { id: 'ds_24_iss_env', code: 'ISS Acoustic/Environmental', category: 'Dataset', curie: 'NASA:ISS-ENV', neighbors: ['cm_pb04_sans', 'cm_pb05_shelter'], clauses: ['V2 6001'] },
];

interface ExecutionResult {
  toolName: string;
  source: 'TAURI_NATIVE_IPC' | 'HTTP_FASTMCP' | 'LOCAL_FALLBACK';
  jsonText: string;
  byteLength: number;
  estimatedTokens: number;
  latencyUs: number;
  normativeClauses: string[];
  hasUntrustedTag: boolean;
  errorMessage: string | null;
}

interface TauriInternalsWindow {
  __TAURI_INTERNALS__?: {
    invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
}

function round1(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
}

function round2(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

function enforceContextMode600Bytes(obj: Record<string, unknown>): string {
  const s = JSON.stringify(obj);
  if (s.length <= 600) return s;
  return JSON.stringify({
    truncated: true,
    bytes: s.length,
    model_status: 'ILLUSTRATIVE_UNVALIDATED',
  });
}

function buildOfflineFallbackPayload(
  toolName: string,
  args: Record<string, string>,
  packet: TelemetryPacket,
  whatIf: WhatIf,
  osStatus: OsStatusBarState | null,
): Record<string, unknown> {
  switch (toolName) {
    case 'query_dataset_graph': {
      const q = (args.query || 'OSD-51').trim().toLowerCase();
      const match =
        OFFLINE_24_DATASET_CATALOG.find(
          (d) =>
            d.code.toLowerCase().includes(q) ||
            d.id.toLowerCase().includes(q) ||
            d.curie.toLowerCase().includes(q) ||
            d.neighbors.some((n) => n.toLowerCase().includes(q)),
        ) ?? OFFLINE_24_DATASET_CATALOG[0];
      return {
        schema: 'SPOKE+BioCypher+PrimeKG+Biolink',
        datasets: 24,
        matched: match.id,
        cat: match.category,
        curie: match.curie,
        neighbors: match.neighbors.slice(0, 3),
        clauses: match.clauses,
        model_status: 'ILLUSTRATIVE_UNVALIDATED',
      };
    }
    case 'explain_biomarker_path': {
      const from = (args.from || 'OSD-818').trim();
      const to = (args.to || 'bm_hr').trim();
      return {
        schema: 'SPOKE+BioCypher+PrimeKG+Biolink',
        from,
        to,
        hops: 2,
        steps: [
          `${from} -[biolink:measures_biomarker]-> ${to}`,
          `${to} -[biolink:governed_by_shall]-> NASA-STD-3001[V1 3003]`,
        ],
        model_status: 'ILLUSTRATIVE_UNVALIDATED',
      };
    }
    case 'get_timestral_quantile_cones': {
      const q = packet.timestral_quantiles;
      return {
        gate: q?.conformal_status ?? 'ABSTAINED_FALLBACK',
        abstained:
          packet.biometrics.hrv_unavailable_reason === 'BEAT_INTERVALS_NOT_AVAILABLE',
        rho_cone: null,
        ttv_cone_h:
          q?.ttv_q05_days != null && q?.ttv_q50_days != null && q?.ttv_q95_days != null
            ? [round1(q.ttv_q05_days * 24), round1(q.ttv_q50_days * 24), round1(q.ttv_q95_days * 24)]
            : null,
        pessimistic_ttv_q05_h:
          q?.ttv_q05_days != null ? round1(q.ttv_q05_days * 24) : null,
        model_status: 'ILLUSTRATIVE_UNVALIDATED',
      };
    }
    case 'get_hypergraph_spatial_status': {
      return {
        hottest: packet.hypergraph_spatial?.anatomical_cells?.[0]?.uberon_id ?? 'UBERON:0001586',
        zone: osStatus?.habitat_zone ?? packet.hypergraph_spatial?.habitat_zone ?? 'MEDOPS',
        violates: osStatus?.violates_policy ?? false,
        eva_forbidden: osStatus?.eva_airlock_forbidden ?? false,
        shelter_mandatory: osStatus?.storm_shelter_mandatory ?? false,
        biokg: {
          clause: 'V1 3003',
          bytes: 16,
          crc_ok: true,
          mapping_status: 'UNVERIFIED',
        },
        model_status: 'ILLUSTRATIVE_UNVALIDATED',
      };
    }
    case 'get_crew_health_summary': {
      return {
        astronaut: packet.astronaut_id,
        fd: Math.round(packet.mission_elapsed_days ?? whatIf.mission_day),
        src: packet.source_record_id,
        t_rec_s: round1(packet.relative_recording_time_s),
        severity: packet.safety_margins.alarm_level,
        mri_pct: round1(packet.safety_margins.mission_readiness_index),
        rho_global: round2(packet.safety_margins.med_stl_rho_robustness),
        hrv_unavailable_reason: packet.biometrics.hrv_unavailable_reason ?? null,
        missing: (packet.biometrics.missing_channels ?? []).slice(0, 4),
        model_status: 'ILLUSTRATIVE_UNVALIDATED',
      };
    }
    case 'explain_causal_anomaly': {
      const chain = (packet.active_playbook?.causal_chain_summary ?? [
        'Microgravity cephalad shift -> IJV stasis -> SANS/Thrombus watch',
      ])
        .slice(0, 2)
        .map((s) => `<untrusted_telemetry_observation>${s}</untrusted_telemetry_observation>`);
      return {
        per_pred: packet.safety_margins.per_predicate_rho ?? {
          tau_w: round2(packet.hemodynamics?.wall_shear_stress_dyn_cm2),
        },
        adhg_chain: chain,
        model_status: 'ILLUSTRATIVE_UNVALIDATED',
      };
    }
    case 'simulate_countermeasure_impact': {
      const rho = packet.safety_margins.med_stl_rho_robustness;
      return {
        current_rho: round2(rho),
        lbnp_30mmhg_delta_rho_h: rho !== null ? 0.19 : null,
        ared_125kgf_delta_rho_h: rho !== null ? 0.11 : null,
        projected_ttv_gain_h: rho !== null ? 96.0 : null,
        model_status: 'ILLUSTRATIVE_UNVALIDATED',
      };
    }
    case 'get_medops_playbook':
    default: {
      return {
        playbook_id: packet.active_playbook?.playbook_id ?? 'PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED',
        gates: packet.active_playbook?.safety_gates ?? {
          anticoagulant_lock_active: true,
          lbnp_auto_vent_armed: true,
          eva_suit_damping_active: true,
        },
        model_status: 'ILLUSTRATIVE_UNVALIDATED',
      };
    }
  }
}

export function OsCommandPalette({
  open,
  onClose,
  onToggle,
  httpBaseUrl,
  packet,
  whatIf,
  transportMode,
  osStatus,
}: {
  open: boolean;
  onClose: () => void;
  onToggle: () => void;
  httpBaseUrl: string;
  packet: TelemetryPacket;
  whatIf: WhatIf;
  transportMode: TransportMode;
  osStatus: OsStatusBarState | null;
}) {
  const [filterText, setFilterText] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [graphQuery, setGraphQuery] = useState('OSD-51');
  const [pathFrom, setPathFrom] = useState('OSD-818');
  const [pathTo, setPathTo] = useState('bm_hr');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filteredTools = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return FASTMCP_TOOLS;
    return FASTMCP_TOOLS.filter(
      (t) =>
        t.rpcName.toLowerCase().includes(q) ||
        (t.displayAlias?.toLowerCase().includes(q) ?? false) ||
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q),
    );
  }, [filterText]);

  const activeTool = filteredTools[selectedIndex] ?? filteredTools[0];

  const executeTool = useCallback(
    async (tool: FastMcpToolDef) => {
      setRunning(true);
      const args: Record<string, string> = {};
      if (tool.hasQueryArg) {
        args.query = graphQuery.trim() || 'OSD-51';
      }
      if (tool.hasPathArgs) {
        args.from = pathFrom.trim() || 'OSD-818';
        args.to = pathTo.trim() || 'bm_hr';
      }

      const jsonRpcReq = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: tool.rpcName,
          arguments: args,
        },
      };

      const started = performance.now();
      let source: ExecutionResult['source'] = 'LOCAL_FALLBACK';
      let jsonText = '';
      let errorMessage: string | null = null;

      try {
        if (IS_ARES_DESKTOP_SHELL) {
          const tauri = (window as unknown as TauriInternalsWindow).__TAURI_INTERNALS__;
          if (tauri?.invoke) {
            const rawResp = await tauri.invoke('invoke_fastmcp_tool', {
              requestJson: JSON.stringify(jsonRpcReq),
            });
            const parsed =
              typeof rawResp === 'string' ? (JSON.parse(rawResp) as Record<string, unknown>) : (rawResp as Record<string, unknown>);
            const contentText = (
              (parsed?.result as Record<string, unknown> | undefined)?.content as
                | Array<{ text?: string }>
                | undefined
            )?.[0]?.text;
            if (typeof contentText === 'string' && contentText.length > 0) {
              jsonText = contentText;
              source = 'TAURI_NATIVE_IPC';
            }
          }
        }

        if (!jsonText && transportMode !== 'LOCAL_SIMULATION') {
          const ctrl = new AbortController();
          const timer = window.setTimeout(() => ctrl.abort(), 1500);
          try {
            const res = await fetch(`${httpBaseUrl}/api/mcp`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(jsonRpcReq),
              signal: ctrl.signal,
            });
            if (res.ok) {
              const parsed = (await res.json()) as Record<string, unknown>;
              const contentText = (
                (parsed?.result as Record<string, unknown> | undefined)?.content as
                  | Array<{ text?: string }>
                  | undefined
              )?.[0]?.text;
              if (typeof contentText === 'string' && contentText.length > 0) {
                jsonText = contentText;
                source = 'HTTP_FASTMCP';
              } else if (parsed?.error) {
                errorMessage = String(
                  (parsed.error as Record<string, unknown>).message ?? 'FastMCP RPC error',
                );
              }
            }
          } finally {
            window.clearTimeout(timer);
          }
        }
      } catch {
        // Offline or /api/mcp unavailable; deterministic fallback below
      }

      if (!jsonText) {
        const fallback = buildOfflineFallbackPayload(
          tool.rpcName,
          args,
          packet,
          whatIf,
          osStatus,
        );
        jsonText = enforceContextMode600Bytes(fallback);
        source = 'LOCAL_FALLBACK';
      }

      const latencyUs = Math.max(1, Math.round((performance.now() - started) * 1000));
      const byteLength = new TextEncoder().encode(jsonText).byteLength;
      const estimatedTokens = Math.ceil(byteLength / 4);

      setResult({
        toolName: tool.rpcName,
        source,
        jsonText,
        byteLength,
        estimatedTokens,
        latencyUs,
        normativeClauses: tool.normativeClauses,
        hasUntrustedTag: jsonText.includes('<untrusted_'),
        errorMessage,
      });
      setRunning(false);
    },
    [graphQuery, pathFrom, pathTo, transportMode, httpBaseUrl, packet, whatIf, osStatus],
  );

  // Global keyboard shortcut: Alt+Space or Cmd+K / Ctrl+K toggles; Escape closes.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isAltSpace =
        e.altKey && (e.code === 'Space' || e.key === ' ' || e.key === '\u00a0');
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';

      if (isAltSpace || isCmdK) {
        e.preventDefault();
        onToggle();
        return;
      }

      if (!open) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((idx) =>
          filteredTools.length === 0 ? 0 : (idx + 1) % filteredTools.length,
        );
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((idx) =>
          filteredTools.length === 0
            ? 0
            : (idx - 1 + filteredTools.length) % filteredTools.length,
        );
        return;
      }

      if (e.key === 'Enter' && activeTool) {
        const target = e.target as HTMLElement | null;
        const isParamInput = target?.dataset?.paletteParam === 'true';
        if (!isParamInput || e.metaKey || e.ctrlKey) {
          e.preventDefault();
          void executeTool(activeTool);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, onToggle, filteredTools.length, activeTool, executeTool]);

  useEffect(() => {
    if (!open) return;
    setSelectedIndex(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ARES-MedOS FastMCP Command Palette"
      data-testid="os-command-palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/85 p-4 pt-14 font-mono text-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[84vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-nominal/70 bg-black shadow-2xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-panel px-4 py-2.5">
          <h2 className="text-sm font-semibold text-white">Onboard tools</h2>
          <input
            ref={inputRef}
            type="search"
            value={filterText}
            onChange={(event) => {
              setFilterText(event.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Find a tool…"
            aria-label="Find a tool"
            className="min-w-[140px] flex-1 rounded border border-line bg-black px-3 py-2 text-sm text-white placeholder:text-gray-500"
          />
          <CloseButton onClick={onClose} />
        </div>

            {/* Main Split View: 8 Tools on Left, Parameters + Context-Mode Result on Right */}
            <div className="grid min-h-0 flex-1 md:grid-cols-[340px_1fr]">
          <div className="overflow-y-auto border-r border-line bg-black p-2">
            <div className="mb-1.5 px-2 text-[10px] tracking-wider text-gray-500">
              Choose a tool, then run it.
            </div>
            <div className="space-y-1">
              {filteredTools.length === 0 && <p role="status" className="px-2 py-1 text-gray-400">No matching tools</p>}
              {filteredTools.map((tool, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={tool.rpcName}
                    type="button"
                    onClick={() => setSelectedIndex(idx)}
                    aria-pressed={isSelected}
                    className={`w-full cursor-pointer rounded border px-2.5 py-2 text-left transition-colors ${
                      isSelected
                        ? 'border-nominal bg-nominal/10 text-white'
                        : 'border-transparent text-gray-300 hover:border-line hover:bg-panel'
                    }`}
                  >
                    <span className="font-semibold">{tool.title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto bg-panel p-4">
            {activeTool && (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-2">
                  <div>
                    <div className="text-sm font-bold text-white">
                      {activeTool.title}
                    </div>
                    <p className="mt-1 text-[11px] text-gray-400">
                      {activeTool.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={running}
                    onClick={() => void executeTool(activeTool)}
                    className="cursor-pointer rounded border border-nominal bg-nominal px-3 py-1 text-[11px] font-bold text-black hover:opacity-90 disabled:opacity-50"
                  >
                    {running ? 'Running…' : 'Run tool'}
                  </button>
                </div>

                {/* Normative Grounding Badges */}
                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span className="text-gray-500">NORMATIVE GROUNDING:</span>
                  {activeTool.normativeClauses.map((clause) => (
                    <span
                      key={clause}
                      className="rounded border border-ok/50 bg-ok/10 px-1.5 py-0.5 text-ok"
                    >
                      {clause}
                    </span>
                  ))}
                </div>

                {/* Parameter Inputs for Graph / Path Tools */}
                {activeTool.hasQueryArg && (
                  <div className="space-y-1.5 rounded border border-line bg-black p-2.5">
                    <label className="block text-[10px] text-gray-400">
                      DATASET / GENE / BIOMARKER QUERY (24 DATASETS + SPOKE + UBERON + LOINC)
                    </label>
                    <input
                      type="text"
                      data-palette-param="true"
                      value={graphQuery}
                      onChange={(e) => setGraphQuery(e.target.value)}
                      className="w-full rounded border border-line bg-panel px-2 py-1 text-xs text-white outline-none focus:border-nominal"
                    />
                    <div className="flex flex-wrap gap-1 pt-1">
                      {['OSD-51', 'OSD-195', 'OSD-818', 'NASA-0000100', 'CSA CANS', 'BIDMC v1.0.0', 'SOST'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setGraphQuery(preset)}
                          className="cursor-pointer rounded border border-line px-1.5 py-0.5 text-[10px] text-gray-300 hover:border-nominal hover:text-nominal"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeTool.hasPathArgs && (
                  <div className="grid gap-2 rounded border border-line bg-black p-2.5 sm:grid-cols-2">
                    <div>
                      <label className="block text-[10px] text-gray-400">FROM NODE</label>
                      <input
                        type="text"
                        data-palette-param="true"
                        value={pathFrom}
                        onChange={(e) => setPathFrom(e.target.value)}
                        className="mt-1 w-full rounded border border-line bg-panel px-2 py-1 text-xs text-white outline-none focus:border-nominal"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400">TO NODE</label>
                      <input
                        type="text"
                        data-palette-param="true"
                        value={pathTo}
                        onChange={(e) => setPathTo(e.target.value)}
                        className="mt-1 w-full rounded border border-line bg-panel px-2 py-1 text-xs text-white outline-none focus:border-nominal"
                      />
                    </div>
                  </div>
                )}

                {/* Result Panel */}
                {result ? (
                  <div className="flex flex-col gap-2 rounded border border-line bg-black p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 text-[10px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-nominal">{FASTMCP_TOOLS.find(tool => tool.rpcName === result.toolName)?.title ?? result.toolName}</span>
                        <span
                          className={`rounded border px-1.5 py-0.5 ${
                            result.source === 'TAURI_NATIVE_IPC'
                              ? 'border-ok/60 text-ok'
                              : result.source === 'HTTP_FASTMCP'
                                ? 'border-nominal/60 text-nominal'
                                : 'border-warning/60 text-warning'
                          }`}
                        >
                          {result.source}
                        </span>
                        {result.hasUntrustedTag && (
                          <span className="rounded border border-advisory/60 bg-advisory/10 px-1.5 py-0.5 text-advisory">
                            SANDBOXED &lt;untrusted_telemetry_observation&gt;
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-gray-400">
                        <span>LATENCY: {result.latencyUs} us</span>
                        <span
                          className={
                            result.byteLength <= 600 && result.estimatedTokens < 150
                              ? 'text-ok'
                              : 'text-warning'
                          }
                        >
                          {result.byteLength}/600 B (~{result.estimatedTokens} tokens)
                        </span>
                      </div>
                    </div>

                    {result.errorMessage && (
                      <div className="rounded border border-critical/60 bg-critical/10 px-2 py-1 text-[11px] text-critical">
                        {result.errorMessage}
                      </div>
                    )}

                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-gray-100">
                      {(() => {
                        try {
                          return JSON.stringify(JSON.parse(result.jsonText), null, 2);
                        } catch {
                          return result.jsonText;
                        }
                      })()}
                    </pre>
                  </div>
                ) : (
                  <div className="rounded border border-dashed border-line bg-black p-4 text-center text-[11px] text-gray-500">
                    Select any of the 8 FastMCP tools or press ENTER to inspect Context-Mode JSON (&lt;150 tokens), latency in us, and NASA-STD-3001 grounding.
                  </div>
                )}
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
