import { onCLS, onFCP, onINP, onLCP, type MetricType } from 'web-vitals';

export type WebVitalName = 'LCP' | 'CLS' | 'INP' | 'FCP';

export interface WebVitalReading {
  value: number;
  rating: MetricType['rating'];
  delta: number;
  id: string;
  navigationType: string;
}

export interface AresWebVitalsSnapshot {
  LCP: WebVitalReading | null;
  CLS: WebVitalReading | null;
  INP: WebVitalReading | null;
  FCP: WebVitalReading | null;
  longTaskCount: number;
  maxLongTaskMs: number;
  updatedAtMs: number;
}

declare global {
  interface Window {
    __ARES_WEB_VITALS__?: AresWebVitalsSnapshot;
  }
}

let reporterInitialized = false;
let qaPillElement: HTMLDivElement | null = null;

function createInitialSnapshot(): AresWebVitalsSnapshot {
  return {
    LCP: null,
    CLS: null,
    INP: null,
    FCP: null,
    longTaskCount: 0,
    maxLongTaskMs: 0,
    updatedAtMs: Date.now(),
  };
}

function isVitalsPillEnabled(search: string): boolean {
  if (!search) return false;
  try {
    return new URLSearchParams(search).get('vitals') === '1';
  } catch {
    return false;
  }
}

function formatMsMetric(reading: WebVitalReading | null): string {
  if (!reading) return '--';
  return `${Math.round(reading.value)}ms`;
}

function formatClsMetric(reading: WebVitalReading | null): string {
  if (!reading) return '--';
  return reading.value.toFixed(3);
}

function renderQaPillText(snapshot: AresWebVitalsSnapshot): string {
  const base = `FCP ${formatMsMetric(snapshot.FCP)} | LCP ${formatMsMetric(snapshot.LCP)} | INP ${formatMsMetric(snapshot.INP)} | CLS ${formatClsMetric(snapshot.CLS)}`;
  return snapshot.longTaskCount > 0
    ? `${base} | LT ${snapshot.longTaskCount} (${Math.round(snapshot.maxLongTaskMs)}ms)`
    : base;
}

function mountOrUpdateQaPill(snapshot: AresWebVitalsSnapshot): void {
  if (typeof document === 'undefined' || !isVitalsPillEnabled(window.location.search)) {
    return;
  }

  const attach = () => {
    if (!document.body) return;
    if (!qaPillElement || !qaPillElement.isConnected) {
      const existing = document.getElementById('ares-web-vitals-pill');
      if (existing instanceof HTMLDivElement) {
        qaPillElement = existing;
      } else {
        const el = document.createElement('div');
        el.id = 'ares-web-vitals-pill';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'off');
        el.setAttribute('data-qa-vitals', 'true');
        el.style.position = 'fixed';
        el.style.right = '12px';
        el.style.bottom = '12px';
        el.style.zIndex = '60';
        el.style.pointerEvents = 'none';
        el.style.padding = '4px 8px';
        el.style.borderRadius = '2px';
        el.style.border = '1px solid oklch(0.84 0.14 210 / 0.28)';
        el.style.backgroundColor = 'oklch(0.13 0.008 250 / 0.94)';
        el.style.color = 'oklch(0.76 0.02 250)';
        el.style.fontFamily =
          'var(--font-mono, "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace)';
        el.style.fontSize = '10px';
        el.style.lineHeight = '1.2';
        el.style.letterSpacing = '0.06em';
        el.style.fontVariantNumeric = 'tabular-nums';
        document.body.appendChild(el);
        qaPillElement = el;
      }
    }
    qaPillElement.textContent = renderQaPillText(snapshot);
  };

  if (document.body) {
    attach();
  } else {
    window.addEventListener('DOMContentLoaded', attach, { once: true });
  }
}

export function initWebVitalsReporter(): AresWebVitalsSnapshot | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!window.__ARES_WEB_VITALS__) {
    window.__ARES_WEB_VITALS__ = createInitialSnapshot();
  }

  if (reporterInitialized) {
    mountOrUpdateQaPill(window.__ARES_WEB_VITALS__);
    return window.__ARES_WEB_VITALS__;
  }
  reporterInitialized = true;

  const commitMetric = (name: WebVitalName, metric: MetricType) => {
    const target = window.__ARES_WEB_VITALS__ ?? createInitialSnapshot();
    target[name] = {
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      id: metric.id,
      navigationType: metric.navigationType,
    };
    target.updatedAtMs = Date.now();
    window.__ARES_WEB_VITALS__ = target;
    mountOrUpdateQaPill(target);
  };

  onLCP((metric) => commitMetric('LCP', metric), { reportAllChanges: true });
  onCLS((metric) => commitMetric('CLS', metric), { reportAllChanges: true });
  onINP((metric) => commitMetric('INP', metric), { reportAllChanges: true });
  onFCP((metric) => commitMetric('FCP', metric), { reportAllChanges: true });

  try {
    if (
      typeof PerformanceObserver !== 'undefined' &&
      Array.isArray(PerformanceObserver.supportedEntryTypes) &&
      PerformanceObserver.supportedEntryTypes.includes('longtask')
    ) {
      const longTaskObserver = new PerformanceObserver((list) => {
        const target = window.__ARES_WEB_VITALS__ ?? createInitialSnapshot();
        for (const entry of list.getEntries()) {
          target.longTaskCount += 1;
          if (entry.duration > target.maxLongTaskMs) {
            target.maxLongTaskMs = Math.round(entry.duration * 10) / 10;
          }
        }
        target.updatedAtMs = Date.now();
        window.__ARES_WEB_VITALS__ = target;
        mountOrUpdateQaPill(target);
      });
      longTaskObserver.observe({ type: 'longtask', buffered: true });
    }
  } catch {
    // Ignore environments without PerformanceObserver longtask support
  }

  mountOrUpdateQaPill(window.__ARES_WEB_VITALS__);
  return window.__ARES_WEB_VITALS__;
}
