/**
 * One-time codemod: replace local `function json(...)` helpers in API routes
 * with the shared `jsonResponse` from src/lib/apiResponse.ts.
 *
 * Usage: npx tsx scripts/migrate-json-response.ts [--dry-run]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const dryRun = process.argv.includes('--dry-run');
const root = resolve(import.meta.dirname, '..');

const JSON_FN_RE =
  /function json\([^)]*\): Response \{\s*return new Response\(JSON\.stringify\([^)]+\), \{[\s\S]*?\}\);\s*\}\n?/;

const EXTRA_HEADERS_JSON_FN_RE =
  /function json\(data: unknown, status = 200, extraHeaders\?: Record<string, string>\): Response \{[\s\S]*?\}\n?/;

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkTsFiles(full, out);
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

function apiResponseImportPath(filePath: string): string {
  const rel = relative(dirname(filePath), resolve(root, 'src/lib/apiResponse'));
  const normalized = rel.split('\\').join('/');
  return normalized.startsWith('.') ? normalized : `./${normalized}`;
}

function ensureImport(source: string, importPath: string): string {
  if (source.includes('/apiResponse')) return source;
  const importLine = `import { jsonResponse } from '${importPath.replace(/\.ts$/, '')}';\n`;
  const lastImportIdx = source.lastIndexOf('\nimport ');
  if (lastImportIdx === -1) {
    const shebang = source.startsWith('#!') ? source.indexOf('\n') + 1 : 0;
    return source.slice(0, shebang) + importLine + source.slice(shebang);
  }
  const insertAt = source.indexOf('\n', lastImportIdx + 1) + 1;
  return source.slice(0, insertAt) + importLine + source.slice(insertAt);
}

function migrateFile(filePath: string): boolean {
  let source = readFileSync(filePath, 'utf8');
  const hadExtraHeaders = EXTRA_HEADERS_JSON_FN_RE.test(source);
  const hadJsonFn = JSON_FN_RE.test(source) || hadExtraHeaders;

  if (!hadJsonFn) return false;

  source = source.replace(JSON_FN_RE, '');
  source = source.replace(EXTRA_HEADERS_JSON_FN_RE, '');

  if (hadExtraHeaders) {
    source = source.replace(
      /\bjson\(([^,]+),\s*([^,]+),\s*([^)]+)\)/g,
      'jsonResponse($1, $2, { headers: $3 })',
    );
  }

  source = source.replace(/\bjson\(/g, 'jsonResponse(');

  const importPath = apiResponseImportPath(filePath);
  source = ensureImport(source, importPath);

  if (!dryRun) writeFileSync(filePath, source, 'utf8');
  console.log(`${dryRun ? '[dry-run] ' : ''}migrated ${relative(root, filePath)}`);
  return true;
}

const apiDir = resolve(root, 'src/pages/api');
const files = walkTsFiles(apiDir);

let count = 0;
for (const file of files) {
  if (migrateFile(file)) count += 1;
}

console.log(`\n${count} file(s) ${dryRun ? 'would be ' : ''}migrated.`);
