import type { APIRoute } from 'astro';
import { telegramSetMyCommands } from '../../../lib/telegramClient';
import { buildCommandList } from '../../../lib/telegramCommandList';
import { serverEnv } from '../../../lib/serverEnv';

export const prerender = false;

/**
 * GET /api/telegram/register-commands?secret=<TELEGRAM_WEBHOOK_SECRET>
 *
 * Pushes the command list to Telegram via setMyCommands so the native / picker
 * shows them in the correct order (business first, Claude last).
 * Gate with the same webhook secret to avoid public access.
 */
export const GET: APIRoute = async ({ url }) => {
  const secret = serverEnv('TELEGRAM_WEBHOOK_SECRET');
  const token = serverEnv('TELEGRAM_BOT_TOKEN');

  if (!token?.trim()) {
    return json({ ok: false, error: 'TELEGRAM_BOT_TOKEN not set' }, 503);
  }
  if (!secret?.trim()) {
    return json({ ok: false, error: 'TELEGRAM_WEBHOOK_SECRET not set' }, 503);
  }

  const provided = url.searchParams.get('secret') ?? '';
  if (provided !== secret) {
    return json({ ok: false, error: 'invalid secret' }, 401);
  }

  const commands = buildCommandList();
  const res = await telegramSetMyCommands(token, commands);

  if (!res.ok) {
    return json({ ok: false, error: res.error }, 502);
  }

  return json({ ok: true, registered: commands.length, commands });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
