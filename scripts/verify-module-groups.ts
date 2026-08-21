/**
 * Guard: Social inbox is a listed module, and catalogs expose Social + E-commerce groups.
 * Run: npm run check:module-groups
 */
import assert from 'node:assert/strict';
import {
  EXTERNAL_SERVICE_IDS,
  FEATURE_IDS,
  FEATURE_LABELS,
  isExternalService,
  isPrivateFeature,
} from '../src/lib/featureCatalog.ts';
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
assert.equal(FEATURE_LABELS.social_inbox, 'Social inbox');
assert.equal(demoModuleIdForFeature('social_inbox'), '036');
assert.ok(FEATURE_IDS.includes('google_workspace'));
assert.equal(FEATURE_LABELS.google_workspace, 'Google™ Workspace');
assert.equal(FEATURE_LABELS.mobile_content_editing, 'Mobile Content Editing');
assert.equal(demoModuleIdForFeature('google_workspace'), '037');
assert.equal(demoModuleIdForFeature('microsoft_365'), '038');
assert.equal(demoModuleIdForFeature('google_business_profile'), '039');
assert.equal(demoModuleIdForFeature('apple_business_connect'), '040');
assert.equal(demoModuleIdForFeature('cloud_number'), '041');
assert.equal(demoModuleIdForFeature('mobile_content_editing'), '042');
assert.equal(FEATURE_LABELS.cloud_number, 'Cloud number');
assert.equal(isPrivateFeature('google_workspace'), true);
assert.equal(isExternalService('google_workspace'), true);
assert.equal(moduleDisplayGroupId('google_workspace'), null);

for (const id of EXTERNAL_SERVICE_IDS) {
  assert.ok(FEATURE_IDS.includes(id), `${id} must be a feature id`);
  assert.equal(isPrivateFeature(id), true, `${id} must be private`);
  assert.equal(isExternalService(id), true, `${id} must be an external service`);
  assert.equal(moduleDisplayGroupId(id), null, `${id} must not sit in a public group`);
}

const groupIds = MODULE_DISPLAY_GROUPS.map((g) => g.id);
assert.ok(groupIds.includes('social'));
assert.ok(groupIds.includes('e-commerce'));

assert.equal(moduleDisplayGroupId('social_inbox'), 'social');
assert.equal(moduleDisplayGroupId('online_reviews'), 'social');
assert.equal(moduleDisplayGroupFor('inventory_sync')?.title, 'E-commerce');
assert.equal(moduleDisplayGroupId('dealership_wizard'), 'e-commerce');
assert.equal(moduleDisplayGroupId('event_ticketing'), 'e-commerce');
assert.equal(moduleDisplayGroupId('client_portal'), null);

assert.ok(DEFAULT_VISIBLE_SOCIAL_PLATFORMS.includes('youtube'));
assert.ok(DEFAULT_VISIBLE_SOCIAL_PLATFORMS.includes('tiktok'));

for (const slug of ['reave', 'tonybarlettajr', 'barry-levine', 'barrylevine', 'levineslaw']) {
  assert.ok(configFeatures(slug).includes('social_inbox'), `${slug} must enable social_inbox`);
  for (const id of EXTERNAL_SERVICE_IDS) {
    assert.ok(!configFeatures(slug).includes(id), `${slug} must not enable ${id}`);
  }
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
