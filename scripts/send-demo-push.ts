/**
 * Send a demo push notification to every subscribed admin device.
 *
 * Usage:
 *   npm run push:demo
 *   npm run push:demo -- --title "Hello" --message "Testing push"
 *
 * Requires VAPID_* env vars and at least one phone/browser subscribed via /admin.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(new URL('.', import.meta.url)));
const REPO_ROOT = join(ROOT, '..');

function loadDotEnv(): void {
  const envPath = join(REPO_ROOT, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]] != null) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  return process.argv[i + 1]?.trim() || undefined;
}

loadDotEnv();

const title = argValue('--title') ?? 'Demo notification';
const message =
  argValue('--message') ??
  'Push is working — you will get inbox alerts, bookings, and website monitoring here.';
const url = argValue('--url') ?? '/admin?tab=dashboard';

const { isPushConfigured, sendPushNotification } = await import('../src/lib/webPush.ts');
if (!isPushConfigured()) {
  console.error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set.');
  process.exit(1);
}

const { listPushSubscriptions } = await import('../src/lib/pushSubscriptionStore.ts');
const subs = await listPushSubscriptions();
if (!subs.length) {
  console.error(
    'No push subscriptions. On your phone: open /admin, install to home screen (iOS), tap Enable notifications.',
  );
  process.exit(1);
}

await sendPushNotification({
  title,
  body: message,
  tag: 'demo-test',
  url,
  badgeCount: 3,
});

console.log(`Sent "${title}" to ${subs.length} device(s). Lock your phone to see the alert.`);
