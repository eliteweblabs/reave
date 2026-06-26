/**
 * Supabase-backed dashboard chat threads (web agent, Clerk user scoped).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from './serverEnv';
import type { TelegramChatTurn } from './telegramChatHistory';

export interface ChatThreadSummary {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ChatThreadDetail extends ChatThreadSummary {
  messages: ChatMessage[];
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

export function isSupabaseChatsConfigured(): boolean {
  return !!(serverEnv('SUPABASE_URL') && serverEnv('SUPABASE_SERVICE_ROLE_KEY'));
}

export function titleFromMessage(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (!oneLine) return 'New chat';
  return oneLine.length > 60 ? `${oneLine.slice(0, 57)}…` : oneLine;
}

export async function dbListChatThreads(userId: string): Promise<ChatThreadSummary[] | null> {
  const client = getClient();
  if (!client) return null;

  const { data, error } = await client
    .from('chat_threads')
    .select('id, title, updated_at, created_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[chats:db] list error:', error.message);
    return null;
  }
  return (data ?? []) as ChatThreadSummary[];
}

export async function dbCreateChatThread(userId: string): Promise<ChatThreadSummary | null> {
  const client = getClient();
  if (!client) return null;

  const { data, error } = await client
    .from('chat_threads')
    .insert({ user_id: userId, title: 'New chat' })
    .select('id, title, updated_at, created_at')
    .single();

  if (error) {
    console.error('[chats:db] create error:', error.message);
    return null;
  }
  return data as ChatThreadSummary;
}

export async function dbGetChatThread(
  userId: string,
  threadId: string
): Promise<ChatThreadDetail | null> {
  const client = getClient();
  if (!client) return null;

  const { data: thread, error: threadErr } = await client
    .from('chat_threads')
    .select('id, title, updated_at, created_at')
    .eq('id', threadId)
    .eq('user_id', userId)
    .single();

  if (threadErr) {
    if (threadErr.code !== 'PGRST116') {
      console.error('[chats:db] get thread error:', threadErr.message);
    }
    return null;
  }

  const { data: messages, error: msgErr } = await client
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (msgErr) {
    console.error('[chats:db] get messages error:', msgErr.message);
    return null;
  }

  return {
    ...(thread as ChatThreadSummary),
    messages: (messages ?? []) as ChatMessage[],
  };
}

export async function dbAppendChatMessages(
  threadId: string,
  turns: TelegramChatTurn[]
): Promise<boolean> {
  const client = getClient();
  if (!client || !turns.length) return false;

  const rows = turns.map((t) => ({
    thread_id: threadId,
    role: t.role,
    content: t.content,
  }));

  const { error } = await client.from('chat_messages').insert(rows);
  if (error) {
    console.error('[chats:db] append error:', error.message);
    return false;
  }

  const { error: touchErr } = await client
    .from('chat_threads')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', threadId);

  if (touchErr) {
    console.error('[chats:db] touch thread error:', touchErr.message);
  }
  return true;
}

export async function dbUpdateChatTitle(threadId: string, title: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;

  const { error } = await client.from('chat_threads').update({ title }).eq('id', threadId);
  if (error) {
    console.error('[chats:db] title update error:', error.message);
    return false;
  }
  return true;
}

export async function dbDeleteChatThread(userId: string, threadId: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;

  const { data, error } = await client
    .from('chat_threads')
    .delete()
    .eq('id', threadId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[chats:db] delete error:', error.message);
    return false;
  }
  return !!data;
}
