/**
 * BrightLocal API client — REΛVE agency account only.
 *
 * One-time Citation Builder campaigns (ownership model), not ongoing rental sync.
 * Docs: https://developer.brightlocal.com /
 * Product overview: https://www.brightlocal.com/platform/api-solutions/
 *
 * Auth: API key via BRIGHTLOCAL_API_KEY (server-only).
 */

import { serverEnv } from './serverEnv';

export function isBrightLocalConfigured(): boolean {
  return Boolean(serverEnv('BRIGHTLOCAL_API_KEY')?.trim());
}

export function brightlocalApiKey(): string | null {
  const key = serverEnv('BRIGHTLOCAL_API_KEY')?.trim();
  return key || null;
}

/** Product modes for SEO Directory API Kit (one module, two packages). */
export const SEO_DIRECTORY_MODES = ['local', 'national_ecommerce'] as const;
export type SeoDirectoryMode = (typeof SEO_DIRECTORY_MODES)[number];

export type SeoDirectoryStatus = {
  feature: 'seo_directory';
  configured: boolean;
  vendor: 'brightlocal';
  accountModel: 'agency_single';
  pricingModel: 'one_time_citation';
  modes: typeof SEO_DIRECTORY_MODES;
  defaultsNote: string;
  next: string[];
};

export function seoDirectoryStatus(): SeoDirectoryStatus {
  return {
    feature: 'seo_directory',
    configured: isBrightLocalConfigured(),
    vendor: 'brightlocal',
    accountModel: 'agency_single',
    pricingModel: 'one_time_citation',
    modes: SEO_DIRECTORY_MODES,
    defaultsNote:
      'Google Business, Apple Maps, Yelp, and Bing Places stay in audits / socials / reviews — this kit is the second-tier citation layer.',
    next: isBrightLocalConfigured()
      ? [
          'Wire Locations + Citation Builder API calls',
          'Per-client directory checklist storage',
          'Admin panel + portal report surfaces',
          'Feed citation coverage into Maps & Directories audit scores',
        ]
      : [
          'Set BRIGHTLOCAL_API_KEY on the service (REΛVE agency account)',
          'Confirm API access includes Citation Builder + Locations',
          'Then wire campaign create/track endpoints',
        ],
  };
}
