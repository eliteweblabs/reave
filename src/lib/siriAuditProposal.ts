/**
 * Shared Siri / Digital Audit proposal pipeline.
 *
 * Creates an inquiry stub immediately, then runs the knowledge agent in the
 * background with the audit playbook. Used by POST /api/siri and the public
 * Digital Audit page — do not duplicate this flow elsewhere.
 */

import { isContactApiConfigured } from './contactApi';
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
};

function pickBusiness(params: AuditProposalParams): string {
  return String(
    params.business ?? params.business_name ?? params.company ?? params.name ?? params.query ?? '',
  ).trim();
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
    userId,
    triggerLabel: options.triggerLabel || 'Siri shortcut',
  }).catch((e) => {
    log.error('background research failed', e instanceof Error ? e : new Error(String(e)));
  });

  const ack =
    tier === 'full'
      ? `Running full audit on ${label}. Watch the Work tab — project ${stub.slug} is in progress.`
      : `Auditing ${label}. Watch the Work tab — project ${stub.slug} is in progress.`;

  return {
    ok: true,
    text: ack,
    data: {
      started: true,
      tier,
      label,
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
  userId: string | null;
  triggerLabel: string;
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

  const auditToolsStep =
    input.tier === 'full'
      ? '3. Run the **full** audit tool sequence on the website: fetch_url, seo_inventory (og:image, robots.txt, sitemap, manifest, favicon, canonical, JSON-LD), ' +
        'lighthouse_audit, ssl_check, check_links, dns_check, brave_search (Google Business Profile, Yelp, reviews/reputation, social), ' +
        'playwright_audit (Playwright / Chromium real-browser UX/UI on desktop + mobile), detect_tech_stack, and Search/Analytics tools ' +
        '(gsc_search_analytics / gsc_inspect_url / gsc_list_sitemaps and plausible_stats or ga4_stats when site_id/property_id is known — ' +
        'always pass explicit site_url; never company domain). Run read-only tools in parallel when possible. ' +
        'Call lighthouse_audit **once** — if it fails, proceed to step 4; do NOT retry. ' +
        'If any analytics tool returns ANALYTICS_FAILED, mark Search / Analytics as Failed in the markdown and do NOT invent metrics; continue other sections. ' +
        'In the SEO and Search Rich Results sections, quote seo_inventory findings and copy Problem → Impact pitches into Opportunities.'
      : '3. Run the **quick** audit tool sequence on the website (street-speed — skip slow tools): fetch_url, seo_inventory ' +
        '(og:image, robots.txt, sitemap, manifest, favicon, canonical, JSON-LD — required for customer pitches), ' +
        'lighthouse_audit (category **performance** only — saves PSI quota), ssl_check, dns_check, and brave_search ' +
        '(Google Business Profile, Yelp, reviews/reputation, social). Do **not** run playwright_audit, check_links, ' +
        'detect_tech_stack, or Search/Analytics tools — those belong in the full audit tier. Run all read-only tools in **one parallel batch**, ' +
        'then go to step 4. Call lighthouse_audit **once** — if it fails, proceed anyway; do NOT retry. ' +
        'Quote seo_inventory checklist items and Problem → Impact pitches in SEO / Opportunities.';

  const userText = [
    `${input.triggerLabel} "${tierLabel}" was triggered with only the raw information below — there is no one ` +
      'here to ask follow-up questions, so proceed autonomously and make reasonable, clearly-noted assumptions ' +
      'instead of stopping to ask.',
    '',
    'The business description may be just a name or include street, town, or other disambiguating details ' +
      '(e.g. "Joe\'s Pizza on Main Street in Portland"). Treat the full string as your search query.',
    '',
    `An inquiry project already exists at slug **${input.jobSlug}** (stub body — audit in progress). ` +
      'Do **not** call create_work. Use update_work on that slug with the full audit body and a new title.',
    '',
    ...givenLines,
    '',
    `Follow the ${tierLabel.toLowerCase()} playbook (read_knowledge slug "${knowledgeSlug}" first):`,
    '1. If no URL was given, use brave_search with the full business description (plus phone/email if provided) ' +
      'to identify the correct business and find its website; use any location hints in the description to ' +
      'disambiguate common names. If no website can be found, say so in the audit and continue with whatever ' +
      'public info you can find.',
    '2. resolve_contact for the client. If there is no match, create_contact with kind "proposed". If a match ' +
      'exists but kindExplicit is false (never classified), update_contact with kind "proposed". Use the business ' +
      'name as the contact name when no personal name is known, and save whatever phone/email/company was given.',
    auditToolsStep,
    `4. update_work slug "${input.jobSlug}" with status "inquiry", contact_uid set, and a catchy finding-based title (5–12 words — ` +
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
  const agentContext = input.userId ? { userId: input.userId, threadId } : {};

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

  await notifyAdminAgentOfSiriProposalComplete({
    label: input.label,
    reply,
    jobSlug: input.jobSlug,
    tier: input.tier,
    researchStartedAt,
  }).catch((e) =>
    log.warn('proposal notify failed', {
      err: e instanceof Error ? e.message : String(e),
    }),
  );
}
