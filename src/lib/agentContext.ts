import { AsyncLocalStorage } from 'node:async_hooks';
import type { ChatDocAttachment, ChatImageAttachment } from './chatTypes';
import type { ChatMention } from './chatMentions';
import type { OwnerContactRecord } from './ownerContact';

export interface AgentRunContext {
  userId?: string;
  threadId?: string;
  emailId?: string;
  /** Automated system alert — do not wait for the owner; still reuse Session history when present. */
  systemAlert?: boolean;
  /**
   * Deploy / crash auto-repair — more tool rounds so the agent can actually
   * diagnose and ship a fix instead of stopping at a 5-round diagnosis.
   */
  repairRun?: boolean;
  /** Railway service under repair (for docker-image guardrails). */
  repairDeployService?: string;
  /** Per-run counter — set_railway_variables redeploys during repairRun. */
  _repairRailwayVarSets?: number;
  /**
   * Owner-initiated Siri Shortcuts (and similar) may run Claude during sleep mode.
   * Checked by the agent runner and Anthropic client — automated overnight work stays blocked.
   */
  bypassSleepMode?: boolean;
  /**
   * Background research (Siri / Digital Audit) — do not decorate the reply
   * with a Railway deploy banner. That text gets reused as the completion push.
   */
  skipDeployBanner?: boolean;
  /** Siri / Digital Audit research — enforce a prepaid credit reserve mid-run. */
  auditResearch?: { tier: 'quick' | 'full' };
  /**
   * Owner is speaking via Siri Shortcuts — lead with a short plain-text spoken
   * answer (the chat transcript may still carry more detail below).
   */
  siriVoice?: boolean;
  /** Images (including SVGs) attached to the current user message (for filing to projects). */
  messageImages?: ChatImageAttachment[];
  /** PDF/PPTX documents attached to the current user message (for filing to projects). */
  messageDocs?: ChatDocAttachment[];
  /**
   * Structured @-mentions from the composer (contacts + Clerk team users).
   * Prefer these ids over fuzzy resolve_contact for the current turn.
   */
  mentions?: ChatMention[];
  /**
   * The logged-in admin user's own contact-api record.
   * Injected at request time so the agent can assign internal projects to the
   * owner without prompting for a client name.
   */
  ownerContact?: OwnerContactRecord | null;
  /**
   * Per-run circuit breakers for tools that must not be retried (e.g. lighthouse_audit
   * after a PSI quota/rate-limit failure — retries burn the whole tool-round budget).
   */
  _toolOnce?: Record<string, true>;
}

export const agentRunContext = new AsyncLocalStorage<AgentRunContext>();

export function getAgentContext(): AgentRunContext {
  return agentRunContext.getStore() ?? {};
}

export function runWithAgentContext<T>(ctx: AgentRunContext, fn: () => Promise<T>): Promise<T> {
  return agentRunContext.run(ctx, fn);
}
