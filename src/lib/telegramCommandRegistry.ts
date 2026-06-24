/**
 * Keep Telegram's native / command picker in sync without requiring a manual
 * register-webhook POST after every deploy.
 */
import { telegramSetMyCommands } from './telegramClient';
import { buildCommandList } from './telegramCommandList';

let lastRegisteredAt = 0;
const MIN_INTERVAL_MS = 5 * 60 * 1000;

export async function ensureTelegramCommandsRegistered(token: string): Promise<void> {
  const now = Date.now();
  if (now - lastRegisteredAt < MIN_INTERVAL_MS) return;

  const commands = buildCommandList();
  const res = await telegramSetMyCommands(token, commands);
  if (res.ok) {
    lastRegisteredAt = now;
    console.info('[telegram] setMyCommands ok', { count: commands.length });
  } else {
    console.warn('[telegram] setMyCommands failed', res.error);
  }
}

/** Force re-register (e.g. /registercommands). */
export async function registerTelegramCommands(
  token: string,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const commands = buildCommandList();
  const res = await telegramSetMyCommands(token, commands);
  if (res.ok) lastRegisteredAt = Date.now();
  return res.ok ? { ok: true, count: commands.length } : { ok: false, count: 0, error: res.error };
}
