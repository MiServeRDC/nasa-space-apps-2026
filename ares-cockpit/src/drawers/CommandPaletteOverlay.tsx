// Spatial Command Palette & FastMCP Inspector Overlay (`CommandPaletteOverlay`).
// Implements:
// - `Cmd+K / Ctrl+K / Alt+Space` modal (`0` `backdrop-filter`, `#05070c` OLED surface)
// - `COMMANDS`: Tokenized quick-jump capsules (`UBERON:*` organs with reversible live 3D camera
//   preview on selection & `ESC` restore, `GATHER/EVALUATE/ACT`, `MALE/FEMALE`, Playbooks `#01-#15`,
//   and Drawers)
// - `FASTMCP`: Executes all 8 `< 150-token` (`<= 600-byte`) `FASTMCP_TOOLS` via Tauri IPC ->
//   `POST ${httpBaseUrl}/api/mcp` -> deterministic local fallback, displaying Context-Mode
//   byte/token budget and `<untrusted_...>` prompt-injection spotlighting
// - `COPILOT`: Air-gapped Edge Copilot query enforcing `NASA-STD-3001 [V2 10027]` Gate 1 interlock

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnatomicalRegionWireId, TelemetryPacket } from '../types/telemetry';
import type { CommandPaletteTabId } from '../types/workbench';
import type { WhatIf } from '../lib/scenario';
import {
  classifyVoiceTranscript,
  requestEdgeCopilot,
  type CopilotAskResponse,
} from '../lib/voiceIntentRouter';
import { CANONICAL_REGIONS } from '../modules/body-3d-heatmap/uberonSpatialMapping';
import { ALL_CRYSTALLIZED_PLAYBOOK_LIST } from '../lib/playbookCatalog';
import {
  FASTMCP_TOOLS,
  type FastMcpToolDef,
} from '../modules/os-shell/OsCommandPalette';
import {
  IS_ARES_DESKTOP_SHELL,
  type TransportMode,
} from '../modules/os-shell/OsSystemStatusBar';
import { hasWhatIfDeviation } from '../lenses/lensMath';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { announceAssertive, announcePolite } from '../stores/a11yAnnouncer';
import { restoreFocusById } from './drawerLogic';

export { FASTMCP_TOOLS };

export interface CommandPaletteOverlayProps {
  packet: TelemetryPacket;
  whatIf: WhatIf;
  transportMode: TransportMode;
  httpBaseUrl?: string;
  onChangeSex: (sex: 'MALE' | 'FEMALE') => void;
}

interface QuickCommandItem {
  id: string;
  capsule: string;
  title: string;
  previewUberon?: (typeof CANONICAL_REGIONS)[number]['region'];
  run: () => void;
}

interface ToolRpcResult {
  toolName: string;
  source: 'TAURI_NATIVE_IPC' | 'HTTP_FASTMCP' | 'LOCAL_CONTEXT_MODE';
  jsonText: string;
  byteLength: number;
  estimatedTokens: number;
  latencyUs: number;
  hasUntrustedSpotlighting: boolean;
}

interface TauriInvokeWindow {
  __TAURI_INTERNALS__?: {
    invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
}

function buildCompactFallback600Bytes(
  toolName: string,
  args: Record<string, string>,
  packet: TelemetryPacket,
  whatIf: WhatIf,
): string {
  const payload: Record<string, unknown> = {
    tool: toolName,
    crew: `<untrusted_telemetry_id>${packet.astronaut_id}</untrusted_telemetry_id>`,
    alarm: packet.safety_margins.alarm_level,
    mri: packet.safety_margins.mission_readiness_index,
    rho: packet.safety_margins.med_stl_rho_robustness,
    playbook: packet.active_playbook?.playbook_id ?? 'NONE',
    gate1_lock: packet.active_playbook?.safety_gates?.anticoagulant_lock_active ?? true,
    sex: whatIf.sex,
    args,
  };
  const raw = JSON.stringify(payload);
  const enc = new TextEncoder();
  if (enc.encode(raw).byteLength <= 600) return raw;
  return raw.slice(0, 560) + '"}';
}

export function CommandPaletteOverlay({
  packet,
  whatIf,
  transportMode,
  httpBaseUrl = 'http://127.0.0.1:8080',
  onChangeSex,
}: CommandPaletteOverlayProps) {
  const open = useWorkbenchStore((s) => s.commandPaletteOpen);
  const initialTab = useWorkbenchStore((s) => s.commandPaletteInitialTab);
  const closeCommandPalette = useWorkbenchStore((s) => s.closeCommandPalette);
  const setPhase = useWorkbenchStore((s) => s.setPhase);
  const selectUberonRegion = useWorkbenchStore((s) => s.selectUberonRegion);
  const selectPlaybook = useWorkbenchStore((s) => s.selectPlaybook);
  const openDrawer = useWorkbenchStore((s) => s.openDrawer);
  const setStudioBarOpen = useWorkbenchStore((s) => s.setStudioBarOpen);
  const triggerVoiceSafetyBlock = useWorkbenchStore((s) => s.triggerVoiceSafetyBlock);

  const [tab, setTab] = useState<CommandPaletteTabId>(initialTab);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [graphQuery, setGraphQuery] = useState('OSD-51');
  const [pathFrom, setPathFrom] = useState('OSD-818');
  const [pathTo, setPathTo] = useState('bm_hr');
  const [rpcResult, setRpcResult] = useState<ToolRpcResult | null>(null);
  const [copilotPrompt, setCopilotPrompt] = useState('');
  const [copilotResponse, setCopilotResponse] = useState<CopilotAskResponse | null>(null);
  const [copilotBlockedMsg, setCopilotBlockedMsg] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const initialRegionBeforeOpenRef = useRef<AnatomicalRegionWireId | null>(null);

  useEffect(() => {
    if (open) {
      initialRegionBeforeOpenRef.current = useWorkbenchStore.getState().selectedUberonRegion;
      setTab(initialTab);
      setQuery('');
      setActiveIdx(0);
      window.setTimeout(() => searchInputRef.current?.focus(), 10);
    }
  }, [initialTab, open]);

  const handleCancelAndRevertPreview = useCallback(() => {
    selectUberonRegion(initialRegionBeforeOpenRef.current);
    const restoreId = closeCommandPalette(false);
    restoreFocusById(restoreId);
  }, [closeCommandPalette, selectUberonRegion]);

  const handleCommitClose = useCallback(() => {
    const restoreId = closeCommandPalette(true);
    restoreFocusById(restoreId);
  }, [closeCommandPalette]);

  const quickCommands = useMemo<QuickCommandItem[]>(() => {
    const organCmds: QuickCommandItem[] = CANONICAL_REGIONS.map((meta) => ({
      id: `uberon-${meta.uberonCurie}`,
      capsule: meta.uberonCurie,
      title: `Focus 3D Organ: ${meta.label}`,
      previewUberon: meta.region,
      run: () => {
        selectUberonRegion(meta.region);
        announcePolite(`Focused 3D camera on ${meta.label}.`);
        handleCommitClose();
      },
    }));

    const coreCmds: QuickCommandItem[] = [
      {
        id: 'reference-atlas',
        capsule: 'REFERENCE',
        title: 'Open reference anatomy atlas (existing source geometry)',
        run: () => { window.open('/anatomy', '_blank', 'noopener,noreferrer'); handleCommitClose(); },
      },
      {
        id: 'reference-lab',
        capsule: 'REFERENCE',
        title: 'Open anatomy pipeline lab (synthetic reference only)',
        run: () => { window.open('/anatomy-lab', '_blank', 'noopener,noreferrer'); handleCommitClose(); },
      },
      {
        id: 'phase-gather',
        capsule: 'PHASE:01',
        title: 'Switch to 01 GATHER Multimodal Sensor & Ultrasound Bay',
        run: () => {
          setPhase('GATHER');
          handleCommitClose();
        },
      },
      {
        id: 'phase-evaluate',
        capsule: 'PHASE:02',
        title: 'Switch to 02 EVALUATE NQS-STL & Quantile Cones',
        run: () => {
          setPhase('EVALUATE');
          handleCommitClose();
        },
      },
      {
        id: 'phase-act',
        capsule: 'PHASE:03',
        title: 'Switch to 03 ACT Branched Safety Gate Playbook DAG',
        run: () => {
          setPhase('ACT');
          handleCommitClose();
        },
      },
      {
        id: 'morph-male',
        capsule: 'TWIN:MALE',
        title: 'Morph 3D Biodigital Twin to MALE Anthropometric Baseline',
        run: () => {
          onChangeSex('MALE');
          handleCommitClose();
        },
      },
      {
        id: 'morph-female',
        capsule: 'TWIN:FEMALE',
        title: 'Morph 3D Biodigital Twin to FEMALE Anthropometric Baseline',
        run: () => {
          onChangeSex('FEMALE');
          handleCommitClose();
        },
      },
      {
        id: 'drawer-portal',
        capsule: 'DRAWER:DSN',
        title: 'Open Mars-Earth DSN Store-and-Forward & 24-Dataset Atlas',
        run: () => {
          handleCommitClose();
          openDrawer('MISSION_PORTAL');
        },
      },
      {
        id: 'drawer-audit',
        capsule: 'DRAWER:SHA256',
        title: 'Open SHA-256 Audit Ledger & NASA-STD-3001 Privacy Governance',
        run: () => {
          handleCommitClose();
          openDrawer('AUDIT_PROVENANCE');
        },
      },
      {
        id: 'studio-toggle',
        capsule: 'STUDIO:29.8S',
        title: 'Open <= 29.8s OpenScreenStudio Director Timeline Bar',
        run: () => {
          setStudioBarOpen(true);
          handleCommitClose();
        },
      },
    ];

    const playbookCmds: QuickCommandItem[] = ALL_CRYSTALLIZED_PLAYBOOK_LIST.map((pb) => ({
      id: `pb-${pb.playbook_id}`,
      capsule: `MEDOPS:${pb.short_code}`,
      title: pb.title,
      run: () => {
        selectPlaybook(pb.playbook_id);
        setPhase('ACT');
        handleCommitClose();
      },
    }));

    return [...organCmds, ...coreCmds, ...playbookCmds];
  }, [
    handleCommitClose,
    onChangeSex,
    openDrawer,
    selectPlaybook,
    selectUberonRegion,
    setPhase,
    setStudioBarOpen,
  ]);

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quickCommands;
    return quickCommands.filter(
      (c) => c.capsule.toLowerCase().includes(q) || c.title.toLowerCase().includes(q),
    );
  }, [query, quickCommands]);

  const executeFastMcpTool = async (tool: FastMcpToolDef) => {
    const args: Record<string, string> = {};
    if (tool.hasQueryArg) args.query = graphQuery.trim() || 'OSD-51';
    if (tool.hasPathArgs) {
      args.from = pathFrom.trim() || 'OSD-818';
      args.to = pathTo.trim() || 'bm_hr';
    }

    const req = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: tool.rpcName, arguments: args },
    };

    const t0 = performance.now();
    let jsonText = '';
    let source: ToolRpcResult['source'] = 'LOCAL_CONTEXT_MODE';

    try {
      if (IS_ARES_DESKTOP_SHELL) {
        const tauri = (window as unknown as TauriInvokeWindow).__TAURI_INTERNALS__;
        if (tauri?.invoke) {
          const raw = await tauri.invoke('invoke_fastmcp_tool', {
            requestJson: JSON.stringify(req),
          });
          const parsed =
            typeof raw === 'string'
              ? (JSON.parse(raw) as Record<string, unknown>)
              : (raw as Record<string, unknown>);
          const text = (
            (parsed?.result as Record<string, unknown> | undefined)?.content as
              | Array<{ text?: string }>
              | undefined
          )?.[0]?.text;
          if (typeof text === 'string' && text.length > 0) {
            jsonText = text;
            source = 'TAURI_NATIVE_IPC';
          }
        }
      }

      if (!jsonText && transportMode !== 'LOCAL_SIMULATION') {
        const ctrl = new AbortController();
        const timer = window.setTimeout(() => ctrl.abort(), 1400);
        try {
          const res = await fetch(`${httpBaseUrl}/api/mcp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
            signal: ctrl.signal,
          });
          if (res.ok) {
            const parsed = (await res.json()) as Record<string, unknown>;
            const text = (
              (parsed?.result as Record<string, unknown> | undefined)?.content as
                | Array<{ text?: string }>
                | undefined
            )?.[0]?.text;
            if (typeof text === 'string' && text.length > 0) {
              jsonText = text;
              source = 'HTTP_FASTMCP';
            }
          }
        } finally {
          window.clearTimeout(timer);
        }
      }
    } catch {
      // Offline Context-Mode fallback below
    }

    if (!jsonText) {
      jsonText = buildCompactFallback600Bytes(tool.rpcName, args, packet, whatIf);
      source = 'LOCAL_CONTEXT_MODE';
    }

    const byteLength = new TextEncoder().encode(jsonText).byteLength;
    setRpcResult({
      toolName: tool.rpcName,
      source,
      jsonText,
      byteLength,
      estimatedTokens: Math.ceil(byteLength / 4),
      latencyUs: Math.max(1, Math.round((performance.now() - t0) * 1000)),
      hasUntrustedSpotlighting: jsonText.includes('<untrusted_'),
    });
  };

  const handleCopilotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = copilotPrompt.trim();
    if (!prompt) return;

    setCopilotBlockedMsg(null);
    const cls = classifyVoiceTranscript(prompt);
    if (cls.kind === 'SAFETY_INTERLOCK_BLOCKED') {
      const reason = cls.reason;
      setCopilotBlockedMsg(reason);
      triggerVoiceSafetyBlock(cls.clause, reason);
      announceAssertive(reason);
      return;
    }

    const resp = await requestEdgeCopilot({
      query: prompt,
      role: 'CMO',
      preferredToolHint:
        cls.kind === 'CONVERSATIONAL_COPILOT_ASK' ? cls.preferred_tool_hint : null,
      whatIfActive: hasWhatIfDeviation(whatIf),
      isTauriDesktop: IS_ARES_DESKTOP_SHELL,
      allowHttpNetwork: transportMode !== 'LOCAL_SIMULATION',
      httpBaseUrl,
      packet,
      whatIf,
    });
    setCopilotResponse(resp);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ARES-Health Command Palette and FastMCP Console"
      className="fixed inset-0 z-[92] flex items-start justify-center bg-black/85 p-3 pt-[7dvh]"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) {
          handleCancelAndRevertPreview();
        }
      }}
    >
      <div className="flex max-h-[84dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#05070c] font-mono text-xs shadow-2xl">
        {/* Top Mode Tabs + Close */}
        <div className="flex items-center justify-between border-b border-white/10 bg-[#080b12] px-4 py-2.5">
          <div role="tablist" aria-label="Command palette modes" className="flex gap-1.5">
            {(
              [
                { id: 'COMMANDS', label: 'QUICK COMMANDS' },
                { id: 'FASTMCP', label: `FASTMCP (${FASTMCP_TOOLS.length} TOOLS)` },
                { id: 'COPILOT', label: 'EDGE COPILOT' },
              ] as const
            ).map((tItem) => {
              const selected = tab === tItem.id;
              return (
                <button
                  key={tItem.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(tItem.id)}
                  className={`ares-interactive rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold ${
                    selected
                      ? 'border-cyan-400/70 bg-cyan-400/15 text-cyan-200'
                      : 'border-white/10 bg-black text-[var(--color-ink-meta)]'
                  }`}
                >
                  {tItem.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleCancelAndRevertPreview}
            className="ares-touch-target ares-interactive rounded-lg border border-white/15 bg-black px-3 text-[11px] font-semibold text-[var(--color-ink-display)]"
          >
            [ESC] CANCEL
          </button>
        </div>

        {/* Tab 1: Quick Commands + Reversible Live 3D Organ Camera Preview */}
        {tab === 'COMMANDS' ? (
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIdx(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const next = Math.min(filteredCommands.length - 1, activeIdx + 1);
                  setActiveIdx(next);
                  const preview = filteredCommands[next]?.previewUberon;
                  if (preview) selectUberonRegion(preview);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  const prev = Math.max(0, activeIdx - 1);
                  setActiveIdx(prev);
                  const preview = filteredCommands[prev]?.previewUberon;
                  if (preview) selectUberonRegion(preview);
                } else if (e.key === 'Enter' && filteredCommands[activeIdx]) {
                  e.preventDefault();
                  filteredCommands[activeIdx].run();
                }
              }}
              placeholder="Type UBERON:0004712, Playbook #01-#15, GATHER, FEMALE, DSN..."
              aria-label="Filter spatial workbench commands"
              className="ares-touch-target w-full rounded-xl border border-white/15 bg-black px-3.5 text-xs text-[var(--color-ink-display)] focus:border-cyan-400 focus:outline-none"
            />

            <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {filteredCommands.map((cmd, idx) => {
                const selected = idx === activeIdx;
                return (
                  <button
                    key={cmd.id}
                    type="button"
                    onMouseEnter={() => {
                      setActiveIdx(idx);
                      if (cmd.previewUberon) {
                        selectUberonRegion(cmd.previewUberon);
                      }
                    }}
                    onClick={cmd.run}
                    className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left ${
                      selected
                        ? 'border-cyan-400/65 bg-cyan-500/15 text-cyan-100'
                        : 'border-white/5 bg-black/60 text-[var(--color-ink-display)]'
                    }`}
                  >
                    <span className="truncate font-sans text-xs">{cmd.title}</span>
                    <span className="shrink-0 rounded border border-cyan-400/40 bg-black px-2 py-0.5 text-[10px] text-cyan-300">
                      {cmd.capsule}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Tab 2: All 8 `< 150-token` FastMCP JSON-RPC Tools */}
        {tab === 'FASTMCP' ? (
          <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 md:grid-cols-12">
            <div className="space-y-1.5 md:col-span-5">
              {FASTMCP_TOOLS.map((tool) => (
                <button
                  key={tool.rpcName}
                  type="button"
                  onClick={() => void executeFastMcpTool(tool)}
                  className="ares-touch-target ares-interactive flex w-full flex-col justify-center rounded-xl border border-white/10 bg-black/80 px-3 py-2 text-left hover:border-cyan-400/60"
                >
                  <div className="text-[11px] font-bold text-cyan-200">{tool.rpcName}</div>
                  <div className="truncate text-[9px] text-[var(--color-ink-meta)]">
                    {tool.title}
                  </div>
                </button>
              ))}
            </div>

            <div className="space-y-2.5 md:col-span-7">
              <div className="ares-inner-well grid grid-cols-3 gap-1.5 p-2.5 text-[10px]">
                <label className="block">
                  <span className="text-[9px] text-[var(--color-ink-meta)]">QUERY ARG</span>
                  <input
                    value={graphQuery}
                    onChange={(e) => setGraphQuery(e.target.value)}
                    className="mt-0.5 w-full rounded border border-white/15 bg-black px-2 py-1 text-[10px]"
                  />
                </label>
                <label className="block">
                  <span className="text-[9px] text-[var(--color-ink-meta)]">FROM CURIE</span>
                  <input
                    value={pathFrom}
                    onChange={(e) => setPathFrom(e.target.value)}
                    className="mt-0.5 w-full rounded border border-white/15 bg-black px-2 py-1 text-[10px]"
                  />
                </label>
                <label className="block">
                  <span className="text-[9px] text-[var(--color-ink-meta)]">TO CURIE</span>
                  <input
                    value={pathTo}
                    onChange={(e) => setPathTo(e.target.value)}
                    className="mt-0.5 w-full rounded border border-white/15 bg-black px-2 py-1 text-[10px]"
                  />
                </label>
              </div>

              {rpcResult ? (
                <div className="ares-inner-well space-y-2 p-3 text-[10px]">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-bold text-emerald-300">{rpcResult.toolName}</span>
                    <span className="text-cyan-200">
                      {rpcResult.byteLength}/600 B (~{rpcResult.estimatedTokens}/150 tok) &bull;{' '}
                      {rpcResult.latencyUs} us
                    </span>
                  </div>
                  <div className="text-[9px] text-[var(--color-ink-meta)]">
                    TRANSPORT: {rpcResult.source} &bull; SPOTLIGHTING:{' '}
                    {rpcResult.hasUntrustedSpotlighting ? 'ACTIVE (<untrusted_...>)' : 'CLEAN'}
                  </div>
                  <pre className="max-h-52 overflow-auto rounded-lg border border-white/10 bg-black p-2.5 text-[10px] whitespace-pre-wrap text-cyan-100">
                    {rpcResult.jsonText}
                  </pre>
                </div>
              ) : (
                <div className="ares-inner-well p-4 text-[11px] text-[var(--color-ink-meta)]">
                  Select any of the 8 FastMCP tools on the left to execute a JSON-RPC 2.0 call
                  within the strict &lt; 150-token (&lt;= 600-byte) Context-Mode compression ceiling.
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Tab 3: Air-Gapped Edge Copilot (`NASA-STD-3001 [V2 10027]` Gate 1 Interlock) */}
        {tab === 'COPILOT' ? (
          <div className="space-y-3 p-4">
            <form onSubmit={(e) => void handleCopilotSubmit(e)} className="flex gap-2">
              <input
                type="text"
                value={copilotPrompt}
                onChange={(e) => setCopilotPrompt(e.target.value)}
                placeholder="Ask local Edge Copilot (e.g., Summarize crew readiness or Explain SANS path)..."
                aria-label="Ask air-gapped Edge Copilot"
                className="ares-touch-target flex-1 rounded-xl border border-white/15 bg-black px-3 text-xs text-[var(--color-ink-display)] focus:border-cyan-400 focus:outline-none"
              />
              <button
                type="submit"
                className="ares-touch-target ares-interactive rounded-xl border border-cyan-400/70 bg-cyan-500/20 px-4 font-bold text-cyan-100"
              >
                ASK EDGE
              </button>
            </form>

            {copilotBlockedMsg ? (
              <div
                role="alert"
                className="rounded-xl border border-rose-500/80 bg-rose-500/15 p-3 text-[11px] text-rose-100"
              >
                <div className="font-bold text-rose-300">
                  SAFETY INTERLOCK BLOCKED // NASA-STD-3001 [V2 10027]
                </div>
                <p className="mt-1 font-sans text-xs">{copilotBlockedMsg}</p>
              </div>
            ) : null}

            {copilotResponse ? (
              <div className="ares-inner-well space-y-1.5 p-3 text-[11px]">
                <div className="flex items-center justify-between text-[10px] text-cyan-300">
                  <span>CLAUSE: {copilotResponse.normative_clause}</span>
                  <span>MODE: {copilotResponse.execution_mode}</span>
                </div>
                <p className="font-sans text-xs leading-relaxed text-[var(--color-ink-display)]">
                  {copilotResponse.spoken_summary}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
