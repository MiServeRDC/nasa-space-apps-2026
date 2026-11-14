import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Same-origin requests forwarded only to the local Fernando server.
const proxy: Record<string, string | ProxyOptions> = {
  '/ws/telemetry': { target: 'ws://127.0.0.1:8080', ws: true },
  '/api/stress-test': 'http://127.0.0.1:8080',
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy },
  preview: { proxy },
});
