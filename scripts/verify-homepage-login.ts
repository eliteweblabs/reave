/**
 * Guard: Clerk login chrome is config-driven (public `/`, auth at `/admin`)
 * and never applies to official reΛVe.app.
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
  clerkProxyRequestHeaders,
  fetchClerkUpstream,
  isClerkFrontendApiHost,
  isClerkFrontendProxyPath,
  rewriteClerkProxyLocation,
  rewriteClerkProxySetCookie,
  rewriteClerkRedirectResponse,
} from '../src/lib/clerkFrontendProxy.ts';
import { clerkProxyUrlFromEnv, clerkProxyUrlsEqual } from '../src/lib/clerkProxyUrl.ts';
import { homepageTemplateFromConfig } from '../src/lib/homepageTemplate.ts';

const reaveSite = JSON.parse(readFileSync('config/sites/reave-config.json', 'utf8')) as {
  homepage?: { template?: string; heroHeadlineHtml?: string };
  pages?: string[];
  nav?: { groups?: Array<{ id?: string; links?: Array<{ href?: string; label?: string }> }> };
};
assert.notEqual(reaveSite.homepage?.template, 'login');
assert.match(String(reaveSite.homepage?.heroHeadlineHtml || ''), /Small Business/);
assert.equal(reaveSite.pages?.includes('/features'), true);

const productHrefs = (reaveSite.nav?.groups?.find((g) => g.id === 'product')?.links ?? [])
  .map((link) => link.href)
  .filter((href): href is string => Boolean(href));
assert.equal(new Set(productHrefs).size, productHrefs.length, 'Product nav hrefs must be unique');
assert.equal(productHrefs.filter((href) => href === '/demo-loader').length, 1);

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

const patSite = JSON.parse(readFileSync('config/sites/pattheplumber-config.json', 'utf8')) as {
  homepage?: { template?: string; subtitle?: string };
  pages?: string[];
};
assert.equal(patSite.homepage?.template, 'login');
assert.equal(patSite.homepage?.subtitle, 'Coming soon');
assert.equal(patSite.pages?.includes('/features'), false);

const patInstall = JSON.parse(readFileSync('config/config-pattheplumber.json', 'utf8')) as {
  homepageTemplate?: string;
  siteContentKey?: string;
};
assert.equal(patInstall.homepageTemplate, 'login');
assert.equal(patInstall.siteContentKey, 'pattheplumber');

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
  'canonical reΛVe.app ignores login template',
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
  'client host must not inherit reΛVe.app marketing when INSTALL_CONFIG=reave',
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
assert.equal(isClerkFrontendProxyPath('/__clerk/v1/client/handshake'), true);
assert.equal(isClerkFrontendProxyPath('/admin/__clerk/v1/client/handshake'), true);
assert.equal(isClerkFrontendProxyPath('/admin/login'), false);
assert.equal(
  rewriteClerkProxyLocation(
    'https://clerk.reave.app/v1/client/handshake?foo=1',
    'https://reave.app/admin/?tab=dashboard',
  ),
  'https://reave.app/admin/__clerk/v1/client/handshake?foo=1',
);
assert.equal(
  rewriteClerkProxyLocation(
    'https://reave.app/__clerk/v1/client/handshake?foo=1',
    'https://reave.app/admin/?tab=dashboard',
  ),
  'https://reave.app/admin/__clerk/v1/client/handshake?foo=1',
);
assert.equal(
  rewriteClerkProxyLocation(
    'https://reave.app/sign-in?redirect_url=%2Fadmin%2F',
    'https://reave.app/admin/',
  ),
  'https://reave.app/admin/login?redirect_url=%2Fadmin%2F',
);
{
  const rewritten = rewriteClerkRedirectResponse(
    new Response(null, {
      status: 307,
      headers: { Location: 'https://frontend-api.clerk.dev/v1/client/handshake?redirect_url=https://reave.app/admin/' },
    }),
    new Request('https://reave.app/admin/?tab=dashboard'),
  );
  assert.equal(rewritten.status, 307);
  assert.equal(
    rewritten.headers.get('location'),
    'https://reave.app/admin/__clerk/v1/client/handshake?redirect_url=https://reave.app/admin/',
  );
}
assert.equal(
  rewriteClerkProxySetCookie('__client=abc; Path=/; Domain=clerk.reave.app; Secure; HttpOnly'),
  '__client=abc; Path=/; Secure; HttpOnly',
);
assert.equal(
  rewriteClerkProxySetCookie('__session=abc; Path=/__clerk; Domain=clerk.reave.app; Secure; HttpOnly'),
  '__session=abc; Path=/; Secure; HttpOnly',
);
assert.equal(
  rewriteClerkProxySetCookie('__client=abc; Secure; HttpOnly'),
  '__client=abc; Secure; HttpOnly; Path=/',
);
assert.equal(
  await fetchClerkUpstream('https://clerk.app.levineslaw.com/v1/environment', { redirect: 'manual' }),
  null,
  'broken instance FAPI TLS must not throw out of the proxy',
);
{
  const forwarded = clerkProxyRequestHeaders(
    new Request('https://app.levineslaw.com/__clerk/v1/environment', {
      headers: {
        accept: 'application/json',
        cookie: '__client=abc',
        host: 'app.levineslaw.com',
        'cf-ray': 'should-not-forward',
        'accept-encoding': 'zstd, gzip',
      },
    }),
    'https://app.levineslaw.com/__clerk',
  );
  assert.equal(forwarded.get('accept'), 'application/json');
  assert.equal(forwarded.get('cookie'), '__client=abc');
  assert.equal(forwarded.get('Clerk-Proxy-Url'), 'https://app.levineslaw.com/__clerk');
  assert.equal(forwarded.get('host'), null);
  assert.equal(forwarded.get('cf-ray'), null);
  assert.equal(forwarded.get('accept-encoding'), null);
}

const astroConfig = readFileSync('astro.config.mjs', 'utf8');
assert.match(astroConfig, /clerkProxyUrlFromEnv/);
assert.match(astroConfig, /proxyUrl/);

console.log('verify-homepage-login: ok');
