/**
 * Agent tools for SEO Directory API Kit (BrightLocal — REΛVE agency account).
 */

import { hasFeature } from '../../src/lib/features';
import { seoDirectoryStatus } from '../../src/lib/brightlocalClient';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';

async function handle_seo_directory_status(
  _args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  return JSON.stringify(seoDirectoryStatus());
}

export const seoDirectoryAgentTools: AgentToolModule = {
  id: 'seo-directory',
  enabled: () => hasFeature('seo_directory'),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'seo_directory_status',
          description:
            'SEO Directory API Kit status: BrightLocal agency account wiring, local vs national_ecommerce modes, and whether one-time citation campaigns can run yet. Use when planning second-tier directory/citation work beyond Google Business, Apple Maps, Yelp, and Bing.',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
      },
    ];
  },
  handlers: {
    seo_directory_status: handle_seo_directory_status,
  },
};
