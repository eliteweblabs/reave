/**
 * Post operational alerts into the admin agent "System alerts" chat thread.
 */

import { serverEnv } from './serverEnv';
import {
  storeAppendChatMessages,
  storeCreateChatThread,
  storeListChatThreads,
  storeUpdateChatTitle,
} from './chatStore';
import { runKnowledgeAgent } from './agentRunner';
import { prependDeployBanner } from './deployStatus';
import { sendPushNotification } from './webPush';
import { storeGetEmailInbox } from './emailInboxStore';
import { formatEmailChatReferenceWithBody } from './emailAgentContext';
import { hasFeature } from './features';
import { createLogger } from './logger';

const log = createLogger('admin-agent');

const ALERT_THREAD_TITLE = 'System alerts';

export function agentAlertUserId(): string | null {
  return serverEnv('AGENT_ALERT_USER_ID')?.trim() || null;
}

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

async function getOrCreateAlertThread(userId: string): Promise<string | null> {
  const threads = await storeListChatThreads(userId);
  const existing = threads.find((t) => t.title === ALERT_THREAD_TITLE);
  if (existing) return existing.id;

  const created = await storeCreateChatThread(userId);
  if (!created) return null;
  await storeUpdateChatTitle(userId, created.id, ALERT_THREAD_TITLE);
  return created.id;
}

/** Fire-and-forget — Siri "Create Proposal" finished (client + audit project filed). */
export async function notifyAdminAgentOfSiriProposalComplete(opts: {
  label: string;
  reply: string;
  jobSlug?: string | null;
  threadId?: string;
}): Promise<void> {
  if (!agentAlertUserId()) return;

  const slug = opts.jobSlug?.trim();
  const deepLinkUrl = slug ? `/admin?tab=work&slug=${encodeURIComponent(slug)}` : '/admin?tab=work';
  const summary = opts.reply.trim().slice(0, 1200);

  const message = [
    'Proposal research complete (Siri shortcut)',
    '',
    `Prospect: ${opts.label}`,
    slug ? `Project slug: ${slug}` : 'Project: see Work tab',
    '',
    summary || 'Research finished — open the project for the full audit.',
  ].join('\n');

  await postToSystemAlertsThread({
    message,
    autoRun: false,
    push: {
      title: `Proposal ready: ${opts.label}`,
      body: summary.slice(0, 150) || `Project ready${slug ? `: ${slug}` : ''}`,
      tag: `siri-proposal-${opts.threadId ?? slug ?? opts.label}`,
      url: deepLinkUrl,
    },
  });
}

/** Fire-and-forget — logs failures, never throws to callers. */
export async function postToSystemAlertsThread(opts: {
  message: string;
  autoRun?: boolean;
  emailId?: string;
  /** Optional model override — e.g. 'claude-opus-4-6' for high-priority auto-investigations. */
  model?: string;
  push?: { title: string; body: string; tag?: string; url?: string };
}): Promise<void> {
  const userId = agentAlertUserId();
  if (!userId) return;

  try {
    const threadId = await getOrCreateAlertThread(userId);
    if (!threadId) {
      log.warn('could not open System alerts thread');
      return;
    }

    const priorTurns: { role: 'user' | 'assistant'; content: string }[] = [];
    // System alerts are standalone events — replaying the whole thread blows the prompt.

    const autoRun = opts.autoRun !== false && serverEnv('AGENT_ALERT_AUTO_RUN') !== '0';

    if (autoRun) {
      let reply = await runKnowledgeAgent({
        userText: opts.message,
        priorTurns,
        model: opts.model ?? null,
        context: opts.emailId
          ? { userId, emailId: opts.emailId, systemAlert: true }
          : { userId, systemAlert: true },
      });
      reply = await prependDeployBanner(reply, { userText: opts.message });
      await storeAppendChatMessages(userId, threadId, [
        { role: 'user', content: opts.message },
        { role: 'assistant', content: reply },
      ]);
    } else {
      await storeAppendChatMessages(userId, threadId, [{ role: 'user', content: opts.message }]);
    }

    if (opts.push) {
      sendPushNotification({
        title: opts.push.title,
        body: opts.push.body,
        tag: opts.push.tag ?? 'system-alert',
        url: opts.push.url ?? '/admin?tab=chats',
      }).catch((e) => log.warn('push failed', e));
    }

    log.info('alert posted', { threadId });
  } catch (e) {
    log.warn('notify failed', e);
  }
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
    ? 'Railway alert email received (deploy/build crash notification). You run inside this app on Railway — use your tools first, not manual dashboard/CLI steps.'
    : anthropicBilling
      ? 'Anthropic Claude API is out of usage credits — AI email triage/summaries (and this very alert reply, if attempted) will fail until credits are added.'
      : 'Inbound alert email received.';

  const lines = [
    intro,
    '',
    `Status: ${opts.status}`,
    railway
      ? 'Call check_deployment_status and get_git_status now. Distinguish rollout teardown vs a real crash, summarize what you found, and suggest next steps. You cannot fetch Railway logs via API — only mention dashboard logs if tools leave the cause unclear.'
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

/** Fire-and-forget — logs failures, never throws to inbound email handler. */
export async function notifyAdminAgentOfEmailAlert(opts: {
  status: string;
  from: string;
  subject: string;
  summary: string;
  category: string;
  emailId?: string;
}): Promise<void> {
  if (!shouldAgentAlertForInboundEmail({ category: opts.category, status: opts.status })) return;

  const message = await formatAlertMessage(opts);
  await postToSystemAlertsThread({
    message,
    emailId: opts.emailId,
    // The agent's auto-reply itself needs the Claude API — skip it here so we
    // don't burn a doomed-to-fail call and can just show the canned summary.
    autoRun: !isAnthropicBillingAlertStatus(opts.status),
    push: isRailwayAlertStatus(opts.status)
      ? undefined // Railway alerts via email → no push (webhook handler manages those silently)
      : {
          title: `Alert: ${opts.summary.slice(0, 60)}`,
          body: opts.summary,
          tag: opts.emailId ?? `email-${opts.status}`,
          url: opts.emailId
            ? `/admin?tab=email&email=${encodeURIComponent(opts.emailId)}`
            : '/admin?tab=email',
        },
  });
}
