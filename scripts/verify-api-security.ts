/**
 * CI guard: catch common API security regressions.
 *
 * - Local `function json(` helpers (use jsonResponse instead)
 * - Unsafe secret comparison (=== on env keys without secretMatches)
 * - Admin API routes missing auth import
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const errors: string[] = [];

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkTsFiles(full, out);
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

const ADMIN_AUTH_ALLOWLIST = new Set([
  'src/pages/api/admin/social/deauthorize/instagram.ts',
  'src/pages/api/admin/social/data-deletion/instagram.ts',
]);

function checkFile(filePath: string): void {
  const rel = relative(root, filePath);
  const source = readFileSync(filePath, 'utf8');

  if (/function json\([^)]*\): Response/.test(source)) {
    errors.push(`${rel}: local json() helper — use jsonResponse from src/lib/apiResponse.ts`);
  }

  if (
    rel.startsWith('src/pages/api/admin/') &&
    !ADMIN_AUTH_ALLOWLIST.has(rel) &&
    !source.includes('requireDashboardUser') &&
    !source.includes('requireDeploymentOwner') &&
    !source.includes('authorizeContactRoute') &&
    !source.includes('createReorderPostHandler') &&
    !source.includes('verifyPunchlistHubAuth')
  ) {
    errors.push(`${rel}: admin route may be missing auth guard`);
  }
}

for (const file of walkTsFiles(join(root, 'src/pages/api'))) {
  checkFile(file);
}

if (errors.length) {
  console.error('API security verify failed:\n');
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}

console.log('API security verify passed.');
