/**
 * Guard: Agentic Social Media is a listed module, and catalogs expose Social + E-commerce groups.
 * Run: npm run check:module-groups
 */
import assert from 'node:assert/strict';
import { FEATURE_IDS, FEATURE_LABELS, FEATURE_MARKETING, FEATURE_SALE_SHEET } from '../src/lib/featureCatalog.ts';
import { MARKETING_FEATURES } from '../src/lib/marketingFeatures.ts';
import { defaultModuleCatalog } from '../src/lib/moduleCatalog.ts';
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
assert.ok(FEATURE_IDS.includes('google_workspace'));
assert.equal(FEATURE_LABELS.social_inbox, 'Agentic Social Media');
assert.equal(FEATURE_LABELS.google_workspace, 'Google™ Workspace');
assert.equal(FEATURE_LABELS.time_tracking, 'Time Tracking');
assert.equal(FEATURE_LABELS.materials_pricing, 'Materials pricing');
assert.equal(FEATURE_LABELS.website, 'Agentic Website Editor');
const socialId = Number(demoModuleIdForFeature('social_inbox'));
const workspaceId = Number(demoModuleIdForFeature('google_workspace'));
assert.ok(socialId >= 201 && socialId <= 300, 'social_inbox should be in the Social 201–300 band');
assert.ok(workspaceId >= 701 && workspaceId <= 800, 'google_workspace should be in the Google™ Workspace 701–800 band');
assert.ok(FEATURE_SALE_SHEET.has('time_tracking'));
assert.ok(FEATURE_SALE_SHEET.has('social_inbox'));
assert.ok(FEATURE_SALE_SHEET.has('google_workspace'));
assert.ok(!FEATURE_SALE_SHEET.has('content_management'));

const groupIds = MODULE_DISPLAY_GROUPS.map((g) => g.id);
assert.ok(groupIds.includes('social'));
assert.ok(groupIds.includes('e_commerce'));

assert.equal(moduleDisplayGroupId('social_inbox'), 'social');
assert.equal(moduleDisplayGroupId('online_reviews'), 'social');
assert.equal(moduleDisplayGroupFor('inventory_sync')?.title, 'E-commerce');
assert.equal(moduleDisplayGroupId('dealership_wizard'), 'e_commerce');
assert.equal(moduleDisplayGroupId('event_ticketing'), 'e_commerce');
assert.equal(moduleDisplayGroupId('client_portal'), null);
assert.equal(moduleDisplayGroupId('time_tracking'), 'work');
assert.equal(moduleDisplayGroupFor('time_tracking')?.title, 'Work');
assert.equal(moduleDisplayGroupId('google_workspace'), 'google_workspace');

for (const id of FEATURE_SALE_SHEET) {
  assert.ok(FEATURE_IDS.includes(id), `unknown sale-sheet feature ${id}`);
}

const catalog = defaultModuleCatalog();
assert.ok(catalog.some((row) => row.kind === 'core' && row.saleSheet && /^\d{3}$/.test(row.id)));
assert.ok(catalog.every((row) => row.id !== '—'));
assert.ok(catalog.every((row) => !row.feature.includes('-')), 'feature slugs must use underscores');
for (const group of ['core', 'work', 'google_workspace', 'social', 'e_commerce', 'web_development', 'other', 'internal']) {
  const nums = catalog
    .filter((row) => row.group === group)
    .map((row) => Number(row.id))
    .sort((a, b) => a - b);
  for (let i = 1; i < nums.length; i++) {
    assert.equal(nums[i], nums[i - 1]! + 1, `${group} ids must be consecutive`);
  }
}
assert.ok(catalog.some((row) => row.feature === 'time_tracking' && row.group === 'work' && row.saleSheet));
assert.ok(catalog.some((row) => row.feature === 'social_inbox' && row.label === 'Agentic Social Media'));
assert.ok(catalog.some((row) => row.feature === 'google_workspace' && row.group === 'google_workspace' && row.saleSheet));
assert.ok(catalog.some((row) => row.feature === 'gmail_mx' && row.group === 'google_workspace'));
assert.ok(catalog.some((row) => row.feature === 'gmail_dkim' && row.group === 'google_workspace'));
assert.ok(!catalog.some((row) => row.feature === 'content_management'));
assert.equal(FEATURE_MARKETING.google_workspace?.length, 5);
assert.ok(FEATURE_MARKETING.google_workspace?.every((c) => !c.id.includes('-')), 'marketing chips must use underscores');
assert.ok(
  MARKETING_FEATURES.every((f) => !f.id.includes('-')),
  'marketing feature ids must use underscores',
);
assert.ok(FEATURE_MARKETING.google_workspace?.some((c) => c.id === 'gmail_mx'));
assert.ok(FEATURE_MARKETING.google_workspace?.some((c) => c.id === 'gmail_dkim'));

assert.ok(DEFAULT_VISIBLE_SOCIAL_PLATFORMS.includes('youtube'));
assert.ok(DEFAULT_VISIBLE_SOCIAL_PLATFORMS.includes('tiktok'));

for (const slug of ['reave', 'tonybarlettajr', 'barry-levine', 'barrylevine', 'levineslaw']) {
  assert.ok(configFeatures(slug).includes('social_inbox'), `${slug} must enable social_inbox`);
  assert.ok(configFeatures(slug).includes('google_workspace'), `${slug} must enable google_workspace`);
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
