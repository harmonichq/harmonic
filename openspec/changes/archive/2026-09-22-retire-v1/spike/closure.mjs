// Import closure: which tracked files do the given roots reach, by real
// import statements only (comments stripped, no bare string matching)?
// usage: node closure.mjs [--why] <root file or dir>...
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const why = args[0] === '--why';
const roots = why ? args.slice(1) : args;
const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
const seeds = tracked.filter((f) => roots.some((r) => f === r || f.startsWith(`${r}/`)));
const RX = [
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\s+['"]([^'"]+)['"]/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  /new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g,
  /@import\s+(?:url\()?['"]([^'"]+)['"]/g,
  /(?:href|src)=["']([^"']+)["']/g,
];
const parent = new Map();
const seen = new Set();
const queue = [...seeds];
while (queue.length) {
  const f = queue.pop();
  if (seen.has(f)) continue;
  seen.add(f);
  if (!/\.(m?js|css|html)$/.test(f)) continue;
  let src;
  try { src = readFileSync(resolve(ROOT, f), 'utf8'); } catch { continue; }
  src = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  for (const rx of RX) {
    for (const m of src.matchAll(rx)) {
      const spec = m[1];
      if (!/^\.\.?\//.test(spec)) continue;
      const abs = resolve(dirname(resolve(ROOT, f)), spec);
      if (!existsSync(abs) || !statSync(abs).isFile()) continue;
      const rel = relative(ROOT, abs);
      if (rel.startsWith('..') || seen.has(rel)) continue;
      if (!parent.has(rel)) parent.set(rel, f);
      queue.push(rel);
    }
  }
}
for (const f of [...seen].filter((x) => x.startsWith('frontend/')).sort()) {
  console.log(why ? `${f}\t<- ${parent.get(f) ?? '(root)'}` : f);
}
