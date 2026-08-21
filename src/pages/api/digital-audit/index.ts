/**
 * Public Digital Audit API — same pipeline as Siri `audit` / `full_audit`.
 *
 * POST /api/digital-audit  { business, url?, phone?, email?, notes?, tier? }
 * GET  /api/digital-audit?slug=…  — status + inProgress for the report page poller
 *
 * Feature-gated by `site_audits`. Rate-limited per IP. Does not expose raw Work bodies
 * beyond what the public report card needs.
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../lib/features';
import { isContactApiConfigured } from '../../../lib/contactApi';
import { startAuditProposal } from '../../../lib/siriAuditProposal';
import { isSafeWorkSlug, storeReadWork } from '../../../lib/workStore';
import { buildAuditReportCard, isAuditJob } from '../../../lib/auditReportCard';
import { googlePlacesListedForContact } from '../../../lib/auditPlacesListing';
import { checkInMemoryRateLimit } from '../../../lib/inMemoryRateLimit';
import { clientIp } from '../../../lib/clientIp';
import { getSiriAuditRun } from '../../../lib/siriAuditRuns';
import type { SiriAuditTier } from '../../../lib/siriAuditRuns';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;

const MAX_FIELD = 500;
const BOT_UA_RE =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|whatsapp|google-inspection|bingpreview|embedly|quora link preview|pinterest|redditbot|applebot|duckduckbot|baiduspider|yandex|semrush|ahrefs|petalbot|bytespider/i;

function trimField(raw: unknown, max = MAX_FIELD): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/\s+/g, ' ').slice(0, max);
}

function parseTier(raw: unknown): SiriAuditTier {
  const t = String(raw ?? 'quick').trim().toLowerCase();
  return t === 'full' ? 'full' : 'quick';
}

/** Only expose public-facing audits (Siri / Digital Audit stubs). */
function isPublicAuditJob(doc: {
  source?: string;
  tags?: string[];
  title?: string;
  body?: string;
}): boolean {
  if ((doc.source || '').toLowerCase() === 'siri_audit') return true;
  return isAuditJob({
    tags: doc.tags,
    source: doc.source,
    title: doc.title,
    body: doc.body,
  });
}

export const POST: APIRoute = async ({ request }) => {
  if (!hasFeature('site_audits')) {
    return jsonResponse({ ok: false, error: 'Not found' }, 404);
  }
  if (!isContactApiConfigured()) {
    return jsonResponse({ ok: false, error: 'Audits are temporarily unavailable.' }, 503);
  }

  const ua = request.headers.get('user-agent') || '';
  if (BOT_UA_RE.test(ua)) {
    return jsonResponse({ ok: false, error: 'Not found' }, 404);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  // Honeypot — bots fill hidden "website_url"; real form uses "url".
  if (trimField(body.website_url) || trimField(body.company_website)) {
    return jsonResponse({ ok: true, data: { started: true, slug: 'ok', tier: 'quick', label: 'ok' } });
  }

  const business = trimField(body.business ?? body.query ?? body.name, 300);
  const url = trimField(body.url ?? body.website, 400);
  const phone = trimField(body.phone, 40);
  const email = trimField(body.email, 120);
  const notes = trimField(body.notes, 500);
  const tier = parseTier(body.tier);

  if (!business) {
    return jsonResponse(
      { ok: false, error: 'Tell us the business name — add a street or town if the name is common.' },
      400,
    );
  }

  const ip = clientIp(request) || 'unknown';
  const rate = checkInMemoryRateLimit(`digital-audit:${ip}`, {
    windowMs: 60 * 60 * 1000,
    maxPerWindow: 4,
  });
  if (!rate.ok) {
    return jsonResponse(
      {
        ok: false,
        error: 'Too many audits from this network. Please try again later.',
        retryAfterSeconds: rate.retryAfterSeconds,
      },
      429,
    );
  }

  const result = await startAuditProposal(
    { business, url, phone, email, notes },
    tier,
    { triggerLabel: 'Digital Audit form' },
  );

  if (!result.ok) {
    const status = result.code === 'anthropic_credits' ? 503 : 400;
    return jsonResponse({ ok: false, error: result.error }, status);
  }

  return jsonResponse({
    ok: true,
    text: result.text,
    data: {
      started: true,
      tier: result.data.tier,
      label: result.data.label,
      slug: result.data.slug,
      url: result.data.url,
      business: result.data.business,
    },
  });
};

export const GET: APIRoute = async ({ url }) => {
  if (!hasFeature('site_audits')) {
    return jsonResponse({ ok: false, error: 'Not found' }, 404);
  }

  const slug = (url.searchParams.get('slug') || '').trim().toLowerCase();
  if (!slug || !isSafeWorkSlug(slug)) {
    return jsonResponse({ ok: false, error: 'Invalid slug' }, 400);
  }

  const doc = await storeReadWork(slug);
  if (!doc || !isPublicAuditJob(doc)) {
    return jsonResponse({ ok: false, error: 'Not found' }, 404);
  }

  const googlePlacesListed = await googlePlacesListedForContact(doc.contact_uid);
  const report = buildAuditReportCard({
    tags: doc.tags,
    source: doc.source,
    title: doc.title,
    body: doc.body || '',
    clientName: doc.contact_name || '',
    googlePlacesListed,
  });

  const activeRun = getSiriAuditRun(slug);
  const inProgress = Boolean(report?.inProgress) || Boolean(activeRun);

  return jsonResponse({
    ok: true,
    data: {
      slug: doc.slug,
      title: doc.title,
      inProgress,
      tier: activeRun?.tier || (doc.tags?.includes('full-audit') ? 'full' : 'quick'),
      updated: doc.updated || doc.created || null,
      /** Lightweight summary for the poller — full card is SSR'd on the page. */
      overall: report && !inProgress ? report.overall : null,
      overallScore: report && !inProgress ? report.overallScore : null,
    },
  });
};
