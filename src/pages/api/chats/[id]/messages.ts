import type { APIRoute } from 'astro';
import { db } from '@/lib/quantumCoreOpticalEngine';
import {
  getMessagesForChat,
  getMessagesSince,
  insertMessage,
} from '@/lib/pgMessages';

/**
 * GET /api/chats/[id]/messages
 * Fetch messages for a chat.
 * Query params:
 *   - since?: ISO timestamp — return only messages created after this time (for polling)
 */
export const GET: APIRoute = async ({ params, request }) => {
  try {
    const chatId = params.id;
    if (!chatId) {
      return new Response(JSON.stringify({ error: 'Missing chatId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    const sinceParam = url.searchParams.get('since');

    let messages;
    if (sinceParam) {
      const sinceDate = new Date(sinceParam);
      messages = await getMessagesSince(db, chatId, sinceDate);
    } else {
      messages = await getMessagesForChat(db, chatId);
    }

    return new Response(JSON.stringify({ messages }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch messages' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

/**
 * POST /api/chats/[id]/messages
 * Save a message to the database.
 * Body: { role: 'user' | 'assistant', content: string }
 */
export const POST: APIRoute = async ({ params, request }) => {
  try {
    const chatId = params.id;
    if (!chatId) {
      return new Response(JSON.stringify({ error: 'Missing chatId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { role, content } = body;

    if (!role || !content) {
      return new Response(
        JSON.stringify({ error: 'Missing role or content' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const message = await insertMessage(db, chatId, role, content);

    return new Response(JSON.stringify({ message }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error saving message:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to save message' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
