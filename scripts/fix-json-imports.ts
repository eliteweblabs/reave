/**
 * Fix codemod artifact: jsonResponse import inserted inside another import block.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkTsFiles(full, out);
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

const BROKEN_RE =
  /import \{\nimport \{ jsonResponse \} from '([^']+)';\n([\s\S]*?\n)\} from '([^']+)';\n/g;

let fixed = 0;
for (const file of walkTsFiles(join(root, 'src/pages/api'))) {
  let source = readFileSync(file, 'utf8');
  if (!BROKEN_RE.test(source)) continue;
  source = readFileSync(file, 'utf8');
  source = source.replace(BROKEN_RE, (_m, jsonPath, inner, fromPath) => {
    return `import {\n${inner}} from '${fromPath}';\nimport { jsonResponse } from '${jsonPath}';\n`;
  });
  writeFileSync(file, source, 'utf8');
  console.log('fixed', relative(root, file));
  fixed += 1;
}

console.log(`\n${fixed} file(s) fixed.`);
