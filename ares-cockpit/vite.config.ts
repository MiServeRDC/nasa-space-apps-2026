import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Air-gapped: no remote assets, no CDN, loopback-only dev server.
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
