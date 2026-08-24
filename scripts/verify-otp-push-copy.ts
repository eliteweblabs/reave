/**
 * Guard: OTP push title/body stay parseable so a notification tap can copy.
 * File-content checks only — no app imports (those pull server HTML deps).
 * Run: npm run check:otp-push-copy
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function extractOtpCodeFromPushText(text: string): string {
  const raw = String(text || '');
  if (!raw.trim()) return '';
  const google = raw.match(/\b(G-\d{6})\b/i);
  if (google?.[1]) return google[1].toUpperCase();
  const labeled = raw.match(/\bCode[:\s]+([A-Z0-9][A-Z0-9 -]{2,16}[A-Z0-9])\b/i);
  if (labeled?.[1]) return labeled[1].replace(/\s+/g, '');
  return '';
}

{
  const body = 'Code 94043 — tap to copy';
  assert.equal(extractOtpCodeFromPushText(body), '94043');
  assert.equal(
    extractOtpCodeFromPushText(`${body}\nGoogle sign-in — code ready`),
    '94043',
  );
  console.log('ok — "Code 94043 — tap to copy" extracts 94043');
}

{
  assert.equal(extractOtpCodeFromPushText('Code G-123456 — tap to copy'), 'G-123456');
  console.log('ok — Google G-123456 survives tap-to-copy formatting');
}

{
  const parser = readFileSync(join(root, 'src/lib/emailOtpParser.ts'), 'utf8');
  assert.match(parser, /Code \$\{code\} — tap to copy/);
  assert.match(parser, /extractOtpCodeFromPushText/);
  console.log('ok — formatOtpPushNotification still emits tap-to-copy body');
}

{
  const sw = readFileSync(join(root, 'public/admin/sw.js'), 'utf8');
  assert.match(sw, /opened = await self\.clients\.openWindow\(copyUrl\)/);
  assert.match(sw, /The SW cannot write the clipboard/);
  assert.doesNotMatch(sw, /alreadyFocused/);
  console.log('ok — service worker always opens /admin/copy on OTP tap');
}

{
  const copyPage = readFileSync(join(root, 'src/pages/admin/copy.astro'), 'utf8');
  assert.match(copyPage, /var launchCode = codeFromHash\(\);/);
  assert.match(copyPage, /launchCopied = fallbackCopy\(launchCode\)/);
  assert.match(copyPage, /document\.execCommand\('copy'\)/);
  console.log('ok — /admin/copy copies synchronously from the notification hash');
}

console.log('otp push copy checks passed');
