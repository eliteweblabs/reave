const TELEGRAM_API = 'https://api.telegram.org';

/**
 * An inline keyboard button. Fires a callback (`data`), opens a link (`url`),
 * or, when `copy` is set, copies that text to the user's clipboard on tap
 * (Telegram Bot API 8.0+ `copy_text` button — no callback round-trip needed).
 */
export type MenuButton = { text: string; data?: string; copy?: string; url?: string };

function toInlineButton(btn: MenuButton): Record<string, unknown> {
  if (btn.copy != null) return { text: btn.text, copy_text: { text: btn.copy } };
  if (btn.url != null) return { text: btn.text, url: btn.url };
  return { text: btn.text, callback_data: btn.data };
}

export async function telegramSendMessage(
  token: string,
  chatId: number,
  text: string
): Promise<void> {
  const max = 3900;
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += max) {
    chunks.push(text.slice(i, i + max));
  }
  if (chunks.length === 0) chunks.push('(empty)');

  for (const chunk of chunks) {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Telegram sendMessage failed: ${res.status} ${errText}`);
    }
  }
}

/**
 * Send a message with an inline keyboard.
 * `buttons` is an array of rows; each row is an array of { text, data } buttons.
 */
export async function telegramSendMenu(
  token: string,
  chatId: number,
  text: string,
  buttons: Array<Array<MenuButton>>
): Promise<void> {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: buttons.map((row) => row.map(toInlineButton)),
      },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Telegram sendMenu failed: ${res.status} ${errText}`);
  }
}

/**
 * Edit an existing bot message in-place (text + inline keyboard).
 * Use this from callback handlers so the visible message updates immediately
 * instead of a new message appearing that the user might not notice.
 */
export async function telegramEditMessage(
  token: string,
  chatId: number,
  messageId: number,
  text: string,
  buttons?: Array<Array<MenuButton>>
): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
  };
  if (buttons) {
    body.reply_markup = {
      inline_keyboard: buttons.map((row) => row.map(toInlineButton)),
    };
  }
  const res = await fetch(`${TELEGRAM_API}/bot${token}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Telegram editMessageText failed: ${res.status} ${errText}`);
  }
}

/** Acknowledge a callback_query so Telegram removes the loading spinner. */
export async function telegramAnswerCallback(
  token: string,
  callbackQueryId: string
): Promise<void> {
  await fetch(`${TELEGRAM_API}/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
}

/**
 * (Re)register the webhook so Telegram delivers the update types we handle.
 * Crucially includes `callback_query` so inline-keyboard button taps reach us.
 */
export async function telegramSetWebhook(
  token: string,
  url: string,
  secretToken: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      secret_token: secretToken,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    }),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) return { ok: false, error: `${res.status} ${text}` };
  return { ok: true };
}

/** Fetch the current webhook configuration (url, allowed_updates, pending count, last error). */
export async function telegramGetWebhookInfo(
  token: string
): Promise<{ ok: boolean; info?: unknown; error?: string }> {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/getWebhookInfo`);
  const text = await res.text().catch(() => '');
  if (!res.ok) return { ok: false, error: `${res.status} ${text}` };
  try {
    const json = JSON.parse(text) as { result?: unknown };
    return { ok: true, info: json.result };
  } catch {
    return { ok: false, error: 'could not parse getWebhookInfo response' };
  }
}

export type BotCommand = { command: string; description: string };

/**
 * Register the bot's slash command list with Telegram.
 * Commands appear in the native / picker in the order given.
 * Descriptions are limited to 256 chars; command names must be lowercase a-z 0-9 _.
 */
export async function telegramSetMyCommands(
  token: string,
  commands: BotCommand[]
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { ok: false, error: `${res.status} ${errText}` };
  }
  return { ok: true };
}
