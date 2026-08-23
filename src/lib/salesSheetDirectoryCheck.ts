/**
 * Live directory coverage: homepage links first, then a name-search for
 * profiles that exist but are not linked from the site.
 */
import { braveSearch, isBraveConfigured, type BraveSearchResult } from './braveClient';
import { fetchHtml } from './clientBrand';
import {
  checksFromSignals,
  directorySlugsForGroup,
  nameSearchStems,
  profileLooksLikeBusiness,
  slugFromProfileUrl,
  slugsLinkedFromHtml,
  type DirectoryCheck,
  type DirectorySlug,
} from './salesSheetDirectories';

const SOCIAL_SITES =
  'site:instagram.com OR site:facebook.com OR site:tiktok.com OR site:nextdoor.com OR site:linkedin.com OR site:x.com OR site:twitter.com OR site:bsky.app OR site:bsky.social';

const DIRECTORY_SITES =
  'site:yelp.com OR site:tripadvisor.com OR site:thumbtack.com OR site:angi.com OR site:homeadvisor.com OR site:houzz.com OR site:yellowpages.com OR site:yp.com OR site:foursquare.com OR site:maps.apple.com OR site:businessconnect.apple.com OR site:bbb.org OR site:avvo.com OR site:manta.com OR site:superpages.com OR site:merchantcircle.com OR site:hotfrog.com OR site:brownbook.net OR site:chamberofcommerce.com OR site:porch.com OR site:dataaxle.com OR site:bingplaces.com';

export async function checkDirectoryCoverage(opts: {
  website?: string;
  businessName?: string;
  googlePlacesListed?: boolean | null;
  html?: string;
  pageUrl?: string;
  iconGroup?: string | null;
  search?: (query: string) => Promise<BraveSearchResult[]>;
}): Promise<DirectoryCheck[]> {
  const name = (opts.businessName || '').trim();
  let html = opts.html || '';
  let pageUrl = opts.pageUrl || '';
  const website = (opts.website || '').trim();

  if (!html && website) {
    const url = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    const fetched = await fetchHtml(url);
    if (fetched.ok) {
      html = fetched.html;
      pageUrl = fetched.finalUrl;
    }
  }

  const linked = slugsLinkedFromHtml(html, pageUrl || website);
  const found = new Set<DirectorySlug>(linked);

  if (opts.googlePlacesListed === true) {
    found.add('google');
  }

  const host = (() => {
    try {
      return new URL(pageUrl || (/^https?:\/\//i.test(website) ? website : `https://${website}`)).hostname;
    } catch {
      return '';
    }
  })();
  const stems = nameSearchStems(name, host);

  if (name && (opts.search || isBraveConfigured())) {
    const run = opts.search
      ? opts.search
      : async (query: string) => {
          const res = await braveSearch(query, 8);
          return res.ok ? res.results : [];
        };
    const queries = [`"${name}" (${SOCIAL_SITES})`, `"${name}" (${DIRECTORY_SITES})`];
    const rows = (await Promise.all(queries.map((q) => run(q).catch(() => [] as BraveSearchResult[])))).flat();
    for (const row of rows) {
      const slug = slugFromProfileUrl(row.url);
      if (!slug || linked.has(slug)) continue;
      if (profileLooksLikeBusiness(row, stems, name)) found.add(slug);
    }
  }

  return checksFromSignals({ linked, found, slugs: directorySlugsForGroup(opts.iconGroup) });
}
