/**
 * Newsletter automation rules — the "when + how" for lifecycle emails.
 *
 * Each automation binds a trigger (an event that happens elsewhere in the app)
 * to a template + a delay. Defaults live here; per-install overrides (enable /
 * disable / retiming) are stored in Postgres via newsletterStore.
 */
import type { NewsletterTemplateId } from './newsletterTemplates';

export type NewsletterTrigger = 'contact_created' | 'job_completed';

export interface NewsletterAutomationDef {
  /** Stable id — also the dedup namespace for queued sends. */
  id: string;
  label: string;
  description: string;
  templateId: NewsletterTemplateId;
  trigger: NewsletterTrigger;
  enabledByDefault: boolean;
  /** Delay after the trigger before the email is due to send. */
  defaultDelayMinutes: number;
  /**
   * For follow-ups: skip the send if, by the time it's due, the contact has
   * become a client with an active/completed project (i.e. already converted).
   */
  skipIfConverted?: boolean;
}

const MIN = 1;
const HOUR = 60;
const DAY = 60 * 24;

export const NEWSLETTER_AUTOMATIONS: NewsletterAutomationDef[] = [
  {
    id: 'welcome',
    label: 'Welcome new contact',
    description: 'When a new contact is added, send the welcome email shortly after.',
    templateId: 'user_welcome',
    trigger: 'contact_created',
    enabledByDefault: true,
    defaultDelayMinutes: 5 * MIN,
  },
  {
    id: 'welcome_followup',
    label: 'Follow up with new contact',
    description: 'A few days after signup, check in — but skip anyone who already started a project.',
    templateId: 'user_followup',
    trigger: 'contact_created',
    enabledByDefault: true,
    defaultDelayMinutes: 3 * DAY,
    skipIfConverted: true,
  },
  {
    id: 'project_complete',
    label: 'Project complete follow-up',
    description: 'When a project is marked done, send a thank-you + next steps.',
    templateId: 'project_complete',
    trigger: 'job_completed',
    enabledByDefault: true,
    defaultDelayMinutes: 1 * HOUR,
  },
  {
    id: 'review_request',
    label: 'Request a review',
    description: 'A few days after a project completes, ask the client for a review.',
    templateId: 'review_request',
    trigger: 'job_completed',
    enabledByDefault: true,
    defaultDelayMinutes: 5 * DAY,
  },
];

export function getAutomationDef(id: string): NewsletterAutomationDef | null {
  return NEWSLETTER_AUTOMATIONS.find((a) => a.id === id) ?? null;
}

export function automationsForTrigger(trigger: NewsletterTrigger): NewsletterAutomationDef[] {
  return NEWSLETTER_AUTOMATIONS.filter((a) => a.trigger === trigger);
}

/** Effective automation config = defaults merged with a stored override. */
export interface NewsletterAutomationConfig extends NewsletterAutomationDef {
  enabled: boolean;
  delayMinutes: number;
}

export interface NewsletterAutomationOverride {
  enabled?: boolean;
  delayMinutes?: number;
}

export function mergeAutomation(
  def: NewsletterAutomationDef,
  override: NewsletterAutomationOverride | undefined,
): NewsletterAutomationConfig {
  const delay = override?.delayMinutes;
  return {
    ...def,
    enabled: override?.enabled ?? def.enabledByDefault,
    delayMinutes:
      typeof delay === 'number' && Number.isFinite(delay) && delay >= 0
        ? Math.round(delay)
        : def.defaultDelayMinutes,
  };
}
