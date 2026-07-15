/**
 * Sandboxed dev/ops tasks callable from the admin agent.
 * Only allowlisted tasks run — no arbitrary shell commands.
 */
import { getCompanyBrandContext } from './companyConfig';
import { isContactApiConfigured } from './contactApi';
import { isBookingConfigured, bookingPing } from './bookingClient';
import { isCardDavConfigured } from './carddav/auth';
import { isCraterConfigured, craterListInvoices } from './craterClient';
import { isGithubConfigured, githubGetRepoAccess, githubRepoSlug } from './githubClient';
import { listKnowledgeSlugs } from './localKnowledge';
import { cloudflareVerifyToken, isCloudflareConfigured } from './cloudflareClient';
import { isRailwayConfigured, railwayListProjectNetworking, railwayPing } from './railwayClient';
import { isResendDnsSyncConfigured, syncResendDnsToCloudflare } from './resendDnsSync';
import { isKinstaConfigured, kinstaListSites, kinstaPing } from './kinstaClient';
import { serverEnv } from './serverEnv';

export const DEV_TASK_NAMES = [
  'service_status',
  'ping_crater',
  'ping_contact_api',
  'ping_railway',
  'list_railway_domains',
  'ping_kinsta',
  'list_kinsta_sites',
  'list_knowledge_slugs',
  'ping_booking',
  'ping_cloudflare',
  'sync_resend_dns',
] as const;

export type DevTaskName = (typeof DEV_TASK_NAMES)[number];

export function isDevTaskName(value: string): value is DevTaskName {
  return (DEV_TASK_NAMES as readonly string[]).includes(value);
}

export type DevTaskResult = { ok: true; task: DevTaskName; result: unknown } | { ok: false; error: string };

export async function runDevTask(task: DevTaskName): Promise<DevTaskResult> {
  switch (task) {
    case 'service_status': {
      const githubAccess = isGithubConfigured() ? await githubGetRepoAccess() : null;
      return {
        ok: true,
        task,
        result: {
          crater: isCraterConfigured(),
          contact_api: isContactApiConfigured(),
          carddav: isCardDavConfigured(),
          anthropic: Boolean(serverEnv('ANTHROPIC_API_KEY')?.trim()),
          railway: isRailwayConfigured(),
          kinsta: isKinstaConfigured(),
          booking: isBookingConfigured(),
          resend_inbound: Boolean(serverEnv('RESEND_WEBHOOK_SECRET')?.trim()),
          cloudflare: isCloudflareConfigured(),
          resend_dns_sync: isResendDnsSyncConfigured(),
          github_token: isGithubConfigured(),
          github_repo: githubRepoSlug(),
          github_write: githubAccess?.ok ? githubAccess.data : null,
        },
      };
    }

    case 'ping_crater': {
      if (!isCraterConfigured()) {
        return { ok: false, error: 'Crater not configured (CRATER_API_BASE_URL / CRATER_API_TOKEN)' };
      }
      const out = await craterListInvoices();
      if (!out.ok) return { ok: false, error: out.error };
      return { ok: true, task, result: { invoice_count: out.data.count, reachable: true } };
    }

    case 'ping_contact_api': {
      if (!isContactApiConfigured()) {
        return { ok: false, error: 'Contact API not configured (CONTACT_API_BASE_URL)' };
      }
      const base = serverEnv('CONTACT_API_BASE_URL')!.replace(/\/+$/, '');
      let res: Response;
      try {
        res = await fetch(`${base}/health`, { headers: { Accept: 'application/json' } });
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      const text = await res.text().catch(() => '');
      return {
        ok: true,
        task,
        result: {
          reachable: res.ok,
          status: res.status,
          body: text.slice(0, 500) || null,
        },
      };
    }

    case 'ping_railway': {
      const out = await railwayPing();
      if (!out.ok) return { ok: false, error: out.error };
      return { ok: true, task, result: out };
    }

    case 'list_railway_domains': {
      const out = await railwayListProjectNetworking();
      if (!out.ok) return { ok: false, error: out.error };
      return { ok: true, task, result: out.data };
    }

    case 'ping_kinsta': {
      const out = await kinstaPing();
      if (!out.ok) return { ok: false, error: out.error };
      return { ok: true, task, result: out };
    }

    case 'list_kinsta_sites': {
      const out = await kinstaListSites({ includeEnvironments: true });
      if (!out.ok) return { ok: false, error: out.error };
      return { ok: true, task, result: out };
    }

    case 'list_knowledge_slugs':
      return { ok: true, task, result: { slugs: listKnowledgeSlugs() } };

    case 'ping_booking': {
      if (!isBookingConfigured()) {
        return { ok: false, error: 'Booking API not configured (BOOKING_API_URL)' };
      }
      const out = await bookingPing();
      if (!out.ok) return { ok: false, error: out.error };
      return { ok: true, task, result: out.data };
    }

    case 'ping_cloudflare': {
      if (!isCloudflareConfigured()) {
        return { ok: false, error: 'Cloudflare not configured (CLOUDFLARE_API_TOKEN)' };
      }
      const out = await cloudflareVerifyToken();
      if (!out.ok) return { ok: false, error: out.error };
      return { ok: true, task, result: { token_status: out.data.status, id: out.data.id } };
    }

    case 'sync_resend_dns': {
      if (!isResendDnsSyncConfigured()) {
        return {
          ok: false,
          error: 'Need CLOUDFLARE_API_TOKEN and RESEND_API_KEY for Resend → Cloudflare DNS sync',
        };
      }
      const brand = await getCompanyBrandContext();
      const domain = brand.domain;
      if (!domain) {
        return { ok: false, error: 'Company domain is not configured (admin → Profile → Company details)' };
      }
      const out = await syncResendDnsToCloudflare(domain);
      if (!out.ok) return { ok: false, error: out.error };
      return { ok: true, task, result: { ...out, summary: out.summary } };
    }

    default: {
      const _exhaustive: never = task;
      return { ok: false, error: `unknown task ${_exhaustive}` };
    }
  }
}
