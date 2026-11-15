/** Resolve one backend base for browser, native shell and explicit deployments. */
export function resolveEngineEndpoints(config: {
  httpUrl?: string;
  wsUrl?: string;
  browserOrigin?: string;
  desktop?: boolean;
}) {
  const origin = config.browserOrigin;
  const browserBase = origin && /^https?:\/\//i.test(origin) ? origin : undefined;
  const http = (config.httpUrl?.trim() || (!config.desktop && browserBase) || 'http://127.0.0.1:8080').replace(/\/+$/, '');
  const ws = config.wsUrl?.trim() || `${http.replace(/^http/i, 'ws')}/ws/telemetry`;
  return { http, ws };
}
