// The second Vite root: the v2 desk, built ahead of time and served by the
// packaged Python runtime at /v2/ beside v1 (HV2-01, HV2-02).
//
// `base: '/v2/'` is the whole delivery contract in one line — every emitted
// asset URL is rewritten to sit under /v2/assets/, which is the one prefix
// api.py mounts for this surface. Built with no CDN: the fonts and the ECharts
// bundle both come from the tree.
import { defineConfig } from 'vite';

import { chartKeyCss, glossaryModule, materialCss, APP_SHELL } from './frontend-v2/app-source.mjs';

const MATERIAL = 'virtual:harmonic/app-material.css';
const GLOSSARY = 'virtual:harmonic/glossary';

// The two facts v2 shares with v1, resolved from v1's own file at build time so
// neither is copied into this tree. app-source.mjs states why and fails closed
// when a marker moves; `\0` is Vite's convention for a resolved virtual id.
function appSource() {
  return {
    name: 'harmonic-app-source',
    resolveId(id) {
      if (id === MATERIAL || id === GLOSSARY) return `\0${id}`;
      return null;
    },
    load(id) {
      if (id === `\0${MATERIAL}`) return `${materialCss()}\n${chartKeyCss()}`;
      if (id === `\0${GLOSSARY}`) return glossaryModule();
      return null;
    },
    // A change to v1's shell must rebuild the v2 material, not serve a stale one.
    configureServer(server) {
      server.watcher.add(APP_SHELL);
    },
  };
}

export default defineConfig({
  root: 'frontend-v2',
  base: '/v2/',
  plugins: [appSource()],
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
