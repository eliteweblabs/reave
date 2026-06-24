/**
 * Supabase-backed knowledge store.
 * Uses the service-role key (server-only, never exposed to the browser).
 * All functions return null/error when SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set
 * so callers can fall back to bundled docs gracefully.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from './serverEnv';

export interface KnowledgeEntry {
  id?: string;
  slug: string;
  title: string;
  content: string;
  tags: string[];
  source: string;
  updated_at?: string;
  created_at?: string;
}

export interface KnowledgeSummary {
  slug: string;
  title: string;
  tags: string[];
  updated_at: string;
}

let _client: SupabaseClient | null | undefined = undefined;

function getClient(): SupabaseClient | null {
  if (_client !== undefined) return _client;
  const url = serverEnv('SUPABASE_URL');
  const key = serverEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    _client = null;
    return null;
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export function isSupabaseKnowledgeConfigured(): boolean {
  return !!(serverEnv('SUPABASE_URL') && serverEnv('SUPABASE_SERVICE_ROLE_KEY'));
}

export async function dbListKnowledge(): Promise<KnowledgeSummary[] | null> {
  const client = getClient();
  if (!client) return null;

  const { data, error } = await client
    .from('knowledge_entries')
    .select('slug, title, tags, updated_at')
    .order('slug');

  if (error) {
    console.error('[knowledge:db] list error:', error.message);
    return null;
  }
  return (data ?? []) as KnowledgeSummary[];
}

export async function dbReadKnowledge(slug: string): Promise<KnowledgeEntry | null> {
  const client = getClient();
  if (!client) return null;

  const { data, error } = await client
    .from('knowledge_entries')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    // PGRST116 = no rows found — not a real error
    if (error.code !== 'PGRST116') {
      console.error('[knowledge:db] read error:', error.message);
    }
    return null;
  }
  return data as KnowledgeEntry;
}

export async function dbSearchKnowledge(
  query: string,
): Promise<{ slug: string; title: string; preview: string }[] | null> {
  const client = getClient();
  if (!client) return null;

  // Try full-text search first; fall back to ilike if it errors (e.g. no search_vector column yet)
  const ftsResult = await client
    .from('knowledge_entries')
    .select('slug, title, content')
    .textSearch('search_vector', query, { config: 'english', type: 'websearch' })
    .limit(10);

  if (ftsResult.error) {
    // Fallback: ilike on title + content
    const { data, error } = await client
      .from('knowledge_entries')
      .select('slug, title, content')
      .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
      .limit(10);

    if (error) {
      console.error('[knowledge:db] search error:', error.message);
      return null;
    }
    return buildPreviews(data ?? []);
  }

  return buildPreviews(ftsResult.data ?? []);
}

function buildPreviews(rows: { slug: string; title: string; content: string }[]) {
  return rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    preview: row.content.replace(/\n+/g, ' ').slice(0, 200),
  }));
}

export async function dbWriteKnowledge(
  entry: Omit<KnowledgeEntry, 'id' | 'created_at' | 'updated_at'>,
): Promise<{ ok: boolean; error?: string }> {
  const client = getClient();
  if (!client) return { ok: false, error: 'Supabase not configured' };

  const { error } = await client
    .from('knowledge_entries')
    .upsert(
      { ...entry, updated_at: new Date().toISOString() },
      { onConflict: 'slug' },
    );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function dbDeleteKnowledge(
  slug: string,
): Promise<{ ok: boolean; error?: string }> {
  const client = getClient();
  if (!client) return { ok: false, error: 'Supabase not configured' };

  const { error } = await client.from('knowledge_entries').delete().eq('slug', slug);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
