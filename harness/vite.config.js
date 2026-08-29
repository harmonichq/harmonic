import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { harnessDataPlugin } from './dev-server.js';

const harnessRoot = fileURLToPath(new URL('.', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  root: harnessRoot,
  plugins: [harnessDataPlugin({ repositoryRoot })],
  server: {
    fs: { allow: [repositoryRoot] },
  },
});
