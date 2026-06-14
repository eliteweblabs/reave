const TELEGRAM_API = 'https://api.telegram.org';

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
  buttons: Array<Array<{ text: string; data: string }>>
): Promise<void> {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: buttons.map((row) =>
          row.map((btn) => ({ text: btn.text, callback_data: btn.data }))
        ),
      },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Telegram sendMenu failed: ${res.status} ${errText}`);
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
