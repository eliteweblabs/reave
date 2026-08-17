/**
 * "Apps this platform replaces" logo wall — homepage integrations + /features.
 * Bytes live in the media library; this catalog is name + slug only.
 */
import { siteMediaSrc } from './siteMedia';

export interface BrandLogo {
  /** Display name — from the catalog, or site-config override. */
  name: string;
  /** Public media URL, e.g. /api/media/replaced-gmail */
  src: string;
}

type BrandLogoRef = {
  name: string;
  image: string;
};

/** Order matches the old numbered filenames (01-gmail … 36-make). */
export const REPLACED_APP_LOGOS: BrandLogoRef[] = [
  { name: 'Gmail', image: 'replaced-gmail' },
  { name: 'Outlook', image: 'replaced-outlook' },
  { name: 'Google Calendar', image: 'replaced-google-calendar' },
  { name: 'ChatGPT', image: 'replaced-chatgpt' },
  { name: 'QuickBooks', image: 'replaced-quickbooks' },
  { name: 'Slack', image: 'replaced-slack' },
  { name: 'Notion', image: 'replaced-notion' },
  { name: 'Trello', image: 'replaced-trello' },
  { name: 'Asana', image: 'replaced-asana' },
  { name: 'Monday.com', image: 'replaced-monday' },
  { name: 'HubSpot', image: 'replaced-hubspot' },
  { name: 'Salesforce', image: 'replaced-salesforce' },
  { name: 'Stripe', image: 'replaced-stripe' },
  { name: 'Calendly', image: 'replaced-calendly' },
  { name: 'DocuSign', image: 'replaced-docusign' },
  { name: 'Mailchimp', image: 'replaced-mailchimp' },
  { name: 'Dropbox', image: 'replaced-dropbox' },
  { name: 'Google Drive', image: 'replaced-google-drive' },
  { name: 'Airtable', image: 'replaced-airtable' },
  { name: 'ClickUp', image: 'replaced-clickup' },
  { name: 'Xero', image: 'replaced-xero' },
  { name: 'Typeform', image: 'replaced-typeform' },
  { name: 'Intercom', image: 'replaced-intercom' },
  { name: 'Zendesk', image: 'replaced-zendesk' },
  { name: 'Zapier', image: 'replaced-zapier' },
  { name: 'Zoho', image: 'replaced-zoho' },
  { name: 'Square', image: 'replaced-square' },
  { name: 'PayPal', image: 'replaced-paypal' },
  { name: 'Google Analytics', image: 'replaced-google-analytics' },
  { name: 'Buffer', image: 'replaced-buffer' },
  { name: 'Hootsuite', image: 'replaced-hootsuite' },
  { name: 'WordPress', image: 'replaced-wordpress' },
  { name: 'Basecamp', image: 'replaced-basecamp' },
  { name: 'Make', image: 'replaced-make' },
];

function resolveLogos(refs: BrandLogoRef[]): BrandLogo[] {
  return refs
    .map((logo) => ({
      name: logo.name,
      src: siteMediaSrc(logo.image),
    }))
    .filter((logo) => logo.name && logo.src);
}

/** Lists the replaced-apps wall. `folder` is kept for callers; only "replaced-apps" is used. */
export function listBrandLogos(folder = 'replaced-apps'): BrandLogo[] {
  if (folder !== 'replaced-apps') return [];
  return resolveLogos(REPLACED_APP_LOGOS);
}
