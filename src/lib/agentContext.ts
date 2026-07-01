import { AsyncLocalStorage } from 'node:async_hooks';

export interface AgentRunContext {
  userId?: string;
  threadId?: string;
  emailId?: string;
}

export const agentRunContext = new AsyncLocalStorage<AgentRunContext>();

export function getAgentContext(): AgentRunContext {
  return agentRunContext.getStore() ?? {};
}

export function runWithAgentContext<T>(ctx: AgentRunContext, fn: () => Promise<T>): Promise<T> {
  return agentRunContext.run(ctx, fn);
}
