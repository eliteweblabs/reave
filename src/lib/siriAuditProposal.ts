/**
 * Shared Siri / Digital Audit proposal pipeline.
 *
 * Creates an audit stub immediately, then runs the knowledge agent in the
 * background with the audit playbook. Used by POST /api/siri and the public
 * Digital Audit page — do not duplicate this flow elsewhere.
 */

import {
  extractPortal,
  getContact,
  isContactApiConfigured,
  type PlacesListingRecord,
} from './contactApi';
import { runKnowledgeAgent } from './agentRunner';
import { agentAlertUserId, notifyAdminAgentOfSiriProposalComplete } from './adminAgentAlert';
import { createLogger } from './logger';
import { createSiriAuditStubProject } from './siriAuditIntake';
import {
  clearSiriAuditRun,
  registerSiriAuditRun,
  siriAuditThreadId,
  type SiriAuditTier,
} from './siriAuditRuns';
import { clearAgentProgress } from './agentProgress';
import { ensureGooglePlacesNotListedInAuditBody } from './auditPlacesListing';
import { storeReadWork, storeWriteWork } from './workStore';

const log = createLogger('siri-proposal');

export type AuditProposalParams = {
  business?: string;
  business_name?: string;
  company?: string;
  name?: string;
  query?: string;
  url?: string;
  website?: string;
  link?: string;
  phone?: string;
  email?: string;
  notes?: string;
  context?: string;
};

export type AuditProposalResult =
  | {
      ok: true;
      text: string;
      data: {
        started: true;
        tier: SiriAuditTier;
        label: string;
        slug: string;
        url: string | null;
        business: string | null;
        contactUid: string;
      };
    }
  | { ok: false; error: string; text?: string };

export type AuditProposalOptions = {
  /** Label used in the agent prompt (defaults to "Siri shortcut"). */
  triggerLabel?: string;
  /**
   * Owner-initiated Siri Shortcuts may run research + completion push during
   * sleep mode. Public Digital Audit form submissions stay blocked overnight.
   */
  bypassSleepMode?: boolean;
};

function pickBusiness(params: AuditProposalParams): string {
  return String(
    params.business ?? params.business_name ?? params.company ?? params.name ?? params.query ?? '',
  ).trim();
}

const SPOKEN_TITLE_MAX = 56;

/**
 * Short title for Siri to speak — prefer the Google Places match name
 * (best autocomplete option), else a trimmed freeform cue without the
 * long dictated description.
 */
export function spokenAuditBusinessTitle(
  business: string,
  placesListing?: PlacesListingRecord | null,
): string {
  if (placesListing?.status === 'matched') {
    const placeName = placesListing.address?.split(',')[0]?.trim();
    // Prefer establishment names; skip street-only first segments ("123 Main St").
    if (placeName && !/^\d/.test(placeName)) return truncateSpokenTitle(placeName);
  }
  return shortenFreeformBusinessTitle(business);
}

function truncateSpokenTitle(value: string): string {
  const oneLine = value.replace(/\s+/g, ' ').trim();
  if (!oneLine || oneLine.length <= SPOKEN_TITLE_MAX) return oneLine;
  const slice = oneLine.slice(0, SPOKEN_TITLE_MAX);
  const atWord = slice.lastIndexOf(' ');
  const clipped = (atWord >= 24 ? slice.slice(0, atWord) : slice).trim();
  return clipped || oneLine.slice(0, SPOKEN_TITLE_MAX).trim();
}

/** Drop trailing "they sell…" style clauses people add when dictating. */
function shortenFreeformBusinessTitle(business: string): string {
  let s = business.replace(/\s+/g, ' ').trim();
  if (!s) return s;

  const clause = s.search(/\s+(?:they|that|which)\b/i);
  if (clause > 0) s = s.slice(0, clause).trim();

  return truncateSpokenTitle(s);
}

function auditStartedAck(tier: SiriAuditTier, spokenTitle: string): string {
  const title = spokenTitle || 'that business';
  const lead =
    tier === 'full'
      ? `Running a full audit on ${title}`
      : `Running an audit on ${title}`;
  return `${lead}. It will be available in the Reave app shortly.`;
}

/**
 * Start a quick or full audit: stub Work project + background research agent.
 */
export async function startAuditProposal(
  params: AuditProposalParams,
  tier: SiriAuditTier,
  options: AuditProposalOptions = {},
): Promise<AuditProposalResult> {
  if (!isContactApiConfigured()) {
    return { ok: false, error: 'Contact API not configured' };
  }

  const url = String(params.url ?? params.website ?? params.link ?? '').trim();
  const business = pickBusiness(params);
  const phone = String(params.phone ?? '').trim();
  const email = String(params.email ?? '').trim();
  const notes = String(params.notes ?? params.context ?? '').trim();

  if (!business) {
    const msg = 'Business name is required — include street or town if the name is common.';
    return { ok: false, error: msg, text: msg };
  }

  const label = business;

  const stub = await createSiriAuditStubProject({
    business,
    tier,
    url: url || undefined,
    phone: phone || undefined,
    email: email || undefined,
    notes: notes || undefined,
  });
  if (!stub.ok) {
    return { ok: false, error: stub.error, text: stub.error };
  }

  const userId = agentAlertUserId();
  if (userId) {
    registerSiriAuditRun({
      slug: stub.slug,
      tier,
      label,
      userId,
      startedAt: Date.now(),
    });
  }

  runProposalResearch({
    url,
    business,
    phone,
    email,
    notes,
    label,
    tier,
    jobSlug: stub.slug,
    contactUid: stub.contactUid,
    userId,
    triggerLabel: options.triggerLabel || 'Siri shortcut',
    bypassSleepMode: options.bypassSleepMode === true,
    placesListing: stub.placesListing,
  }).catch((e) => {
    log.error('background research failed', e instanceof Error ? e : new Error(String(e)));
  });

  const spokenTitle = spokenAuditBusinessTitle(business, stub.placesListing);
  const ack = auditStartedAck(tier, spokenTitle);

  return {
    ok: true,
    text: ack,
    data: {
      started: true,
      tier,
      label: spokenTitle,
      slug: stub.slug,
      url: url || null,
      business: business || null,
      contactUid: stub.contactUid,
    },
  };
}

async function runProposalResearch(input: {
  url: string;
  business: string;
  phone: string;
  email: string;
  notes: string;
  label: string;
  tier: SiriAuditTier;
  jobSlug: string;
  contactUid: string;
  userId: string | null;
  triggerLabel: string;
  bypassSleepMode: boolean;
  placesListing?: PlacesListingRecord | null;
}): Promise<void> {
  const givenLines = [
    input.business ? `Business name: ${input.business}` : null,
    input.url ? `Website/URL: ${input.url}` : null,
    input.phone ? `Phone: ${input.phone}` : null,
    input.email ? `Email: ${input.email}` : null,
    input.notes ? `Notes: ${input.notes}` : null,
  ].filter((l): l is string => Boolean(l));

  const knowledgeSlug =
    input.tier === 'full' ? 'inquiry-website-audit' : 'inquiry-website-audit-quick';
  const tierLabel = input.tier === 'full' ? 'Full audit' : 'Quick audit (street)';

  const directorySearch =
    'Google Business Profile / Google Places, Apple Business Connect / Apple Maps, Yelp, Bing Places, reviews/reputation, social';

  const auditToolsStep =
    input.tier === 'full'
      ? '3. Run the **full** audit tool sequence on the website: fetch_url, seo_inventory (og:image, robots.txt, sitemap, manifest, favicon, canonical, JSON-LD), ' +
        `lighthouse_audit, ssl_check, check_links, dns_check, brave_search (${directorySearch}), ` +
        'playwright_audit (Playwright / Chromium real-browser UX/UI on desktop + mobile), detect_tech_stack, and Search/Analytics tools ' +
        '(gsc_search_analytics / gsc_inspect_url / gsc_list_sitemaps and plausible_stats or ga4_stats when site_id/property_id is known — ' +
        'always pass explicit site_url; never company domain). Run read-only tools in parallel when possible. ' +
        'Call lighthouse_audit **once** — if it fails, proceed to step 4; do NOT retry. ' +
        'If any analytics tool returns ANALYTICS_FAILED, mark Search / Analytics as Failed in the markdown and do NOT invent metrics; continue other sections. ' +
        'Analytics & Conversion Tracking is client-facing: report only whether tracking snippets are installed on the website (detect_tech_stack / fetch_url HTML). Never mention owned property, Search Console access, or that we do not control the domain. ' +
        'In the SEO and Search Rich Results sections, quote seo_inventory findings and copy Problem → Impact pitches into Opportunities. ' +
        'In Online Presence, write **separate bullets** for Google Business Profile, Apple Business Connect, Yelp, and Bing Places so the Maps & Directories score stays accurate.'
      : '3. Run the **quick** audit tool sequence on the website (street-speed — skip slow tools): fetch_url, seo_inventory ' +
        '(og:image, robots.txt, sitemap, manifest, favicon, canonical, JSON-LD — required for customer pitches), ' +
        'lighthouse_audit (category **performance** only — saves PSI quota), ssl_check, dns_check, and brave_search ' +
        `(${directorySearch}). Do **not** run playwright_audit, check_links, ` +
        'detect_tech_stack, or Search/Analytics tools — those belong in the full audit tier. Run all read-only tools in **one parallel batch**, ' +
        'then go to step 4. Call lighthouse_audit **once** — if it fails, proceed anyway; do NOT retry. ' +
        'Quote seo_inventory checklist items and Problem → Impact pitches in SEO / Opportunities. ' +
        'Analytics & Conversion Tracking is client-facing: scan fetch_url HTML for gtag / GTM / Plausible / Meta Pixel and list what is installed, or write that none were found. Never mention owned property or Search Console access. ' +
        'In Online Presence, write **separate bullets** for Google Business Profile, Apple Business Connect, Yelp, and Bing Places.';

  const placesLines: string[] = [];
  if (input.placesListing?.status === 'not_listed') {
    const q = input.placesListing.query || input.business;
    placesLines.push(
      '',
      'CRITICAL — Google Places API (already checked when the contact was created):',
      `Google Places returned **no exact address match** for "${q}". ` +
        `${input.business || 'This business'} is **not listed in the Google Places API**. ` +
        'You MUST state this explicitly in the Online Presence section as ' +
        '`Google Business Profile: Missing — not listed in the Google Places API (no exact address match)` ' +
        'and include a Problem → Solution opportunity about claiming / creating their Google Business Profile. ' +
        'Do not soften or omit this — the client must be 100% aware.',
    );
  } else if (input.placesListing?.status === 'matched' && input.placesListing.address) {
    placesLines.push(
      '',
      `Google Places API matched an address when the contact was created: ${input.placesListing.address}. ` +
        'Still verify Google Business Profile completeness (hours, photos, claim status) via brave_search.',
    );
  }

  const userText = [
    `${input.triggerLabel} "${tierLabel}" was triggered with only the raw information below — there is no one ` +
      'here to ask follow-up questions, so proceed autonomously and make reasonable, clearly-noted assumptions ' +
      'instead of stopping to ask.',
    '',
    'The business description may be just a name or include street, town, or other disambiguating details ' +
      '(e.g. "Joe\'s Pizza on Main Street in Portland"). Treat the full string as your search query.',
    '',
    `An audit project already exists at slug **${input.jobSlug}** (stub body — audit in progress). ` +
      'Do **not** call create_work. Use update_work on that slug with the full audit body and a new title. ' +
      'Keep status "audit" (never inquiry or archived) and preserve tags siri-audit / quick-audit|full-audit.',
    '',
    ...givenLines,
    ...placesLines,
    '',
    `Follow the ${tierLabel.toLowerCase()} playbook (read_knowledge slug "${knowledgeSlug}" first):`,
    '1. If no URL was given, use brave_search with the full business description (plus phone/email if provided) ' +
      'to identify the correct business and find its website; use any location hints in the description to ' +
      'disambiguate common names. If no website can be found, say so in the audit and continue with whatever ' +
      'public info you can find.',
    `2. Contact uid **${input.contactUid}** is already linked to the stub and marked proposed when unclassified. ` +
      'Prefer update_contact on that uid to fill phone/email/company/website. Only create_contact if resolve_contact ' +
      'finds a clearer match that should replace it — new contacts must use kind "proposed". Use the business ' +
      'name as the contact name when no personal name is known.',
    auditToolsStep,
    `4. update_work slug "${input.jobSlug}" with status "audit", contact_uid set, and a catchy finding-based title (5–12 words — ` +
      'witty but professional, inspired by the top audit finding; do NOT include the business name because ' +
      'it already appears as the client name in the project list). Examples: "Antique shop, antique website — ' +
      'not in a good way", "Great reviews, terrible mobile score". Never use "Website Redesign — {Business Name}". ' +
      'Replace the stub body with a complete markdown audit following the required section structure — 1,200+ characters for ' +
      'quick tier, 1,500+ for full tier, not a stub. In findings and Opportunities, refer to the business by name ' +
      '(never "this business" — too informal/generic).',
    '5. End your final reply with a line formatted exactly like ' +
      `\`Project: ${input.jobSlug}\` followed by 2-3 sentences summarizing the top findings and the recommended next step.`,
  ].join('\n');

  const researchStartedAt = Date.now();
  const threadId = siriAuditThreadId(input.jobSlug);
  const agentContext = {
    ...(input.userId ? { userId: input.userId, threadId } : {}),
    ...(input.bypassSleepMode ? { bypassSleepMode: true } : {}),
  };

  let reply: string;
  try {
    reply = (
      await runKnowledgeAgent({
        userText,
        context: agentContext,
      })
    ).text;
  } catch (e) {
    reply = `Research failed: ${e instanceof Error ? e.message : String(e)}`;
    log.error('runKnowledgeAgent threw', e instanceof Error ? e : new Error(String(e)));
  } finally {
    if (input.userId) {
      clearAgentProgress(input.userId, threadId);
      clearSiriAuditRun(input.jobSlug);
    }
  }

  // Hard guarantee: if Places had no exact address match, the finished audit
  // body always says so — even when the agent softens or omits the finding.
  await ensurePlacesNotListedOnAuditWork({
    jobSlug: input.jobSlug,
    contactUid: input.contactUid,
    business: input.business,
    placesListing: input.placesListing,
  }).catch((e) =>
    log.warn('places audit inject failed', {
      err: e instanceof Error ? e.message : String(e),
    }),
  );

  await notifyAdminAgentOfSiriProposalComplete({
    label: input.label,
    reply,
    jobSlug: input.jobSlug,
    tier: input.tier,
    researchStartedAt,
    bypassQuietHours: input.bypassSleepMode,
  }).catch((e) =>
    log.warn('proposal notify failed', {
      err: e instanceof Error ? e.message : String(e),
    }),
  );
}

async function ensurePlacesNotListedOnAuditWork(input: {
  jobSlug: string;
  contactUid: string;
  business: string;
  placesListing?: PlacesListingRecord | null;
}): Promise<void> {
  let listing = input.placesListing ?? null;
  if (listing?.status !== 'not_listed' && input.contactUid) {
    const contact = await getContact(input.contactUid);
    if (contact.ok) {
      listing = extractPortal(contact.data)?.placesListing ?? listing;
    }
  }
  if (listing?.status !== 'not_listed') return;

  const doc = await storeReadWork(input.jobSlug);
  if (!doc?.body?.trim()) return;
  if (/siri audit in progress/i.test(doc.body)) return;

  const nextBody = ensureGooglePlacesNotListedInAuditBody(doc.body, {
    businessName: input.business || doc.contact_name || '',
    query: listing.query,
  });
  if (nextBody === doc.body) return;

  const written = await storeWriteWork(input.jobSlug, {
    title: doc.title,
    contact_uid: doc.contact_uid || input.contactUid,
    contact_name: doc.contact_name,
    status: doc.status,
    priority: doc.priority,
    due_date: doc.due_date,
    value: doc.value,
    tags: doc.tags,
    source: doc.source,
    source_chat_id: doc.source_chat_id,
    body: nextBody,
  });
  if (!written.ok) {
    log.warn('places audit inject write failed', { err: written.error });
  }
}
