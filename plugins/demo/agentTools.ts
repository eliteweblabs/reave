import { getDemoSetupStatus, isDemoMode, isDemoSeedReady } from '../../src/lib/demoMode';
import { runDemoSeed } from '../../src/lib/demoSeedRunner';
import { hasFeature } from '../../src/lib/features';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';

async function handle_get_demo_setup_status(
  _args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  if (!hasFeature('demo')) {
    return JSON.stringify({ error: 'demo feature not enabled — set INSTALL_CONFIG=demo or DEMO_MODE=1' });
  }
  const status = await getDemoSetupStatus();
  return JSON.stringify({ ok: true, ...status });
}

async function handle_run_demo_seed(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!hasFeature('demo')) {
    return JSON.stringify({ error: 'demo feature not enabled' });
  }
  if (!isDemoMode()) {
    return JSON.stringify({
      error: 'Demo mode is not active on this deployment (set DEMO_MODE=1 or INSTALL_CONFIG=demo)',
    });
  }

  const dryRun = args.dry_run === true || args.dryRun === true;
  if (!dryRun && !isDemoSeedReady()) {
    const status = await getDemoSetupStatus();
    return JSON.stringify({
      error: 'Demo seed prerequisites are not met',
      checks: status.checks.filter((c) => !c.ok),
    });
  }

  const result = runDemoSeed({
    fresh: args.fresh === true,
    forceCompany: args.force_company === true || args.forceCompany === true,
    withBookings: args.with_bookings === true || args.withBookings === true,
    dryRun,
    industry: typeof args.industry === 'string' ? args.industry : undefined,
    moduleIds: Array.isArray(args.module_ids)
      ? (args.module_ids as string[])
      : Array.isArray(args.moduleIds)
        ? (args.moduleIds as string[])
        : undefined,
    tier: typeof args.tier === 'number' ? args.tier : undefined,
  });

  if (!result.ok) {
    return JSON.stringify({
      error: result.error,
      stdout: result.stdout?.slice(-2000),
      stderr: result.stderr?.slice(-2000),
    });
  }

  const status = dryRun ? null : await getDemoSetupStatus();
  return JSON.stringify({
    ok: true,
    dryRun,
    stdout: result.stdout.slice(-4000),
    status,
  });
}

export const demoModule: AgentToolModule = {
  id: 'demo',
  enabled: () => hasFeature('demo') && isDemoMode(),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'get_demo_setup_status',
          description:
            'Check demo install readiness: env prerequisites, whether demo data is seeded, and row counts. Use at the start of a demo quick-start wizard.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
      {
        type: 'function',
        function: {
          name: 'run_demo_seed',
          description:
            'Populate (or refresh) the dashboard with demo contacts, projects, inbox, chats, and todos via scripts/seed-demo.ts. Requires demo mode. Use fresh=true to wipe prior demo rows first. Use force_company=true to overwrite company branding with Reave Demo Co.',
          parameters: {
            type: 'object',
            properties: {
              fresh: {
                type: 'boolean',
                description: 'Delete prior demo rows before seeding (safe — keeps your real contact)',
              },
              force_company: {
                type: 'boolean',
                description: 'Overwrite company_config with demo branding',
              },
              with_bookings: {
                type: 'boolean',
                description: 'Also seed Cal.com bookings (needs CALCOM_DATABASE_URL)',
              },
              dry_run: {
                type: 'boolean',
                description: 'Plan only — no database or API writes',
              },
              industry: {
                type: 'string',
                description: 'Industry slug for themed seed data (plumbing, general)',
              },
              module_ids: {
                type: 'array',
                items: { type: 'string' },
                description: 'Numeric module ids from demo URL, e.g. ["001","004"]',
              },
              tier: {
                type: 'number',
                description: 'Installation tier (default 1)',
              },
            },
            additionalProperties: false,
          },
        },
      },
    ];
  },
  handlers: {
    get_demo_setup_status: handle_get_demo_setup_status,
    run_demo_seed: handle_run_demo_seed,
  },
};
