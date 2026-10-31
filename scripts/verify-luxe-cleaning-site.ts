/**
 * lux.cleaning public site must expose booking forms and scheduling runtime.
 * Run: npm run check:luxe-site
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const install = JSON.parse(
  readFileSync(join(root, 'config/config-luxe-cleaning.json'), 'utf8'),
) as { moduleStatus?: Record<string, string> };
const site = JSON.parse(
  readFileSync(join(root, 'config/sites/luxe-cleaning-config.json'), 'utf8'),
) as {
  pages?: string[];
  landing?: { schedule?: { formSlug?: string } };
};

const pages = (site.pages ?? []).map((p) => p.replace(/\/$/, '') || '/');
assert.ok(
  pages.includes('/form'),
  'luxe-cleaning site config must allow /form (middleware blocks /form/* otherwise)',
);
assert.equal(install.moduleStatus?.scheduling, 'deployed');
assert.equal(site.landing?.schedule?.formSlug, 'lux-schedule');

console.log('verify-luxe-cleaning-site: ok');
