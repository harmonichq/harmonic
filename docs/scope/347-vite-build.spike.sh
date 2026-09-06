#!/bin/sh
# #347 spike — does Vite 8 build the CURRENT frontend/index.html shell as it is
# (inline module script, runtime-compiled Vue templates, ECharts as a global),
# leaving no CDN URL in the output and keeping the S71 replay seam readable in
# an unminified bundle? Runs entirely in a scratch directory; the checkout is
# not modified. Recorded output lives in docs/scope/347-vite-frontend-foundation.md.
#
#   sh docs/scope/347-vite-build.spike.sh [scratch-dir]
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
S=${1:-$(mktemp -d "${TMPDIR:-/tmp}/harmonic-347-spike.XXXXXX")}
SRC="$ROOT/frontend"
rm -rf "$S/proj"; mkdir -p "$S/proj/frontend" "$S/npm-cache"
# shipped frontend sources only (no tests, fixtures, or browser drivers)
for f in "$SRC"/*.js "$SRC"/*.css "$SRC"/*.svg "$SRC"/index.html; do
  case "$f" in *.test.js|*.browser.*|*.replay.*|*.mjs) continue;; esac
  cp "$f" "$S/proj/frontend/"
done
cd "$S/proj"
cat > package.json <<'JSON'
{ "name": "harmonic-spike-347", "private": true, "type": "module",
  "scripts": { "build": "vite build" } }
JSON
npm --cache "$S/npm-cache" install --save-exact --no-audit --no-fund \
  vite@8.2.2 vue@3.5.42 echarts@5.5.0 @vitejs/plugin-vue@6.0.8 >install.log 2>&1
cat > vite.config.js <<'JS'
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: 'frontend',
  base: '/',
  plugins: [vue()],
  resolve: { alias: { vue: 'vue/dist/vue.esm-bundler.js' } },
  build: { outDir: 'dist', emptyOutDir: true, minify: false },
});
JS
cat > frontend/main.js <<'JS'
// Compatibility entry: one bundled ECharts identity on window for the chart
// modules that still read the global.
import * as echarts from 'echarts';
window.echarts = echarts;
JS
node - <<'JS'
const fs = require('fs');
let h = fs.readFileSync('frontend/index.html', 'utf8');
const before = h.length;
h = h.replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, '');
h = h.replace(/\s*<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/echarts@5\.5\.0\/dist\/echarts\.min\.js"><\/script>/, '\n  <script type="module" src="./main.js"></script>');
h = h.replace(/(from\s+['"])\/assets\//g, '$1./');
h = h.replace(/(href=["'])\/assets\//g, '$1./');
fs.writeFileSync('frontend/index.html', h);
console.log('index.html transformed', before, '->', h.length, 'chars; /assets/ left:', (h.match(/\/assets\//g)||[]).length);
JS
npx vite build > build.log 2>&1 || { tail -40 build.log; exit 1; }
tail -25 build.log
echo "--- dist tree ---"; find frontend/dist -type f | sort
echo "--- CDN URLs in dist (want 0) ---"; grep -rl -E "unpkg\.com|jsdelivr\.net" frontend/dist | wc -l
echo "--- seam in bundle (want >=1) ---"; grep -l -F 'function createDiagnoseWorkstation({ root, callbacks = {} }) {' frontend/dist/assets/*.js | wc -l
echo "--- vue compiler present (compile fn) ---"; grep -l -E "compileToFunction" frontend/dist/assets/*.js | wc -l
echo "--- dist/index.html script/link tags ---"; grep -n -E "<script|<link" frontend/dist/index.html | head
echo "scratch: $S"
