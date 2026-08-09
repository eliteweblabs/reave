/**
 * Bing Webmaster Tools — placeholder until OAuth/API key wiring ships.
 */
export function isBingWebmasterConfigured(): boolean {
  return false;
}

export function bingWebmasterPlaceholder(tool: string): string {
  return JSON.stringify({
    ok: false,
    error: 'BING_NOT_CONFIGURED',
    tool,
    reason:
      'Bing Webmaster Tools API is stubbed for now. Placeholders exist so playbooks and tool names stay stable; real OAuth/API-key wiring comes later.',
    instruction: 'Skip Bing-specific steps. Do not invent Bing traffic or crawl data.',
  });
}
