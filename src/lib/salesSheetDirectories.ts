/**
 * Directory-coverage tiles for the sales-sheet iPhone.
 *
 * Verdict: a link on the website is a pass. No site link but a matching
 * profile (Places / name search) is a half-fail. Neither is a full fail.
 */
export const DIRECTORY_SLUGS = [
  'angi',
  'apple',
  'avvo',
  'bbb',
  'bing',
  'bluesky',
  'brownbook',
  'chamber',
  'dataaxle',
  'facebook',
  'foursquare',
  'google',
  'homeadvisor',
  'hotfrog',
  'houzz',
  'instagram',
  'linkedin',
  'manta',
  'merchantcircle',
  'nextdoor',
  'porch',
  'superpages',
  'thumbtack',
  'tiktok',
  'tripadvisor',
  'x',
  'yellowpages',
  'yelp',
] as const;

export type DirectorySlug = (typeof DIRECTORY_SLUGS)[number];

export type DirectoryVerdict = 'pass' | 'half' | 'fail';

export type DirectoryCheck = {
  slug: DirectorySlug;
  title: string;
  verdict: DirectoryVerdict;
  linkedFromSite: boolean;
  foundOffSite: boolean;
};

export const DIRECTORY_APPS: { slug: DirectorySlug; title: string; short?: string; host: RegExp }[] = [
  { slug: 'angi', title: 'Angi', host: /(?:^|\.)angi\.com$/i },
  { slug: 'apple', title: 'Apple Business Connect', short: 'Apple', host: /(?:^|\.)(?:maps\.apple\.com|businessconnect\.apple\.com)$/i },
  { slug: 'avvo', title: 'Avvo', host: /(?:^|\.)avvo\.com$/i },
  { slug: 'bbb', title: 'Better Business Bureau', short: 'BBB', host: /(?:^|\.)bbb\.org$/i },
  { slug: 'bing', title: 'Bing Places', short: 'Bing', host: /(?:^|\.)(?:bing\.com|bingplaces\.com)$/i },
  { slug: 'bluesky', title: 'Bluesky', host: /(?:^|\.)(?:bsky\.app|bsky\.social)$/i },
  { slug: 'brownbook', title: 'Brownbook', short: 'Brown', host: /(?:^|\.)brownbook\.net$/i },
  { slug: 'chamber', title: 'Chamber of Commerce', short: 'Chamber', host: /(?:^|\.)(?:chamberofcommerce\.com|chamber\.com)$/i },
  { slug: 'dataaxle', title: 'Data Axle', short: 'Axle', host: /(?:^|\.)(?:dataaxle\.com|data-axle\.com|referenceusa\.com)$/i },
  { slug: 'facebook', title: 'Facebook', host: /(?:^|\.)(?:facebook\.com|fb\.com|fb\.me)$/i },
  { slug: 'foursquare', title: 'Foursquare', host: /(?:^|\.)(?:foursquare\.com|swarmapp\.com)$/i },
  { slug: 'google', title: 'Google Business Profile', short: 'Google', host: /(?:^|\.)(?:google\.com|maps\.google\.com|g\.page|goo\.gl|business\.google\.com)$/i },
  { slug: 'homeadvisor', title: 'HomeAdvisor', short: 'HA', host: /(?:^|\.)homeadvisor\.com$/i },
  { slug: 'hotfrog', title: 'Hotfrog', host: /(?:^|\.)hotfrog\.com$/i },
  { slug: 'houzz', title: 'Houzz', host: /(?:^|\.)houzz\.com$/i },
  { slug: 'instagram', title: 'Instagram', host: /(?:^|\.)(?:instagram\.com|instagr\.am)$/i },
  { slug: 'linkedin', title: 'LinkedIn', host: /(?:^|\.)linkedin\.com$/i },
  { slug: 'manta', title: 'Manta', host: /(?:^|\.)manta\.com$/i },
  { slug: 'merchantcircle', title: 'MerchantCircle', short: 'Circle', host: /(?:^|\.)merchantcircle\.com$/i },
  { slug: 'nextdoor', title: 'Nextdoor', host: /(?:^|\.)nextdoor\.com$/i },
  { slug: 'porch', title: 'Porch', host: /(?:^|\.)porch\.com$/i },
  { slug: 'superpages', title: 'Superpages', short: 'Super', host: /(?:^|\.)superpages\.com$/i },
  { slug: 'thumbtack', title: 'Thumbtack', host: /(?:^|\.)thumbtack\.com$/i },
  { slug: 'tiktok', title: 'TikTok', host: /(?:^|\.)tiktok\.com$/i },
  { slug: 'tripadvisor', title: 'Tripadvisor', host: /(?:^|\.)tripadvisor\.com$/i },
  { slug: 'x', title: 'X', host: /(?:^|\.)(?:x\.com|twitter\.com|t\.co)$/i },
  { slug: 'yellowpages', title: 'Yellow Pages', short: 'YP', host: /(?:^|\.)(?:yellowpages\.com|yp\.com)$/i },
  { slug: 'yelp', title: 'Yelp', host: /(?:^|\.)yelp\.com$/i },
];

const DIR_NAME_RE: Record<DirectorySlug, RegExp> = {
  angi: /\bangi\b|\bangie'?s list\b/i,
  apple: /\bapple(?:\s+(?:maps|business(?:\s+connect)?))?\b|\bbusiness connect\b/i,
  avvo: /\bavvo\b/i,
  bbb: /\bbbb\b|\bbetter business bureau\b/i,
  bing: /\bbing(?:\s+places)?\b/i,
  bluesky: /\bbluesky\b|\bbsky\b/i,
  brownbook: /\bbrownbook\b/i,
  chamber: /\bchamber(?:\s+of\s+commerce)?\b/i,
  dataaxle: /\bdata\s*axle\b|\breferenceusa\b/i,
  facebook: /\bfacebook\b|\bfb\.com\b/i,
  foursquare: /\bfoursquare\b|\bswarm\b/i,
  google: /\bgoogle(?:\s+(?:maps|business|places|my business|app))?\b|\bgbp\b|\bgmb\b/i,
  homeadvisor: /\bhomeadvisor\b/i,
  hotfrog: /\bhotfrog\b/i,
  houzz: /\bhouzz\b/i,
  instagram: /\binstagram\b|\binsta\b/i,
  linkedin: /\blinkedin\b/i,
  manta: /\bmanta\b/i,
  merchantcircle: /\bmerchant\s*circle\b/i,
  nextdoor: /\bnextdoor\b/i,
  porch: /\bporch\b/i,
  superpages: /\bsuperpages\b/i,
  thumbtack: /\bthumbtack\b/i,
  tiktok: /\btiktok\b/i,
  tripadvisor: /\btrip\s*advisor\b/i,
  x: /\b(?:twitter|\bx\.com\b|\bx\b)\b/i,
  yellowpages: /\byellow\s*pages\b|\byp\.com\b/i,
  yelp: /\byelp\b/i,
};

const GOOGLE_PROFILE_PATH = /\/maps|\/business|g\.page/i;
const BING_PATH = /\/maps|\/places/i;

function isGoogleBusinessLink(host: string, path: string): boolean {
  if (/^(?:maps\.google\.com|g\.page|goo\.gl|business\.google\.com)$/i.test(host)) return true;
  return GOOGLE_PROFILE_PATH.test(host + path);
}

function isBingPlacesLink(host: string, path: string): boolean {
  if (/bingplaces\.com$/i.test(host)) return true;
  return BING_PATH.test(path);
}

const NEGATIVE = /missing|not found|unclaimed|nowhere|no listing|not listed|point nowhere|absent|unchecked|full fail/i;
const POSITIVE = /listed|found|claimed|present|live|active|confirmed|matched|linked/i;
const HALF = /half fail|not linked|no link from the (?:site|website)|unlinked/i;

function slugsIn(text: string): DirectorySlug[] {
  return DIRECTORY_SLUGS.filter((slug) => DIR_NAME_RE[slug].test(text));
}

export type DirectoryCoverageOpts = {
  text?: string;
  googlePlacesListed?: boolean | null;
  listed?: readonly string[];
};

export const DIRECTORY_COVERAGE_FINDING = {
  id: 'directories',
  categoryLabel: 'Directories',
  problem: 'Most of the places customers look still have no listing — or no link from the website.',
  solution: 'Link every live profile from the site, then claim the rest so a name search finds you.',
};

export function isDirectoryCoverageFinding(finding: { id?: string; categoryLabel?: string }): boolean {
  const id = (finding.id || '').toLowerCase();
  const label = (finding.categoryLabel || '').toLowerCase();
  return id === 'directories' || id === 'listings-thin' || label === 'directories';
}

export function pinDirectoryCoverageFirst<T extends { id?: string; categoryLabel?: string }>(
  findings: T[],
  pinned: T = DIRECTORY_COVERAGE_FINDING as unknown as T,
): T[] {
  const rest = findings.filter((f) => !isDirectoryCoverageFinding(f));
  return [pinned, ...rest];
}

export function directoryIconSrc(slug: DirectorySlug): string {
  return `/admin/dir-icons/${slug}.png`;
}

export function directoryTitle(slug: DirectorySlug): string {
  return DIRECTORY_APPS.find((app) => app.slug === slug)?.title || slug;
}

export function directoryShortLabel(slug: DirectorySlug): string {
  const app = DIRECTORY_APPS.find((row) => row.slug === slug);
  return app?.short || app?.title || slug;
}

export function directorySlugsSorted(slugs: readonly DirectorySlug[] = DIRECTORY_SLUGS): DirectorySlug[] {
  return [...slugs].sort((a, b) =>
    directoryTitle(a).localeCompare(directoryTitle(b), 'en', { sensitivity: 'base' }),
  );
}

/**
 * Per-industry 28-icon packs. Only General local ships today — music
 * (Spotify / Apple Music / SoundCloud), restaurants, and others plug in here.
 */
export const DIRECTORY_ICON_GROUPS = [
  {
    id: 'general',
    label: 'General local',
    hint: 'Maps, reviews, and local business listings. More industry packs later.',
    slugs: DIRECTORY_SLUGS,
  },
] as const;

export type DirectoryIconGroupId = (typeof DIRECTORY_ICON_GROUPS)[number]['id'];

export const DEFAULT_DIRECTORY_ICON_GROUP: DirectoryIconGroupId = 'general';

export function parseDirectoryIconGroup(raw?: string | null): DirectoryIconGroupId {
  const id = (raw || '').trim().toLowerCase();
  return DIRECTORY_ICON_GROUPS.some((group) => group.id === id)
    ? (id as DirectoryIconGroupId)
    : DEFAULT_DIRECTORY_ICON_GROUP;
}

export function directoryIconGroupById(raw?: string | null) {
  const id = parseDirectoryIconGroup(raw);
  return DIRECTORY_ICON_GROUPS.find((group) => group.id === id) ?? DIRECTORY_ICON_GROUPS[0];
}

export function directorySlugsForGroup(raw?: string | null): readonly DirectorySlug[] {
  return directorySlugsSorted(directoryIconGroupById(raw).slugs);
}

/** Hosts / paths on the audited website that count as a first-party link. */
export function slugsLinkedFromHtml(html: string, pageUrl?: string): Set<DirectorySlug> {
  const found = new Set<DirectorySlug>();
  const hrefs = html.matchAll(/href\s*=\s*["']([^"']+)["']/gi);
  const base = pageUrl || 'https://example.invalid/';
  for (const match of hrefs) {
    const raw = (match[1] || '').trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:')) continue;
    let url: URL;
    try {
      url = new URL(raw, base);
    } catch {
      continue;
    }
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    const path = `${url.pathname}${url.search}`;
    for (const app of DIRECTORY_APPS) {
      if (!app.host.test(host)) continue;
      if (app.slug === 'google' && !isGoogleBusinessLink(host, path)) continue;
      if (app.slug === 'bing' && !isBingPlacesLink(host, path)) continue;
      found.add(app.slug);
    }
  }
  return found;
}

export function nameSearchStems(businessName: string, websiteHost = ''): string[] {
  const stems = new Set<string>();
  const host = websiteHost.replace(/^www\./i, '').split('.')[0] || '';
  if (host.length >= 3) stems.add(host.toLowerCase());
  const words = businessName
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1 && !/^(the|and|of|for|llc|inc|co)$/.test(w));
  if (words.length) {
    stems.add(words.join(''));
    stems.add(words.join('-'));
    if (words[0].length >= 4) stems.add(words[0]);
  }
  return [...stems];
}

export function slugFromProfileUrl(url: string): DirectorySlug | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const path = `${parsed.pathname}${parsed.search}`;
    for (const app of DIRECTORY_APPS) {
      if (!app.host.test(host)) continue;
      if (app.slug === 'google' && !isGoogleBusinessLink(host, path)) continue;
      if (app.slug === 'bing' && !isBingPlacesLink(host, path)) continue;
      return app.slug;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function profileLooksLikeBusiness(
  result: { title?: string; url?: string; description?: string },
  stems: string[],
  businessName: string,
): boolean {
  const blob = `${result.title || ''} ${result.url || ''} ${result.description || ''}`.toLowerCase();
  const name = businessName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (name && blob.includes(name)) return true;
  return stems.some((stem) => stem.length >= 3 && blob.includes(stem));
}

export function scoreDirectory(linkedFromSite: boolean, foundOffSite: boolean): DirectoryVerdict {
  if (linkedFromSite) return 'pass';
  if (foundOffSite) return 'half';
  return 'fail';
}

export function checksFromSignals(opts: {
  linked: Iterable<DirectorySlug>;
  found: Iterable<DirectorySlug>;
  slugs?: readonly DirectorySlug[];
}): DirectoryCheck[] {
  const linked = new Set(opts.linked);
  const found = new Set(opts.found);
  const slugs = directorySlugsSorted(opts.slugs ?? DIRECTORY_SLUGS);
  return slugs.map((slug) => {
    const linkedFromSite = linked.has(slug);
    const foundOffSite = found.has(slug) || linkedFromSite;
    return {
      slug,
      title: directoryTitle(slug),
      linkedFromSite,
      foundOffSite,
      verdict: scoreDirectory(linkedFromSite, foundOffSite),
    };
  });
}

export function summarizeDirectoryChecks(checks: DirectoryCheck[]): string {
  const fail = checks.filter((c) => c.verdict === 'fail');
  const half = checks.filter((c) => c.verdict === 'half');
  const pass = checks.filter((c) => c.verdict === 'pass');
  const bits: string[] = [];
  bits.push(`${pass.length} of ${checks.length} linked from the website.`);
  if (half.length) {
    bits.push(
      `${half.map((c) => c.title).join(', ')} ${half.length === 1 ? 'exists' : 'exist'} but ${
        half.length === 1 ? 'is' : 'are'
      } not linked from the site.`,
    );
  }
  if (fail.length) {
    bits.push(`${fail.length} have no matching profile.`);
  }
  return bits.join(' ');
}

/** Slugs with a confirmed listing. Used when a live site check has not run. */
export function listedDirectorySlugs(opts: DirectoryCoverageOpts = {}): Set<DirectorySlug> {
  const listed = new Set<DirectorySlug>();
  const text = (opts.text || '').trim();
  const forced = new Set(
    (opts.listed || []).map((s) => s.trim().toLowerCase()).filter((s): s is DirectorySlug =>
      (DIRECTORY_SLUGS as readonly string[]).includes(s),
    ),
  );

  const missing = new Set<DirectorySlug>();
  if (text) {
    for (const clause of text.split(/[.!?\n;]+/)) {
      const names = slugsIn(clause);
      if (!names.length) continue;
      if (NEGATIVE.test(clause) && !HALF.test(clause)) {
        for (const slug of names) missing.add(slug);
      } else if (POSITIVE.test(clause) || HALF.test(clause)) {
        for (const slug of names) listed.add(slug);
      }
    }
  }

  if (opts.googlePlacesListed === true) {
    listed.add('google');
    missing.delete('google');
  } else if (opts.googlePlacesListed === false) {
    missing.add('google');
    listed.delete('google');
  }

  for (const slug of forced) listed.add(slug);
  for (const slug of missing) listed.delete(slug);

  if (opts.googlePlacesListed == null && !missing.has('google') && !listed.has('google')) {
    listed.add('google');
  }

  return listed;
}

export function directoryIsListed(slug: DirectorySlug, listed: Set<DirectorySlug>): boolean {
  return listed.has(slug);
}

export function verdictsFromListed(
  listed: Set<DirectorySlug>,
  slugs: readonly DirectorySlug[] = DIRECTORY_SLUGS,
): DirectoryCheck[] {
  return slugs.map((slug) => {
    const on = listed.has(slug);
    return {
      slug,
      title: directoryTitle(slug),
      linkedFromSite: on,
      foundOffSite: on,
      verdict: on ? 'pass' : 'fail',
    };
  });
}
