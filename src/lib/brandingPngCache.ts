/** In-process cache for rasterized branding PNGs (Sharp). Survives warm Railway instances. */

const MAX_ENTRIES = 48;
const cache = new Map<string, Buffer>();

export function getCachedBrandingPng(key: string): Buffer | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

export function setCachedBrandingPng(key: string, body: Buffer): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, body);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function clearBrandingPngCache(): void {
  cache.clear();
}
