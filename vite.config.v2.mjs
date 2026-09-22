// The desk's root: the one browser shell, built ahead of time and served at the
// root page by the packaged Python runtime (HV2-01, HV2-02, ADR 416).
//
// `base: '/'` is the whole delivery contract in one line — every emitted asset
// URL is rewritten to sit under /assets/, which is the one prefix api.py
// mounts. Built with no CDN: the fonts and the ECharts bundle both come from
// the tree.
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'frontend-v2',
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8765',
    },
  },
});
