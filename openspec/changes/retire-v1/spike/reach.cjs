// How much of a module do the named exports transitively need?
const fs = require('fs'); const parser = require(process.cwd() + '/node_modules/@babel/parser');
const [file, ...names] = process.argv.slice(2);
const src = fs.readFileSync(file, 'utf8');
const ast = parser.parse(src, { sourceType: 'module', plugins: ['importAttributes'] });
const decls = new Map(); // name -> {start,end,lines,imports?}
const importsBy = new Map();
for (const n of ast.program.body) {
  const node = n.type === 'ExportNamedDeclaration' && n.declaration ? n.declaration : n;
  const add = (id) => decls.set(id, { s: n.start, e: n.end, lines: n.loc.end.line - n.loc.start.line + 1 });
  if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') add(node.id.name);
  else if (node.type === 'VariableDeclaration') for (const d of node.declarations) if (d.id.type === 'Identifier') add(d.id.name);
  else if (n.type === 'ImportDeclaration') for (const s of n.specifiers) importsBy.set(s.local.name, n.source.value);
}
const idRx = /[A-Za-z_$][A-Za-z0-9_$]*/g;
const seen = new Set(); const usedImports = new Map(); const q = [...names];
while (q.length) { const k = q.pop(); if (seen.has(k) || !decls.has(k)) continue; seen.add(k);
  const d = decls.get(k); for (const m of src.slice(d.s, d.e).matchAll(idRx)) { const id = m[0];
    if (decls.has(id) && !seen.has(id)) q.push(id); if (importsBy.has(id)) usedImports.set(id, importsBy.get(id)); } }
const lines = [...seen].reduce((a, k) => a + decls.get(k).lines, 0);
const total = src.split('\n').length;
console.log(`${file}: ${names.length} roots -> ${seen.size} of ${decls.size} top-level declarations, ${lines} of ${total} lines`);
console.log('imports needed:', [...new Set(usedImports.values())].sort().join(', '));
console.log('missing roots:', names.filter((n) => !decls.has(n)).join(', ') || 'none');
