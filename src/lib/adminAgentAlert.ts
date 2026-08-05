/**
 * Post operational alerts into isolated admin agent chat threads (one per event).
 */

import { agentAlertUserId, postToSystemAlertsThread } from './systemAlertsThread';
import {
  bestWorkDisplayName,
  formatAuditReadyNotification,
} from './notificationFormat';
import { sendPushNotification } from './webPush';
import { storeGetEmailInbox } from './emailInboxStore';
import { formatEmailChatReferenceWithBody } from './emailAgentContext';
import { hasFeature } from './features';
import { createLogger } from './logger';
import { isSafeWorkSlug, storeListWork, storeReadWork } from './workStore';

const log = createLogger('admin-agent');

export { agentAlertUserId, postToSystemAlertsThread } from './systemAlertsThread';

export function isRailwayAlertStatus(status: string): boolean {
  return status.toUpperCase().startsWith('RAILWAY');
}

export function isAnthropicBillingAlertStatus(status: string): boolean {
  return status.toUpperCase() === 'ANTHROPIC_BILLING';
}

/** True when inbound email will post to System alerts and send its own push. */
export function shouldAgentAlertForInboundEmail(opts: {
  category: string;
  status: string;
  isUptimeRobot?: boolean;
}): boolean {
  if (!agentAlertUserId()) return false;
  if (opts.category !== 'alert' && !isRailwayAlertStatus(opts.status)) return false;
  if (opts.isUptimeRobot && hasFeature('uptime_monitoring')) return false;
  return true;
}

/** Parse `Project: <slug>` from an agent audit reply (backticks / markdown tolerated). */
export function extractWorkSlugFromAgentReply(reply: string): string | null {
  const trimmed = reply.trim();
  if (!trimmed) return null;

  const patterns = [
    /Project:\s*`([a-z0-9._-]+)`/i,
    /Project:\s*([a-z0-9._-]+)/i,
  ];
  for (const re of patterns) {
    const match = trimmed.match(re);
    const slug = match?.[1]?.trim().toLowerCase();
    if (slug && isSafeWorkSlug(slug)) return slug;
  }
  return null;
}

/** Resolve the work slug filed during a Siri audit when the reply line is missing or malformed. */
export async function resolveSiriProposalWorkSlug(opts: {
  reply: string;
  label: string;
  jobSlug?: string | null;
  researchStartedAt?: number;
}): Promise<string | null> {
  const explicit = opts.jobSlug?.trim().toLowerCase();
  if (explicit && isSafeWorkSlug(explicit)) return explicit;

  const fromReply = extractWorkSlugFromAgentReply(opts.reply);
  if (fromReply) return fromReply;

  const label = opts.label.trim();
  if (!label) return null;

  const sinceMs = Math.max(0, (opts.researchStartedAt ?? Date.now()) - 5000);
  const jobs = await storeListWork();
  const labelLower = label.toLowerCase();
  const keywords = labelLower
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 6);

  const recent = jobs
    .filter((j) => new Date(j.updated).getTime() >= sinceMs)
    .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());

  if (!recent.length) return null;
  if (recent.length === 1) return recent[0].slug;

  for (const job of recent) {
    const hay = `${job.title} ${job.slug} ${job.client} ${job.contact_name}`.toLowerCase();
    const hits = keywords.filter((w) => hay.includes(w)).length;
    if (hits >= Math.min(2, keywords.length)) return job.slug;
  }

  if (keywords.length) {
    for (const job of recent) {
      const hay = `${job.title} ${job.slug}`.toLowerCase();
      if (keywords.some((w) => hay.includes(w))) return job.slug;
    }
  }

  return recent[0]?.slug ?? null;
}

/** Fire-and-forget — Siri audit/proposal finished (audit project updated). Push only — no alert chat. */
export async function notifyAdminAgentOfSiriProposalComplete(opts: {
  label: string;
  reply: string;
  jobSlug?: string | null;
  tier?: 'quick' | 'full';
  researchStartedAt?: number;
}): Promise<void> {
  if (!agentAlertUserId()) return;

  const slug = await resolveSiriProposalWorkSlug({
    reply: opts.reply,
    label: opts.label,
    jobSlug: opts.jobSlug,
    researchStartedAt: opts.researchStartedAt,
  });
  const deepLinkUrl = slug ? `/admin?tab=work&slug=${encodeURIComponent(slug)}` : '/admin?tab=work';
  const summary = extractProposalSummary(opts.reply, slug);
  const job = slug ? await storeReadWork(slug).catch(() => null) : null;
  const displayName = bestWorkDisplayName(job, opts.label);
  const { title, detail } = formatAuditReadyNotification({
    tier: opts.tier,
    displayName,
    excerpt: summary,
  });

  await sendPushNotification({
    title,
    body: detail,
    tag: `siri-proposal-${slug ?? opts.label}`,
    url: deepLinkUrl,
  }).catch((e) => log.warn('siri audit push failed', e));
}

function extractProposalSummary(reply: string, slug?: string | null): string {
  const trimmed = reply.trim();
  if (!trimmed) return 'Research finished — open the project for the full audit.';

  if (slug) {
    const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = trimmed.match(new RegExp(`Project:\\s*${escaped}\\s*\\n?([\\s\\S]*)`, 'i'));
    if (match?.[1]?.trim()) return match[1].trim();
  }

  const generic = trimmed.match(/Project:\s*[a-z0-9._-]+\s*\n([\s\S]*)/i);
  if (generic?.[1]?.trim()) return generic[1].trim();

  return trimmed.slice(0, 1200);
}

async function formatAlertMessage(opts: {
  status: string;
  from: string;
  subject: string;
  summary: string;
  emailId?: string;
}): Promise<string> {
  const railway = isRailwayAlertStatus(opts.status);
  const anthropicBilling = isAnthropicBillingAlertStatus(opts.status);
  const intro = railway
    ? 'Railway alert email received. Routed through deploy-incident handler (one active repair per GitHub repo).'
    : anthropicBilling
      ? 'Anthropic Claude API is out of usage credits — AI email triage/summaries (and this very alert reply, if attempted) will fail until credits are added.'
      : 'Inbound alert email received.';

  const lines = [
    intro,
    '',
    `Status: ${opts.status}`,
    railway
      ? 'Handled by deploy-incident playbook — read_knowledge slug "railway-build-failure-triage". Duplicate alerts for the same repo are blocked while this incident is open.'
      : anthropicBilling
        ? 'Add credits at console.anthropic.com/settings/billing to restore Claude API access and AI email triage.'
        : 'Read the linked email below and suggest concrete next steps.',
  ];

  if (opts.emailId) {
    const stored = await storeGetEmailInbox(opts.emailId);
    if (stored) {
      lines.push('', formatEmailChatReferenceWithBody(stored));
      return lines.join('\n');
    }
  }

  lines.push(
    '',
    `From: ${opts.from}`,
    `Subject: ${opts.subject}`,
    '',
    opts.summary,
  );
  return lines.join('\n');
}

/** Fire-and-forget — logs failures, never throws to inbound email handler. */
export async function notifyAdminAgentOfEmailAutomation(opts: {
  automationKind: string;
  contactName?: string | null;
  jobTitle?: string | null;
  jobSlug?: string | null;
  whenLabel?: string | null;
  summary?: string;
  subject?: string;
  from?: string;
  emailId?: string;
}): Promise<void> {
  if (!agentAlertUserId()) return;

  const kind = opts.automationKind.trim();
  const client = opts.contactName?.trim() || opts.from?.trim() || 'Client';
  const project = opts.jobTitle?.trim() || opts.jobSlug?.trim() || '';
  const when = opts.whenLabel?.trim() || '';

  const headers: Record<string, string> = {
    project_created: '📁 New project created automatically',
    project_match_suggested: '📎 Possible project match — review needed',
    meeting_booked: '📅 Meeting auto-booked from email',
    meeting_request: '📅 Meeting request — review needed',
    meeting_conflict: '⚠️ Meeting time conflict',
    meeting_followup: '📬 Meeting follow-up from client',
  };

  const intro = headers[kind] ?? `📬 Email automation: ${kind}`;
  const messageLines = [intro, '', `Client: ${client}`];

  if (project) messageLines.push(`Project: ${project}${opts.jobSlug ? ` (${opts.jobSlug})` : ''}`);
  if (when) messageLines.push(`When: ${when}`);
  if (opts.subject?.trim()) messageLines.push(`Subject: ${opts.subject.trim()}`);

  if (kind === 'project_created') {
    messageLines.push(
      '',
      'A project was created automatically from this inbound email. Review it on the home dashboard or Email tab — a branded acknowledgment was sent to the client.',
    );
  } else if (kind === 'project_match_suggested') {
    messageLines.push(
      '',
      'This inbound email may belong on an existing project. Open the home dashboard or Email tab to add the message content and any attachments, or dismiss if it is not a match.',
    );
  } else if (kind === 'meeting_booked') {
    messageLines.push(
      '',
      'A calendar booking was created automatically. Confirm the project link and send the meeting confirmation from the home dashboard or Email tab.',
    );
  } else if (kind === 'meeting_request') {
    messageLines.push(
      '',
      'The client wants to meet but no specific time was booked. Use Accept & notify on the home dashboard to send them a branded scheduling link.',
    );
  } else if (kind === 'meeting_conflict') {
    messageLines.push(
      '',
      'The requested meeting time conflicts with an existing booking. Notify the client from the home dashboard.',
    );
  } else if (kind === 'meeting_followup') {
    messageLines.push('', 'The client sent a follow-up about an existing meeting.');
  } else {
    messageLines.push('', opts.summary?.trim() || 'Review this in the admin Email tab.');
  }

  if (opts.emailId) {
    const stored = await storeGetEmailInbox(opts.emailId);
    if (stored) {
      messageLines.push('', formatEmailChatReferenceWithBody(stored));
    }
  } else if (opts.summary?.trim()) {
    messageLines.push('', opts.summary.trim());
  }

  await postToSystemAlertsThread({
    message: messageLines.join('\n'),
    emailId: opts.emailId,
    autoRun: false,
  });
}

/** Fire-and-forget — logs failures, never throws to inbound email handler. */
export async function notifyAdminAgentOfProjectReply(opts: {
  contactName: string;
  jobTitle: string;
  summary: string;
  emailId?: string;
}): Promise<void> {
  if (!agentAlertUserId()) return;

  const messageLines = [
    '🚨 URGENT — Client replied on a project',
    '',
    `Client: ${opts.contactName}`,
    `Project: ${opts.jobTitle}`,
    '',
    'This is new work that needs ASAP follow-up. Recommend immediate next steps (reply draft, call, scope update, invoice, schedule), link to the project if needed, and do not ask what project they mean — the email body is below.',
  ];

  if (opts.emailId) {
    const stored = await storeGetEmailInbox(opts.emailId);
    if (stored) {
      messageLines.push('', formatEmailChatReferenceWithBody(stored));
    }
  } else if (opts.summary.trim()) {
    messageLines.push('', opts.summary.trim());
  }

  const message = messageLines.join('\n');

  await postToSystemAlertsThread({
    message,
    emailId: opts.emailId,
    push: {
      title: `🚨 Client reply: ${opts.jobTitle}`,
      body: `${opts.contactName} — follow up ASAP`,
      tag: opts.emailId ?? 'project-reply',
      url: opts.emailId
        ? `/admin?tab=email&email=${encodeURIComponent(opts.emailId)}`
        : '/admin?tab=email',
    },
  });
}

/** Fire-and-forget — logs failures, never throws to comment POST handler. */
export async function notifyAdminAgentOfProjectComment(opts: {
  contactName: string;
  jobTitle: string;
  jobSlug: string;
  commentText: string;
  commentId: string;
}): Promise<void> {
  if (!agentAlertUserId()) return;

  const message = [
    '💬 Client commented on a project',
    '',
    `Client: ${opts.contactName}`,
    `Project: ${opts.jobTitle}`,
    '',
    opts.commentText.trim(),
    '',
    'Reply from the project comments thread in admin when you follow up.',
  ].join('\n');

  await postToSystemAlertsThread({
    message,
    push: {
      title: `💬 Comment on ${opts.jobTitle}`,
      body: `${opts.contactName}: ${opts.commentText.slice(0, 120)}`,
      tag: `project-comment-${opts.commentId}`,
      url: `/admin?tab=work&slug=${encodeURIComponent(opts.jobSlug)}`,
    },
  });
}

/** Fire-and-forget — client added password vault entries. */
export async function notifyAdminAgentOfVaultSubmit(opts: {
  contactName: string;
  contactUid: string;
  labels: string[];
  engagementId: string;
}): Promise<void> {
  if (!agentAlertUserId()) return;

  const labelLine =
    opts.labels.length > 0 ? opts.labels.slice(0, 8).join(', ') : 'New vault item';
  const message = [
    '🔐 Client added to the password vault',
    '',
    `Client: ${opts.contactName}`,
    `Items: ${labelLine}`,
    '',
    'Review the vault on the client page in admin.',
  ].join('\n');

  await postToSystemAlertsThread({
    message,
    push: {
      title: `🔐 Vault update: ${opts.contactName}`,
      body: labelLine.slice(0, 120),
      tag: `vault-${opts.engagementId}`,
      url: `/admin?tab=clients&client=${encodeURIComponent(opts.contactUid)}`,
    },
  });
}

/** Fire-and-forget — client opened a tracked share / proposal / deck link. */
export async function notifyAdminAgentOfShareOpen(opts: {
  contactName: string;
  contactUid: string;
  jobTitle: string;
  jobSlug: string;
  kind: string;
  engagementId: string;
}): Promise<void> {
  if (!agentAlertUserId()) return;

  const message = [
    `👀 Client opened ${opts.kind}`,
    '',
    `Client: ${opts.contactName}`,
    `Project: ${opts.jobTitle}`,
    '',
    'They engaged with the share link — follow up while interest is warm.',
  ].join('\n');

  await postToSystemAlertsThread({
    message,
    push: {
      title: `👀 ${opts.contactName} opened ${opts.kind}`,
      body: opts.jobTitle,
      tag: `share-open-${opts.engagementId}`,
      url: `/admin?tab=work&slug=${encodeURIComponent(opts.jobSlug)}`,
    },
  });
}

/** Fire-and-forget — website contact form created an inquiry. */
export async function notifyAdminAgentOfContactForm(opts: {
  contactName: string;
  contactUid: string;
  jobTitle: string;
  jobSlug: string;
  email?: string | null;
  engagementId: string;
}): Promise<void> {
  if (!agentAlertUserId()) return;

  const message = [
    '📬 New website contact form inquiry',
    '',
    `Client: ${opts.contactName}`,
    opts.email ? `Email: ${opts.email}` : null,
    `Project: ${opts.jobTitle}`,
    '',
    'A new inquiry project was created from the website contact form. Review it on the Work tab.',
  ]
    .filter(Boolean)
    .join('\n');

  await postToSystemAlertsThread({
    message,
    push: {
      title: `📬 Contact form: ${opts.contactName}`,
      body: opts.jobTitle.slice(0, 120),
      tag: `contact-form-${opts.engagementId}`,
      url: `/admin?tab=work&slug=${encodeURIComponent(opts.jobSlug)}`,
    },
  });
}

/** Fire-and-forget — sales deck page view. */
export async function notifyAdminAgentOfDeckView(opts: {
  contactName: string | null;
  contactUid: string | null;
  industry: string | null;
  industryLabel?: string | null;
  deckTitle?: string | null;
  engagementId: string;
}): Promise<void> {
  if (!agentAlertUserId()) return;

  const deckTitle = opts.deckTitle?.trim() || 'Business OS — everything';
  const industryLabel = opts.industryLabel?.trim() || opts.industry?.trim() || null;
  const who = opts.contactName || 'Anonymous visitor';
  const message = [
    `📊 ${deckTitle} viewed`,
    '',
    `Viewer: ${who}`,
    industryLabel
      ? `Preset: ${industryLabel}${opts.industry ? ` (/deck?type=${opts.industry})` : ''}`
      : 'Default deck · /deck',
    '',
    'Someone is reviewing the sales narrative.',
  ].join('\n');

  const url = opts.contactUid
    ? `/admin?tab=clients&client=${encodeURIComponent(opts.contactUid)}`
    : '/admin?tab=home';

  await postToSystemAlertsThread({
    message,
    push: {
      title: `📊 ${deckTitle}`,
      body: opts.contactName
        ? `${opts.contactName}${industryLabel ? ` · ${industryLabel}` : ''}`
        : industryLabel
          ? `${industryLabel} preset`
          : 'Anonymous · default deck',
      tag: `deck-view-${opts.engagementId}`,
      url,
    },
  });
}

/**
 * Fire-and-forget — logs failures, never throws to inbound email handler.
 *
 * Railway build/deploy alerts route through deployIncidentHandler:
 *   - One active incident per GitHub repo (duplicate emails suppressed + deleted)
 *   - Agent runs playbook, ends with ✅ RESOLVED or 🚨 UNRESOLVED
 *   - Resolved → silent email delete; unresolved → urgent push
 */
export async function notifyAdminAgentOfEmailAlert(opts: {
  status: string;
  from: string;
  subject: string;
  summary: string;
  category: string;
  emailId?: string;
}): Promise<void> {
  if (!shouldAgentAlertForInboundEmail({ category: opts.category, status: opts.status })) return;

  const isRailway = isRailwayAlertStatus(opts.status);

  if (isRailway) {
    const message = await formatAlertMessage(opts);
    const { handleDeployFailure, isRailwayIncidentHandlerEnabled } = await import(
      './deployIncidentHandler'
    );
    if (isRailwayIncidentHandlerEnabled()) {
      await handleDeployFailure({
        source: 'email',
        message,
        emailId: opts.emailId,
        subject: opts.subject,
        body: opts.summary,
      });
      return;
    }

    await postToSystemAlertsThread({
      message,
      emailId: opts.emailId,
      autoRun: false,
      push: {
        title: `Railway: ${opts.summary.slice(0, 60)}`,
        body: opts.summary,
        tag: opts.emailId ?? 'railway-alert',
        url: opts.emailId
          ? `/admin?tab=email&email=${encodeURIComponent(opts.emailId)}`
          : '/admin?tab=email',
      },
    });
    return;
  }

  const message = await formatAlertMessage(opts);

  await postToSystemAlertsThread({
    message,
    emailId: opts.emailId,
    autoRun: !isAnthropicBillingAlertStatus(opts.status),
    push: {
      title: `Alert: ${opts.summary.slice(0, 60)}`,
      body: opts.summary,
      tag: opts.emailId ?? `email-${opts.status}`,
      url: opts.emailId
        ? `/admin?tab=email&email=${encodeURIComponent(opts.emailId)}`
        : '/admin?tab=email',
    },
  });
}
