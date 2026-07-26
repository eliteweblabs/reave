/**
 * Agent tool module: detect_tech_stack
 * Runs the local Wappalyzer-lite detector against any public URL.
 */

import { detectTechStack } from '../../techStackDetector';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../types';

async function handle_detect_tech_stack(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  const url = String(args.url ?? '').trim();
  if (!url) return JSON.stringify({ error: 'url is required' });

  const result = await detectTechStack(url);

  if (!result.ok) {
    return JSON.stringify({ error: result.error, status_code: result.status_code });
  }

  const { data } = result;
  return JSON.stringify({
    url: data.url,
    status_code: data.status_code,
    technologies: data.technologies,
    by_category: data.by_category,
    summary: data.summary,
    total_detected: data.technologies.length,
  });
}

export const techStackModule: AgentToolModule = {
  id: 'tech-stack',
  enabled: () => true,
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'detect_tech_stack',
          description:
            'Detect what technologies power a website — CMS, frameworks, analytics, hosting, payment processors, chat widgets, CDN, and more. Uses a local Wappalyzer-style pattern database (no external API). Great for prospect research, competitive analysis, or client audits.',
          parameters: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'Full URL or domain to scan, e.g. https://example.com',
              },
            },
            required: ['url'],
            additionalProperties: false,
          },
        },
      },
    ];
  },
  handlers: {
    detect_tech_stack: handle_detect_tech_stack,
  },
};
