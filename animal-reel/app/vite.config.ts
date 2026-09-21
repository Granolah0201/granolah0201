import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the same build works on GitHub Pages (served from /<repo>/)
// and on Cloudflare Pages (served from /). Override with VITE_BASE if needed.
export default defineConfig({
  base: process.env.VITE_BASE || './',
  plugins: [react()],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          // Both are large and only needed once the user gets to voice/export.
          tts: ['kokoro-js'],
          muxer: ['mediabunny'],
        },
      },
    },
  },
  optimizeDeps: {
    // onnxruntime-web ships its own wasm loader; pre-bundling breaks it.
    exclude: ['kokoro-js', '@huggingface/transformers'],
  },
  worker: { format: 'es' },
});
