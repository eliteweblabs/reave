/**
 * Railway domain registration + misc tools via the agent.
 */
import { railwayListRegisteredDomains } from '../../railwayAgentApi';
import type { AgentToolModule, ToolContext } from '../types';

export const railwayModule: AgentToolModule = {
  id: 'railway',
  enabled: () => true, // Always available when agent runs
  definitions: () => [
    {
      type: 'function',
      function: {
        name: 'list_railway_registered_domains',
        description:
          'List all domains purchased via Railway domain registration. Use when the user asks what domains they registered.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
  ],
  handlers: {
    list_railway_registered_domains: async () => {
      const result = await railwayListRegisteredDomains();
      if (!result.ok) {
        return JSON.stringify({ error: result.error });
      }
      const formatted = result.domains
        .map((d) => `${d.domain} (id: ${d.id}, created: ${d.createdAt || 'unknown'})`)
        .join('\n');
      return JSON.stringify({
        ok: true,
        count: result.domains.length,
        domains: formatted || '(none found)',
      });
    },
  },
};
