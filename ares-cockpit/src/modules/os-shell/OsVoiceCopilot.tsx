import { requireLocalSpeech } from '../../lib/localSpeechPolicy';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  classifyVoiceTranscript,
  requestEdgeCopilot,
  sanitizeSpokenSummary,
  type CopilotAskResponse,
  type VoiceIntentClassification,
} from '../../lib/voiceIntentRouter';
import type { WhatIf } from '../../lib/scenario';
import type { TelemetryPacket } from '../../types/telemetry';
import { IS_ARES_DESKTOP_SHELL, type TransportMode } from './OsSystemStatusBar';

interface WebSpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface WebSpeechRecognitionErrorEventLike {
  error?: string;
}

interface WebSpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  onresult: ((ev: WebSpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: WebSpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type WebSpeechRecognitionCtor = new () => WebSpeechRecognitionLike;

function getSpeechRecognitionCtor(): WebSpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: WebSpeechRecognitionCtor;
    webkitSpeechRecognition?: WebSpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function speakLocalSummaryOnly(summaryText: string, enabled: boolean): void {
  if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const synth = window.speechSynthesis;
    const localVoices = synth.getVoices().filter((v) => v.localService === true);
    if (localVoices.length === 0) {
      // Air-gapped safety: do not invoke cloud TTS voices if no local on-device voice exists
      return;
    }
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(sanitizeSpokenSummary(summaryText, 25));
    utter.voice = localVoices[0];
    utter.rate = 1.05;
    synth.speak(utter);
  } catch {
    // Ignore speech synthesis errors cleanly
  }
}

export interface OsVoiceCopilotProps {
  packet: TelemetryPacket;
  whatIf: WhatIf;
  whatIfOverlayActive: boolean;
  transportMode: TransportMode;
  httpBaseUrl: string;
  onExecuteIntent: (intent: Exclude<VoiceIntentClassification, { kind: 'CONVERSATIONAL_COPILOT_ASK' }>) => void;
}

export function OsVoiceCopilot({
  packet,
  whatIf,
  whatIfOverlayActive,
  transportMode,
  httpBaseUrl,
  onExecuteIntent,
}: OsVoiceCopilotProps) {
  const [inputText, setInputText] = useState('');
  const [wakeWordOnly, setWakeWordOnly] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [intentNotice, setIntentNotice] = useState<{
    blocked: boolean;
    title: string;
    detail: string;
  } | null>(null);
  const [copilotReply, setCopilotReply] = useState<CopilotAskResponse | null>(null);
  const recognitionRef = useRef<WebSpeechRecognitionLike | null>(null);
  const speechAvailable = getSpeechRecognitionCtor() !== null;

  const processTranscript = useCallback(
    async (rawTranscript: string, fromWakeListener: boolean) => {
      const trimmed = rawTranscript.trim();
      if (!trimmed) return;

      if (fromWakeListener && wakeWordOnly && !/^ares\b/i.test(trimmed)) {
        setIntentNotice({
          blocked: false,
          title: 'WAKE WORD IGNORED',
          detail: 'Hands-free wake mode requires prefix "ARES".',
        });
        return;
      }

      setLastTranscript(trimmed);
      const classification = classifyVoiceTranscript(trimmed);

      if (classification.kind === 'SAFETY_INTERLOCK_BLOCKED') {
        setIntentNotice({
          blocked: true,
          title: `SAFETY_INTERLOCK_BLOCKED | ${classification.clause}`,
          detail: classification.reason,
        });
        speakLocalSummaryOnly('Voice safety interlock blocked. Use tactile verification.', ttsEnabled);
        return;
      }

      if (classification.kind !== 'CONVERSATIONAL_COPILOT_ASK') {
        onExecuteIntent(classification);
        setIntentNotice({
          blocked: false,
          title: `TYPE-1 INTENT (< 1 ms): ${classification.kind}`,
          detail: classification.label,
        });
        speakLocalSummaryOnly(classification.label, ttsEnabled);
        return;
      }

      setBusy(true);
      setIntentNotice(null);
      try {
        const resp = await requestEdgeCopilot({
          query: classification.query,
          role: 'CMO',
          preferredToolHint: classification.preferred_tool_hint,
          whatIfActive: whatIfOverlayActive || Boolean(packet.is_local_simulation),
          isTauriDesktop: IS_ARES_DESKTOP_SHELL,
          allowHttpNetwork: transportMode !== 'LOCAL_SIMULATION',
          httpBaseUrl,
          packet,
          whatIf,
        });
        setCopilotReply(resp);
        speakLocalSummaryOnly(resp.spoken_summary, ttsEnabled);
      } finally {
        setBusy(false);
      }
    },
    [
      wakeWordOnly,
      ttsEnabled,
      onExecuteIntent,
      whatIfOverlayActive,
      packet,
      transportMode,
      httpBaseUrl,
      whatIf,
    ],
  );

  const togglePushToTalk = useCallback(() => {
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setIntentNotice({
        blocked: false,
        title: 'TEXT FALLBACK READY',
        detail: 'On-device Web Speech API unavailable in this browser; type commands or ask Copilot below.',
      });
      return;
    }

    try {
      const rec = new Ctor();
      rec.lang = 'en-US';
      rec.continuous = false;
      rec.interimResults = false;
      if (!requireLocalSpeech(rec)) {
        setListening(false);
        setIntentNotice({blocked: false, title: 'TEXT FALLBACK READY', detail: 'On-device recognition is not supported. Type your command.'});
        return;
      }
      rec.onresult = (ev) => {
        const transcript = ev.results?.[0]?.[0]?.transcript ?? '';
        void processTranscript(transcript, true);
      };
      rec.onerror = (ev) => {
        setListening(false);
        setIntentNotice({
          blocked: false,
          title: 'VOICE INPUT STANDBY',
          detail: `Speech recognition stopped (${ev.error ?? 'unavailable'}). Use text input fallback.`,
        });
      };
      rec.onend = () => {
        setListening(false);
      };
      recognitionRef.current = rec;
      setListening(true);
      rec.start();
    } catch {
      setListening(false);
    }
  }, [listening, processTranscript]);

  // Global Push-To-Talk hotkey: Alt+V
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        togglePushToTalk();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePushToTalk]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  return (
    <section
      aria-label="Microgravity Voice & Edge Copilot Bar"
      className="rounded-lg border border-line bg-black px-3 py-2 font-mono text-xs text-gray-200"
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={togglePushToTalk}
          className={`min-h-[44px] min-w-[44px] shrink-0 cursor-pointer rounded border px-3 py-2 font-semibold transition-colors ${
            listening
              ? 'border-critical bg-critical/15 text-critical'
              : 'border-nominal bg-nominal/10 text-nominal hover:bg-nominal/20'
          }`}
        >
          {listening
            ? 'LISTENING (ALT+V TO STOP)'
            : speechAvailable
              ? 'PTT VOICE (ALT+V)'
              : 'VOICE / TEXT (ALT+V)'}
        </button>

        <button
          type="button"
          onClick={() => setWakeWordOnly((v) => !v)}
          className={`min-h-[44px] min-w-[44px] shrink-0 cursor-pointer rounded border px-3 py-2 text-xs transition-colors ${
            wakeWordOnly
              ? 'border-nominal bg-nominal/10 text-nominal'
              : 'border-line bg-black text-gray-400 hover:border-gray-600'
          }`}
        >
          WAKE: {wakeWordOnly ? '"ARES" ON' : 'DIRECT'}
        </button>

        <button
          type="button"
          onClick={() => setTtsEnabled((v) => !v)}
          className={`min-h-[44px] min-w-[44px] shrink-0 cursor-pointer rounded border px-3 py-2 text-xs transition-colors ${
            ttsEnabled
              ? 'border-ok bg-ok/10 text-ok'
              : 'border-line bg-black text-gray-400 hover:border-gray-600'
          }`}
        >
          LOCAL TTS: {ttsEnabled ? 'ON (<=25w)' : 'MUTE'}
        </button>

        <form
          className="flex min-w-[240px] flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const q = inputText;
            setInputText('');
            void processTranscript(q, false);
          }}
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder='Command or question (e.g. "open playbook 4", "run what-if lbnp 30", "explain IJV shear")'
            aria-label="Voice or text command for ARES Edge Copilot"
            className="min-h-[44px] flex-1 rounded border border-line bg-black px-3 py-2 text-xs text-white outline-none focus:border-nominal placeholder:text-gray-500"
          />
          <button
            type="submit"
            disabled={busy || !inputText.trim()}
            className="min-h-[44px] min-w-[44px] shrink-0 cursor-pointer rounded border border-nominal bg-nominal px-4 py-2 font-bold text-black disabled:opacity-40"
          >
            {busy ? 'WAIT...' : 'SEND'}
          </button>
        </form>
      </div>

      {/* Type-1 Intent Feedback / Safety Interlock Banner */}
      {intentNotice && (
        <div
          role={intentNotice.blocked ? 'alert' : 'status'}
          className={`mt-2 flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-xs ${
            intentNotice.blocked
              ? 'border-critical bg-critical/10 text-critical'
              : 'border-nominal/50 bg-black text-nominal'
          }`}
        >
          <div>
            <span className="font-bold">{intentNotice.title}: </span>
            <span className="text-gray-200">{intentNotice.detail}</span>
            {lastTranscript && (
              <span className="ml-2 text-[11px] text-gray-500">("{lastTranscript}")</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIntentNotice(null)}
            className="min-h-[44px] min-w-[44px] cursor-pointer rounded border border-line bg-black px-3 py-1 text-gray-300"
          >
            DISMISS
          </button>
        </div>
      )}

      {/* Edge Copilot Answer Drawer */}
      {copilotReply && (
        <div className="mt-2 space-y-2 rounded border border-line bg-black p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded border px-2 py-0.5 font-semibold ${
                  copilotReply.execution_mode === 'LOCAL_EDGE_LLM'
                    ? 'border-ok text-ok'
                    : 'border-caution text-caution'
                }`}
              >
                {copilotReply.execution_mode}
              </span>
              <span className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300">
                {copilotReply.validation_disclosure}
              </span>
              <span className="text-[10px] text-gray-400">
                {copilotReply.normative_clause}
              </span>
              <span className="text-[10px] text-gray-500">
                AUDIT {copilotReply.audit_hash_hex} | {copilotReply.total_latency_us} us
              </span>
            </div>
            <button
              type="button"
              onClick={() => setCopilotReply(null)}
              className="min-h-[44px] min-w-[44px] cursor-pointer rounded border border-line bg-black px-3 py-1 text-gray-300 hover:text-white"
            >
              CLOSE
            </button>
          </div>

          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-gray-200">
            {copilotReply.answer_markdown}
          </pre>

          <div className="flex flex-wrap items-center gap-3 text-[10px] text-gray-500">
            <span>PLAYBOOK: {copilotReply.active_playbook_id}</span>
            {copilotReply.hrv_unavailable_reason && (
              <span className="text-advisory">HRV: {copilotReply.hrv_unavailable_reason}</span>
            )}
            <span>
              TOOLS: {copilotReply.tools_invoked.map((t) => `${t.tool} (${t.byte_len}B)`).join(', ')}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
