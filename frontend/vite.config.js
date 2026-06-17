import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    minify: 'esbuild',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1000,
  },
  server: { port: 5173 },
});
