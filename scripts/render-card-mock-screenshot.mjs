#!/usr/bin/env node
/**
 * Render a fixed-viewport HTML mock to a JPEG for grand-opening card fan assets.
 *
 * Usage:
 *   node scripts/render-card-mock-screenshot.mjs \
 *     scripts/mockups/bust-dusters-mobile.html \
 *     public/grand-opening/bust-dusters-mobile.jpg
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const [htmlArg, outArg] = process.argv.slice(2);
if (!htmlArg || !outArg) {
  console.error('Usage: node scripts/render-card-mock-screenshot.mjs <html> <output.jpg>');
  process.exit(1);
}

const htmlPath = path.resolve(htmlArg);
const outPath = path.resolve(outArg);
const htmlUrl = `file://${htmlPath}`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 472, height: 1024 },
    deviceScaleFactor: 1,
  });
  await page.goto(htmlUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: outPath,
    type: 'jpeg',
    quality: 90,
    clip: { x: 0, y: 0, width: 472, height: 1024 },
  });
  console.log(`Wrote ${outPath}`);
} finally {
  await browser.close();
}
