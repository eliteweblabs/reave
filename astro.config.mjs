// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import clerk from '@clerk/astro';
import { publicAssetVersion } from './scripts/asset-version.mjs';

const usePolling = process.env.VITE_USE_POLLING === '1';

/**
 * Astro 5.18+ hardens host/proxy headers: unless `security.allowedDomains` is
 * configured, `X-Forwarded-Host` is ignored and the reconstructed request
 * origin falls back to `localhost`. Behind Railway's TLS-terminating proxy the
 * container socket is plain HTTP, so Astro's built-in CSRF origin check then
 * compares the browser's real `https://…` Origin against `https://localhost`
 * and rejects same-origin POSTs with a 403 ("Cross-site … forbidden").
 *
 * This app already trusts the proxy's forwarded host everywhere it builds
 * absolute URLs (see src/lib/requestOrigin.ts), and it is deployed to many
 * installs on both `*.up.railway.app` and custom domains. Trusting any
 * forwarded HTTPS host keeps that behavior consistent and lets the origin
 * check pass for legitimate same-origin requests while still requiring TLS.
 */
const allowedDomains = [{ protocol: 'https' }];

export default defineConfig({
  integrations: [clerk(), react()],
  output: 'server',
  security: {
    allowedDomains,
  },
  /** Listen on all interfaces (same idea as `astro dev --host`). */
  server: {
    host: true,
  },
  vite: {
    /**
     * Cache-busting token for the scripts we serve from `public/`. Those files
     * never reach src/middleware.ts (the node adapter answers them first), so
     * they leave the origin with no Cache-Control and Cloudflare applies a
     * four-hour browser TTL. scripts/version-public-assets.mjs stamps the same
     * token onto the import specifiers inside them after the build.
     */
    define: {
      __PUBLIC_ASSET_VERSION__: JSON.stringify(publicAssetVersion()),
    },
    optimizeDeps: {
      // Pre-bundle Three.js + postprocessing so dep cache stays stable across restarts.
      include: [
        'three',
        'three/examples/jsm/postprocessing/EffectComposer.js',
        'three/examples/jsm/postprocessing/RenderPass.js',
        'three/examples/jsm/postprocessing/UnrealBloomPass.js',
      ],
    },
    server: {
      watch: {
        ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
        usePolling,
        ...(usePolling ? { interval: 300 } : {}),
      },
    },
  },
  adapter: node({
    mode: 'standalone',
  }),
  /**
   * Portfolio (and other `astro:assets` images) are resized/encoded on demand
   * via `/_image` in SSR. Prefer modern formats with solid quality/size tradeoffs.
   */
  image: {
    service: {
      entrypoint: 'astro/assets/services/sharp',
      config: {
        webp: { quality: 80, effort: 5, alphaQuality: 90 },
        avif: { quality: 65, effort: 4 },
        jpeg: { quality: 82, mozjpeg: true },
        png: { compressionLevel: 9 },
      },
    },
  },
});
