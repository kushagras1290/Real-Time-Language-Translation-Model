import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite configuration.
 *
 * The dev server proxies `/api` and `/ws` to the Flask backend so the browser
 * sees a single origin during development. That keeps CORS out of the local
 * loop entirely and means `VITE_API_BASE` only needs setting for deployed
 * builds, where the two are served from different hosts.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:5000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // three.js and the r3f stack dominate the bundle and change far less
        // often than app code, so splitting them keeps cache hits high.
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
          motion: ['framer-motion'],
        },
      },
    },
  },
});
