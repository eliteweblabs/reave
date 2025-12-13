// @ts-check
import { defineConfig } from 'astro/config';
import clerk from '@clerk/astro';

// https://astro.build/config
export default defineConfig({
  integrations: [
    clerk({
      // Use new prop names to avoid deprecation warnings
      fallbackRedirectUrl: '/',
      signInUrl: '/sign-in',
      signUpUrl: '/sign-up',
    }),
  ],
});
