/**
 * Postbuild: stamp the deploy's cache-busting token onto every module specifier
 * inside the scripts we ship from `public/`.
 *
 * Astro emits those files to `dist/client` verbatim, and the node adapter serves
 * them before middleware, so they carry no `Cache-Control` and Cloudflare applies
 * its default four-hour browser TTL. Bumping `?v=` by hand across ~100 import
 * sites is what kept letting stale admin modules survive a deploy, so do it here
 * instead. `astro.config.mjs` stamps the same token into the HTML script URLs.
 *
 * Only module specifiers are touched — a quoted relative or root-absolute `.js`
 * path — so nothing else in the bundle can be caught by accident.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { publicAssetVersion } from './asset-version.mjs';

const CLIENT_DIR = path.resolve('dist/client');
/** Hashed and already immutable — Astro owns its cache headers. */
const SKIP_DIRS = new Set(['_astro']);
/**
 * The service worker must keep one stable URL: the browser keys a registration
 * by script URL, so a per-deploy query would register a second worker on every
 * deploy. Browsers bypass the HTTP cache for the worker script anyway.
 */
const PIN_STABLE = new Set(['/admin/sw.js', '/c/sw.js']);

const version = publicAssetVersion();

/** Quoted `./foo.js`, `../foo.js`, or `/admin/foo.js`, with or without a token. */
const SPECIFIER = /(['"])((?:\.{1,2}\/|\/)[A-Za-z0-9._/-]+\.js)(?:\?v=[A-Za-z0-9._-]*)?\1/g;

function collectJsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) out.push(...collectJsFiles(full));
    } else if (entry.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

let filesChanged = 0;
let specifiersStamped = 0;

for (const file of collectJsFiles(CLIENT_DIR)) {
  const before = readFileSync(file, 'utf8');
  const after = before.replace(SPECIFIER, (match, quote, specifier) => {
    if (PIN_STABLE.has(specifier)) return match;
    specifiersStamped += 1;
    return `${quote}${specifier}?v=${version}${quote}`;
  });
  if (after !== before) {
    writeFileSync(file, after);
    filesChanged += 1;
  }
}

console.log(
  `[version-public-assets] stamped ?v=${version} on ${specifiersStamped} specifier(s) across ${filesChanged} file(s)`,
);
