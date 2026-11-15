// Spatial Command Palette & FastMCP Inspector Overlay (`CommandPaletteOverlay`).
// Implements:
// - `Cmd+K / Ctrl+K / Alt+Space` modal (`0` blur, `#05070c` OLED surface) via `shadcn` `Command` (`cmdk`)
// - `COMMANDS`: Tokenized quick-jump capsules (`UBERON:*` organs with reversible live 3D camera
//   preview on hover/selection & `ESC` restore, `GATHER/EVALUATE/ACT`, `MALE/FEMALE`, Aerospace 360
//   Playbooks `#01-#30` across 4 domain tabs, and Drawers)
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
import {
  ALL_360_PLAYBOOK_LIST,
  getPlaybookDomainForShortCode,
  PLAYBOOK_360_DOMAIN_TABS,
  type Playbook360DomainId,
} from '../lib/playbookCatalog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '../components/ui/command';
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
  group: 'ANATOMY' | 'WORKBENCH' | 'PLAYBOOK';
  capsule: string;
  title: string;
  searchKeywords: string;
  domain360?: Playbook360DomainId;
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
  const [domainFilter, setDomainFilter] = useState<'ALL' | Playbook360DomainId>('ALL');
  const [selectedCmdId, setSelectedCmdId] = useState('');
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
      setDomainFilter('ALL');
      setSelectedCmdId('');
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
      group: 'ANATOMY',
      capsule: meta.uberonCurie,
      title: `Focus 3D Organ: ${meta.label}`,
      searchKeywords: `${meta.uberonCurie} ${meta.label} ${meta.region}`,
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
        group: 'WORKBENCH',
        capsule: 'REFERENCE',
        title: 'Open reference anatomy atlas (existing source geometry)',
        searchKeywords: 'reference atlas anatomy source geometry',
        run: () => { window.open('/anatomy', '_blank', 'noopener,noreferrer'); handleCommitClose(); },
      },
      {
        id: 'reference-lab',
        group: 'WORKBENCH',
        capsule: 'REFERENCE',
        title: 'Open anatomy pipeline lab (synthetic reference only)',
        searchKeywords: 'anatomy pipeline lab synthetic',
        run: () => { window.open('/anatomy-lab', '_blank', 'noopener,noreferrer'); handleCommitClose(); },
      },
      {
        id: 'phase-gather',
        group: 'WORKBENCH',
        capsule: 'PHASE:01',
        title: 'Switch to 01 GATHER Multimodal Sensor & Ultrasound Bay',
        searchKeywords: 'phase 01 gather ultrasound sensor',
        run: () => {
          setPhase('GATHER');
          handleCommitClose();
        },
      },
      {
        id: 'phase-evaluate',
        group: 'WORKBENCH',
        capsule: 'PHASE:02',
        title: 'Switch to 02 EVALUATE NQS-STL & Quantile Cones',
        searchKeywords: 'phase 02 evaluate stl quantile cones',
        run: () => {
          setPhase('EVALUATE');
          handleCommitClose();
        },
      },
      {
        id: 'phase-act',
        group: 'WORKBENCH',
        capsule: 'PHASE:03',
        title: 'Switch to 03 ACT Branched Safety Gate Playbook DAG',
        searchKeywords: 'phase 03 act safety gate playbook dag',
        run: () => {
          setPhase('ACT');
          handleCommitClose();
        },
      },
      {
        id: 'morph-male',
        group: 'WORKBENCH',
        capsule: 'TWIN:MALE',
        title: 'Morph 3D Biodigital Twin to MALE Anthropometric Baseline',
        searchKeywords: 'twin male anthropometric profile morph',
        run: () => {
          onChangeSex('MALE');
          handleCommitClose();
        },
      },
      {
        id: 'morph-female',
        group: 'WORKBENCH',
        capsule: 'TWIN:FEMALE',
        title: 'Morph 3D Biodigital Twin to FEMALE Anthropometric Baseline',
        searchKeywords: 'twin female anthropometric profile morph',
        run: () => {
          onChangeSex('FEMALE');
          handleCommitClose();
        },
      },
      {
        id: 'drawer-portal',
        group: 'WORKBENCH',
        capsule: 'DRAWER:DSN',
        title: 'Open Mars-Earth DSN Store-and-Forward & 24-Dataset Atlas',
        searchKeywords: 'drawer dsn portal osdr dataset mars earth',
        run: () => {
          handleCommitClose();
          openDrawer('MISSION_PORTAL');
        },
      },
      {
        id: 'drawer-audit',
        group: 'WORKBENCH',
        capsule: 'DRAWER:SHA256',
        title: 'Open SHA-256 Audit Ledger & NASA-STD-3001 Privacy Governance',
        searchKeywords: 'drawer audit sha256 governance privacy',
        run: () => {
          handleCommitClose();
          openDrawer('AUDIT_PROVENANCE');
        },
      },
      {
        id: 'studio-toggle',
        group: 'WORKBENCH',
        capsule: 'STUDIO:29.8S',
        title: 'Open <= 29.8s OpenScreenStudio Director Timeline Bar',
        searchKeywords: 'studio timeline director 29.8s',
        run: () => {
          setStudioBarOpen(true);
          handleCommitClose();
        },
      },
    ];

    const playbookCmds: QuickCommandItem[] = ALL_360_PLAYBOOK_LIST.map((pb) => ({
      id: `pb-${pb.playbook_id}`,
      group: 'PLAYBOOK',
      capsule: `MEDOPS:${pb.short_code}`,
      title: pb.title,
      searchKeywords: `${pb.short_code} ${pb.short_label} ${pb.playbook_id} ${pb.title} ${pb.normative_clause}`,
      domain360: getPlaybookDomainForShortCode(pb.short_code),
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

  const previewByCommandId = useMemo(() => {
    const map = new Map<string, AnatomicalRegionWireId>();
    for (const cmd of quickCommands) {
      if (cmd.previewUberon) {
        map.set(cmd.id, cmd.previewUberon);
      }
    }
    return map;
  }, [quickCommands]);

  const anatomyCommands = useMemo(
    () => quickCommands.filter((c) => c.group === 'ANATOMY'),
    [quickCommands],
  );
  const workbenchCommands = useMemo(
    () => quickCommands.filter((c) => c.group === 'WORKBENCH'),
    [quickCommands],
  );
  const playbookCommands = useMemo(
    () =>
      quickCommands.filter(
        (c) =>
          c.group === 'PLAYBOOK' &&
          (domainFilter === 'ALL' || c.domain360 === domainFilter),
      ),
    [domainFilter, quickCommands],
  );

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

        {/* Tab 1: shadcn Command + Aerospace 360 Playbook Domain Tabs + Reversible Live 3D Organ Preview */}
        {tab === 'COMMANDS' ? (
          <div className="flex min-h-0 flex-1 flex-col p-3">
            {/* Aerospace 360 Domain Filter Tabs for #01-#30 */}
            <div
              role="group"
              aria-label="Aerospace 360 Playbook domain tabs"
              className="mb-2 flex flex-wrap gap-1 font-mono text-[9.5px]"
            >
              <button
                type="button"
                data-testid="cmd-domain-ALL"
                aria-pressed={domainFilter === 'ALL'}
                onClick={() => setDomainFilter('ALL')}
                className={`ares-interactive rounded-lg border px-2 py-1 font-semibold ${
                  domainFilter === 'ALL'
                    ? 'border-cyan-400/70 bg-cyan-400/15 text-cyan-200'
                    : 'border-white/10 bg-black text-[var(--color-ink-meta)]'
                }`}
              >
                ALL 30
              </button>
              {PLAYBOOK_360_DOMAIN_TABS.map((dom) => {
                const selected = domainFilter === dom.id;
                return (
                  <button
                    key={dom.id}
                    type="button"
                    data-testid={`cmd-domain-${dom.id}`}
                    aria-pressed={selected}
                    onClick={() => setDomainFilter(dom.id)}
                    className={`ares-interactive rounded-lg border px-2 py-1 font-semibold ${
                      selected
                        ? 'border-cyan-400/70 bg-cyan-400/15 text-cyan-200'
                        : 'border-white/10 bg-black text-[var(--color-ink-meta)]'
                    }`}
                  >
                    {dom.label} {dom.rangeLabel}
                  </button>
                );
              })}
            </div>

            <Command
              value={selectedCmdId}
              onValueChange={(nextId) => {
                setSelectedCmdId(nextId);
                const region = previewByCommandId.get(nextId);
                if (region) selectUberonRegion(region);
              }}
              className="min-h-0 flex-1 border-[var(--color-border)] bg-[var(--color-surface-l0)]"
            >
              <CommandInput
                ref={searchInputRef}
                value={query}
                onValueChange={setQuery}
                placeholder="Type UBERON:0004712, Playbook #01-#30, GATHER, FEMALE, DSN..."
                aria-label="Filter spatial workbench commands"
              />
              <CommandList className="max-h-[48dvh] min-h-0 flex-1">
                <CommandEmpty>No matching Aerospace 360 command or playbook.</CommandEmpty>

                {domainFilter === 'ALL' ? (
                  <>
                    <CommandGroup heading="Anatomical 3D Focus (UBERON)">
                      {anatomyCommands.map((cmd) => (
                        <CommandItem
                          key={cmd.id}
                          value={`${cmd.id} ${cmd.capsule} ${cmd.title} ${cmd.searchKeywords}`}
                          onMouseEnter={() => {
                            if (cmd.previewUberon) selectUberonRegion(cmd.previewUberon);
                          }}
                          onSelect={cmd.run}
                          className="min-h-[40px]"
                        >
                          <span className="truncate font-sans text-xs">{cmd.title}</span>
                          <CommandShortcut className="border-cyan-400/40 text-cyan-300">
                            {cmd.capsule}
                          </CommandShortcut>
                        </CommandItem>
                      ))}
                    </CommandGroup>

                    <CommandGroup heading="Workbench Phases, Twin & Drawers">
                      {workbenchCommands.map((cmd) => (
                        <CommandItem
                          key={cmd.id}
                          value={`${cmd.id} ${cmd.capsule} ${cmd.title} ${cmd.searchKeywords}`}
                          onSelect={cmd.run}
                          className="min-h-[40px]"
                        >
                          <span className="truncate font-sans text-xs">{cmd.title}</span>
                          <CommandShortcut className="border-cyan-400/40 text-cyan-300">
                            {cmd.capsule}
                          </CommandShortcut>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                ) : null}

                <CommandGroup heading={`Aerospace 360 MedOps Playbooks (${playbookCommands.length})`}>
                  {playbookCommands.map((cmd) => (
                    <CommandItem
                      key={cmd.id}
                      value={`${cmd.id} ${cmd.capsule} ${cmd.title} ${cmd.searchKeywords}`}
                      onSelect={cmd.run}
                      className="min-h-[40px]"
                    >
                      <span className="truncate font-sans text-xs">{cmd.title}</span>
                      <CommandShortcut className="border-cyan-400/40 text-cyan-300">
                        {cmd.capsule}
                      </CommandShortcut>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
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
