// @ts-check
import { defineConfig } from 'astro/config';
import clerk from '@clerk/astro';

// https://astro.build/config
export default defineConfig({
  integrations: [
    clerk({
      afterSignInUrl: '/',
      afterSignUpUrl: '/',
      signInUrl: '/sign-in',
      signUpUrl: '/sign-up',
    }),
  ],
  vite: {
    resolve: {
      alias: {
        '@clerk/astro/components': '@clerk/astro/components',
      },
    },
    optimizeDeps: {
      include: ['@clerk/astro'],
    },
  },
});
