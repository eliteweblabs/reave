/**
 * Deploy resume tool — lets the agent register a continuation message so that
 * when the Railway deploy-success webhook fires, this chat session is
 * automatically resumed and the agent picks up where it left off.
 *
 * Tools:
 *   set_deploy_resume — register a pending continuation for the current thread
 *   clear_deploy_resume — cancel any pending resume
 */

import { setDeployResume, popDeployResume } from '../../deployResume';
import { getAgentContext } from '../../agentContext';
import { isPgChatsConfigured } from '../../pgChats';
import type { AgentToolModule } from '../types';

function isConfigured(): boolean {
  return isPgChatsConfigured();
}

function getCurrentThreadId(): string | null {
  return getAgentContext().threadId ?? null;
}

export const deployResumeModule: AgentToolModule = {
  enabled: () => isConfigured(),

  definitions: () => [
    {
      name: 'set_deploy_resume',
      description:
        'Register a continuation message so the agent automatically resumes THIS chat session when the next Railway deploy-success webhook fires. Use when you are about to go silent waiting for a deploy (e.g. you committed a fix and need a Crater route to be live before finishing). The message is posted back into this thread exactly as if the owner typed it, triggering a new agent run. Clears itself after 30 minutes or on first trigger. Omit thread_id to use the current session.',
      input_schema: {
        type: 'object' as const,
        properties: {
          message: {
            type: 'string',
            description:
              'The continuation message to post when the deploy lands. Be specific — include exactly what to do next (e.g. "Crater is live. Call update_invoice_item on invoice 90 item 306 name=Plausible Analytics…").',
          },
          thread_id: {
            type: 'string',
            description:
              'Thread UUID to resume. Defaults to the current chat session when omitted.',
          },
        },
        required: ['message'],
      },
    },
    {
      name: 'clear_deploy_resume',
      description:
        'Cancel any pending deploy-resume continuation (e.g. the deploy is no longer needed or the task was completed another way).',
      input_schema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    },
  ],

  handlers: {
    async set_deploy_resume(args) {
      const message = typeof args.message === 'string' ? args.message.trim() : '';
      if (!message) {
        return JSON.stringify({ error: 'message is required and must be non-empty' });
      }

      const threadId =
        typeof args.thread_id === 'string' && args.thread_id.trim()
          ? args.thread_id.trim()
          : getCurrentThreadId();

      if (!threadId) {
        return JSON.stringify({ error: 'no thread_id and no current session context' });
      }

      await setDeployResume(threadId, message);

      return JSON.stringify({
        ok: true,
        thread_id: threadId,
        message: 'Deploy resume registered. When the next Railway deploy-success webhook fires (within 30 minutes), this chat will be resumed automatically.',
      });
    },

    async clear_deploy_resume() {
      const cleared = await popDeployResume();
      if (!cleared) {
        return JSON.stringify({ ok: true, message: 'No pending deploy resume found.' });
      }
      return JSON.stringify({
        ok: true,
        message: `Cleared pending resume for thread ${cleared.thread_id}.`,
      });
    },
  },
};
