#!/usr/bin/env node
/**
 * Publish a bootstrap microservice folder to its own GitHub repo.
 *
 * Usage:
 *   node scripts/publish-bootstrap-repo.mjs fleet-api
 *   node scripts/publish-bootstrap-repo.mjs fleet-api --dry-run
 *
 * Copies bootstrap/{name}/ to a temp dir (self-contained — no parent bootstrap/lib),
 * initializes git, and pushes to eliteweblabs/{name} unless GITHUB_OWNER is set.
 */
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const name = process.argv[2]?.trim();
const dryRun = process.argv.includes('--dry-run');

if (!name) {
  console.error('Usage: node scripts/publish-bootstrap-repo.mjs <service-name> [--dry-run]');
  process.exit(1);
}

const root = resolve(import.meta.dirname, '..');
const src = join(root, 'bootstrap', name);
if (!existsSync(src)) {
  console.error(`Missing bootstrap/${name}/`);
  process.exit(1);
}

const owner = process.env.GITHUB_OWNER?.trim() || 'eliteweblabs';
const repo = `${owner}/${name}`;
const tmp = mkdtempSync(join(tmpdir(), `${name}-publish-`));

try {
  cpSync(src, tmp, { recursive: true });
  console.log(`[publish] staged ${src} → ${tmp}`);

  if (dryRun) {
    console.log(`[publish] dry-run — would create ${repo} from ${tmp}`);
    process.exit(0);
  }

  execSync('git init', { cwd: tmp, stdio: 'inherit' });
  execSync('git add -A', { cwd: tmp, stdio: 'inherit' });
  execSync(`git commit -m "Initial ${name}"`, { cwd: tmp, stdio: 'inherit' });

  try {
    execSync(`gh repo view ${repo}`, { stdio: 'pipe' });
    console.log(`[publish] ${repo} exists — pushing main`);
    execSync(`git remote add origin https://github.com/${repo}.git`, { cwd: tmp, stdio: 'inherit' });
    execSync('git branch -M main', { cwd: tmp, stdio: 'inherit' });
    execSync('git push -u origin main --force', { cwd: tmp, stdio: 'inherit' });
  } catch {
    console.log(`[publish] creating ${repo}`);
    execSync(`gh repo create ${repo} --public --source=. --remote=origin --push`, {
      cwd: tmp,
      stdio: 'inherit',
    });
  }

  console.log(`[publish] done — https://github.com/${repo}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
