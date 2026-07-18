/**
 * Newsletter / lifecycle email templates.
 *
 * Each template renders into the shared branded wrapper (`brandedEmailHtml`).
 * Templates fall into two buckets:
 *   - `automation`  — fired by lifecycle triggers (welcome, follow-up, review…)
 *   - `broadcast`   — sent manually to a segment (announcements, promos…)
 *
 * "Marketing" templates always render the CAN-SPAM footer (physical address +
 * one-click unsubscribe). "Transactional" lifecycle mail (welcome, project
 * complete) still includes an unsubscribe link but reads as service email.
 */
import { brandedEmailHtml } from './emailTemplates';
import { getCompanyConfig } from './companyConfig';
import { siteBaseUrl } from './requestOrigin';

export type NewsletterTemplateId =
  | 'user_welcome'
  | 'user_followup'
  | 'project_complete'
  | 'review_request'
  | 'reengagement'
  | 'referral_request'
  | 'announcement'
  | 'newsletter_update'
  | 'seasonal_promo'
  | 'thank_you';

export type NewsletterTemplateKind = 'automation' | 'broadcast';
export type NewsletterTemplateTone = 'transactional' | 'marketing';

/** Runtime values injected when rendering a template. */
export interface NewsletterTemplateContext {
  firstName: string;
  companyName: string;
  /** Project/job title, for project-complete + review templates. */
  projectTitle?: string;
  /** Where the primary CTA points (portal, booking, review site, etc.). */
  ctaUrl?: string;
  ctaLabel?: string;
  /** Public review link (Google/Yelp/etc.) for the review-request template. */
  reviewUrl?: string;
  /** Booking link for follow-up / re-engagement templates. */
  bookingUrl?: string;
  /** Broadcast-only: subject override. */
  subject?: string;
  /** Broadcast-only: custom heading / lead line. */
  heading?: string;
  /** Broadcast-only: body paragraphs supplied by the sender. */
  body?: string[];
}

export interface RenderedNewsletter {
  subject: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  note?: string;
}

export interface NewsletterTemplateDef {
  id: NewsletterTemplateId;
  label: string;
  description: string;
  kind: NewsletterTemplateKind;
  tone: NewsletterTemplateTone;
  /** Emoji for the admin UI. */
  icon: string;
  /** Fallback subject when the sender doesn't override it. */
  defaultSubject: (ctx: NewsletterTemplateContext) => string;
  build: (ctx: NewsletterTemplateContext) => RenderedNewsletter;
}

function firstNameOr(ctx: NewsletterTemplateContext, fallback = 'there'): string {
  const n = (ctx.firstName || '').trim();
  return n || fallback;
}

/** Paragraphs supplied by the sender, or a sensible default set. */
function bodyOr(ctx: NewsletterTemplateContext, fallback: string[]): string[] {
  const custom = (ctx.body || []).map((p) => p.trim()).filter(Boolean);
  return custom.length ? custom : fallback;
}

export const NEWSLETTER_TEMPLATES: Record<NewsletterTemplateId, NewsletterTemplateDef> = {
  user_welcome: {
    id: 'user_welcome',
    label: 'User welcome',
    description: 'Warm intro sent right after someone becomes a contact.',
    kind: 'automation',
    tone: 'transactional',
    icon: '👋',
    defaultSubject: (ctx) => `Welcome to ${ctx.companyName}`,
    build: (ctx) => ({
      subject: `Welcome to ${ctx.companyName}`,
      paragraphs: [
        `Welcome aboard — we're glad to have you with ${ctx.companyName}.`,
        `We wanted to personally reach out and say hello. Whatever you're working toward, we're here to help you get there.`,
        `If you have any questions, just reply to this email — it comes straight to our team.`,
      ],
      cta: ctx.ctaUrl ? { label: ctx.ctaLabel || 'Get started', url: ctx.ctaUrl } : undefined,
    }),
  },

  user_followup: {
    id: 'user_followup',
    label: 'User follow-up',
    description: 'Checks in a few days later if the contact hasn\u2019t started a project yet.',
    kind: 'automation',
    tone: 'transactional',
    icon: '🔁',
    defaultSubject: (ctx) => `Anything we can help with, ${firstNameOr(ctx, 'friend')}?`,
    build: (ctx) => ({
      subject: `Anything we can help with?`,
      paragraphs: [
        `Just circling back to see how things are going since you connected with ${ctx.companyName}.`,
        `If there's a project on your mind or a question we can answer, we'd love to help. No pressure at all — reply whenever you're ready.`,
      ],
      cta: ctx.bookingUrl
        ? { label: 'Book a quick chat', url: ctx.bookingUrl }
        : ctx.ctaUrl
          ? { label: ctx.ctaLabel || 'Get in touch', url: ctx.ctaUrl }
          : undefined,
    }),
  },

  project_complete: {
    id: 'project_complete',
    label: 'Project complete follow-up',
    description: 'Sent after a project is marked done — thanks + next steps.',
    kind: 'automation',
    tone: 'transactional',
    icon: '✅',
    defaultSubject: (ctx) =>
      ctx.projectTitle ? `${ctx.projectTitle} is complete` : `Your project is complete`,
    build: (ctx) => ({
      subject: ctx.projectTitle ? `${ctx.projectTitle} is complete` : `Your project is complete`,
      paragraphs: [
        `Great news — ${ctx.projectTitle ? `"${ctx.projectTitle}"` : 'your project'} is officially complete. Thank you for trusting ${ctx.companyName} with it.`,
        `We hope you're thrilled with the result. If anything needs a tweak or you have questions, just reply and we'll take care of it.`,
        `It's been a pleasure working with you.`,
      ],
      cta: ctx.ctaUrl ? { label: ctx.ctaLabel || 'View your project', url: ctx.ctaUrl } : undefined,
    }),
  },

  review_request: {
    id: 'review_request',
    label: 'Leave us a review',
    description: 'Asks a happy client for a review a few days after project completion.',
    kind: 'automation',
    tone: 'transactional',
    icon: '⭐',
    defaultSubject: () => `Would you leave us a quick review?`,
    build: (ctx) => ({
      subject: `Would you leave us a quick review?`,
      paragraphs: [
        `We loved working with you${ctx.projectTitle ? ` on "${ctx.projectTitle}"` : ''}, and we hope you're happy with how everything turned out.`,
        `If you have a moment, a short review would mean the world to us — it helps other people find ${ctx.companyName} and helps us keep improving.`,
        `It only takes a minute, and we're grateful for anything you can share.`,
      ],
      cta: (ctx.reviewUrl || ctx.ctaUrl)
        ? { label: ctx.ctaLabel || 'Leave a review', url: (ctx.reviewUrl || ctx.ctaUrl)! }
        : undefined,
    }),
  },

  reengagement: {
    id: 'reengagement',
    label: 'Re-engagement ("we miss you")',
    description: 'Win-back email for contacts who\u2019ve gone quiet for a while.',
    kind: 'broadcast',
    tone: 'marketing',
    icon: '💜',
    defaultSubject: (ctx) => `We\u2019ve missed you at ${ctx.companyName}`,
    build: (ctx) => ({
      subject: `We\u2019ve missed you at ${ctx.companyName}`,
      paragraphs: bodyOr(ctx, [
        `It's been a little while, and we wanted to check in. A lot has happened at ${ctx.companyName}, and we'd love to reconnect.`,
        `If there's anything we can help you with, we're just a reply away — and we'd be glad to pick up right where we left off.`,
      ]),
      cta: ctx.ctaUrl ? { label: ctx.ctaLabel || 'See what\u2019s new', url: ctx.ctaUrl } : undefined,
    }),
  },

  referral_request: {
    id: 'referral_request',
    label: 'Referral request',
    description: 'Asks satisfied clients to refer a friend or colleague.',
    kind: 'broadcast',
    tone: 'marketing',
    icon: '🤝',
    defaultSubject: (ctx) => `Know someone who\u2019d love ${ctx.companyName}?`,
    build: (ctx) => ({
      subject: `Know someone who\u2019d love ${ctx.companyName}?`,
      paragraphs: bodyOr(ctx, [
        `We're so glad you're part of the ${ctx.companyName} family. If you've enjoyed working with us, the biggest compliment you can give is a referral.`,
        `Know a friend or colleague who could use our help? Send them our way — we'll take great care of them.`,
      ]),
      cta: ctx.ctaUrl ? { label: ctx.ctaLabel || 'Refer a friend', url: ctx.ctaUrl } : undefined,
    }),
  },

  announcement: {
    id: 'announcement',
    label: 'Announcement',
    description: 'General update — new service, hours, launch, or company news.',
    kind: 'broadcast',
    tone: 'marketing',
    icon: '📣',
    defaultSubject: (ctx) => ctx.subject || `News from ${ctx.companyName}`,
    build: (ctx) => ({
      subject: ctx.subject || `News from ${ctx.companyName}`,
      paragraphs: bodyOr(ctx, [
        ctx.heading || `We've got some news to share from ${ctx.companyName}.`,
        `Thanks for being part of our community — more to come soon.`,
      ]),
      cta: ctx.ctaUrl ? { label: ctx.ctaLabel || 'Learn more', url: ctx.ctaUrl } : undefined,
    }),
  },

  newsletter_update: {
    id: 'newsletter_update',
    label: 'Newsletter / roundup',
    description: 'Recurring content roundup or monthly newsletter.',
    kind: 'broadcast',
    tone: 'marketing',
    icon: '📰',
    defaultSubject: (ctx) => ctx.subject || `The latest from ${ctx.companyName}`,
    build: (ctx) => ({
      subject: ctx.subject || `The latest from ${ctx.companyName}`,
      paragraphs: bodyOr(ctx, [
        ctx.heading || `Here's what's new at ${ctx.companyName} this month.`,
        `Thanks for reading — we'll see you in the next one.`,
      ]),
      cta: ctx.ctaUrl ? { label: ctx.ctaLabel || 'Read more', url: ctx.ctaUrl } : undefined,
    }),
  },

  seasonal_promo: {
    id: 'seasonal_promo',
    label: 'Seasonal promo / offer',
    description: 'Limited-time offer or seasonal promotion.',
    kind: 'broadcast',
    tone: 'marketing',
    icon: '🎁',
    defaultSubject: (ctx) => ctx.subject || `A special offer from ${ctx.companyName}`,
    build: (ctx) => ({
      subject: ctx.subject || `A special offer from ${ctx.companyName}`,
      paragraphs: bodyOr(ctx, [
        ctx.heading || `For a limited time, we've got something special for you.`,
        `Reach out or tap below to take advantage — we'd love to help.`,
      ]),
      cta: ctx.ctaUrl ? { label: ctx.ctaLabel || 'Claim offer', url: ctx.ctaUrl } : undefined,
    }),
  },

  thank_you: {
    id: 'thank_you',
    label: 'Thank you / appreciation',
    description: 'Holiday or milestone appreciation note to your contacts.',
    kind: 'broadcast',
    tone: 'marketing',
    icon: '🙏',
    defaultSubject: (ctx) => ctx.subject || `Thank you, from all of us at ${ctx.companyName}`,
    build: (ctx) => ({
      subject: ctx.subject || `Thank you, from all of us at ${ctx.companyName}`,
      paragraphs: bodyOr(ctx, [
        `We just wanted to say thank you. Clients like you are the reason ${ctx.companyName} exists.`,
        `We're grateful for your trust and we're looking forward to what's ahead together.`,
      ]),
      cta: ctx.ctaUrl ? { label: ctx.ctaLabel || 'Say hello', url: ctx.ctaUrl } : undefined,
    }),
  },
};

export function getNewsletterTemplate(id: string): NewsletterTemplateDef | null {
  return (NEWSLETTER_TEMPLATES as Record<string, NewsletterTemplateDef>)[id] ?? null;
}

export function listNewsletterTemplates(): NewsletterTemplateDef[] {
  return Object.values(NEWSLETTER_TEMPLATES);
}

/** Metadata-only view (safe to send to the client for the admin UI). */
export interface NewsletterTemplateMeta {
  id: NewsletterTemplateId;
  label: string;
  description: string;
  kind: NewsletterTemplateKind;
  tone: NewsletterTemplateTone;
  icon: string;
}

export function newsletterTemplateMeta(def: NewsletterTemplateDef): NewsletterTemplateMeta {
  return {
    id: def.id,
    label: def.label,
    description: def.description,
    kind: def.kind,
    tone: def.tone,
    icon: def.icon,
  };
}

export interface RenderedNewsletterEmail {
  subject: string;
  html: string;
  text: string;
}

function toPlainText(rendered: RenderedNewsletter, opts: { unsubscribeUrl?: string; address?: string }): string {
  const lines = [...rendered.paragraphs];
  if (rendered.cta) lines.push('', `${rendered.cta.label}: ${rendered.cta.url}`);
  if (rendered.note) lines.push('', rendered.note);
  if (opts.address) lines.push('', opts.address);
  if (opts.unsubscribeUrl) lines.push('', `Unsubscribe: ${opts.unsubscribeUrl}`);
  return lines.join('\n\n');
}

/**
 * Render a template into ready-to-send subject + HTML + text.
 * Always includes the compliance footer (address + unsubscribe) so every
 * newsletter/lifecycle send is CAN-SPAM friendly.
 */
export async function renderNewsletterEmail(opts: {
  templateId: NewsletterTemplateId;
  context: NewsletterTemplateContext;
  unsubscribeUrl?: string;
  subjectOverride?: string;
}): Promise<RenderedNewsletterEmail | { error: string }> {
  const def = getNewsletterTemplate(opts.templateId);
  if (!def) return { error: `Unknown template: ${opts.templateId}` };

  const company = await getCompanyConfig();
  const ctx: NewsletterTemplateContext = {
    ...opts.context,
    companyName: opts.context.companyName || company.name || 'our team',
  };

  const rendered = def.build(ctx);
  const subject = (opts.subjectOverride || ctx.subject || rendered.subject || def.defaultSubject(ctx)).trim();

  const address = buildFooterAddress(company);
  const html = await brandedEmailHtml({
    firstName: ctx.firstName || 'there',
    paragraphs: rendered.paragraphs,
    cta: rendered.cta,
    note: rendered.note,
    unsubscribeUrl: opts.unsubscribeUrl,
    footerAddress: address,
  });

  const text = toPlainText(
    { ...rendered, subject },
    { unsubscribeUrl: opts.unsubscribeUrl, address },
  );

  return { subject, html, text };
}

function buildFooterAddress(company: { name?: string; address?: string }): string | undefined {
  const parts = [company.name, company.address].map((s) => (s || '').trim()).filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

/** Absolute site URL helper for building CTA links in emails. */
export function newsletterSiteUrl(path = ''): string {
  const base = siteBaseUrl().replace(/\/+$/, '');
  if (!path) return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
