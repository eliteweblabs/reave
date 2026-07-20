// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import clerk from '@clerk/astro';

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
    optimizeDeps: {
      // Pre-bundle Three.js + postprocessing so dep cache stays stable across restarts.
      include: [
        'three',
        'three/examples/jsm/postprocessing/EffectComposer.js',
        'three/examples/jsm/postprocessing/RenderPass.js',
        'three/examples/jsm/postprocessing/ShaderPass.js',
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
});
