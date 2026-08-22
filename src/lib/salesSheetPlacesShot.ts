/**
 * Playwright screenshots for the sales-sheet phone.
 * Isolated so a missing browser does not break the HTML preview.
 */

import https from 'node:https';
import { URL } from 'node:url';
import {
  googleMapsSearchUrl,
  googlePlacesSearchUrl,
  placesPhoneScreenshotDocument,
  resolveIphoneFrameSrc,
  type PlacesPhoneMockOpts,
  type SalesSheetPlacesView,
} from './salesSheetPlacesView';
import { httpsAuditCandidates, type LiveUrlProbe } from './salesSheetExhibits';

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-first-run',
  '--no-zygote',
  '--single-process',
];

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

const SERP_CACHE_TTL_MS = 30 * 60 * 1000;
const serpCache = new Map<string, { pngBase64: string; url: string; listed: boolean; at: number }>();

export type GoogleSearchShotOpts = {
  query: string;
  near?: string;
  lat?: number;
  lng?: number;
};

function launchOptions(): { headless: true; args: string[]; executablePath?: string } {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();
  return {
    headless: true,
    args: LAUNCH_ARGS,
    ...(executablePath ? { executablePath } : {}),
  };
}

type ClickablePage = {
  locator: (sel: string) => {
    first: () => {
      isVisible: (opts: { timeout: number }) => Promise<boolean>;
      click: () => Promise<void>;
    };
  };
  waitForLoadState: (state: 'domcontentloaded') => Promise<void>;
};

async function clickFirstVisible(page: ClickablePage, selectors: string[]): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1200 })) {
        await btn.click();
        await page.waitForLoadState('domcontentloaded');
        return true;
      }
    } catch {
      /* try next */
    }
  }
  return false;
}

async function dismissGoogleOverlays(page: ClickablePage): Promise<void> {
  await clickFirstVisible(page, [
    'button:has-text("Accept all")',
    'button:has-text("I agree")',
    'button:has-text("Accept")',
    '#L2AGLb',
    'button[aria-label="Accept all"]',
  ]);
  await clickFirstVisible(page, [
    'button:has-text("Go back to web")',
    'button:has-text("Use the web")',
    'button:has-text("Stay on web")',
  ]);
}

function googleBlocked(url: string, title: string): string | null {
  if (/\/sorry\//i.test(url) || /unusual traffic/i.test(title)) {
    return 'Google blocked the screenshot (captcha / unusual traffic)';
  }
  return null;
}

const NAME_STOP = new Set(['the', 'and', 'llc', 'inc', 'ltd', 'salon', 'company', 'co']);

/** True when the live Google/Maps page is clearly this business (not a generic nearby list). */
export function serpShowsBusiness(query: string, url: string, title: string): boolean {
  if (/\/maps\/place\//i.test(url)) return true;
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !NAME_STOP.has(t));
  if (!tokens.length) return false;
  const hay = `${title} ${url}`.toLowerCase();
  const hits = tokens.filter((t) => hay.includes(t)).length;
  return hits >= Math.ceil(tokens.length * 0.7);
}

export async function screenshotGoogleSearchResults(
  opts: GoogleSearchShotOpts,
): Promise<
  { ok: true; pngBase64: string; url: string; listed: boolean } | { ok: false; error: string }
> {
  const searchUrl = googlePlacesSearchUrl(opts.query, opts.near);
  const mapsUrl = googleMapsSearchUrl(opts.query, opts.near);
  const cacheKey = `${searchUrl}|${mapsUrl}|${opts.lat ?? ''}|${opts.lng ?? ''}`;
  const cached = serpCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SERP_CACHE_TTL_MS) {
    return { ok: true, pngBase64: cached.pngBase64, url: cached.url, listed: cached.listed };
  }

  let pw: typeof import('playwright');
  try {
    pw = await import('playwright');
  } catch {
    return { ok: false, error: 'Playwright is not installed' };
  }

  const hasGeo =
    opts.lat != null &&
    opts.lng != null &&
    Number.isFinite(opts.lat) &&
    Number.isFinite(opts.lng);

  let browser: Awaited<ReturnType<typeof pw.chromium.launch>> | undefined;
  try {
    browser = await pw.chromium.launch({
      ...launchOptions(),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
      ],
    });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: IPHONE_UA,
      locale: 'en-US',
      timezoneId: 'America/New_York',
      ...(hasGeo
        ? {
            geolocation: { latitude: opts.lat as number, longitude: opts.lng as number },
            permissions: ['geolocation'],
          }
        : {}),
    });
    const page = await context.newPage();

    let landed = '';
    for (const url of [searchUrl, mapsUrl]) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await dismissGoogleOverlays(page);
      await new Promise((r) => setTimeout(r, 1600));
      await dismissGoogleOverlays(page);
      const blocked = googleBlocked(page.url(), await page.title());
      if (blocked) continue;
      landed = page.url();
      break;
    }
    if (!landed) {
      return { ok: false, error: 'Google blocked the screenshot (captcha / unusual traffic)' };
    }

    await page
      .locator('textarea[name="q"], input[name="q"], [role="combobox"], [aria-label*="Search"]')
      .first()
      .waitFor({ state: 'visible', timeout: 8000 })
      .catch(() => undefined);
    await new Promise((r) => setTimeout(r, 1800));

    const title = await page.title();
    const listed = serpShowsBusiness(opts.query, page.url(), title);
    const buf = await page.screenshot({ type: 'png' });
    const pngBase64 = buf.toString('base64');
    serpCache.set(cacheKey, { pngBase64, url: page.url(), listed, at: Date.now() });
    return { ok: true, pngBase64, url: page.url(), listed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

export type AuditUrlShot = {
  ok: true;
  pngBase64: string;
  down: boolean;
  status: number | null;
  title: string;
  finalUrl: string;
};

/** True when the captured tab is an error page, not a real homepage. */
export function auditUrlShotLooksDown(shot: Pick<AuditUrlShot, 'down' | 'status' | 'title' | 'finalUrl'>): boolean {
  if (shot.down) return true;
  const url = (shot.finalUrl || '').toLowerCase();
  const title = (shot.title || '').toLowerCase();
  if (/chrome-error|chromewebdata|about:neterror|edge:\/\//.test(url)) return true;
  if (
    /can'?t be reached|cannot open the page|site can.t be reached|err_connection|err_name_not|err_timed_out|err_address|this site can.t provide a secure connection/.test(
      title,
    )
  ) {
    return true;
  }
  if (shot.status != null && shot.status >= 500) return true;
  return false;
}

/** True when the tab is a cert / Not Secure interstitial, not a clean HTTPS page. */
export function auditUrlShotLooksInsecure(
  shot: Pick<AuditUrlShot, 'down' | 'status' | 'title' | 'finalUrl'>,
): boolean {
  const url = (shot.finalUrl || '').toLowerCase();
  const title = (shot.title || '').toLowerCase();
  if (/^http:\/\//.test(url)) return true;
  if (/not private|privacy error|err_cert|net::err_cert|certificate/.test(title)) return true;
  if (/chrome-error|chromewebdata/.test(url) && /cert|ssl|privacy|secure/.test(title)) return true;
  return false;
}

const CERT_ERR_RE =
  /CERT_|UNABLE_TO_VERIFY|ERR_TLS|DEPTH_ZERO|HOSTNAME_MISMATCH|self.?signed|unable to verify|certificate/i;

function classifyHttpsError(err: unknown): 'insecure' | 'down' {
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : '';
  const msg = err instanceof Error ? err.message : String(err || '');
  if (CERT_ERR_RE.test(code) || CERT_ERR_RE.test(msg)) return 'insecure';
  return 'down';
}

function probeOneHttps(url: string, hops = 0): Promise<'ok' | 'insecure' | 'down'> {
  if (hops > 5) return Promise.resolve('down');
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: 'ok' | 'insecure' | 'down') => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      done('down');
      return;
    }
    if (target.protocol === 'http:') {
      done('insecure');
      return;
    }
    const req = https.request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname || '/'}${target.search || ''}`,
        method: 'GET',
        timeout: 8000,
        servername: target.hostname,
        headers: { Accept: 'text/html', 'User-Agent': IPHONE_UA },
      },
      (res) => {
        const loc = res.headers.location;
        if (loc && res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          const next = new URL(loc, target);
          if (next.protocol === 'http:') {
            done('insecure');
            return;
          }
          void probeOneHttps(next.href, hops + 1).then(done);
          return;
        }
        res.resume();
        if ((res.statusCode || 0) >= 500) done('down');
        else done('ok');
      },
    );
    req.on('error', (err) => done(classifyHttpsError(err)));
    req.on('timeout', () => {
      req.destroy();
      done('down');
    });
    req.end();
  });
}

/** Probe www and apex. Used to keep the Not Secure graphic only when HTTPS actually fails. */
export async function probeAuditHttps(website: string): Promise<LiveUrlProbe> {
  const cleanUrls: string[] = [];
  const insecureUrls: string[] = [];
  const downUrls: string[] = [];
  for (const url of httpsAuditCandidates(website)) {
    const result = await probeOneHttps(url);
    if (result === 'ok') cleanUrls.push(url);
    else if (result === 'insecure') insecureUrls.push(url);
    else downUrls.push(url);
  }
  return { cleanUrls, insecureUrls, downUrls };
}

/** Capture the audit URL and say whether the front door is actually closed. */
export async function screenshotAuditUrl(
  url: string,
): Promise<AuditUrlShot | { ok: false; error: string }> {
  const target = url.trim();
  if (!target) return { ok: false, error: 'No audit URL' };
  let pw: typeof import('playwright');
  try {
    pw = await import('playwright');
  } catch {
    return { ok: false, error: 'Playwright is not installed' };
  }
  let browser: Awaited<ReturnType<typeof pw.chromium.launch>> | undefined;
  try {
    browser = await pw.chromium.launch(launchOptions());
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: IPHONE_UA,
    });
    let status: number | null = null;
    let timedOut = false;
    const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 12_000 }).catch((err: unknown) => {
      timedOut = /timeout/i.test(err instanceof Error ? err.message : String(err));
      return null;
    });
    status = response?.status() ?? null;
    await new Promise((r) => setTimeout(r, 800));
    const finalUrl = page.url();
    const title = await page.title().catch(() => '');
    const buf = await page.screenshot({ type: 'png' });
    const down = timedOut || !response || auditUrlShotLooksDown({ down: false, status, title, finalUrl });
    return { ok: true, pngBase64: buf.toString('base64'), down, status, title, finalUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

export async function screenshotPlacesPhoneMock(
  view: SalesSheetPlacesView,
  opts?: PlacesPhoneMockOpts,
): Promise<{ ok: true; pngBase64: string } | { ok: false; error: string }> {
  let pw: typeof import('playwright');
  try {
    pw = await import('playwright');
  } catch {
    return { ok: false, error: 'Playwright is not installed' };
  }

  let browser: Awaited<ReturnType<typeof pw.chromium.launch>> | undefined;
  try {
    browser = await pw.chromium.launch(launchOptions());
    const page = await browser.newPage({
      viewport: { width: 360, height: 760 },
      deviceScaleFactor: 2,
    });
    const frameSrc = opts?.frameSrc || (await resolveIphoneFrameSrc());
    await page.setContent(placesPhoneScreenshotDocument(view, { frameSrc }), {
      waitUntil: 'domcontentloaded',
    });
    const phone = page.locator('.ss-phone');
    await phone.waitFor({ state: 'visible', timeout: 4000 });
    await page
      .locator('.ss-phone-frame')
      .evaluate((img: HTMLImageElement) => {
        if (img.complete && img.naturalWidth > 0) return true;
        return new Promise<boolean>((resolve, reject) => {
          img.addEventListener('load', () => resolve(true), { once: true });
          img.addEventListener('error', () => reject(new Error('iPhone frame failed to load')), {
            once: true,
          });
        });
      })
      .catch(() => undefined);
    const buf = await phone.screenshot({ type: 'png' });
    return { ok: true, pngBase64: buf.toString('base64') };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
