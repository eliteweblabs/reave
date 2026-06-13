// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

const usePolling = process.env.VITE_USE_POLLING === '1';

export default defineConfig({
  output: 'server',
  /** Listen on all interfaces (same idea as `astro dev --host`). */
  server: {
    host: true,
  },
  vite: {
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
