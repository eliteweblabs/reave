#!/usr/bin/env node
/**
 * One-shot codemod: replace per-route `function json(...)` with shared `apiJson.ts`.
 */
import fs from 'node:fs';
import path from 'node:path';

const API_ROOT = path.join(process.cwd(), 'src/pages/api');
const API_JSON = path.join(process.cwd(), 'src/lib/apiJson.ts');

const JSON_FN_RE =
  /\nfunction json\([^)]*\): Response \{\n[\s\S]*?\n\}\n/;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

function relImport(fromFile) {
  const fromDir = path.dirname(fromFile);
  let rel = path.relative(fromDir, API_JSON).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  rel = rel.replace(/\.ts$/, '');
  return rel;
}

let changed = 0;
let skipped = 0;

for (const file of walk(API_ROOT)) {
  let src = fs.readFileSync(file, 'utf8');
  if (!src.includes('function json(')) continue;
  if (src.includes("from '") && /from ['"].*apiJson['"]/.test(src)) {
    skipped++;
    continue;
  }
  const match = src.match(JSON_FN_RE);
  if (!match) {
    console.warn('skip (pattern):', path.relative(process.cwd(), file));
    skipped++;
    continue;
  }

  const importPath = relImport(file);
  const importLine = `import { json } from '${importPath}';\n`;

  if (!src.includes(importLine.trim())) {
    const importInsert = src.match(/^import .+;\n/m);
    if (importInsert) {
      const idx = src.lastIndexOf(importInsert[0]) + importInsert[0].length;
      src = src.slice(0, idx) + importLine + src.slice(idx);
    } else {
      const prerender = src.match(/^export const prerender = false;\n\n/m);
      if (prerender) {
        const idx = prerender.index + prerender[0].length;
        src = src.slice(0, idx) + importLine + src.slice(idx);
      } else {
        src = importLine + '\n' + src;
      }
    }
  }

  src = src.replace(JSON_FN_RE, '\n');
  fs.writeFileSync(file, src);
  changed++;
}

console.log(`migrate-api-json: ${changed} updated, ${skipped} skipped`);
