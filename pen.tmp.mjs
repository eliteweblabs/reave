import { chromium } from "playwright";
import fs from "node:fs";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1200, height: 800 },
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  locale: "en-US",
});
const page = await ctx.newPage();

const urls = [
  "https://cdpn.io/cs_playground/fullpage/dyroQoE",
  "https://cdpn.io/cs_playground/debug/dyroQoE",
  "https://codepen.io/cs_playground/pen/dyroQoE",
];

for (const url of urls) {
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(6000);
    const title = await page.title();
    const html = await page.content();
    console.log(`\n=== ${url} status=${res?.status()} title="${title}" bytes=${html.length}`);
    if (/Just a moment|challenge/i.test(title)) {
      console.log("   (cloudflare challenge, waiting longer)");
      await page.waitForTimeout(12000);
    }
    const out = await page.content();
    const file = `/tmp/pen-${url.split("/").slice(-2, -1)[0]}.html`;
    fs.writeFileSync(file, out);
    console.log("   saved", file, out.length, "bytes; title now:", await page.title());
    await page.screenshot({ path: `/tmp/pen-${url.split("/").slice(-2, -1)[0]}.png`, fullPage: false });
    if (!/Just a moment/i.test(await page.title())) break;
  } catch (e) {
    console.log(`=== ${url} FAILED: ${e.message.split("\n")[0]}`);
  }
}

await browser.close();
