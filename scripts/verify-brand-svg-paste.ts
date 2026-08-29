/**
 * A wordmark pasted into admin → Company → Logo SVG must survive validation and
 * the config store byte for byte. The reAVe.app wordmark is ~7 KB of path data,
 * which is the shape of paste that people report "not saving".
 * Run: npm run check:brand-svg-paste
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const store = mkdtempSync(join(tmpdir(), 'brand-svg-'));
process.env.COMPANY_CONFIG_FILE = join(store, 'company-config.json');
delete process.env.DATABASE_URL;

const { sanitizeInlineSvg, prepareInlineBrandSvg, BRAND_SVG_MAX_CHARS } = await import(
  '../src/lib/brandSvg.ts'
);
const {
  companyConfigStorageBackend,
  clearCompanyConfigCache,
  getStoredCompanyConfig,
  setStoredCompanyConfig,
} = await import('../src/lib/companyConfigStore.ts');

const WORDMARK = readFileSync('public/logos/reave-app-wordmark.svg', 'utf8');

{
  assert.ok(WORDMARK.length < BRAND_SVG_MAX_CHARS, 'wordmark exceeds the paste cap');
  const sanitized = sanitizeInlineSvg(WORDMARK);
  assert.ok(sanitized, 'wordmark rejected by sanitizeInlineSvg');
  assert.equal(
    (sanitized.match(/<path/g) ?? []).length,
    9,
    'sanitizer dropped glyph paths',
  );
  assert.ok(prepareInlineBrandSvg(WORDMARK), 'wordmark rejected for inline render');
}

{
  // Leading XML declarations and stray whitespace are normal from design tools.
  assert.ok(sanitizeInlineSvg(`<?xml version="1.0"?>\n${WORDMARK}`));
  assert.ok(sanitizeInlineSvg(`\n\n  ${WORDMARK}  \n`));
  // Things people paste by mistake must stay rejected.
  assert.equal(sanitizeInlineSvg('https://reave.app/logos/reave-app-wordmark.svg'), null);
  assert.equal(sanitizeInlineSvg(''), null);
  assert.equal(sanitizeInlineSvg('x'.repeat(BRAND_SVG_MAX_CHARS + 1)), null);
}

if (companyConfigStorageBackend() === 'files') {
  clearCompanyConfigCache();
  const ok = await setStoredCompanyConfig({ logoSvg: WORDMARK.trim(), iconSvg: null });
  assert.ok(ok, 'company config write failed');
  clearCompanyConfigCache();
  const stored = await getStoredCompanyConfig();
  assert.equal(stored?.logoSvg, WORDMARK.trim(), 'wordmark did not round-trip through the store');
  assert.equal(stored?.iconSvg, null, 'empty paste must clear, not store whitespace');
} else {
  console.log('· storage round-trip skipped (postgres backend configured)');
}

// The admin panel autosaves; a paste that cannot be saved has to say so at the
// field, and a pending paste must survive the tab going away on a phone.
{
  const admin = readFileSync('public/admin/os-map-loader.js', 'utf8');
  assert.match(admin, /function setFormFieldMessage/, 'field-level save errors went missing');
  assert.match(
    admin,
    /const blocking = blockingField\(\);[\s\S]{0,240}setFormFieldMessage\(blocking, fieldError\(blocking\)\)/,
    'a field blocking autosave must be named, not silently skipped',
  );
  assert.match(admin, /function isPastedSvgMarkup/, 'SVG pastes need a client-side gate');
  assert.match(admin, /COMPANY_SVG_FIELD_IDS/, 'company SVG fields must use the SVG validator');
  assert.match(
    admin,
    /if \(document\.hidden\) \{[\s\S]{0,200}flushSettingsAutosaveKeepBound\(\)/,
    'backgrounding the tab must flush a pending settings edit',
  );
  assert.match(
    admin,
    /pagehide[\s\S]{0,160}flushSettingsAutosaveKeepBound\(\)/,
    'pagehide must flush a pending settings edit',
  );
  assert.match(
    admin,
    /document\.activeElement === ta/,
    'a save response must not overwrite an SVG field that is being edited',
  );
}

{
  const css = readFileSync('src/styles/admin/panels/settings.css', 'utf8');
  assert.match(css, /\.prof-field-error\s*\{/, 'field-level error style went missing');
}

rmSync(store, { recursive: true, force: true });
console.log('✓ brand SVG paste: wordmark validates, round-trips, and failures surface at the field');
