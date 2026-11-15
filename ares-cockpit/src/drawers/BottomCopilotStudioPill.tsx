import { requireLocalSpeech } from '../lib/localSpeechPolicy';
// Document-flow Voice Copilot & Studio Director controls (`BottomCopilotStudioPill`).
// Implements:
// - Compact wrapping tactile bar (`0` `backdrop-filter`, `>= 48px` hit targets)
// - Air-gapped voice & typed command router (`classifyVoiceTranscript` + `requestEdgeCopilot`)
// - Hard Clinical Safety Interlock (`NASA-STD-3001 [V2 10027]`): blocks any vocal attempt to
//   unlock Gate 1, confirm POCUS thrombus by voice, or administer systemic anticoagulants,
//   firing a damped GSAP horizontal elastic shake + crimson toast + Risk 5 `announceAssertive`!

import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import type { CrystallizedPlaybookId, TelemetryPacket } from '../types/telemetry';
import type { WhatIf } from '../lib/scenario';
import {
  classifyVoiceTranscript,
  requestEdgeCopilot,
  sanitizeSpokenSummary,
} from '../lib/voiceIntentRouter';
import { IS_ARES_DESKTOP_SHELL } from '../modules/os-shell/OsSystemStatusBar';
import { hasWhatIfDeviation } from '../lenses/lensMath';
import { prefersReducedMotionSafe } from '../instruments/instrumentMath';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { announceAssertive, announcePolite } from '../stores/a11yAnnouncer';

export type CopilotVisualState =
  | 'IDLE'
  | 'LISTENING'
  | 'TOOL_EXEC'
  | 'SAFETY_INTERLOCK_BLOCKED';

export interface BottomCopilotStudioPillProps {
  packet: TelemetryPacket;
  whatIf: WhatIf;
  httpBaseUrl?: string;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<SpeechRecognitionAlternativeLike>>;
}

interface SpeechRecognitionInstanceLike {
  processLocally?: boolean;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechWindowLike {
  SpeechRecognition?: new () => SpeechRecognitionInstanceLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionInstanceLike;
}

export function BottomCopilotStudioPill({
  packet,
  whatIf,
  httpBaseUrl = 'http://127.0.0.1:8080',
}: BottomCopilotStudioPillProps) {
  const voiceListening = useWorkbenchStore((s) => s.voiceListening);
  const setVoiceListening = useWorkbenchStore((s) => s.setVoiceListening);
  const voiceSafetyToast = useWorkbenchStore((s) => s.voiceSafetyBlockToast);
  const triggerVoiceSafetyBlock = useWorkbenchStore((s) => s.triggerVoiceSafetyBlock);
  const dismissVoiceSafetyBlock = useWorkbenchStore((s) => s.dismissVoiceSafetyBlock);
  const studioBarOpen = useWorkbenchStore((s) => s.studioBarOpen);
  const toggleStudioBar = useWorkbenchStore((s) => s.toggleStudioBar);
  const setPhase = useWorkbenchStore((s) => s.setPhase);
  const selectPlaybook = useWorkbenchStore((s) => s.selectPlaybook);

  const [consoleExpanded, setConsoleExpanded] = useState<boolean>(false);
  const [utteranceInput, setUtteranceInput] = useState<string>('');
  const [busyExec, setBusyExec] = useState<boolean>(false);
  const [lastSpokenReply, setLastSpokenReply] = useState<string | null>(null);

  const pillRef = useRef<HTMLDivElement | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null);

  const visualState: CopilotVisualState = voiceSafetyToast?.active
    ? 'SAFETY_INTERLOCK_BLOCKED'
    : busyExec
      ? 'TOOL_EXEC'
      : voiceListening
        ? 'LISTENING'
        : 'IDLE';

  // Kinetic damped GSAP elastic shake when `[V2 10027]` voice safety interlock fires
  useEffect(() => {
    if (!voiceSafetyToast?.active || !pillRef.current || prefersReducedMotionSafe()) return;
    const el = pillRef.current;
    gsap.fromTo(
      el,
      { x: -9 },
      {
        x: 0,
        duration: 0.42,
        ease: 'elastic.out(1.2, 0.3)',
        clearProps: 'transform',
      },
    );
  }, [voiceSafetyToast?.timestampMs, voiceSafetyToast?.active]);

  const processTranscript = async (rawTranscript: string) => {
    const clean = rawTranscript.trim();
    if (!clean) return;

    const cls = classifyVoiceTranscript(clean);
    if (cls.kind === 'SAFETY_INTERLOCK_BLOCKED') {
      const reason = cls.reason;
      triggerVoiceSafetyBlock('NASA-STD-3001 [V2 10027]', reason);
      announceAssertive(reason);
      setLastSpokenReply(null);
      return;
    }

    dismissVoiceSafetyBlock();

    if (cls.kind === 'NAVIGATE_PHASE') {
      setPhase(cls.phase);
      const msg = `Voice navigated to ${cls.phase} phase.`;
      setLastSpokenReply(msg);
      announcePolite(msg);
      return;
    }

    if (cls.kind === 'OPEN_PLAYBOOK') {
      selectPlaybook(cls.playbook_id as CrystallizedPlaybookId);
      setPhase('ACT');
      const msg = `Selected ${cls.playbook_id} in 03 ACT.`;
      setLastSpokenReply(msg);
      announcePolite(msg);
      return;
    }

    setBusyExec(true);
    const resp = await requestEdgeCopilot({
      query: clean,
      role: 'CMO',
      preferredToolHint:
        cls.kind === 'CONVERSATIONAL_COPILOT_ASK' ? cls.preferred_tool_hint : null,
      whatIfActive: hasWhatIfDeviation(whatIf),
      isTauriDesktop: IS_ARES_DESKTOP_SHELL,
      allowHttpNetwork: true,
      httpBaseUrl,
      packet,
      whatIf,
    });
    setBusyExec(false);
    const summary = sanitizeSpokenSummary(resp.spoken_summary);
    setLastSpokenReply(summary);
    announcePolite(summary);
  };

  // Optional local browser SpeechRecognition bridge when voiceListening toggles on
  useEffect(() => {
    if (!voiceListening) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      return;
    }
    if (typeof window === 'undefined') return;
    const w = window as unknown as SpeechWindowLike;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setVoiceNotice('On-device voice unavailable. Type a command.');
      // Air-gapped headless / non-SpeechRecognition browser: open local utterance bar automatically
      setConsoleExpanded(true);
      setVoiceListening(false);
      return;
    }
    try {
      const rec = new Ctor();
      if (!requireLocalSpeech(rec)) {
        setVoiceNotice('On-device voice unavailable. Type a command.');
        setConsoleExpanded(true);
        setVoiceListening(false);
        return;
      }
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';
      rec.onresult = (ev) => {
        const transcript = ev.results?.[0]?.[0]?.transcript ?? '';
        setVoiceListening(false);
        void processTranscript(transcript);
      };
      rec.onerror = () => { setVoiceNotice('On-device recognition failed. Type a command.'); setConsoleExpanded(true); setVoiceListening(false); };
      rec.onend = () => setVoiceListening(false);
      recognitionRef.current = rec;
      setVoiceNotice(null);
      rec.start();
    } catch {
      setVoiceNotice('On-device recognition unavailable. Type a command.');
      setConsoleExpanded(true);
      setVoiceListening(false);
    }
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, [voiceListening]);

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="copilot-flow pointer-events-auto font-mono text-sm"
    >
      {voiceNotice ? <p role="status" className="rounded bg-black p-2 text-amber-200">{voiceNotice}</p> : null}
      {/* Safety Interlock Toast (`NASA-STD-3001 [V2 10027]`) */}
      {voiceSafetyToast?.active ? (
        <div
          role="alert"
          className="mb-2 max-w-md rounded-xl border border-rose-500/85 bg-[#140508] px-3 py-2 text-rose-100 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 font-bold text-rose-300">
            <span>VOICE INTERLOCK BLOCKED // {voiceSafetyToast.clause}</span>
            <button
              type="button"
              onClick={dismissVoiceSafetyBlock}
              className="rounded border border-rose-400/40 bg-black px-1.5 py-0.5 text-[9px]"
            >
              DISMISS
            </button>
          </div>
          <p className="mt-0.5 font-sans text-xs leading-snug">{voiceSafetyToast.reason}</p>
        </div>
      ) : null}

      {/* Expandable Local Air-Gapped Utterance Test & Reply Tray */}
      {consoleExpanded ? (
        <div className="mb-2 w-[360px] max-w-[92vw] space-y-2 rounded-2xl border border-white/15 bg-[#06090f] p-2.5 shadow-2xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void processTranscript(utteranceInput);
              setUtteranceInput('');
            }}
            className="flex gap-1.5"
          >
            <input
              type="text"
              value={utteranceInput}
              onChange={(e) => setUtteranceInput(e.target.value)}
              placeholder="Speak or type command..."
              aria-label="Simulated or typed voice utterance"
              className="min-h-[38px] flex-1 rounded-lg border border-white/15 bg-black px-2.5 text-[11px] text-[var(--color-ink-display)] focus:border-cyan-400 focus:outline-none"
            />
            <button
              type="submit"
              className="ares-interactive rounded-lg border border-cyan-400/65 bg-cyan-500/20 px-2.5 font-bold text-cyan-100"
            >
              RUN
            </button>
          </form>

          <div className="flex flex-wrap gap-1 text-[9px]">
            <button
              type="button"
              onClick={() => void processTranscript('Read crew health summary')}
              className="rounded border border-white/10 bg-black px-2 py-1 text-cyan-200"
            >
              &quot;Crew summary&quot;
            </button>
            <button
              type="button"
              onClick={() => void processTranscript('Switch to evaluate phase')}
              className="rounded border border-white/10 bg-black px-2 py-1 text-cyan-200"
            >
              &quot;Evaluate phase&quot;
            </button>
            <button
              type="button"
              onClick={() => void processTranscript('Administer Enoxaparin anticoagulant now')}
              className="rounded border border-rose-400/50 bg-rose-500/10 px-2 py-1 text-rose-200"
            >
              &quot;Give Enoxaparin&quot; [Gate 1 Test]
            </button>
          </div>

          {lastSpokenReply ? (
            <div className="rounded-lg border border-white/10 bg-black/80 p-2 font-sans text-xs text-[var(--color-ink-display)]">
              {lastSpokenReply}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Main Compact Pill (`0` `backdrop-filter`) */}
      <div
        ref={pillRef}
        data-copilot-state={visualState}
        className={`flex flex-wrap items-center gap-2 rounded-xl border bg-[#06090f] px-2 py-1 shadow-2xl ${
          visualState === 'SAFETY_INTERLOCK_BLOCKED'
            ? 'border-rose-500/85'
            : visualState === 'LISTENING'
              ? 'border-cyan-400/80'
              : 'border-white/15'
        }`}
      >
        <button
          type="button"
          aria-pressed={voiceListening}
          onClick={() => setVoiceListening(!voiceListening)}
          className={`ares-touch-target ares-interactive cursor-pointer rounded-full border px-3 font-semibold tracking-wider ${
            visualState === 'SAFETY_INTERLOCK_BLOCKED'
              ? 'border-rose-400/80 bg-rose-500/20 text-rose-100'
              : voiceListening
                ? 'border-cyan-400/80 bg-cyan-400/20 text-cyan-100'
                : 'border-white/10 bg-black text-[var(--color-ink-display)]'
          }`}
        >
          [V] COPILOT: {visualState}
        </button>

        <button
          type="button"
          aria-expanded={consoleExpanded}
          onClick={() => setConsoleExpanded((v) => !v)}
          className="ares-touch-target ares-interactive cursor-pointer rounded-full border border-white/10 bg-black px-2.5 text-[var(--color-ink-meta)]"
        >
          {consoleExpanded ? 'HIDE TRAY' : 'PROMPT'}
        </button>

        <button
          type="button"
          aria-pressed={studioBarOpen}
          onClick={toggleStudioBar}
          className={`ares-touch-target ares-interactive cursor-pointer rounded-full border px-3 font-semibold tracking-wider ${
            studioBarOpen
              ? 'border-amber-400/75 bg-amber-500/20 text-amber-100'
              : 'border-white/10 bg-black text-cyan-200'
          }`}
        >
          [S] STUDIO 29.8S
        </button>
      </div>
    </div>
  );
}
