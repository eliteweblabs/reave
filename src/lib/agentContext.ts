import { AsyncLocalStorage } from 'node:async_hooks';
import type { ChatImageAttachment } from './chatTypes';
import type { OwnerContactRecord } from './ownerContact';

export interface AgentRunContext {
  userId?: string;
  threadId?: string;
  emailId?: string;
  /** Automated System alerts thread — do not replay chat history or "wait for instructions". */
  systemAlert?: boolean;
  /** Images attached to the current user message (for filing to projects). */
  messageImages?: ChatImageAttachment[];
  /**
   * The logged-in admin user's own contact-api record.
   * Injected at request time so the agent can assign internal projects to the
   * owner without prompting for a client name.
   */
  ownerContact?: OwnerContactRecord | null;
}

export const agentRunContext = new AsyncLocalStorage<AgentRunContext>();

export function getAgentContext(): AgentRunContext {
  return agentRunContext.getStore() ?? {};
}

export function runWithAgentContext<T>(ctx: AgentRunContext, fn: () => Promise<T>): Promise<T> {
  return agentRunContext.run(ctx, fn);
}
