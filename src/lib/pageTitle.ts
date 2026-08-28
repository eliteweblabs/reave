/**
 * HTML `<title>` vs PWA / push name — two different strings.
 *
 * iOS copies `document.title` of the installed PWA into every web-push banner
 * as "from …". That must stay the short company name. Browser tabs and SEO
 * still need the page name and (on the homepage) the tagline.
 *
 * Do not reuse this helper for notification payloads — those go through
 * `formatPwaPushTitle` / `formatNotificationPayload` in notificationFormat.ts.
 */

export function formatHtmlPageTitle(opts: {
  /** Inner-page name ("Features", "Privacy Policy"). Omit on the homepage. */
  page?: string | null;
  siteName: string;
  /** Marketing tagline — homepage `<title>` only. Never sent to push. */
  tagline?: string | null;
}): string {
  const page = opts.page?.trim() || '';
  const site = opts.siteName.trim();
  const tagline = opts.tagline?.trim() || '';
  if (page && site && page.toLowerCase() !== site.toLowerCase()) {
    if (page.toLowerCase().includes(site.toLowerCase())) return page;
    return `${page} | ${site}`;
  }
  if (page) return page;
  if (site && tagline && tagline.toLowerCase() !== site.toLowerCase()) {
    return `${site} | ${tagline}`;
  }
  return site || tagline || 'Home';
}

/** Home-screen label and iOS push "from" line — company name only. */
export function formatPwaAppTitle(siteName: string): string {
  return siteName.trim() || 'Business OS';
}
