/**
 * Guard: Clerk login homepage is config-driven and never applies to official REΛVE.
 * Run: npm run check:homepage-login
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isClerkRuntimeConfigured } from '../src/lib/clerkClient.ts';
import { homepageTemplateFromConfig } from '../src/lib/homepageTemplate.ts';

const reaveSite = JSON.parse(readFileSync('config/sites/reave-config.json', 'utf8')) as {
  homepage?: { template?: string; heroHeadlineHtml?: string };
  pages?: string[];
};
assert.notEqual(reaveSite.homepage?.template, 'login');
assert.match(String(reaveSite.homepage?.heroHeadlineHtml || ''), /Small Business/);
assert.equal(reaveSite.pages?.includes('/features'), true);

const reaveInstall = JSON.parse(readFileSync('config/config-reave.json', 'utf8')) as {
  homepageTemplate?: string;
  siteContentKey?: string;
};
assert.notEqual(reaveInstall.homepageTemplate, 'login');
assert.equal(reaveInstall.siteContentKey, 'reave');

const defaultSite = JSON.parse(readFileSync('config/sites/default-config.json', 'utf8')) as {
  homepage?: { template?: string };
  pages?: string[];
};
assert.equal(defaultSite.homepage?.template, 'login');
assert.equal(defaultSite.pages?.includes('/features'), false);

const defaultInstall = JSON.parse(readFileSync('config/config-default.json', 'utf8')) as {
  homepageTemplate?: string;
  siteContentKey?: string;
};
assert.equal(defaultInstall.homepageTemplate, 'login');
assert.equal(defaultInstall.siteContentKey, 'default');

assert.equal(
  homepageTemplateFromConfig({
    siteTemplate: 'login',
    installTemplate: 'login',
    siteKey: 'reave',
    hasLanding: false,
    hasWebsiteFeature: true,
    isCanonicalReave: true,
    isOfficialReaveHost: true,
    isDemo: false,
  }),
  'default',
  'canonical REΛVE ignores login template',
);

assert.equal(
  homepageTemplateFromConfig({
    siteTemplate: 'login',
    siteKey: 'default',
    hasLanding: false,
    hasWebsiteFeature: false,
    isCanonicalReave: false,
    isOfficialReaveHost: true,
    isDemo: false,
  }),
  'default',
  'reave.app host ignores login template',
);

assert.equal(
  homepageTemplateFromConfig({
    siteTemplate: 'login',
    siteKey: 'default',
    hasLanding: false,
    hasWebsiteFeature: false,
    isCanonicalReave: false,
    isOfficialReaveHost: false,
    isDemo: false,
  }),
  'login',
);

assert.equal(
  homepageTemplateFromConfig({
    siteTemplate: 'default',
    installTemplate: 'login',
    siteKey: 'default',
    hasLanding: false,
    hasWebsiteFeature: false,
    isCanonicalReave: false,
    isOfficialReaveHost: false,
    isDemo: false,
  }),
  'login',
);

assert.equal(
  homepageTemplateFromConfig({
    siteTemplate: 'landing',
    siteKey: 'tonybarlettajr',
    hasLanding: true,
    hasWebsiteFeature: false,
    isCanonicalReave: false,
    isOfficialReaveHost: false,
    isDemo: false,
  }),
  'landing',
);

assert.equal(
  homepageTemplateFromConfig({
    siteTemplate: 'default',
    siteKey: 'barbersedge',
    hasLanding: true,
    hasWebsiteFeature: false,
    isCanonicalReave: false,
    isOfficialReaveHost: false,
    isDemo: false,
  }),
  'default',
);

assert.equal(
  homepageTemplateFromConfig({
    siteTemplate: 'default',
    siteKey: 'standalone',
    hasLanding: false,
    hasWebsiteFeature: false,
    isCanonicalReave: false,
    isOfficialReaveHost: false,
    isDemo: false,
  }),
  'login',
);

assert.equal(
  homepageTemplateFromConfig({
    siteTemplate: 'default',
    siteKey: 'reave',
    hasLanding: false,
    hasWebsiteFeature: true,
    isCanonicalReave: true,
    isOfficialReaveHost: false,
    isDemo: false,
    requestHost: 'app.levineslaw.com',
  }),
  'login',
  'client host must not inherit REΛVE marketing when INSTALL_CONFIG=reave',
);

assert.equal(
  homepageTemplateFromConfig({
    siteTemplate: 'login',
    siteKey: 'reave',
    hasLanding: false,
    hasWebsiteFeature: true,
    isCanonicalReave: true,
    isOfficialReaveHost: true,
    isDemo: false,
    requestHost: 'reave.app',
  }),
  'default',
  'reave.app stays marketing even when login is configured',
);

assert.equal(isClerkRuntimeConfigured(), false, 'unset Clerk keys are not runtime-ready');

console.log('verify-homepage-login: ok');
