/**
 * Playwright screenshot of the Places phone mock-up.
 * Isolated so a missing browser does not break the HTML preview.
 */

import {
  placesPhoneScreenshotDocument,
  resolveIphoneFrameSrc,
  type PlacesPhoneMockOpts,
  type SalesSheetPlacesView,
} from './salesSheetPlacesView';

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-first-run',
  '--no-zygote',
  '--single-process',
];

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
    browser = await pw.chromium.launch({ headless: true, args: LAUNCH_ARGS });
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
