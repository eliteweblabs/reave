/**
 * Guard: Clerk login homepage is config-driven and never applies to official REΛVE.
 * Run: npm run check:homepage-login
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  clerkFrontendApiHost,
  clerkFrontendApiOrigin,
  clerkPublishableKey,
  clerkSecretKey,
  clerkDomainRows,
  isClerkFrontendConfigured,
  isClerkRuntimeConfigured,
  normalizeClerkRuntimeEnv,
} from '../src/lib/clerkClient.ts';
import {
  absoluteClerkProxyUrl,
  isClerkFrontendApiHost,
  rewriteClerkProxyLocation,
  rewriteClerkProxySetCookie,
} from '../src/lib/clerkFrontendProxy.ts';
import { clerkProxyUrlFromEnv, clerkProxyUrlsEqual } from '../src/lib/clerkProxyUrl.ts';
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

assert.equal(
  clerkFrontendApiHost('pk_live_Y2xlcmsucmVhdmUuYXBwJA'),
  'clerk.reave.app',
  'publishable key decodes to the instance FAPI host',
);
assert.equal(clerkFrontendApiOrigin('pk_live_Y2xlcmsucmVhdmUuYXBwJA'), 'https://clerk.reave.app');
assert.equal(clerkFrontendApiHost('pk_test_not-a-host'), undefined);

const prevPk = process.env.CLERK_PUBLISHABLE_KEY;
const prevSk = process.env.CLERK_SECRET;
const prevCanonPk = process.env.PUBLIC_CLERK_PUBLISHABLE_KEY;
const prevCanonSk = process.env.CLERK_SECRET_KEY;
delete process.env.PUBLIC_CLERK_PUBLISHABLE_KEY;
delete process.env.CLERK_SECRET_KEY;
process.env.CLERK_PUBLISHABLE_KEY = 'pk_test_alias';
process.env.CLERK_SECRET = 'sk_test_alias';
assert.equal(clerkPublishableKey(), 'pk_test_alias', 'Clerk dashboard publishable alias is accepted');
assert.equal(clerkSecretKey(), 'sk_test_alias', 'Clerk dashboard secret alias is accepted');
assert.equal(isClerkFrontendConfigured(), true);
normalizeClerkRuntimeEnv();
assert.equal(process.env.PUBLIC_CLERK_PUBLISHABLE_KEY, 'pk_test_alias');
assert.equal(process.env.CLERK_SECRET_KEY, 'sk_test_alias');
assert.equal(isClerkRuntimeConfigured(), true);
if (prevPk === undefined) delete process.env.CLERK_PUBLISHABLE_KEY;
else process.env.CLERK_PUBLISHABLE_KEY = prevPk;
if (prevSk === undefined) delete process.env.CLERK_SECRET;
else process.env.CLERK_SECRET = prevSk;
if (prevCanonPk === undefined) delete process.env.PUBLIC_CLERK_PUBLISHABLE_KEY;
else process.env.PUBLIC_CLERK_PUBLISHABLE_KEY = prevCanonPk;
if (prevCanonSk === undefined) delete process.env.CLERK_SECRET_KEY;
else process.env.CLERK_SECRET_KEY = prevCanonSk;

assert.equal(clerkProxyUrlFromEnv({}), '/__clerk', 'production default is same-origin /__clerk');
assert.equal(
  clerkProxyUrlFromEnv({ PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_example' }),
  '/__clerk',
);
assert.equal(
  clerkProxyUrlFromEnv({ PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_example' }),
  undefined,
  'development instances cannot use the Frontend API proxy',
);
assert.equal(clerkProxyUrlFromEnv({ PUBLIC_CLERK_PROXY_URL: 'none' }), undefined);
assert.equal(
  clerkProxyUrlFromEnv({ PUBLIC_CLERK_PROXY_URL: 'https://app.example.com/__clerk/' }),
  'https://app.example.com/__clerk/',
);
assert.equal(
  clerkProxyUrlsEqual('https://app.example.com/__clerk/', 'https://app.example.com/__clerk'),
  true,
);

const prevProxy = process.env.PUBLIC_CLERK_PROXY_URL;
delete process.env.PUBLIC_CLERK_PROXY_URL;
delete process.env.PUBLIC_CLERK_PUBLISHABLE_KEY;
delete process.env.CLERK_PUBLISHABLE_KEY;
delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
normalizeClerkRuntimeEnv();
assert.equal(process.env.PUBLIC_CLERK_PROXY_URL, '/__clerk');
if (prevProxy === undefined) delete process.env.PUBLIC_CLERK_PROXY_URL;
else process.env.PUBLIC_CLERK_PROXY_URL = prevProxy;
if (prevCanonPk === undefined) delete process.env.PUBLIC_CLERK_PUBLISHABLE_KEY;
else process.env.PUBLIC_CLERK_PUBLISHABLE_KEY = prevCanonPk;
if (prevPk === undefined) delete process.env.CLERK_PUBLISHABLE_KEY;
else process.env.CLERK_PUBLISHABLE_KEY = prevPk;

assert.equal(clerkDomainRows({ data: [{ id: 'dmn_1', is_satellite: false, proxy_url: null }] })[0]?.id, 'dmn_1');

assert.equal(
  absoluteClerkProxyUrl(
    new Request('https://internal/__clerk/v1/client', {
      headers: { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'reave.app' },
    }),
  ),
  'https://reave.app/__clerk',
);
assert.equal(isClerkFrontendApiHost('clerk.reave.app'), true);
assert.equal(isClerkFrontendApiHost('frontend-api.clerk.dev'), true);
assert.equal(isClerkFrontendApiHost('reave.app'), false);
assert.equal(
  rewriteClerkProxyLocation(
    'https://clerk.reave.app/v1/client/handshake?foo=1',
    'https://reave.app/__clerk/v1/client/handshake',
  ),
  'https://reave.app/__clerk/v1/client/handshake?foo=1',
);
assert.equal(
  rewriteClerkProxySetCookie('__client=abc; Path=/; Domain=clerk.reave.app; Secure; HttpOnly'),
  '__client=abc; Path=/; Secure; HttpOnly',
);

const astroConfig = readFileSync('astro.config.mjs', 'utf8');
assert.match(astroConfig, /clerkProxyUrlFromEnv/);
assert.match(astroConfig, /proxyUrl/);

console.log('verify-homepage-login: ok');
