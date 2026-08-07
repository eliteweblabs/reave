/**
 * Agent tool module: playwright_audit
 *
 * Runs a real headless Chromium browser against a public URL and returns a
 * UX/UI audit covering both desktop and mobile viewports. Checks nav
 * functionality, JS errors, overflow elements, tap targets, CTA buttons, forms,
 * sticky headers, and captures screenshots (full-page + nav state).
 */

import { playwrightAudit, formatPlaywrightResults } from '../../playwrightAuditClient';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../types';

async function handle_playwright_audit(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  const url = String(args.url ?? '').trim();
  if (!url) return JSON.stringify({ error: 'url is required' });

  // Parse optional viewport filter
  const viewportArg = args.viewports;
  let viewports: ('desktop' | 'mobile')[] | undefined;
  if (Array.isArray(viewportArg)) {
    viewports = viewportArg.filter(
      (v): v is 'desktop' | 'mobile' => v === 'desktop' || v === 'mobile',
    );
    if (viewports.length === 0) viewports = undefined;
  } else if (viewportArg === 'desktop' || viewportArg === 'mobile') {
    viewports = [viewportArg];
  }

  const includeScreenshots =
    args.include_screenshots !== undefined ? Boolean(args.include_screenshots) : true;

  const result = await playwrightAudit({ url, viewports, includeScreenshots });

  if (!result.ok) {
    return JSON.stringify({ error: result.error });
  }

  // Return the structured data + a compact text summary for the agent
  // Strip screenshot base64 from the JSON to avoid token bloat — report sizes only
  const sanitized = {
    ...result,
    results: result.results.map((r) => ({
      ...r,
      screenshotFullPage: r.screenshotFullPage
        ? `[base64 PNG — ${Math.round((r.screenshotFullPage.length * 0.75) / 1024)}KB]`
        : '',
      screenshotNav: r.screenshotNav
        ? `[base64 PNG — ${Math.round((r.screenshotNav.length * 0.75) / 1024)}KB]`
        : '',
    })),
  };

  const text = formatPlaywrightResults(result);

  return JSON.stringify({ ...sanitized, formatted_summary: text });
}

const definition: AgentToolDef = {
  type: 'function',
  function: {
    name: 'playwright_audit',
    description:
      'Run a real headless Chromium browser against a public URL to audit UX/UI issues on both desktop (1440px) and mobile (375px) viewports. Checks: hamburger/nav menu open/close, all nav link resolution, JS console errors, off-screen overflow elements, sticky header behavior, CTA button clickability, contact form fields and submit buttons, small tap targets (<44px on mobile), and captures full-page + nav-state screenshots. Use after lighthouse_audit and check_links for a complete website audit.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Full URL or domain to audit, e.g. https://example.com',
        },
        viewports: {
          type: 'array',
          items: { type: 'string', enum: ['desktop', 'mobile'] },
          description:
            'Which viewports to test. Defaults to both ["desktop", "mobile"]. Pass ["mobile"] to test only mobile.',
        },
        include_screenshots: {
          type: 'boolean',
          description:
            'Whether to capture and return screenshots (default true). Set false for faster runs when screenshots are not needed.',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
};

export const playwrightAuditModule: AgentToolModule = {
  id: 'playwright-audit',
  enabled: () => true,
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [definition];
  },
  handlers: {
    playwright_audit: handle_playwright_audit,
  },
};
