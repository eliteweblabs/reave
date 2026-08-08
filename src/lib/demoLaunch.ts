/**
 * Public demo-loader request gate: validate visitor, rate-limit abuse,
 * create a proposed client + inquiry project + critical dashboard notice.
 * Auto-provisioning of a sandbox is paused — staff builds the environment.
 */
import { createHash } from 'crypto';
import { clientIp } from './clientIp';
import { setContactKind } from './contactApi';
import { recordDemoRequestEngagement } from './engagementNotifications';
import { checkInMemoryRateLimit } from './inMemoryRateLimit';
import { DEMO_BASELINE_MODULE_IDS, mergeDemoModuleIds, demoModuleById } from './demoModuleCatalog';
import { parseWorkJobInput } from './workJobInput';
import {
  ensureWorkContact,
  isSafeWorkSlug,
  slugFromTitle,
  storeReadWork,
  storeWriteWork,
} from './workStore';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Bots / crawlers that should not burn request quota or create leads. */
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
  | {
      ok: true;
      contactUid: string | null;
      jobSlug: string | null;
      jobTitle: string | null;
      /** Honeypot / silent accept — no CRM side effects. */
      silent?: boolean;
    }
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
      error: 'Too many demo requests from this network. Please try again later.',
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
      error: 'This email has submitted too many demo requests today. Please try again tomorrow.',
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

function moduleLines(moduleIds: string[]): string[] {
  return moduleIds.map((id) => {
    const entry = demoModuleById(id);
    return entry ? `- **${id}** — ${entry.label} (\`${entry.feature}\`)` : `- **${id}**`;
  });
}

function projectTitle(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  return trimmed ? `Demo request: ${trimmed}` : 'Custom demo request';
}

function projectBody(input: {
  name: string;
  email: string;
  industry: string;
  moduleIds: string[];
  receivedAt: string;
}): string {
  return [
    '## Custom demo environment request',
    '',
    `- **From:** ${input.name || 'Unknown'}`,
    `- **Email:** ${input.email || 'N/A'}`,
    `- **Industry:** ${input.industry || 'general'}`,
    `- **Received:** ${input.receivedAt}`,
    '',
    '### Requested modules',
    '',
    ...moduleLines(input.moduleIds),
    '',
    '_Auto-provisioning is paused — build and notify when the sandbox is ready._',
  ].join('\n');
}

/**
 * Validate + rate-limit + create proposed client, inquiry project, and critical notice.
 * Does not redirect into a live sandbox (provisioning is manual for now).
 */
export async function processDemoLaunch(
  request: Request,
  input: DemoLaunchInput,
): Promise<DemoLaunchResult> {
  const ua = request.headers.get('user-agent') || '';
  if (!ua.trim() || DEMO_LAUNCH_BOT_UA_RE.test(ua)) {
    return { ok: false, error: 'Unable to submit demo request from this client.', status: 403 };
  }

  // Honeypot — bots fill hidden fields; succeed silently without CRM work.
  if (String(input.website || '').trim()) {
    return {
      ok: true,
      contactUid: null,
      jobSlug: null,
      jobTitle: null,
      silent: true,
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

  const moduleIds = sanitizeModuleIds(input.moduleIds);
  const industry = String(input.industry || 'general').trim().toLowerCase().slice(0, 64) || 'general';
  const receivedAt = new Date().toISOString();

  let contactUid: string | null = null;
  let jobSlug: string | null = null;
  let jobTitle: string | null = null;

  try {
    const contact = await ensureWorkContact({
      contact_name: name,
      from: `"${name}" <${email}>`,
      bodyText: `Demo loader request · industry=${industry} · modules=${moduleIds.join(',')}`,
      summary: 'Custom demo request',
    });

    if (!contact.ok) {
      console.warn('[demo-launch] contact failed:', contact.error);
      return { ok: false, error: 'Could not save your request. Please try again.', status: 502 };
    }

    contactUid = contact.uid;

    // Proposed client for demo prospects (new or existing lead).
    const kindResult = await setContactKind(contact.uid, 'proposed');
    if (!kindResult.ok) {
      console.warn('[demo-launch] set proposed kind failed:', kindResult.error);
    }

    const title = projectTitle(contact.name || name);
    let slug = slugFromTitle(title);
    if (!slug || !isSafeWorkSlug(slug)) {
      slug = slugFromTitle(`demo-request-${Date.now()}`);
    }
    if (slug && isSafeWorkSlug(slug)) {
      if (await storeReadWork(slug)) {
        slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
      }

      const parsed = parseWorkJobInput({
        title,
        contact_uid: contact.uid,
        contact_name: contact.name || name,
        status: 'inquiry',
        priority: 'high',
        source: 'demo_loader',
        body: projectBody({
          name: contact.name || name,
          email,
          industry,
          moduleIds,
          receivedAt,
        }),
        record_origin: 'demo_loader',
      });

      if ('error' in parsed) {
        console.warn('[demo-launch] project parse failed:', parsed.error);
      } else {
        const written = await storeWriteWork(slug, parsed);
        if (!written.ok) {
          console.warn('[demo-launch] project write failed:', written.error);
        } else {
          jobSlug = written.doc.slug;
          jobTitle = written.doc.title;
        }
      }
    }

    await recordDemoRequestEngagement({
      contactUid: contact.uid,
      contactName: contact.name || name,
      email,
      industry,
      moduleIds,
      jobSlug,
      jobTitle,
    });
  } catch (e) {
    console.warn(
      '[demo-launch] request capture failed:',
      e instanceof Error ? e.message : e,
    );
    return { ok: false, error: 'Could not save your request. Please try again.', status: 502 };
  }

  return {
    ok: true,
    contactUid,
    jobSlug,
    jobTitle,
  };
}
