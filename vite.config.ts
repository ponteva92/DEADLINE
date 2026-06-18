import { defineConfig } from 'vite';

export default defineConfig({
  // Capacitor serves from file://, so assets must be referenced relatively.
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    // Only build the real app entry; ignore the standalone preview export.
    rollupOptions: { input: 'index.html' },
  },
  // Restrict the dev dependency scanner to index.html so it does NOT try to
  // parse nightfall_preview.html (a self-contained export with inlined JS).
  optimizeDeps: { entries: ['index.html'] },
  server: {
    host: true,
  },
});
