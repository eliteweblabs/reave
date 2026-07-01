// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import clerk from '@clerk/astro';

const usePolling = process.env.VITE_USE_POLLING === '1';

export default defineConfig({
  integrations: [clerk()],
  output: 'server',
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
