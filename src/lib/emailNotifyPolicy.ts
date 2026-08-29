/**
 * Which triage outcomes are allowed to ping the owner.
 * Kept free of stores, AI, and Resend so the policy can be tested directly.
 */

import { isJunkClassification } from './emailJunkNotifyInvariant';
import { isVerificationCodeRuleStatus, isAuthLinkRuleStatus } from './emailRules';
import { isMeetingAutomationKind } from './emailReviewPending';
import type { EmailCategory } from './emailProcessor';

/** Whether this triage outcome needs a phone push (skip junk, silent rules, auto-routed). */
export function shouldSendInboxPush(opts: {
  category: EmailCategory;
  action: string;
  ruleNotify: boolean;
  ruleStatus: string;
  isProjectReply?: boolean;
  automationKind?: string | null;
}): boolean {
  // Hard rule: junk / DELETE / auto-archive never notify — not even when a
  // later meeting/project automation flag is set. Dashboard + push stay empty.
  if (
    isJunkClassification({
      category: opts.category,
      action: opts.action,
      status: opts.ruleStatus,
    })
  ) {
    return false;
  }

  if (opts.isProjectReply) return true;
  if (
    isMeetingAutomationKind(opts.automationKind) ||
    opts.automationKind === 'project_created' ||
    opts.automationKind === 'project_match_suggested'
  ) {
    return true;
  }

  const action = opts.action.toLowerCase();
  const status = opts.ruleStatus.toUpperCase();

  // No keyword rule → inbox only unless the owner opted in (ruleNotify).
  if (
    status === 'UNMATCHED' &&
    !opts.ruleNotify &&
    !opts.isProjectReply &&
    !opts.automationKind
  ) {
    return false;
  }
  if (action === 'needs_explain') return true;
  if (opts.category === 'receipt') return false;
  if (opts.action === 'verification_code' || opts.action === 'activation_link') return false;
  if (opts.category === 'otp' || opts.category === 'auth_link') return false;
  if (isVerificationCodeRuleStatus(opts.ruleStatus) || isAuthLinkRuleStatus(opts.ruleStatus)) {
    return false;
  }
  if (!opts.ruleNotify) return false;
  if (status === 'DELETE' || status === 'AUTO_ARCHIVED') return false;
  // Auto-sorted to a job — visible under Routed, no ping needed (except urgent project replies).
  if (action === 'filed' || action === 'matched') return false;
  // Auto-booked meeting — owner should review and confirm with the sender.
  if (action === 'booked') return true;

  return true;
}
