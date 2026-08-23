/**
 * Guard: Agentic Social Media is a listed module, and catalogs expose Social + E-commerce groups.
 * Run: npm run check:module-groups
 */
import assert from 'node:assert/strict';
import { FEATURE_IDS, FEATURE_LABELS, FEATURE_SALE_SHEET } from '../src/lib/featureCatalog.ts';
import { demoModuleIdForFeature } from '../src/lib/demoModuleCatalog.ts';
import {
  MODULE_DISPLAY_GROUPS,
  moduleDisplayGroupFor,
  moduleDisplayGroupId,
} from '../src/lib/moduleDisplayGroups.ts';
import { parseComposeDraftResponse } from '../src/lib/composeDraft.ts';
import { readFileSync } from 'node:fs';
import { DEFAULT_VISIBLE_SOCIAL_PLATFORMS } from '../src/lib/social/platforms.ts';

function configFeatures(slug: string): string[] {
  const raw = JSON.parse(readFileSync(new URL(`../config/config-${slug}.json`, import.meta.url), 'utf8'));
  return Array.isArray(raw.features) ? raw.features : [];
}

assert.ok(FEATURE_IDS.includes('social_inbox'));
assert.equal(FEATURE_LABELS.social_inbox, 'Agentic Social Media');
assert.equal(FEATURE_LABELS.time_tracking, 'Time Tracking');
assert.equal(FEATURE_LABELS.materials_pricing, 'Materials pricing');
assert.equal(FEATURE_LABELS.website, 'Agentic Website Editor');
assert.equal(demoModuleIdForFeature('social_inbox'), '036');
assert.ok(FEATURE_SALE_SHEET.has('time_tracking'));
assert.ok(FEATURE_SALE_SHEET.has('social_inbox'));
assert.ok(!FEATURE_SALE_SHEET.has('content_management'));

const groupIds = MODULE_DISPLAY_GROUPS.map((g) => g.id);
assert.ok(groupIds.includes('social'));
assert.ok(groupIds.includes('e-commerce'));

assert.equal(moduleDisplayGroupId('social_inbox'), 'social');
assert.equal(moduleDisplayGroupId('online_reviews'), 'social');
assert.equal(moduleDisplayGroupFor('inventory_sync')?.title, 'E-commerce');
assert.equal(moduleDisplayGroupId('dealership_wizard'), 'e-commerce');
assert.equal(moduleDisplayGroupId('event_ticketing'), 'e-commerce');
assert.equal(moduleDisplayGroupId('client_portal'), null);
assert.equal(moduleDisplayGroupId('time_tracking'), 'work');
assert.equal(moduleDisplayGroupFor('time_tracking')?.title, 'Work');

for (const id of FEATURE_SALE_SHEET) {
  assert.ok(FEATURE_IDS.includes(id), `unknown sale-sheet feature ${id}`);
}

assert.ok(DEFAULT_VISIBLE_SOCIAL_PLATFORMS.includes('youtube'));
assert.ok(DEFAULT_VISIBLE_SOCIAL_PLATFORMS.includes('tiktok'));

for (const slug of ['reave', 'tonybarlettajr', 'barry-levine', 'barrylevine', 'levineslaw']) {
  assert.ok(configFeatures(slug).includes('social_inbox'), `${slug} must enable social_inbox`);
}

const emailDraft = parseComposeDraftResponse(
  '{"subject":"Following up","body":"Thanks for writing — we can help Tuesday."}',
  'email',
);
assert.equal(emailDraft?.subject, 'Following up');
assert.match(emailDraft?.body || '', /Tuesday/);

const socialDraft = parseComposeDraftResponse(
  'Here is copy.\n{"body":"Thanks Maya — Saturday morning works."}\n',
  'social_reply',
);
assert.equal(socialDraft?.body, 'Thanks Maya — Saturday morning works.');

console.log('verify-module-groups: ok');
