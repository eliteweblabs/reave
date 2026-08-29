/**
 * Email template fonts must be inbox-safe (no webfonts) and include
 * sans, serif, and mono so every install can match its brand.
 * Run: npm run check:email-safe-fonts
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_EMAIL_FONT_ID,
  EMAIL_SAFE_FONT_CATALOG,
  emailFontStack,
  emailSafeFontById,
  emailSafeFontCatalogForAdmin,
  normalizeEmailFontId,
} from '../src/lib/emailSafeFonts.ts';

assert.equal(DEFAULT_EMAIL_FONT_ID, 'system');
assert.equal(normalizeEmailFontId(''), 'system');
assert.equal(normalizeEmailFontId('space-grotesk'), 'system');
assert.equal(normalizeEmailFontId('Inter'), 'system');
assert.equal(normalizeEmailFontId('georgia'), 'georgia');
assert.equal(normalizeEmailFontId('courier'), 'courier');

const categories = new Set(EMAIL_SAFE_FONT_CATALOG.map((entry) => entry.category));
assert.ok(categories.has('sans'), 'catalog must include sans-serif');
assert.ok(categories.has('serif'), 'catalog must include serif for installs that want it');
assert.ok(categories.has('mono'), 'catalog must include monospace');

for (const entry of EMAIL_SAFE_FONT_CATALOG) {
  assert.ok(entry.id, `missing id on ${entry.label}`);
  assert.match(entry.stack, /sans-serif|serif|monospace/, `${entry.id} needs a generic fallback`);
  assert.doesNotMatch(entry.stack, /Space Grotesk|Inter|Outfit|Mozilla Text/);
  assert.ok(entry.msoFamily, `${entry.id} needs an Outlook face`);
}

assert.match(emailFontStack('system'), /-apple-system/);
assert.match(emailFontStack('georgia'), /Georgia/);
assert.equal(emailSafeFontById('times').category, 'serif');

const admin = emailSafeFontCatalogForAdmin();
assert.equal(admin.length, EMAIL_SAFE_FONT_CATALOG.length);
assert.ok(admin.some((entry) => entry.id === 'arial' && entry.label === 'Arial'));

/** Company form `name="emailFont"` is not an email address — keep this in lockstep with `isEmailAddressField` in os-map-loader.js. */
function isEmailAddressFieldName(name: string): boolean {
  const n = name.toLowerCase();
  return n === 'email' || n.endsWith('email');
}
assert.equal(isEmailAddressFieldName('emailFont'), false);
assert.equal(isEmailAddressFieldName('emailSignature'), false);
assert.equal(isEmailAddressFieldName('supportEmail'), true);
assert.equal(isEmailAddressFieldName('fromEmail'), true);
assert.equal(isEmailAddressFieldName('email'), true);
assert.ok(admin.every((entry) => entry.categoryLabel));
assert.ok(!admin.some((entry) => 'stack' in entry));

console.log('verify-email-safe-fonts: ok');
