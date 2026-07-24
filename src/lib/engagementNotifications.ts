/**
 * Dashboard review notifications + push side-effects for engagement events.
 */

import everythingDeck from '../deck/scripts/everything.json';
import {
  notifyAdminAgentOfContactForm,
  notifyAdminAgentOfDeckView,
  notifyAdminAgentOfShareOpen,
  notifyAdminAgentOfVaultSubmit,
} from './adminAgentAlert';
import { getDeckIndustryBySlug } from './deckIndustriesStore';
import {
  storeCreateEngagementEvent,
  storeListPendingEngagementEvents,
  storeCountPendingEngagementEvents,
  type CreateEngagementInput,
  type EngagementEvent,
  type EngagementEventType,
} from './engagementStore';

/** Display name for the public `/deck` narrative (kept in sync with the script JSON). */
const SALES_DECK_TITLE =
  typeof everythingDeck?.title === 'string' && everythingDeck.title.trim()
    ? everythingDeck.title.trim()
    : 'Business OS — everything';

export type EngagementReviewNotification = {
  id: string;
  type: EngagementEventType;
  title: string;
  detail: string;
  receivedAt: string;
  engagementId: string;
  contactUid?: string;
  contactName?: string;
  jobSlug?: string;
  jobTitle?: string;
};

export function toEngagementReviewNotification(
  event: EngagementEvent,
): EngagementReviewNotification {
  return {
    id: event.id,
    type: event.type,
    title: event.title,
    detail: event.detail,
    receivedAt: event.createdAt,
    engagementId: event.id,
    ...(event.contactUid ? { contactUid: event.contactUid } : {}),
    ...(event.contactName ? { contactName: event.contactName } : {}),
    ...(event.jobSlug ? { jobSlug: event.jobSlug } : {}),
    ...(event.jobTitle ? { jobTitle: event.jobTitle } : {}),
  };
}

export async function listEngagementNotifications(opts?: {
  limit?: number;
  maxAgeDays?: number;
}): Promise<EngagementReviewNotification[]> {
  const pending = await storeListPendingEngagementEvents(opts);
  return pending.map(toEngagementReviewNotification);
}

export async function countEngagementNotifications(): Promise<number> {
  return storeCountPendingEngagementEvents({ maxAgeDays: 14 });
}

async function createAndNotify(
  input: CreateEngagementInput,
  notify: (event: EngagementEvent) => Promise<void>,
): Promise<EngagementEvent | null> {
  try {
    const event = await storeCreateEngagementEvent(input);
    if (!event) return null;
    await notify(event).catch((e) => {
      console.warn('[engagement] notify failed:', e instanceof Error ? e.message : e);
    });
    return event;
  } catch (e) {
    console.warn('[engagement] create failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function recordVaultSubmitEngagement(opts: {
  contactUid: string;
  contactName: string;
  labels: string[];
}): Promise<EngagementEvent | null> {
  const who = opts.contactName.trim() || 'Client';
  const labels = opts.labels.map((l) => l.trim()).filter(Boolean);
  const labelSummary =
    labels.length === 0
      ? 'New vault item'
      : labels.length === 1
        ? labels[0]!
        : `${labels[0]} (+${labels.length - 1} more)`;
  const detail =
    labels.length <= 1
      ? 'Added to the password vault'
      : `Added ${labels.length} items: ${labels.slice(0, 4).join(', ')}${labels.length > 4 ? '…' : ''}`;

  return createAndNotify(
    {
      type: 'vault_entry',
      title: `${who} added vault item: ${labelSummary}`,
      detail,
      contactUid: opts.contactUid,
      contactName: who,
    },
    (event) =>
      notifyAdminAgentOfVaultSubmit({
        contactName: who,
        contactUid: opts.contactUid,
        labels,
        engagementId: event.id,
      }),
  );
}

export async function recordShareOpenEngagement(opts: {
  contactUid: string;
  contactName: string;
  jobSlug: string;
  jobTitle: string;
  linkToken: string;
  destination?: string;
}): Promise<EngagementEvent | null> {
  const who = opts.contactName.trim() || 'Client';
  const project = opts.jobTitle.trim() || opts.jobSlug;
  const dest = (opts.destination || '').toLowerCase();
  const kind = dest.includes('/deck')
    ? 'sales deck'
    : dest.includes('/doc/') || dest.includes('proposal')
      ? 'proposal'
      : 'shared link';

  return createAndNotify(
    {
      type: 'share_open',
      title: `${who} opened ${kind}: ${project}`,
      detail: `First open of the tracked ${kind}`,
      contactUid: opts.contactUid,
      contactName: who,
      jobSlug: opts.jobSlug,
      jobTitle: project,
      dedupeKey: `share:${opts.linkToken}`,
    },
    (event) =>
      notifyAdminAgentOfShareOpen({
        contactName: who,
        contactUid: opts.contactUid,
        jobTitle: project,
        jobSlug: opts.jobSlug,
        kind,
        engagementId: event.id,
      }),
  );
}

export async function recordContactFormEngagement(opts: {
  contactUid: string;
  contactName: string;
  jobSlug: string;
  jobTitle: string;
  email?: string | null;
  messagePreview?: string | null;
}): Promise<EngagementEvent | null> {
  const who = opts.contactName.trim() || 'Visitor';
  const project = opts.jobTitle.trim() || opts.jobSlug;
  const preview = (opts.messagePreview || '').trim().replace(/\s+/g, ' ');
  const detail = preview
    ? preview.length > 160
      ? `${preview.slice(0, 157)}…`
      : preview
    : 'New website contact form inquiry';

  return createAndNotify(
    {
      type: 'contact_form',
      title: `${who} submitted the contact form — inquiry created`,
      detail: `${project}: ${detail}`,
      contactUid: opts.contactUid,
      contactName: who,
      jobSlug: opts.jobSlug,
      jobTitle: project,
      dedupeKey: `contact_form:${opts.jobSlug}`,
    },
    (event) =>
      notifyAdminAgentOfContactForm({
        contactName: who,
        contactUid: opts.contactUid,
        jobTitle: project,
        jobSlug: opts.jobSlug,
        email: opts.email?.trim() || null,
        engagementId: event.id,
      }),
  );
}

export async function recordDeckViewEngagement(opts: {
  contactUid?: string | null;
  contactName?: string | null;
  industry?: string | null;
  sessionKey: string;
}): Promise<EngagementEvent | null> {
  const who = opts.contactName?.trim() || null;
  const industrySlug = opts.industry?.trim() || null;
  let industryLabel: string | null = null;
  if (industrySlug) {
    const row = await getDeckIndustryBySlug(industrySlug).catch(() => null);
    industryLabel = row?.label?.trim() || industrySlug;
  }

  const deckName = SALES_DECK_TITLE;
  const title = who ? `${who} viewed ${deckName}` : `Someone viewed ${deckName}`;
  const detail = industryLabel
    ? `${industryLabel} preset · /deck?type=${industrySlug}`
    : `Default deck · /deck`;

  return createAndNotify(
    {
      type: 'deck_view',
      title,
      detail,
      contactUid: opts.contactUid?.trim() || null,
      contactName: who,
      dedupeKey: `deck:${opts.sessionKey}`,
    },
    (event) =>
      notifyAdminAgentOfDeckView({
        contactName: who,
        contactUid: opts.contactUid?.trim() || null,
        industry: industrySlug,
        industryLabel,
        deckTitle: deckName,
        engagementId: event.id,
      }),
  );
}
