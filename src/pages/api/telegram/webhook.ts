import type { APIRoute } from 'astro';
import { handleTelegramTextMessage, handleTelegramCallbackQuery, type TelegramUpdate } from '../../../lib/telegramMessageHandler';
import { ensureTelegramCommandsRegistered } from '../../../lib/telegramCommandRegistry';
import { serverEnv } from '../../../lib/serverEnv';

export const prerender = false;

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      ok: true,
      service: 'telegram-knowledge-webhook',
      time: new Date().toISOString(),
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};

export const POST: APIRoute = async ({ request }) => {
  const secret = serverEnv('TELEGRAM_WEBHOOK_SECRET');
  const token = serverEnv('TELEGRAM_BOT_TOKEN');

  if (!token?.trim()) {
    return new Response(JSON.stringify({ ok: false, error: 'TELEGRAM_BOT_TOKEN not set' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const headerSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '';
  if (!secret?.trim() || headerSecret !== secret) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid secret' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const update = body as TelegramUpdate;

  try {
    await ensureTelegramCommandsRegistered(token);
    if (update.callback_query) {
      await handleTelegramCallbackQuery({ token, update });
    } else {
      await handleTelegramTextMessage({ token, update });
    }
  } catch (e) {
    console.error('[telegram] handler error', e);
    return new Response(JSON.stringify({ ok: false, error: 'handler failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
