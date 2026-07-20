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

const ALERT_THREAD_TITLE = 'System alerts';

export function agentAlertUserId(): string | null {
  return serverEnv('AGENT_ALERT_USER_ID')?.trim() || null;
}

export function isRailwayAlertStatus(status: string): boolean {
  return status.toUpperCase().startsWith('RAILWAY');
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

/** Fire-and-forget — logs failures, never throws to callers. */
export async function postToSystemAlertsThread(opts: {
  message: string;
  autoRun?: boolean;
  emailId?: string;
  push?: { title: string; body: string; tag?: string; url?: string };
}): Promise<void> {
  const userId = agentAlertUserId();
  if (!userId) return;

  try {
    const threadId = await getOrCreateAlertThread(userId);
    if (!threadId) {
      console.warn('[admin-agent] could not open System alerts thread');
      return;
    }

    const priorTurns: { role: 'user' | 'assistant'; content: string }[] = [];
    // System alerts are standalone events — replaying the whole thread blows the prompt.

    const autoRun = opts.autoRun !== false && serverEnv('AGENT_ALERT_AUTO_RUN') !== '0';

    if (autoRun) {
      let reply = await runKnowledgeAgent({
        userText: opts.message,
        priorTurns,
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
      }).catch((e) => console.warn('[admin-agent] push failed', e));
    }

    console.info('[admin-agent] alert posted', { threadId });
  } catch (e) {
    console.warn('[admin-agent] notify failed', e);
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
  const intro = railway
    ? 'Railway alert email received (deploy/build crash notification). You run inside this app on Railway — use your tools first, not manual dashboard/CLI steps.'
    : 'Inbound alert email received.';

  const lines = [
    intro,
    '',
    `Status: ${opts.status}`,
    railway
      ? 'Call check_deployment_status and get_git_status now. Distinguish rollout teardown vs a real crash, summarize what you found, and suggest next steps. You cannot fetch Railway logs via API — only mention dashboard logs if tools leave the cause unclear.'
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

/** Fire-and-forget — logs failures, never throws to inbound email handler. */
export async function notifyAdminAgentOfEmailAlert(opts: {
  status: string;
  from: string;
  subject: string;
  summary: string;
  category: string;
  emailId?: string;
}): Promise<void> {
  if (!agentAlertUserId()) return;
  if (opts.category !== 'alert' && !isRailwayAlertStatus(opts.status)) return;

  const message = await formatAlertMessage(opts);
  await postToSystemAlertsThread({
    message,
    emailId: opts.emailId,
    push: {
      title: isRailwayAlertStatus(opts.status)
        ? `Railway: ${opts.subject.slice(0, 50) || 'deploy alert'}`
        : `Alert: ${opts.summary.slice(0, 60)}`,
      body: opts.summary,
      tag: opts.emailId ?? `email-${opts.status}`,
      url: opts.emailId
        ? `/admin?tab=email&email=${encodeURIComponent(opts.emailId)}`
        : '/admin?tab=email',
    },
  });
}
