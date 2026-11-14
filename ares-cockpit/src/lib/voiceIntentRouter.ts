// Deterministic Type-1 voice intent router (< 1 ms), NASA-STD-3001 [V2 10027] interlock,
// and shared Edge Copilot request + offline Type-1 fallback helper.
// Pure TypeScript (only `import type` references) for direct Node `--experimental-strip-types` testing.

import type { TelemetryPacket } from '../types/telemetry';
import type { WhatIf } from './scenario';

export type CockpitPhase = 'GATHER' | 'EVALUATE' | 'ACT';
export type EvalTabId = 'BODY_3D' | 'POCUS' | 'MUSCLE_BONE' | 'FORECAST';
export type PlaybookShortCode = '#01' | '#02' | '#03' | '#04' | '#05';

export type VoiceIntentClassification =
  | {
      kind: 'SAFETY_INTERLOCK_BLOCKED';
      clause: 'NASA-STD-3001 [V2 10027]';
      reason: string;
      transcript: string;
    }
  | {
      kind: 'NAVIGATE_PHASE';
      phase: CockpitPhase;
      label: string;
    }
  | {
      kind: 'NAVIGATE_EVAL_TAB';
      tab: EvalTabId;
      label: string;
    }
  | {
      kind: 'OPEN_PLAYBOOK';
      playbook_code: PlaybookShortCode;
      playbook_id: string;
      label: string;
    }
  | {
      kind: 'SHOW_QUANTILE_CONES';
      label: string;
    }
  | {
      kind: 'RUN_WHAT_IF_LBNP';
      lbnp_mmhg: number;
      label: string;
    }
  | {
      kind: 'OPEN_COMMAND_PALETTE';
      initial_tab: 'TOOLS' | 'COPILOT';
      label: string;
    }
  | {
      kind: 'CONVERSATIONAL_COPILOT_ASK';
      query: string;
      preferred_tool_hint: string | null;
    };

export interface CopilotAskRequest {
  query: string;
  role?: string;
  preferred_tool_hint?: string | null;
  what_if_active?: boolean;
}

export interface CopilotToolInvocation {
  tool: string;
  latency_us: number;
  byte_len: number;
}

export interface CopilotAskResponse {
  answer_markdown: string;
  spoken_summary: string;
  execution_mode: 'LOCAL_EDGE_LLM' | 'DETERMINISTIC_TYPE1_FALLBACK';
  fallback_reason?: string | null;
  tools_invoked: CopilotToolInvocation[];
  active_playbook_id: string;
  normative_clause: string;
  hrv_unavailable_reason?: string | null;
  model_validation_status: string;
  validation_disclosure: string;
  audit_hash_hex: string;
  total_latency_us: number;
}

const PLAYBOOK_ID_BY_DIGIT: Record<string, { code: PlaybookShortCode; id: string }> = {
  '1': { code: '#01', id: 'PLAYBOOK_01_VENOUS_STASIS_LBNP' },
  '01': { code: '#01', id: 'PLAYBOOK_01_VENOUS_STASIS_LBNP' },
  '2': { code: '#02', id: 'PLAYBOOK_02_CONFIRMED_IJV_THROMBUS' },
  '02': { code: '#02', id: 'PLAYBOOK_02_CONFIRMED_IJV_THROMBUS' },
  '3': { code: '#03', id: 'PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED' },
  '03': { code: '#03', id: 'PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED' },
  '4': { code: '#04', id: 'PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION' },
  '04': { code: '#04', id: 'PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION' },
  '5': { code: '#05', id: 'PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS' },
  '05': { code: '#05', id: 'PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS' },
};

/**
 * Normalizes a transcript by trimming and removing an optional leading `"ARES"` wake word.
 */
export function stripWakeWord(transcript: string): string {
  return transcript
    .trim()
    .replace(/^ares[\s,.:;!?-]*/i, '')
    .trim();
}

/**
 * Enforces `NASA-STD-3001 [V2 10027]`: vocal confirmation of `pocus_thrombus_confirmed`
 * or vocal unlocking/administration of Gate 1 systemic anticoagulants is strictly prohibited.
 */
export function isVoiceSafetyInterlockBlocked(lower: string): string | null {
  if (lower.includes('pocus_thrombus_confirmed')) {
    return 'Direct voice mutation of pocus_thrombus_confirmed is blocked by NASA-STD-3001 [V2 10027]; use tactile POCUS verification controls.';
  }

  const hasGate1Target =
    /\b(thrombus|clot|gate\s*1|anticoag\w*|enoxaparin|apixaban|heparin|warfarin|dalteparin|blood\s*thinner\w*)\b/.test(
      lower,
    );
  const hasMutationVerb =
    /\b(confirm|verify|mark|set|declare|unlock|open|bypass|override|disable|release|administer|give|start|inject|prescribe|approve)\b/.test(
      lower,
    );

  if (hasGate1Target && hasMutationVerb) {
    return 'Gate 1 anticoagulant unlock and POCUS thrombus confirmation require deliberate tactile click/touch (NASA-STD-3001 [V2 10027]).';
  }

  return null;
}

/**
 * Selects the closest FastMCP Context-Mode tool hint for conversational escalation.
 */
export function inferPreferredToolHint(lower: string): string | null {
  if (/(quantile|cone|timestral|ttv|horizon)/.test(lower)) {
    return 'get_timestral_quantile_cones';
  }
  if (/(3d|uberon|spatial|heatmap|zone|shelter|deontic)/.test(lower)) {
    return 'get_hypergraph_spatial_status';
  }
  if (/(playbook|gate|anticoag|enoxaparin|lbnp vent|countermeasure)/.test(lower)) {
    return 'get_medops_playbook';
  }
  if (/(what-if|simulate|lbnp|ared|impact|delta rho)/.test(lower)) {
    return 'simulate_countermeasure_impact';
  }
  if (/(shear|tau|causal|adhg|ijv|onsd|sans)/.test(lower)) {
    return 'explain_causal_anomaly';
  }
  if (/(path|biomarker|osteopenia|sclerostin|spoke|biolink)/.test(lower)) {
    return 'explain_biomarker_path';
  }
  if (/(osd-|dataset|bidmc|cans|nasa-0000100)/.test(lower)) {
    return 'query_dataset_graph';
  }
  if (/(summary|health|vitals|hrv|rmssd|spo2|readiness|mri)/.test(lower)) {
    return 'get_crew_health_summary';
  }
  return null;
}

/**
 * Deterministic `< 1 ms` Type-1 voice command classifier.
 */
export function classifyVoiceTranscript(rawTranscript: string): VoiceIntentClassification {
  const cleaned = stripWakeWord(rawTranscript);
  const lower = cleaned.toLowerCase();

  // 1. Hard Safety Interlock first (cannot be bypassed by command phrasing)
  const blockReason = isVoiceSafetyInterlockBlocked(lower);
  if (blockReason) {
    return {
      kind: 'SAFETY_INTERLOCK_BLOCKED',
      clause: 'NASA-STD-3001 [V2 10027]',
      reason: blockReason,
      transcript: cleaned,
    };
  }

  // 2. Playbook navigation ("open playbook 1..5" / "playbook #02")
  const pbMatch = lower.match(/\b(?:open\s+|show\s+|go\s+to\s+|switch\s+to\s+)?playbook\s*#?\s*(0?[1-5])\b/);
  if (pbMatch) {
    const entry = PLAYBOOK_ID_BY_DIGIT[pbMatch[1]];
    if (entry) {
      return {
        kind: 'OPEN_PLAYBOOK',
        playbook_code: entry.code,
        playbook_id: entry.id,
        label: `Activating Playbook ${entry.code}`,
      };
    }
  }

  // 3. Multi-horizon Timestral quantile cones
  if (/\b(?:show|open|view|display)\s+(?:the\s+)?(?:timestral\s+)?quantile\s*cones?\b/.test(lower)) {
    return {
      kind: 'SHOW_QUANTILE_CONES',
      label: 'Opening Timestral Multi-Horizon Quantile Cones',
    };
  }

  // 4. What-If LBNP slider command ("run what-if lbnp 30" / "set lbnp -25")
  const lbnpMatch = lower.match(/\b(?:run\s+what[-\s]?if\s+|set\s+|apply\s+)?lbnp\s*(?:at|to|=)?\s*(-?\d{1,2})\b/);
  if (lbnpMatch) {
    const rawNum = Number.parseInt(lbnpMatch[1], 10);
    const magnitude = Math.min(50, Math.max(0, Math.abs(rawNum)));
    const signedMmhg = magnitude === 0 ? 0 : -magnitude;
    return {
      kind: 'RUN_WHAT_IF_LBNP',
      lbnp_mmhg: signedMmhg,
      label: `Setting What-If LBNP to ${signedMmhg} mmHg`,
    };
  }

  // 5. Evaluate sub-tabs ("open pocus", "open forecast", "open 3d", "open muscle")
  if (/\b(?:open|show|go\s+to|switch\s+to)\s+(?:the\s+)?pocus\b/.test(lower)) {
    return { kind: 'NAVIGATE_EVAL_TAB', tab: 'POCUS', label: 'Opening POCUS Ultrasound' };
  }
  if (/\b(?:open|show|go\s+to|switch\s+to)\s+(?:the\s+)?forecast\b/.test(lower)) {
    return { kind: 'NAVIGATE_EVAL_TAB', tab: 'FORECAST', label: 'Opening Forecast & Quantile Cones' };
  }
  if (/\b(?:open|show|go\s+to|switch\s+to)\s+(?:the\s+)?(?:3d|body\s*3d|heatmap)\b/.test(lower)) {
    return { kind: 'NAVIGATE_EVAL_TAB', tab: 'BODY_3D', label: 'Opening 3D UBERON Heatmap' };
  }
  if (/\b(?:open|show|go\s+to|switch\s+to)\s+(?:the\s+)?(?:muscle|bone|ared|gait)\b/.test(lower)) {
    return { kind: 'NAVIGATE_EVAL_TAB', tab: 'MUSCLE_BONE', label: 'Opening Muscle, Bone & Gait' };
  }

  // 6. Tri-phase header ("go to gather|evaluate|act")
  const phaseMatch = lower.match(/\b(?:go\s+to|open|switch\s+to|phase)\s+(gather|evaluate|act)\b/);
  if (phaseMatch) {
    const phase = phaseMatch[1].toUpperCase() as CockpitPhase;
    return {
      kind: 'NAVIGATE_PHASE',
      phase,
      label: `Switching to ${phase} phase`,
    };
  }

  // 7. Command palette / Copilot ask focus
  if (/\bopen\s+(?:command\s+palette|copilot)\b/.test(lower)) {
    return {
      kind: 'OPEN_COMMAND_PALETTE',
      initial_tab: lower.includes('copilot') ? 'COPILOT' : 'TOOLS',
      label: 'Opening FastMCP / Edge Copilot Palette',
    };
  }

  // 8. Conversational escalation to Edge LLM / Type-1 Template Copilot
  return {
    kind: 'CONVERSATIONAL_COPILOT_ASK',
    query: cleaned || rawTranscript.trim(),
    preferred_tool_hint: inferPreferredToolHint(lower),
  };
}

/**
 * Truncates spoken output cleanly to at most `maxWords` (default 25 words for hands-free microgravity clarity).
 */
export function sanitizeSpokenSummary(text: string, maxWords = 25): string {
  const words = text
    .replace(/[*#`_~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}.`;
}

/**
 * Deterministic browser-local Type-1 fallback response when Rust HTTP/Tauri copilot endpoint is offline.
 * Preserves Issue #11 (`BEAT_INTERVALS_NOT_AVAILABLE`) and Issue #12 (`ILLUSTRATIVE_UNVALIDATED`).
 */
export function buildLocalType1CopilotFallback(
  query: string,
  packet: TelemetryPacket,
  whatIf: WhatIf,
  preferredToolHint: string | null = null,
  fallbackReason = 'OFFLINE_CLIENT_TYPE1_TEMPLATE',
): CopilotAskResponse {
  const started = performance.now();
  const b = packet.biometrics;
  const sm = packet.safety_margins;
  const hrStr = b.heart_rate_bpm !== null ? `${Math.round(b.heart_rate_bpm)} bpm` : 'MISSING';
  const spo2Str = b.spo2_percent !== null ? `${b.spo2_percent.toFixed(1)}%` : 'MISSING';
  const hasFiniteHrv =
    typeof b.hrv_rmssd_ms === 'number' && Number.isFinite(b.hrv_rmssd_ms);
  const hrvStr = hasFiniteHrv
    ? `${(b.hrv_rmssd_ms as number).toFixed(1)} ms`
    : `UNAVAILABLE (${b.hrv_unavailable_reason ?? 'BEAT_INTERVALS_NOT_AVAILABLE'})`;
  const rhoStr =
    sm.med_stl_rho_robustness !== null ? sm.med_stl_rho_robustness.toFixed(2) : 'UNAVAILABLE';
  const playbookId = packet.active_playbook?.playbook_id ?? 'NONE';
  const gate1 =
    packet.active_playbook?.safety_gates?.anticoagulant_lock_active === false ? 'UNLOCKED' : 'LOCKED';
  const gate2 =
    packet.active_playbook?.safety_gates?.lbnp_auto_vent_armed === false ? 'STANDBY' : 'ARMED';
  const gate3 = packet.active_playbook?.safety_gates?.eva_suit_damping_active ? 'ACTIVE' : 'STANDBY';
  const validationStatus = packet.model_validation_status ?? 'ILLUSTRATIVE_UNVALIDATED';
  const toolUsed = preferredToolHint ?? 'get_crew_health_summary';

  const answerLines = [
    `[DETERMINISTIC TYPE-1 SUMMARY] Query: "${query}"`,
    `- Vitals: HR ${hrStr}, SpO2 ${spo2Str}, HRV/RMSSD ${hrStr === 'MISSING' && b.hrv_rmssd_ms === null ? hrvStr : hrvStr}.`,
    `- Safety Margins: Alarm ${sm.alarm_level}, NQS rho_min ${rhoStr}, What-If LBNP ${whatIf.lbnp_mmhg} mmHg.`,
    `- MedOps Playbook: ${playbookId} | Gate 1 Anticoag: ${gate1}, Gate 2 LBNP Vent: ${gate2}, Gate 3 EVA Damping: ${gate3}.`,
    `- Evidence Boundary: ${validationStatus} (exploratory scenario bounds, not clinically validated).`,
  ];

  const spoken = sanitizeSpokenSummary(
    `Alarm ${sm.alarm_level}. Heart rate ${hrStr}. Oxygen ${spo2Str}. HRV ${
      hasFiniteHrv ? hrvStr : 'unavailable'
    }. Playbook ${playbookId}. Gate one ${gate1}.`,
    25,
  );

  const latencyUs = Math.max(50, Math.round((performance.now() - started) * 1000));

  return {
    answer_markdown: answerLines.join('\n'),
    spoken_summary: spoken,
    execution_mode: 'DETERMINISTIC_TYPE1_FALLBACK',
    fallback_reason: fallbackReason,
    tools_invoked: [
      {
        tool: toolUsed,
        latency_us: latencyUs,
        byte_len: answerLines.join('\n').length,
      },
    ],
    active_playbook_id: playbookId,
    normative_clause: 'NASA-STD-3001 [V1 3006] / [V2 10027] / [V2 10164]',
    hrv_unavailable_reason:
      b.hrv_rmssd_ms === null ? (b.hrv_unavailable_reason ?? 'BEAT_INTERVALS_NOT_AVAILABLE') : null,
    model_validation_status: validationStatus,
    validation_disclosure: validationStatus,
    audit_hash_hex: 'LOCAL-TYPE1-OFFLINE',
    total_latency_us: latencyUs,
  };
}

interface TauriInternalsLike {
  __TAURI_INTERNALS__?: {
    invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
}

function normalizeCopilotResponse(
  raw: unknown,
  fallback: CopilotAskResponse,
): CopilotAskResponse {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fallback;
  const r = raw as Record<string, unknown>;
  const answer =
    typeof r.answer_markdown === 'string' && r.answer_markdown.trim().length > 0
      ? r.answer_markdown
      : fallback.answer_markdown;
  const spokenRaw =
    typeof r.spoken_summary === 'string' && r.spoken_summary.trim().length > 0
      ? r.spoken_summary
      : answer;

  return {
    answer_markdown: answer,
    spoken_summary: sanitizeSpokenSummary(spokenRaw, 25),
    execution_mode:
      r.execution_mode === 'LOCAL_EDGE_LLM' ? 'LOCAL_EDGE_LLM' : 'DETERMINISTIC_TYPE1_FALLBACK',
    fallback_reason: typeof r.fallback_reason === 'string' ? r.fallback_reason : null,
    tools_invoked: Array.isArray(r.tools_invoked)
      ? r.tools_invoked.filter(
          (t): t is CopilotToolInvocation =>
            typeof t === 'object' &&
            t !== null &&
            typeof (t as CopilotToolInvocation).tool === 'string',
        )
      : fallback.tools_invoked,
    active_playbook_id:
      typeof r.active_playbook_id === 'string' ? r.active_playbook_id : fallback.active_playbook_id,
    normative_clause:
      typeof r.normative_clause === 'string' ? r.normative_clause : fallback.normative_clause,
    hrv_unavailable_reason:
      typeof r.hrv_unavailable_reason === 'string'
        ? r.hrv_unavailable_reason
        : fallback.hrv_unavailable_reason,
    model_validation_status:
      typeof r.model_validation_status === 'string'
        ? r.model_validation_status
        : fallback.model_validation_status,
    validation_disclosure:
      typeof r.validation_disclosure === 'string'
        ? r.validation_disclosure
        : fallback.validation_disclosure,
    audit_hash_hex:
      typeof r.audit_hash_hex === 'string' ? r.audit_hash_hex : fallback.audit_hash_hex,
    total_latency_us:
      typeof r.total_latency_us === 'number' && Number.isFinite(r.total_latency_us)
        ? r.total_latency_us
        : fallback.total_latency_us,
  };
}

/**
 * Calls Tauri `ipc_ask_edge_copilot` when running inside `TAURI_NATIVE_IPC`,
 * or `POST ${httpBaseUrl}/api/copilot/ask` (localhost loopback), falling back to
 * `buildLocalType1CopilotFallback` cleanly if offline or past deadline.
 */
export async function requestEdgeCopilot(params: {
  query: string;
  role?: string;
  preferredToolHint?: string | null;
  whatIfActive: boolean;
  isTauriDesktop: boolean;
  allowHttpNetwork: boolean;
  httpBaseUrl: string;
  packet: TelemetryPacket;
  whatIf: WhatIf;
}): Promise<CopilotAskResponse> {
  const reqBody: CopilotAskRequest = {
    query: params.query,
    role: params.role ?? 'CMO',
    preferred_tool_hint: params.preferredToolHint ?? null,
    what_if_active: params.whatIfActive,
  };
  const fallback = buildLocalType1CopilotFallback(
    params.query,
    params.packet,
    params.whatIf,
    params.preferredToolHint ?? null,
  );

  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    if (params.isTauriDesktop) {
      const tauri = (window as unknown as TauriInternalsLike).__TAURI_INTERNALS__;
      if (tauri?.invoke) {
        const resp = await tauri.invoke('ipc_ask_edge_copilot', { request: reqBody });
        return normalizeCopilotResponse(resp, fallback);
      }
    }

    if (params.allowHttpNetwork) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 2600);
      try {
        const res = await fetch(`${params.httpBaseUrl}/api/copilot/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody),
          signal: controller.signal,
        });
        if (res.ok) {
          const parsed: unknown = await res.json();
          return normalizeCopilotResponse(parsed, fallback);
        }
      } finally {
        window.clearTimeout(timer);
      }
    }
  } catch {
    // Graceful Type-1 deterministic fallback when daemon/LLM is offline
  }

  return fallback;
}
