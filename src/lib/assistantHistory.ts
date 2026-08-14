export type AssistantHistoryTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export function parseAssistantHistory<T extends AssistantHistoryTurn>(
  raw: unknown,
  maxTurns: number,
  maxChars: number,
): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const item of raw.slice(-maxTurns)) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const role = rec.role === 'assistant' ? 'assistant' : rec.role === 'user' ? 'user' : null;
    const content = typeof rec.content === 'string' ? rec.content.trim() : '';
    if (!role || !content) continue;
    out.push({ role, content: content.slice(0, maxChars) } as T);
  }
  return out;
}
