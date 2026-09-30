/** Public preview URL for /card demo tiles (<img src>). Server resolves OG in /api/card/demo-preview. */
export function cardDemoPreviewProxyUrl(siteUrl: string): string {
  return `/api/card/demo-preview?url=${encodeURIComponent(siteUrl)}`;
}
