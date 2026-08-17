/**
 * Bidirectional links between work/projects and inbox emails or dashboard chats.
 */

import pg from 'pg';
import { databaseUrl, getPgPool } from './pgPool';
import { getAgentContext } from './agentContext';
import { storeGetChatSummaryById } from './chatStore';
import { patchWorkSourceChatId, storeReadWork, listJobsBySourceChatId } from './workStore';
import { serverEnv } from './serverEnv';

export type ProjectLinkType = 'email' | 'chat';

export interface LinkedEmailSummary {
  id: string;
  subject: string;
  from: string;
  receivedAt: string;
  summary: string;
}

export interface LinkedChatSummary {
  id: string;
  title: string;
  updatedAt: string;
  /** Present when the thread was removed but the project still references it. */
  deleted?: boolean;
}

export interface LinkedJobSummary {
  slug: string;
  title: string;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS project_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_slug    TEXT NOT NULL,
  link_type   TEXT NOT NULL CHECK (link_type IN ('email', 'chat')),
  link_id     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_slug, link_type, link_id)
);
CREATE INDEX IF NOT EXISTS project_links_job_idx ON project_links (job_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS project_links_item_idx ON project_links (link_type, link_id);
`;

let _schemaReady: Promise<void> | null = null;

async function ensureSchema(): Promise<pg.Pool | null> {
  const pool = getPgPool();
  if (!pool) return null;
  if (!_schemaReady) {
    _schemaReady = pool
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((e) => {
        _schemaReady = null;
        throw e;
      });
  }
  await _schemaReady;
  return pool;
}

export function isProjectLinksConfigured(): boolean {
  return !!databaseUrl();
}

async function jobTitle(slug: string): Promise<string> {
  const doc = await storeReadWork(slug);
  return doc?.title ?? slug;
}

async function jobTitlesBatch(slugs: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(slugs.map((s) => s.trim()).filter(Boolean))];
  const titles = new Map<string, string>();
  if (!unique.length) return titles;

  const pool = await ensureSchema();
  if (!pool) {
    for (const slug of unique) {
      titles.set(slug, await jobTitle(slug));
    }
    return titles;
  }

  const { rows } = await pool.query<{ slug: string; title: string }>(
    `SELECT slug, title FROM jobs WHERE slug = ANY($1::text[])`,
    [unique],
  );
  for (const row of rows) titles.set(row.slug, row.title);
  for (const slug of unique) {
    if (!titles.has(slug)) titles.set(slug, slug);
  }
  return titles;
}

export async function unlinkAllProjectItems(jobSlug: string): Promise<number> {
  const slug = jobSlug.trim();
  if (!slug) return 0;
  try {
    const pool = await ensureSchema();
    if (!pool) return 0;
    const { rowCount } = await pool.query(`DELETE FROM project_links WHERE job_slug = $1`, [slug]);
    return rowCount ?? 0;
  } catch (e) {
    console.error('[project-links] unlink-all failed', e);
    return 0;
  }
}

export async function unlinkProjectItem(
  jobSlug: string,
  linkType: ProjectLinkType,
  linkId: string,
): Promise<boolean> {
  if (!jobSlug?.trim() || !linkId?.trim()) return false;
  try {
    const pool = await ensureSchema();
    if (!pool) return false;
    await pool.query(
      `DELETE FROM project_links WHERE job_slug = $1 AND link_type = $2 AND link_id = $3`,
      [jobSlug.trim(), linkType, linkId.trim()],
    );
    return true;
  } catch (e) {
    console.error('[project-links] unlink failed', e);
    return false;
  }
}

export async function linkProjectItem(
  jobSlug: string,
  linkType: ProjectLinkType,
  linkId: string,
): Promise<boolean> {
  if (!jobSlug?.trim() || !linkId?.trim()) return false;
  try {
    const pool = await ensureSchema();
    if (!pool) return false;
    await pool.query(
      `INSERT INTO project_links (job_slug, link_type, link_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (job_slug, link_type, link_id) DO NOTHING`,
      [jobSlug.trim(), linkType, linkId.trim()],
    );
    return true;
  } catch (e) {
    console.error('[project-links] link failed', e);
    return false;
  }
}

export async function listJobsForItem(
  linkType: ProjectLinkType,
  linkId: string,
): Promise<LinkedJobSummary[]> {
  if (!linkId?.trim()) return [];
  try {
    const pool = await ensureSchema();
    if (!pool) {
      if (linkType === 'chat') {
        const fromSource = await listJobsBySourceChatId(linkId.trim());
        return fromSource.map((job) => ({ slug: job.slug, title: job.title }));
      }
      return [];
    }
    const { rows } = await pool.query<{ job_slug: string }>(
      `SELECT job_slug FROM project_links
       WHERE link_type = $1 AND link_id = $2
       ORDER BY created_at DESC`,
      [linkType, linkId.trim()],
    );
    const out: LinkedJobSummary[] = [];
    for (const row of rows) {
      out.push({ slug: row.job_slug, title: await jobTitle(row.job_slug) });
    }
    if (linkType === 'chat') {
      const fromSource = await listJobsBySourceChatId(linkId.trim());
      for (const job of fromSource) {
        if (!out.some((j) => j.slug === job.slug)) {
          out.push({ slug: job.slug, title: job.title });
        }
      }
    }
    return out;
  } catch (e) {
    console.error('[project-links] list jobs for item failed', e);
    return [];
  }
}

export async function listJobsForItems(
  linkType: ProjectLinkType,
  linkIds: string[],
): Promise<Map<string, LinkedJobSummary[]>> {
  const out = new Map<string, LinkedJobSummary[]>();
  const ids = [...new Set(linkIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return out;
  try {
    const pool = await ensureSchema();
    if (!pool) {
      if (linkType === 'chat') {
        for (const id of ids) {
          const fromSource = await listJobsBySourceChatId(id);
          if (fromSource.length) {
            out.set(
              id,
              fromSource.map((job) => ({ slug: job.slug, title: job.title })),
            );
          }
        }
      }
      return out;
    }
    const { rows } = await pool.query<{ job_slug: string; link_id: string }>(
      `SELECT job_slug, link_id FROM project_links
       WHERE link_type = $1 AND link_id = ANY($2::text[])
       ORDER BY created_at DESC`,
      [linkType, ids],
    );
    const titleCache = await jobTitlesBatch(rows.map((row) => row.job_slug));
    for (const row of rows) {
      const title = titleCache.get(row.job_slug) ?? row.job_slug;
      const list = out.get(row.link_id) ?? [];
      list.push({ slug: row.job_slug, title });
      out.set(row.link_id, list);
    }
    if (linkType === 'chat') {
      for (const id of ids) {
        const fromSource = await listJobsBySourceChatId(id);
        const list = out.get(id) ?? [];
        for (const job of fromSource) {
          if (!list.some((j) => j.slug === job.slug)) {
            list.push({ slug: job.slug, title: job.title });
          }
        }
        if (list.length) out.set(id, list);
      }
    }
    return out;
  } catch (e) {
    console.error('[project-links] batch list jobs failed', e);
    return out;
  }
}

export async function listRelatedForJob(jobSlug: string): Promise<{
  emails: LinkedEmailSummary[];
  chats: LinkedChatSummary[];
}> {
  const slug = jobSlug.trim();
  if (!slug) return { emails: [], chats: [] };

  const emails: LinkedEmailSummary[] = [];
  const chats: LinkedChatSummary[] = [];

  try {
    const pool = await ensureSchema();
    if (pool) {
      const { rows: emailRows } = await pool.query<{
        id: string;
        subject: string;
        from_address: string;
        received_at: string;
        summary: string;
      }>(
        `SELECT DISTINCT e.id, e.subject, e.from_address, e.received_at, e.summary
         FROM email_inbox e
         WHERE e.job_slug = $1
            OR e.id IN (
              SELECT link_id FROM project_links
              WHERE job_slug = $1 AND link_type = 'email'
            )
         ORDER BY e.received_at DESC
         LIMIT 50`,
        [slug],
      );
      for (const row of emailRows) {
        emails.push({
          id: row.id,
          subject: row.subject || '(no subject)',
          from: row.from_address || '',
          receivedAt: row.received_at,
          summary: row.summary || '',
        });
      }

      const { rows: chatRows } = await pool.query<{
        id: string;
        title: string;
        updated_at: string;
      }>(
        `SELECT c.id, c.title, c.updated_at
         FROM chat_threads c
         INNER JOIN project_links pl ON pl.link_id = c.id::text AND pl.link_type = 'chat'
         WHERE pl.job_slug = $1
         ORDER BY c.updated_at DESC
         LIMIT 50`,
        [slug],
      );
      for (const row of chatRows) {
        chats.push({
          id: row.id,
          title: row.title || 'Session',
          updatedAt: row.updated_at,
        });
      }
    }
  } catch (e) {
    console.error('[project-links] list related for job failed', e);
  }

  const doc = await storeReadWork(slug);
  const sourceChatId = doc?.source_chat_id?.trim();
  if (sourceChatId && !chats.some((c) => c.id === sourceChatId)) {
    const summary = await storeGetChatSummaryById(sourceChatId);
    if (summary) {
      chats.unshift({
        id: sourceChatId,
        title: summary.title || 'Session',
        updatedAt: summary.updatedAt || doc?.updated || doc?.created || '',
      });
    } else {
      chats.unshift({
        id: sourceChatId,
        title: 'Session deleted',
        updatedAt: '',
        deleted: true,
      });
    }
  }

  return { emails, chats };
}

export async function assignEmailToJob(
  emailId: string,
  jobSlug: string,
  jobTitleText?: string | null,
): Promise<boolean> {
  const slug = jobSlug.trim();
  const id = emailId.trim();
  if (!slug || !id) return false;

  const title = jobTitleText?.trim() || (await jobTitle(slug));

  try {
    const pool = await ensureSchema();
    if (!pool) return false;
    await pool.query(
      `UPDATE email_inbox SET job_slug = $1, job_title = $2 WHERE id = $3`,
      [slug, title, id],
    );
    await linkProjectItem(slug, 'email', id);
    return true;
  } catch (e) {
    console.error('[project-links] assign email to job failed', e);
    return false;
  }
}

export async function linkWorkFromAgentContext(jobSlug: string): Promise<{
  chatLinked: boolean;
  emailLinked: boolean;
}> {
  const ctx = getAgentContext();
  const slug = jobSlug.trim();
  const out = { chatLinked: false, emailLinked: false };
  if (!slug) return out;

  if (ctx.threadId) {
    out.chatLinked = await linkProjectItem(slug, 'chat', ctx.threadId);
    await patchWorkSourceChatId(slug, ctx.threadId);
  }
  const emailId = ctx.emailId?.trim();
  if (emailId) {
    out.emailLinked = await assignEmailToJob(emailId, slug);
  }
  return out;
}
