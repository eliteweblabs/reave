import { AsyncLocalStorage } from 'node:async_hooks';
import type { ChatDocAttachment, ChatImageAttachment } from './chatTypes';
import type { ChatMention } from './chatMentions';
import type { OwnerContactRecord } from './ownerContact';

export interface AgentRunContext {
  userId?: string;
  threadId?: string;
  emailId?: string;
  /** Automated system alert — do not replay chat history or "wait for instructions". */
  systemAlert?: boolean;
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
