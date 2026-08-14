/**
 * Agent tool module: playwright_audit
 *
 * Runs a real headless Chromium browser against a public URL and returns a
 * UX/UI audit covering both desktop and mobile viewports. Checks nav
 * functionality, JS errors, overflow elements, tap targets, CTA buttons, forms,
 * sticky headers, and captures screenshots when a check fails (empty hamburger
 * nav, overflow, small tap targets, etc.).
 */

import { randomUUID } from 'crypto';
import { getAgentContext } from '../../agentContext';
import { playwrightAudit, formatPlaywrightResults } from '../../playwrightAuditClient';
import {
  attachPlaywrightIssueShots,
  formatUxEvidenceMarkdown,
  mergeUxEvidenceSection,
  stashPlaywrightIssueShots,
} from '../../playwrightIssueShots';
import { isSafeWorkSlug, storeReadWork, storeWriteWork } from '../../workStore';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../types';

async function fileShotsOnExistingJob(
  slug: string,
  runId: string,
): Promise<{ files: { filename: string; url: string; title: string }[]; error?: string }> {
  if (!isSafeWorkSlug(slug)) return { files: [], error: 'invalid job_slug' };
  const doc = await storeReadWork(slug);
  if (!doc) return { files: [], error: 'job not found' };
  const ctx = getAgentContext();
  const saved = await attachPlaywrightIssueShots(slug, runId, {
    uploadedBy: ctx.userId ?? null,
    sourceRef: ctx.threadId ?? runId,
  });
  if (!saved.length) return { files: [] };
  const nextBody = mergeUxEvidenceSection(doc.body, formatUxEvidenceMarkdown(saved));
  if (nextBody !== doc.body) {
    await storeWriteWork(slug, {
      title: doc.title,
      client: doc.client || doc.contact_name,
      contact_uid: doc.contact_uid || undefined,
      status: doc.status,
      body: nextBody,
      record_origin: doc.record_origin,
      priority: doc.priority,
      due_date: doc.due_date,
      value: doc.value,
      tags: doc.tags,
      source: doc.source,
    });
  }
  return {
    files: saved.map((f) => ({ filename: f.filename, url: f.url, title: f.title })),
  };
}

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

  const runId = randomUUID();
  const pending = result.issue_screenshots.map((shot) => ({
    id: shot.id,
    kind: shot.kind,
    viewport: shot.viewport,
    title: shot.title,
    detail: shot.detail,
    filename: shot.filename,
    pngBase64: shot.pngBase64,
  }));
  stashPlaywrightIssueShots({ runId, url: result.url, shots: pending });

  const jobSlug = String(args.job_slug ?? '').trim();
  let filed: { files: { filename: string; url: string; title: string }[]; error?: string } | null =
    null;
  if (jobSlug && pending.length) {
    filed = await fileShotsOnExistingJob(jobSlug, runId);
  }

  // Strip screenshot base64 from the JSON to avoid token bloat — report sizes only
  const sanitized = {
    ...result,
    screenshot_run_id: runId,
    results: result.results.map((r) => ({
      ...r,
      screenshotFullPage: r.screenshotFullPage
        ? `[base64 PNG — ${Math.round((r.screenshotFullPage.length * 0.75) / 1024)}KB]`
        : '',
      screenshotNav: r.screenshotNav
        ? `[base64 PNG — ${Math.round((r.screenshotNav.length * 0.75) / 1024)}KB]`
        : '',
      issueScreenshots: r.issueScreenshots.map((s) => ({
        id: s.id,
        kind: s.kind,
        viewport: s.viewport,
        title: s.title,
        detail: s.detail,
        filename: s.filename,
      })),
    })),
    issue_screenshots: result.issue_screenshots.map((s) => ({
      id: s.id,
      kind: s.kind,
      viewport: s.viewport,
      title: s.title,
      detail: s.detail,
      filename: s.filename,
    })),
    filed_on_project: filed,
  };

  const text = formatPlaywrightResults(result);

  return JSON.stringify({ ...sanitized, formatted_summary: text });
}

const definition: AgentToolDef = {
  type: 'function',
  function: {
    name: 'playwright_audit',
    description:
      'Run a real headless Chromium browser against a public URL to audit UX/UI issues on both desktop (1440px) and mobile (375px) viewports. Checks: hamburger/nav menu open/close (and whether the opened menu is empty), all nav link resolution, JS console errors, off-screen overflow elements, sticky header behavior, CTA button clickability, contact form fields and submit buttons, small tap targets (<44px on mobile). Captures a screenshot at the failed state when a check fails (e.g. hamburger tapped and nav is empty) — not a generic “everything looks fine” gallery. Those issue shots are filed on the project automatically by create_work / update_work. Use after lighthouse_audit and check_links for a complete website audit.',
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
            'Whether to capture generic full-page/nav context shots (default true). Issue-state screenshots are always captured when a check fails.',
        },
        job_slug: {
          type: 'string',
          description:
            'Optional existing project slug. When set, failed-check screenshots are filed on that project immediately. Otherwise create_work / update_work files them automatically.',
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
