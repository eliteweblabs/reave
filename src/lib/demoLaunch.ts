/**
 * Public demo-loader launch gate: validate visitor, rate-limit abuse,
 * record a lightweight lead, build the sandbox URL.
 */
import { createHash } from 'crypto';
import { clientIp } from './clientIp';
import { ensureWorkContact } from './workStore';
import { recordDemoLaunchEngagement } from './engagementNotifications';
import { checkInMemoryRateLimit } from './inMemoryRateLimit';
import {
  buildDemoSuiteConfig,
  buildDemoSuiteUrl,
  type DemoSuiteConfig,
} from './demoSuite';
import { DEMO_BASELINE_MODULE_IDS, mergeDemoModuleIds, demoModuleById } from './demoModuleCatalog';
import { getPublicDemoSiteUrl } from './publicDemo';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Bots / crawlers that should not burn launch quota or create leads. */
export const DEMO_LAUNCH_BOT_UA_RE =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|whatsapp|google-inspection|bingpreview|embedly|quora link preview|pinterest|redditbot|applebot|duckduckbot|baiduspider|yandex|semrush|ahrefs|petalbot|bytespider/i;

export type DemoLaunchInput = {
  name: string;
  email: string;
  industry?: string;
  moduleIds?: string[];
  tier?: number;
  /** Honeypot — must be empty. */
  website?: string;
};

export type DemoLaunchResult =
  | { ok: true; redirectUrl: string; suite: DemoSuiteConfig; contactUid: string | null }
  | { ok: false; error: string; status: number; retryAfterSeconds?: number };

function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 120);
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 254);
}

export function isValidDemoLaunchEmail(email: string): boolean {
  return EMAIL_RE.test(email) && email.length <= 254;
}

function dayBucket(): string {
  return new Date().toISOString().slice(0, 10);
}

function emailRateKey(email: string): string {
  const hash = createHash('sha256').update(email).digest('hex').slice(0, 24);
  return `demo-launch-email:${hash}:${dayBucket()}`;
}

export function checkDemoLaunchRateLimits(
  request: Request,
  email: string,
): { ok: true } | { ok: false; error: string; retryAfterSeconds: number } {
  const ip = clientIp(request) || 'unknown';

  const ipLimit = checkInMemoryRateLimit(`demo-launch-ip:${ip}`, {
    windowMs: 60 * 60 * 1000,
    maxPerWindow: 5,
  });
  if (!ipLimit.ok) {
    return {
      ok: false,
      error: 'Too many demo launches from this network. Please try again later.',
      retryAfterSeconds: ipLimit.retryAfterSeconds,
    };
  }

  const emailLimit = checkInMemoryRateLimit(emailRateKey(email), {
    windowMs: 24 * 60 * 60 * 1000,
    maxPerWindow: 3,
  });
  if (!emailLimit.ok) {
    return {
      ok: false,
      error: 'This email has started too many demos today. Please try again tomorrow.',
      retryAfterSeconds: emailLimit.retryAfterSeconds,
    };
  }

  return { ok: true };
}

export function checkDemoLoaderCatalogRateLimit(
  request: Request,
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const ip = clientIp(request) || 'unknown';
  const rate = checkInMemoryRateLimit(`demo-loader:${ip}`, {
    windowMs: 60_000,
    maxPerWindow: 30,
  });
  if (!rate.ok) return { ok: false, retryAfterSeconds: rate.retryAfterSeconds };
  return { ok: true };
}

function sanitizeModuleIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw
    .map((id) => String(id ?? '').trim().padStart(3, '0'))
    .filter((id) => /^\d{3}$/.test(id) && Boolean(demoModuleById(id)));
  return mergeDemoModuleIds([...DEMO_BASELINE_MODULE_IDS, ...ids]);
}

/**
 * Validate + rate-limit + record lead + build sandbox redirect.
 * Does not create inquiry projects or send ack emails (those would amplify spam cost).
 */
export async function processDemoLaunch(
  request: Request,
  input: DemoLaunchInput,
): Promise<DemoLaunchResult> {
  const ua = request.headers.get('user-agent') || '';
  if (!ua.trim() || DEMO_LAUNCH_BOT_UA_RE.test(ua)) {
    return { ok: false, error: 'Unable to launch demo from this client.', status: 403 };
  }

  // Honeypot — bots fill hidden fields; succeed silently without burning heavy work.
  if (String(input.website || '').trim()) {
    const demoSiteUrl = getPublicDemoSiteUrl();
    if (!demoSiteUrl) {
      return { ok: false, error: 'Demo sandbox is not configured.', status: 503 };
    }
    return {
      ok: true,
      redirectUrl: demoSiteUrl,
      suite: buildDemoSuiteConfig({
        moduleIds: [...DEMO_BASELINE_MODULE_IDS],
        industry: 'general',
        tier: 1,
      }),
      contactUid: null,
    };
  }

  const name = normalizeName(String(input.name || ''));
  const email = normalizeEmail(String(input.email || ''));
  if (name.length < 2) {
    return { ok: false, error: 'Please enter your name.', status: 400 };
  }
  if (!isValidDemoLaunchEmail(email)) {
    return { ok: false, error: 'Please enter a valid email.', status: 400 };
  }

  const rate = checkDemoLaunchRateLimits(request, email);
  if (!rate.ok) {
    return {
      ok: false,
      error: rate.error,
      status: 429,
      retryAfterSeconds: rate.retryAfterSeconds,
    };
  }

  const demoSiteUrl = getPublicDemoSiteUrl();
  if (!demoSiteUrl) {
    return { ok: false, error: 'Demo sandbox is not configured.', status: 503 };
  }

  const moduleIds = sanitizeModuleIds(input.moduleIds);
  const industry = String(input.industry || 'general').trim().toLowerCase().slice(0, 64) || 'general';
  const suite = buildDemoSuiteConfig({
    tier: input.tier ?? 1,
    moduleIds,
    industry,
    visitorName: name,
    visitorEmail: email,
  });

  let contactUid: string | null = null;
  try {
    const contact = await ensureWorkContact({
      contact_name: name,
      from: `"${name}" <${email}>`,
      bodyText: `Demo loader launch · industry=${industry} · modules=${moduleIds.join(',')}`,
      summary: 'Demo loader launch',
    });
    if (contact.ok) {
      contactUid = contact.uid;
      await recordDemoLaunchEngagement({
        contactUid: contact.uid,
        contactName: contact.name || name,
        email,
        industry,
        moduleIds,
      });
    }
  } catch (e) {
    console.warn(
      '[demo-launch] lead capture failed:',
      e instanceof Error ? e.message : e,
    );
  }

  return {
    ok: true,
    redirectUrl: buildDemoSuiteUrl(demoSiteUrl, {
      tier: suite.tier,
      moduleIds: suite.moduleIds,
      industry: suite.industry,
      visitorName: suite.visitorName,
      visitorEmail: suite.visitorEmail,
    }),
    suite,
    contactUid,
  };
}
