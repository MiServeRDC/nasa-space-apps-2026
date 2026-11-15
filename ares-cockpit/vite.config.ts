import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Air-gapped: no remote assets, no CDN, loopback-only dev server.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 850,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/')) {
            return 'vendor-three';
          }
          if (
            id.includes('node_modules/@react-three/') ||
            id.includes('node_modules/three-stdlib/') ||
            id.includes('node_modules/maath/') ||
            id.includes('node_modules/troika-')
          ) {
            return 'vendor-r3f';
          }
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/') ||
            id.includes('node_modules/gsap/') ||
            id.includes('node_modules/zustand/') ||
            id.includes('node_modules/lucide-react/')
          ) {
            return 'vendor-ui';
          }
          return undefined;
        },
      },
    },
  },
});
