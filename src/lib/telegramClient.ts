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
