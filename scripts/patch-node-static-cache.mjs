/**
 * Postbuild: set Cache-Control on dist/client files served by @astrojs/node/send
 * (those requests never reach src/middleware.ts).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ENTRY = path.resolve('dist/server/entry.mjs');

const NEEDLE =
  'if (normalizedPathname.startsWith(`/${app.manifest.assetsDir}/`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");';

const REPLACEMENT = `if (normalizedPathname.startsWith(\`/\${app.manifest.assetsDir}/\`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
\t\t\t\telse {
\t\t\t\t\tconst __reqUrl = req.url ?? "";
\t\t\t\t\tconst __isSw = normalizedPathname === "/admin/sw.js" || normalizedPathname === "/c/sw.js";
\t\t\t\t\tconst __staticExt = /\\.(avif|webp|png|jpe?g|gif|svg|ico|woff2?|css|js|map|json|txt|xml|pdf|wasm)$/i.test(normalizedPathname);
\t\t\t\t\tif (!__isSw && __staticExt) {
\t\t\t\t\t\tconst __immutable = __reqUrl.includes("?v=") || /-\\d+\\.(webp|png|jpe?g)$/i.test(normalizedPathname);
\t\t\t\t\t\tres.setHeader("Cache-Control", __immutable ? "public, max-age=31536000, immutable" : "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800");
\t\t\t\t\t}
\t\t\t\t}`;

let src = readFileSync(ENTRY, 'utf8');
if (!src.includes(NEEDLE)) {
  if (src.includes('__reqUrl = req.url')) {
    console.log('[patch-node-static-cache] already patched');
    process.exit(0);
  }
  console.error('[patch-node-static-cache] needle not found — Astro node bundle changed');
  process.exit(1);
}
writeFileSync(ENTRY, src.replace(NEEDLE, REPLACEMENT));
console.log('[patch-node-static-cache] applied public static Cache-Control on dist/client sends');
