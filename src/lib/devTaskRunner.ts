/**
 * Sandboxed dev/ops tasks callable from the Telegram assistant.
 * Only allowlisted tasks run — no arbitrary shell commands.
 */
import { isContactApiConfigured } from './contactApi';
import { isCardDavConfigured } from './carddav/auth';
import { isCraterConfigured, craterListInvoices } from './craterClient';
import { isGithubConfigured, githubGetRepoAccess, githubRepoSlug } from './githubClient';
import { listKnowledgeSlugs } from './localKnowledge';
import { serverEnv } from './serverEnv';

export const DEV_TASK_NAMES = [
  'service_status',
  'ping_crater',
  'ping_contact_api',
  'list_knowledge_slugs',
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
          railway: Boolean(serverEnv('RAILWAY_API_TOKEN')?.trim()),
          resend_inbound: Boolean(serverEnv('RESEND_WEBHOOK_SECRET')?.trim()),
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

    case 'list_knowledge_slugs':
      return { ok: true, task, result: { slugs: listKnowledgeSlugs() } };

    default: {
      const _exhaustive: never = task;
      return { ok: false, error: `unknown task ${_exhaustive}` };
    }
  }
}
