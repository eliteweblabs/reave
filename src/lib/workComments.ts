/**
 * Client-visible comments on work/jobs (portal thread per job).
 * Postgres when DATABASE_URL is set; otherwise JSON files under WORK_DIR/.comments/.
 */

import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { isSafeWorkSlug, isWorkDbConfigured, workDir } from './workStore';

export type WorkCommentAuthor = 'client' | 'staff';

export interface WorkJobComment {
  id: string;
  slug: string;
  author: WorkCommentAuthor;
  authorName: string;
  text: string;
  createdAt: string;
}

const MAX_COMMENT_LENGTH = 4000;

function commentsDir(): string {
  const dir = join(workDir(), '.comments');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function commentFilePath(slug: string): string {
  return join(commentsDir(), `${slug}.json`);
}

function normalizeComment(raw: unknown, slug: string): WorkJobComment | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const text = typeof o.text === 'string' ? o.text.trim() : '';
  if (!text) return null;
  const author = o.author === 'staff' ? 'staff' : 'client';
  return {
    id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : randomUUID(),
    slug,
    author,
    authorName: typeof o.authorName === 'string' ? o.authorName.trim() : author === 'client' ? 'Client' : 'Team',
    text,
    createdAt:
      typeof o.createdAt === 'string' && o.createdAt.trim()
        ? o.createdAt.trim()
        : new Date().toISOString(),
  };
}

function fileListComments(slug: string): WorkJobComment[] {
  if (!isSafeWorkSlug(slug)) return [];
  const path = commentFilePath(slug);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => normalizeComment(row, slug))
      .filter((c): c is WorkJobComment => !!c)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

function fileAddComment(
  slug: string,
  input: { author: WorkCommentAuthor; authorName: string; text: string },
): { ok: true; comment: WorkJobComment } | { ok: false; error: string } {
  if (!isSafeWorkSlug(slug)) return { ok: false, error: 'Invalid slug' };
  const text = input.text.trim();
  if (!text) return { ok: false, error: 'Comment is required' };
  if (text.length > MAX_COMMENT_LENGTH) {
    return { ok: false, error: `Comment must be ${MAX_COMMENT_LENGTH} characters or less` };
  }

  const comment: WorkJobComment = {
    id: randomUUID(),
    slug,
    author: input.author,
    authorName: input.authorName.trim() || (input.author === 'client' ? 'Client' : 'Team'),
    text,
    createdAt: new Date().toISOString(),
  };

  const existing = fileListComments(slug);
  existing.push(comment);
  writeFileSync(commentFilePath(slug), `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
  return { ok: true, comment };
}

export async function storeListWorkComments(slug: string): Promise<WorkJobComment[]> {
  if (isWorkDbConfigured()) {
    const { dbListJobComments } = await import('./pgJobs');
    const rows = await dbListJobComments(slug);
    if (rows) return rows;
  }
  return fileListComments(slug);
}

export async function storeListWorkCommentsForSlugs(
  slugs: string[],
): Promise<Record<string, WorkJobComment[]>> {
  const safe = slugs.filter(isSafeWorkSlug);
  const out: Record<string, WorkJobComment[]> = {};
  for (const slug of safe) out[slug] = [];

  if (!safe.length) return out;

  if (isWorkDbConfigured()) {
    const { dbListJobCommentsForSlugs } = await import('./pgJobs');
    const map = await dbListJobCommentsForSlugs(safe);
    if (map) return { ...out, ...map };
  }

  for (const slug of safe) {
    out[slug] = fileListComments(slug);
  }
  return out;
}

export async function storeAddWorkComment(
  slug: string,
  input: { author: WorkCommentAuthor; authorName: string; text: string },
): Promise<{ ok: true; comment: WorkJobComment } | { ok: false; error: string }> {
  const text = input.text.trim();
  if (!text) return { ok: false, error: 'Comment is required' };
  if (text.length > MAX_COMMENT_LENGTH) {
    return { ok: false, error: `Comment must be ${MAX_COMMENT_LENGTH} characters or less` };
  }
  if (!isSafeWorkSlug(slug)) return { ok: false, error: 'Invalid slug' };

  if (isWorkDbConfigured()) {
    const { dbAddJobComment } = await import('./pgJobs');
    const result = await dbAddJobComment(slug, input);
    if (result) return result;
  }
  return fileAddComment(slug, input);
}
