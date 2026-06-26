import type { APIRoute } from 'astro';
import { telegramSetWebhook, telegramGetWebhookInfo } from '../../../lib/telegramClient';
import { siteBaseUrl } from '../../../lib/contactApi';
import { serverEnv } from '../../../lib/serverEnv';
import { registerTelegramCommands } from '../../../lib/telegramCommandRegistry';

export const prerender = false;

/**
 * Telegram webhook (re)registration.
 *
 * GET  /api/telegram/register-webhook?secret=<TELEGRAM_WEBHOOK_SECRET>
 *   → returns the current getWebhookInfo (url, allowed_updates, pending_update_count,
 *     last_error_message). Use this to confirm `callback_query` is in allowed_updates.
 *
 * POST /api/telegram/register-webhook?secret=<TELEGRAM_WEBHOOK_SECRET>
 *   → calls setWebhook with allowed_updates = ['message', 'callback_query'] so inline
 *     keyboard button taps (callback_query) are delivered to /api/telegram/webhook.
 *
 * Gated with the same webhook secret to avoid public access.
 */
export const GET: APIRoute = async ({ url }) => {
  const secret = serverEnv('TELEGRAM_WEBHOOK_SECRET');
  const token = serverEnv('TELEGRAM_BOT_TOKEN');

  if (!token?.trim()) return json({ ok: false, error: 'TELEGRAM_BOT_TOKEN not set' }, 503);
  if (!secret?.trim()) return json({ ok: false, error: 'TELEGRAM_WEBHOOK_SECRET not set' }, 503);
  if ((url.searchParams.get('secret') ?? '') !== secret) {
    return json({ ok: false, error: 'invalid secret' }, 401);
  }

  const res = await telegramGetWebhookInfo(token);
  if (!res.ok) return json({ ok: false, error: res.error }, 502);
  return json({ ok: true, info: res.info });
};

export const POST: APIRoute = async ({ url, request }) => {
  const secret = serverEnv('TELEGRAM_WEBHOOK_SECRET');
  const token = serverEnv('TELEGRAM_BOT_TOKEN');

  if (!token?.trim()) return json({ ok: false, error: 'TELEGRAM_BOT_TOKEN not set' }, 503);
  if (!secret?.trim()) return json({ ok: false, error: 'TELEGRAM_WEBHOOK_SECRET not set' }, 503);
  if ((url.searchParams.get('secret') ?? '') !== secret) {
    return json({ ok: false, error: 'invalid secret' }, 401);
  }

  const webhookUrl = `${siteBaseUrl(request)}/api/telegram/webhook`;
  const res = await telegramSetWebhook(token, webhookUrl, secret);
  if (!res.ok) return json({ ok: false, error: res.error }, 502);

  // Register the command list in the same step so the / picker is always
  // current after a deploy — no separate /registercommands needed.
  const cmdRes = await registerTelegramCommands(token);

  const info = await telegramGetWebhookInfo(token);
  return json({
    ok: true,
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query'],
    commands_registered: cmdRes.ok ? cmdRes.count : 0,
    commands_error: cmdRes.ok ? undefined : cmdRes.error,
    info: info.info,
  });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
