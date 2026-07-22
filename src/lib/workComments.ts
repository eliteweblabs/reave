/**
 * Client-visible comments on work/jobs (portal thread per job).
 * Postgres when DATABASE_URL is set; otherwise JSON files under WORK_DIR/.comments/.
 */

import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
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
  /** When staff dismissed or viewed the comment in admin. */
  staffAckAt?: string | null;
}

export type PendingWorkComment = WorkJobComment & { jobTitle: string };

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
  const staffAckAt =
    typeof o.staffAckAt === 'string' && o.staffAckAt.trim() ? o.staffAckAt.trim() : null;
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
    staffAckAt,
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

  const now = new Date().toISOString();
  const comment: WorkJobComment = {
    id: randomUUID(),
    slug,
    author: input.author,
    authorName: input.authorName.trim() || (input.author === 'client' ? 'Client' : 'Team'),
    text,
    createdAt: now,
    staffAckAt: input.author === 'staff' ? now : null,
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
    if (result) {
      if (result.ok && input.author === 'client') {
        void import('./workCommentNotify').then(({ notifyProjectCommentPosted }) =>
          notifyProjectCommentPosted(slug, result.comment),
        );
      }
      return result;
    }
  }
  const fileResult = fileAddComment(slug, input);
  if (fileResult.ok && input.author === 'client') {
    void import('./workCommentNotify').then(({ notifyProjectCommentPosted }) =>
      notifyProjectCommentPosted(slug, fileResult.comment),
    );
  }
  return fileResult;
}

function isPendingWorkComment(comment: WorkJobComment): boolean {
  return comment.author === 'client' && !comment.staffAckAt;
}

async function enrichPendingComments(
  comments: WorkJobComment[],
): Promise<PendingWorkComment[]> {
  const pending = comments.filter(isPendingWorkComment);
  if (!pending.length) return [];

  const { storeReadWork } = await import('./workStore');
  const out: PendingWorkComment[] = [];
  for (const comment of pending) {
    const job = await storeReadWork(comment.slug);
    out.push({
      ...comment,
      jobTitle: job?.title || comment.slug,
    });
  }
  return out;
}

function fileListAllComments(): WorkJobComment[] {
  const dir = commentsDir();
  if (!existsSync(dir)) return [];
  const slugs = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -5));
  const out: WorkJobComment[] = [];
  for (const slug of slugs) {
    out.push(...fileListComments(slug));
  }
  return out;
}

export async function storeListPendingWorkComments(): Promise<PendingWorkComment[]> {
  if (isWorkDbConfigured()) {
    const { dbListPendingJobComments } = await import('./pgJobs');
    const rows = await dbListPendingJobComments();
    if (rows) return rows;
  }
  return enrichPendingComments(fileListAllComments());
}

export async function storeAckWorkComment(
  commentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = commentId.trim();
  if (!id) return { ok: false, error: 'Invalid comment id' };

  if (isWorkDbConfigured()) {
    const { dbAckJobComment } = await import('./pgJobs');
    const result = await dbAckJobComment(id);
    if (result) return result;
  }

  const dir = commentsDir();
  if (!existsSync(dir)) return { ok: false, error: 'Not found' };
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const slug = name.slice(0, -5);
    if (!isSafeWorkSlug(slug)) continue;
    const comments = fileListComments(slug);
    const idx = comments.findIndex((c) => c.id === id);
    if (idx === -1) continue;
    comments[idx] = { ...comments[idx], staffAckAt: new Date().toISOString() };
    writeFileSync(commentFilePath(slug), `${JSON.stringify(comments, null, 2)}\n`, 'utf8');
    return { ok: true };
  }
  return { ok: false, error: 'Not found' };
}

export async function storeAckWorkCommentsForSlug(
  slug: string,
): Promise<{ ok: true; acked: number } | { ok: false; error: string }> {
  if (!isSafeWorkSlug(slug)) return { ok: false, error: 'Invalid slug' };

  if (isWorkDbConfigured()) {
    const { dbAckJobCommentsForSlug } = await import('./pgJobs');
    const result = await dbAckJobCommentsForSlug(slug);
    if (result) return result;
  }

  const comments = fileListComments(slug);
  const now = new Date().toISOString();
  let acked = 0;
  for (const comment of comments) {
    if (isPendingWorkComment(comment)) {
      comment.staffAckAt = now;
      acked += 1;
    }
  }
  if (acked > 0) {
    writeFileSync(commentFilePath(slug), `${JSON.stringify(comments, null, 2)}\n`, 'utf8');
  }
  return { ok: true, acked };
}
