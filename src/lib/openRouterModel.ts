/**
 * Map internal Claude model ids to OpenRouter slugs for the Anthropic Messages API.
 * OpenRouter expects `anthropic/claude-sonnet-4.6` while we store `claude-sonnet-4-6`.
 */
export function toOpenRouterModelId(model: string): string {
  const t = model.trim();
  if (!t || t.includes('/')) return t;

  const dotted = t.match(/^claude-([a-z0-9]+)-(\d+)-(\d+)$/i);
  if (dotted) {
    return `anthropic/claude-${dotted[1]}-${dotted[2]}.${dotted[3]}`;
  }

  const plain = t.match(/^claude-(.+)$/i);
  if (plain) return `anthropic/claude-${plain[1]}`;

  return t;
}
