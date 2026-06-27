/**
 * Pinned deploy-status message in the admin Telegram chat.
 */

import { getDeployPinText } from './deployStatus';
import { getStoredDeployPinMessageId, setStoredDeployPinMessageId } from './deployPinStore';
import {
  telegramEditMessage,
  telegramPinChatMessage,
  telegramSendMessageReturningId,
} from './telegramClient';
import { serverEnv } from './serverEnv';

const lastPinTextByChat = new Map<number, string>();

function deployNotifyChatId(): number | null {
  const raw = serverEnv('TELEGRAM_DEPLOY_NOTIFY_CHAT_ID')?.trim();
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

function envPinMessageId(): number | null {
  const raw = serverEnv('TELEGRAM_DEPLOY_PIN_MESSAGE_ID')?.trim();
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

/** Create or edit the pinned deploy status message (best-effort). */
export async function syncDeployStatusPin(token: string): Promise<void> {
  const chatId = deployNotifyChatId();
  if (chatId == null) return;

  const text = await getDeployPinText();
  if (!text) return;
  if (lastPinTextByChat.get(chatId) === text) return;

  let messageId =
    (await getStoredDeployPinMessageId(chatId)) ?? envPinMessageId() ?? null;

  if (messageId != null) {
    try {
      await telegramEditMessage(token, chatId, messageId, text);
      lastPinTextByChat.set(chatId, text);
      return;
    } catch {
      messageId = null;
    }
  }

  const newId = await telegramSendMessageReturningId(token, chatId, text);
  if (newId == null) return;

  await setStoredDeployPinMessageId(chatId, newId);
  lastPinTextByChat.set(chatId, text);

  try {
    await telegramPinChatMessage(token, chatId, newId);
  } catch (e) {
    console.warn('[telegram] pinChatMessage failed:', e instanceof Error ? e.message : e);
  }
}
