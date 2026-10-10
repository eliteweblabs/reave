/**
 * Cache-Control for Railway's edge CDN (+ Cloudflare in front on many installs).
 * HTML is only cached when the response is anonymous (no Set-Cookie) and on an
 * allowlisted public marketing path.
 */

/** Browser revalidate often; edge holds 5m and may serve stale up to 24h while refreshing. */
export const PUBLIC_HTML_EDGE_CACHE =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=86400";

/** Hashed Astro assets and versioned public scripts. */
export const PUBLIC_STATIC_IMMUTABLE = "public, max-age=31536000, immutable";

/** Marketing images and unversioned public files. */
export const PUBLIC_STATIC_STANDARD =
  "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800";

const STATIC_EXT = /\.(avif|webp|png|jpe?g|gif|svg|ico|woff2?|css|js|map|json|txt|xml|pdf|wasm)$/i;

/** Public marketing HTML we allow the CDN to cache for signed-out visitors. */
const HTML_EDGE_CACHE_EXACT = new Set([
  "/",
  "/about",
  "/compare",
  "/cookies",
  "/deck",
  "/digital-audit",
  "/features",
  "/features-tight",
  "/grand-opening",
  "/home",
  "/hosting",
  "/modules",
  "/platform",
  "/privacy",
  "/terms",
]);

const HTML_EDGE_CACHE_PREFIX = ["/sites/"];

const HTML_EDGE_CACHE_DENY_PREFIX = [
  "/admin",
  "/api",
  "/c/",
  "/deploy",
  "/demo",
  "/partials/",
  "/grand-opening/checkout",
  "/form/",
  "/go/",
  "/doc/",
  "/sign-in",
  "/sign-up",
];

export function normalizeCachePath(pathname: string): string {
  const path = pathname.split("?")[0]?.split("#")[0] ?? "/";
  return path.replace(/\/$/, "") || "/";
}

export function isPublicHtmlEdgeCachePath(pathname: string): boolean {
  const norm = normalizeCachePath(pathname);
  if (HTML_EDGE_CACHE_DENY_PREFIX.some((p) => norm === p.replace(/\/$/, "") || norm.startsWith(p))) {
    return false;
  }
  if (HTML_EDGE_CACHE_EXACT.has(norm)) return true;
  return HTML_EDGE_CACHE_PREFIX.some((p) => norm.startsWith(p));
}

export function cacheControlForPublicStatic(pathname: string, requestUrl: string): string | null {
  const norm = normalizeCachePath(pathname);
  if (norm.startsWith("/admin/sw.js") || norm === "/c/sw.js") return null;
  if (norm.startsWith("/_astro/")) return PUBLIC_STATIC_IMMUTABLE;
  if (!STATIC_EXT.test(norm)) return null;
  if (requestUrl.includes("?v=") || /-\d+\.(webp|png|jpe?g)$/i.test(norm)) {
    return PUBLIC_STATIC_IMMUTABLE;
  }
  return PUBLIC_STATIC_STANDARD;
}

export function applyPublicHtmlEdgeCache(response: Response, pathname: string, method: string): void {
  if (method !== "GET" && method !== "HEAD") return;
  if (response.status !== 200) return;
  if (response.headers.has("Set-Cookie")) return;
  const type = response.headers.get("Content-Type") ?? "";
  if (!type.includes("text/html")) return;
  if (!isPublicHtmlEdgeCachePath(pathname)) return;
  const existing = response.headers.get("Cache-Control") ?? "";
  if (/no-store|private|must-revalidate/i.test(existing)) return;
  response.headers.set("Cache-Control", PUBLIC_HTML_EDGE_CACHE);
}
