/**
 * Guard: Agentic Social Media is a listed module, and catalogs expose Social + E-commerce groups.
 * Run: npm run check:module-groups
 */
import assert from 'node:assert/strict';
import {
  FEATURE_IDS,
  FEATURE_LABELS,
  FEATURE_BLURBS,
  FEATURE_MARKETING,
  formatCatalogTitle,
  FEATURE_REQUIRES,
  expandFeatureRequirements,
  FEATURE_SALE_SHEET,
  isDeployableFeature,
  isHostingFeature,
  isPublicFeature,
  isServiceFeature,
} from '../src/lib/featureCatalog.ts';
import {
  FEATURE_DASHBOARD,
  dashboardCardsForFeatures,
  featureShowsDashboard,
} from '../src/lib/featureDashboard.ts';
import { MARKETING_FEATURES } from '../src/lib/marketingFeatures.ts';
import { defaultModuleCatalog } from '../src/lib/moduleCatalog.ts';
import { normalizeCatalogRows } from '../src/lib/moduleCatalogStore.ts';
import { demoModuleIdForFeature } from '../src/lib/demoModuleCatalog.ts';
import {
  MODULE_DISPLAY_GROUPS,
  moduleDisplayGroupFor,
  moduleDisplayGroupId,
} from '../src/lib/moduleDisplayGroups.ts';
import { parseComposeDraftResponse } from '../src/lib/composeDraft.ts';
import { existsSync, readFileSync } from 'node:fs';
import {
  DEFAULT_VISIBLE_SOCIAL_PLATFORMS,
  composeSocialUrl,
  extractSocialHandle,
  getSocialPlatform,
} from '../src/lib/social/platforms.ts';

function configFeatures(slug: string): string[] {
  const raw = JSON.parse(readFileSync(new URL(`../config/config-${slug}.json`, import.meta.url), 'utf8'));
  return Array.isArray(raw.features) ? raw.features : [];
}

assert.ok(FEATURE_IDS.includes('dscr_calculator'));
assert.equal(FEATURE_LABELS.dscr_calculator, 'DSCR Calculator');
assert.ok(featureShowsDashboard('dscr_calculator'));
assert.equal(FEATURE_DASHBOARD.dscr_calculator?.icon, 'calculator');
assert.ok(FEATURE_IDS.includes('social_inbox'));
assert.ok(FEATURE_IDS.includes('google_workspace'));
assert.ok(FEATURE_IDS.includes('hosting_core_os'));
assert.ok(FEATURE_IDS.includes('hosting_growth'));
assert.equal(FEATURE_LABELS.social_inbox, 'Agentic Social Media');
assert.ok(featureShowsDashboard('social_inbox'));
assert.equal(FEATURE_DASHBOARD.social_inbox?.icon, 'share');
const dashCards = dashboardCardsForFeatures(['social_inbox', 'online_reviews', 'email_marketing', 'website']);
assert.ok(dashCards.some((c) => c.id === 'social_inbox' && c.title === FEATURE_LABELS.social_inbox));
assert.ok(dashCards.some((c) => c.id === 'online_reviews' && c.title === FEATURE_LABELS.online_reviews));
assert.ok(dashCards.some((c) => c.id === 'media' && c.title === 'Media Library' && c.mapKey === 'media'));
assert.ok(dashCards.some((c) => c.id === 'website' && c.title === FEATURE_LABELS.website && c.mapKey === 'media'));
assert.ok(!dashCards.some((c) => c.id === 'client_portal'));
assert.equal(FEATURE_LABELS.google_workspace, 'Google™ Workspace');
assert.equal(FEATURE_LABELS.hosting_core_os, 'Core OS Hosting');
assert.equal(FEATURE_LABELS.hosting_growth, 'Growth Hosting');
assert.equal(FEATURE_LABELS.time_tracking, 'Time Tracking');
assert.equal(FEATURE_LABELS.materials_pricing, 'Materials Pricing');
assert.equal(FEATURE_LABELS.website, 'Agentic Website Editor');
assert.equal(FEATURE_LABELS.online_reviews, 'Reviews Triage');
assert.equal(FEATURE_LABELS.scheduling, 'Cal.com Scheduling & Meetings');
assert.equal(FEATURE_LABELS.billing, 'Crater Billing & Invoices');
assert.equal(FEATURE_LABELS.email_marketing, 'Newsletter & Email Automation');
assert.equal(FEATURE_LABELS.documents, 'Dynamic Documents');
assert.equal(FEATURE_LABELS.digital_signature, 'Digital Signature');
assert.ok(FEATURE_SALE_SHEET.has('digital_signature'));
assert.equal(moduleDisplayGroupId('digital_signature'), 'work');
assert.deepEqual(FEATURE_REQUIRES.digital_signature, ['documents']);
assert.deepEqual(expandFeatureRequirements(['digital_signature']), ['documents', 'digital_signature']);
assert.doesNotMatch(
  FEATURE_BLURBS.documents,
  /\bsign/i,
  'documents blurb should not sell e-sign — that is digital_signature',
);
assert.match(FEATURE_BLURBS.digital_signature, /\bsign/i);
for (const [id, label] of Object.entries(FEATURE_LABELS)) {
  assert.equal(label, formatCatalogTitle(label), `${id} title should be title case`);
  assert.doesNotMatch(label, /\band\b/i, `${id} title should use & instead of and`);
}
const socialId = Number(demoModuleIdForFeature('social_inbox'));
const workspaceId = Number(demoModuleIdForFeature('google_workspace'));
const hostingCoreId = Number(demoModuleIdForFeature('hosting_core_os'));
const hostingGrowthId = Number(demoModuleIdForFeature('hosting_growth'));
assert.ok(socialId >= 201 && socialId <= 300, 'social_inbox should be in the Social 201–300 band');
assert.ok(workspaceId >= 701 && workspaceId <= 800, 'google_workspace should be in the Google™ Workspace 701–800 band');
assert.ok(hostingCoreId >= 801 && hostingCoreId <= 900, 'hosting_core_os should be in the Hosting 801–900 band');
assert.ok(hostingGrowthId >= 801 && hostingGrowthId <= 900, 'hosting_growth should be in the Hosting 801–900 band');
assert.ok(FEATURE_SALE_SHEET.has('time_tracking'));
assert.ok(FEATURE_SALE_SHEET.has('social_inbox'));
assert.ok(FEATURE_SALE_SHEET.has('google_workspace'));
assert.ok(!FEATURE_SALE_SHEET.has('content_management'));
assert.equal(isServiceFeature('google_workspace'), true);
assert.equal(isPublicFeature('google_workspace'), false);
assert.equal(isDeployableFeature('google_workspace'), false);
assert.equal(isHostingFeature('hosting_core_os'), true);
assert.equal(isHostingFeature('hosting_growth'), true);
assert.equal(isServiceFeature('hosting_core_os'), true);
assert.equal(isServiceFeature('hosting_growth'), true);
assert.equal(isPublicFeature('hosting_core_os'), false);
assert.equal(isDeployableFeature('hosting_core_os'), false);
assert.equal(isDeployableFeature('hosting_growth'), false);
assert.equal(isDeployableFeature('social_inbox'), true);

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
assert.equal(moduleDisplayGroupId('hosting_core_os'), 'hosting');
assert.equal(moduleDisplayGroupId('hosting_growth'), 'hosting');
assert.equal(moduleDisplayGroupFor('hosting_core_os')?.title, 'Hosting');

for (const id of FEATURE_SALE_SHEET) {
  assert.ok(FEATURE_IDS.includes(id), `unknown sale-sheet feature ${id}`);
}

const catalog = defaultModuleCatalog();
assert.deepEqual(catalog.find((row) => row.feature === 'digital_signature')?.requires, ['documents']);
assert.deepEqual(catalog.find((row) => row.feature === 'dscr_calculator')?.industries, ['real-estate']);
assert.ok(catalog.find((row) => row.feature === 'billing')?.industries?.includes('salon'));
assert.deepEqual(catalog.find((row) => row.kind === 'core')?.industries, []);
assert.ok(catalog.some((row) => row.kind === 'core' && row.saleSheet && /^\d{3}$/.test(row.id)));
assert.ok(
  catalog.some(
    (row) =>
      row.kind === 'core' &&
      row.feature === 'media_library' &&
      row.label === 'Media Library' &&
      row.group === 'core' &&
      row.priceLabel === 'Included',
  ),
  'Media Library must stay a Core OS baseline module',
);
assert.ok(catalog.every((row) => row.id !== '—'));
assert.ok(catalog.every((row) => !row.feature.includes('-')), 'feature slugs must use underscores');
for (const group of ['core', 'work', 'google_workspace', 'hosting', 'social', 'e_commerce', 'web_development', 'real_estate', 'other', 'internal']) {
  const nums = catalog
    .filter((row) => row.group === group)
    .map((row) => Number(row.id))
    .sort((a, b) => a - b);
  for (let i = 1; i < nums.length; i++) {
    assert.equal(nums[i], nums[i - 1]! + 1, `${group} ids must be consecutive`);
  }
}
assert.ok(catalog.some((row) => row.feature === 'dscr_calculator' && row.group === 'real_estate' && row.saleSheet && row.label === 'DSCR Calculator' && row.priceAmount === 175));
assert.equal(moduleDisplayGroupId('dscr_calculator'), 'real_estate');
assert.ok(FEATURE_SALE_SHEET.has('dscr_calculator'));
const dscrId = Number(demoModuleIdForFeature('dscr_calculator'));
assert.ok(dscrId >= 901 && dscrId <= 999, 'dscr_calculator should be in the Real Estate 901–999 band');
assert.ok(catalog.some((row) => row.feature === 'time_tracking' && row.group === 'work' && row.saleSheet));
assert.ok(catalog.some((row) => row.feature === 'social_inbox' && row.label === 'Agentic Social Media'));
assert.ok(catalog.some((row) => row.feature === 'google_workspace' && row.group === 'google_workspace' && row.saleSheet && row.visibility === 'service'));
assert.equal(catalog.filter((row) => row.group === 'google_workspace').length, 1);
assert.ok(catalog.some((row) => row.feature === 'hosting_core_os' && row.group === 'hosting' && !row.saleSheet && row.visibility === 'service' && row.priceAmount === 600 && row.priceLabel === '$600/yr'));
assert.ok(catalog.some((row) => row.feature === 'hosting_growth' && row.group === 'hosting' && !row.saleSheet && row.visibility === 'service' && row.priceAmount === 900 && row.priceLabel === '$900/yr'));
assert.equal(catalog.filter((row) => row.group === 'hosting').length, 2);
assert.ok(!catalog.some((row) => row.feature === 'gmail_mx' || row.feature === 'gmail_dkim' || row.feature === 'google_spf' || row.feature === 'workspace_dmarc' || row.feature === 'workspace_domains'));
const workspaceRow = catalog.find((row) => row.feature === 'google_workspace');
assert.ok(workspaceRow?.blurb.includes('Gmail MX'));
assert.ok(workspaceRow?.blurb.includes('Google SPF'));
assert.ok(workspaceRow?.blurb.includes('Gmail DKIM'));
assert.ok(workspaceRow?.blurb.includes('Workspace DMARC'));
assert.ok(workspaceRow?.blurb.includes('Workspace Domains'));
assert.ok(!catalog.some((row) => row.feature === 'content_management'));
assert.equal(FEATURE_MARKETING.google_workspace?.length, 5);
assert.ok(FEATURE_MARKETING.google_workspace?.every((c) => !c.id.includes('-')), 'marketing chips must use underscores');
assert.ok(
  MARKETING_FEATURES.every((f) => !f.id.includes('-')),
  'marketing feature ids must use underscores',
);
assert.ok(FEATURE_MARKETING.google_workspace?.some((c) => c.id === 'gmail_mx'));
assert.ok(FEATURE_MARKETING.google_workspace?.some((c) => c.id === 'gmail_dkim'));
assert.ok(!MARKETING_FEATURES.some((f) => f.id === 'gmail_mx' || f.id === 'gmail_dkim'));

const collapsed = normalizeCatalogRows([
  {
    key: 'module:google_workspace',
    kind: 'module',
    group: 'google_workspace',
    id: '701',
    feature: 'google_workspace',
    label: 'Google™ Workspace',
    blurb: 'Gmail MX, SPF, DKIM, DMARC, and Workspace domain admin — point a client domain at Google mail without asking them to paste records.',
    priceAmount: 200,
    priceLabel: '$200',
    saleSheet: true,
    visibility: 'service',
  },
  {
    key: 'custom:gmail_mx',
    kind: 'custom',
    group: 'google_workspace',
    id: '702',
    feature: 'gmail_mx',
    label: 'Gmail MX',
    blurb: 'Five standard Google MX records on the client domain.',
    priceAmount: null,
    priceLabel: 'Included',
    saleSheet: true,
    visibility: 'service',
  },
  {
    key: 'custom:gmail_dkim',
    kind: 'custom',
    group: 'google_workspace',
    id: '703',
    feature: 'gmail_dkim',
    label: 'Gmail DKIM',
    blurb: 'Generate the Workspace key, publish it to Cloudflare, enable signing.',
    priceAmount: null,
    priceLabel: 'Included',
    saleSheet: true,
    visibility: 'service',
  },
]);
assert.equal(collapsed.filter((row) => row.group === 'google_workspace').length, 1);
const collapsedWorkspace = collapsed.find((row) => row.feature === 'google_workspace');
assert.ok(collapsedWorkspace?.blurb.includes('Five standard Google MX'));
assert.ok(collapsedWorkspace?.blurb.includes('include:_spf.google.com'));
assert.ok(collapsedWorkspace?.blurb.includes('enable signing'));
assert.ok(collapsedWorkspace?.blurb.includes('p=none'));
assert.ok(collapsedWorkspace?.blurb.includes('alias'));

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

const reddit = getSocialPlatform('reddit');
assert.equal(extractSocialHandle('https://www.reddit.com/r/reaveapp', reddit), 'reaveapp');
assert.equal(extractSocialHandle('r/reaveapp', reddit), 'reaveapp');
assert.equal(composeSocialUrl('reaveapp', reddit), 'https://reddit.com/r/reaveapp');
assert.equal(reddit.prefix, 'reddit.com/r/');
assert.equal(reddit.handleCharset, 'A-Za-z0-9_');

const bluesky = getSocialPlatform('bluesky');
assert.equal(extractSocialHandle('https://bsky.app/profile/foo.bsky.social', bluesky), 'foo');
assert.equal(composeSocialUrl('foo', bluesky), 'https://bsky.app/profile/foo.bsky.social');
assert.equal(composeSocialUrl('reave.app', bluesky), 'https://bsky.app/profile/reave.app');

const substack = getSocialPlatform('substack');
assert.equal(extractSocialHandle('https://acme.substack.com', substack), 'acme');
assert.equal(composeSocialUrl('acme', substack), 'https://acme.substack.com');

const registrySrc = readFileSync('src/lib/pluginRegistry.ts', 'utf8');
const coreDefaultBlock = registrySrc.match(/export const CORE_DEFAULT_SLUGS[\s\S]*?\];/)?.[0] ?? '';
const pluginOwnedRefs = [
  ['paulino-wizard', 'paulino-wizard-reference'],
  ['inventory', 'inventory-api-reference'],
  ['materials', 'materials-api-reference'],
  ['fleet', 'fleet-api-reference'],
] as const;
for (const [pluginId, slug] of pluginOwnedRefs) {
  assert.equal(
    coreDefaultBlock.includes(`'${slug}'`),
    false,
    `${slug} must live in plugins/${pluginId}/knowledge, not CORE_DEFAULT_SLUGS`,
  );
  assert.match(
    registrySrc,
    new RegExp(`case '${pluginId}':[\\s\\S]*?'${slug}'`),
    `${slug} must be gated on plugin ${pluginId}`,
  );
  assert.equal(existsSync(`src/knowledge/${slug}.md`), false, `${slug} must not ship in src/knowledge`);
  assert.ok(
    existsSync(`plugins/${pluginId}/knowledge/${slug}.md`),
    `${slug} must live under plugins/${pluginId}/knowledge`,
  );
}

const pgKnowledge = readFileSync('src/lib/pgKnowledge.ts', 'utf8');
assert.match(pgKnowledge, /isAddonPlaybookSlug/, 'empty-DB seed must skip add-on playbooks');
assert.match(pgKnowledge, /dbPurgeKnowledgeSlugs/, 'add-on playbooks must be deletable from the live DB');
const knowledgeStore = readFileSync('src/lib/knowledgeStore.ts', 'utf8');
assert.match(knowledgeStore, /isModulePlaybookSlug/, 'module playbooks must be identified separately from the DB');
assert.match(knowledgeStore, /allModuleKnowledgeSlugs/, 'copied module playbooks must be purged from the DB');
assert.match(knowledgeStore, /purgePluginKnowledgeForFeature/, 'toggle-off must drop that add-on\'s playbooks');
assert.match(
  knowledgeStore,
  /not saved to the knowledge DB/,
  'writes must refuse to copy module markdown into Postgres',
);
const addonsApi = readFileSync('src/pages/api/admin/addons.ts', 'utf8');
assert.match(addonsApi, /purgePluginKnowledgeForFeature/, 'Add-ons toggle-off must purge knowledge');

assert.equal(existsSync('src/knowledge/clerk-auth.md'), false, 'clerk-auth must not ship in core knowledge');
assert.ok(
  existsSync('plugins/clerk-auth/knowledge/installs/reave/clerk-auth.md'),
  'clerk-auth setup playbook is reΛVe.app-only',
);
assert.match(
  registrySrc,
  /OPS_ONLY_KNOWLEDGE_SLUGS[\s\S]*'clerk-auth'/,
  'clerk-auth must be purged from completed client installs',
);

console.log('verify-module-groups: ok');
