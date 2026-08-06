import { chromium } from 'playwright';

const browser = await chromium.launch({
  channel: 'chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const ctx = await browser.newContext({ viewport: { width: 900, height: 860 } });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
page.on('pageerror', (e) => logs.push(`PAGEERROR: ${e.message}`));
page.on('response', (r) => {
  if (r.status() >= 400) logs.push(`HTTP ${r.status()} ${r.url().slice(0, 110)}`);
});

await page.goto('https://reave.app/sign-in', { waitUntil: 'commit' });
await page.waitForTimeout(12000);

console.log(
  JSON.stringify(
    await page.evaluate(() => {
      const sheet = document.getElementById('sign-in-sheet');
      return {
        url: location.href,
        sheetExists: !!sheet,
        sheetOpen: !!sheet?.classList.contains('open'),
        iosSheetLoaded: typeof window.IosSheet?.open === 'function',
        clerkLoaded: !!window.Clerk?.loaded,
        clerkCard: !!sheet?.querySelector('.cl-cardBox, .cl-card'),
        identifierInput: !!sheet?.querySelector('input[name="identifier"]'),
        visibleText: (document.body.innerText || '').trim().slice(0, 200),
      };
    }),
    null,
    1,
  ),
);
console.log('logs:\n  ' + [...new Set(logs)].join('\n  '));
await page.screenshot({ path: '/tmp/signin-page.png' });
await browser.close();
