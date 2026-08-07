import { execSync } from 'node:child_process';

/**
 * One cache-busting token per deploy for everything served out of `public/`.
 *
 * Those files bypass `src/middleware.ts` entirely — the node adapter's static
 * handler answers them before the SSR handler runs — so they leave the origin
 * with no `Cache-Control` at all and Cloudflare stamps its default four-hour
 * browser TTL on them. The `?v=` token in every script URL is therefore the only
 * thing standing between a deploy and a browser running yesterday's admin code.
 *
 * `astro.config.mjs` stamps this into the HTML script URLs and
 * `version-public-assets.mjs` stamps it into the import specifiers inside the
 * files themselves, so the two must agree for a given commit. Every source here
 * is deterministic for that reason — never a timestamp.
 */
export function publicAssetVersion() {
  const fromDeploy = process.env.RAILWAY_GIT_COMMIT_SHA?.trim();
  if (fromDeploy) return fromDeploy.slice(0, 12);

  try {
    return execSync('git rev-parse --short=12 HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}
