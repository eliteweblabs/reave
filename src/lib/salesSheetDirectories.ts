/**
 * Directory-coverage tiles for the sales-sheet iPhone.
 * Listed vs missing is inferred from the live Places flag and audit notes.
 */
export const DIRECTORY_SLUGS = [
  'yelp',
  'bing',
  'apple',
  'googlemaps',
  'facebook',
  'tripadvisor',
  'nextdoor',
  'thumbtack',
] as const;

export type DirectorySlug = (typeof DIRECTORY_SLUGS)[number];

const DIR_NAME_RE: Record<DirectorySlug, RegExp> = {
  yelp: /\byelp\b/i,
  bing: /\bbing(?:\s+places)?\b/i,
  apple: /\bapple(?:\s+(?:maps|business))?\b|\bbusiness connect\b/i,
  googlemaps: /\bgoogle(?:\s+(?:maps|business|places|my business))?\b|\bgbp\b|\bgmb\b/i,
  facebook: /\bfacebook\b|\bfb\.com\b/i,
  tripadvisor: /\btrip\s*advisor\b/i,
  nextdoor: /\bnextdoor\b/i,
  thumbtack: /\bthumbtack\b/i,
};

const NEGATIVE = /missing|not found|unclaimed|nowhere|no listing|not listed|point nowhere|absent|unchecked/i;
const POSITIVE = /listed|found|claimed|present|live|active|confirmed|matched/i;

function slugsIn(text: string, re: RegExp): DirectorySlug[] {
  if (!re.test(text)) return [];
  return DIRECTORY_SLUGS.filter((slug) => DIR_NAME_RE[slug].test(text));
}

export type DirectoryCoverageOpts = {
  /** Finding copy plus any extra audit notes. */
  text?: string;
  /** Live Google Places / Maps match. */
  googlePlacesListed?: boolean | null;
  /** Explicit listed slugs (query / fixture override). */
  listed?: readonly string[];
};

/** Slugs with a confirmed listing. Everything else on the grid is missing. */
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
      const names = slugsIn(clause, /./);
      if (!names.length) continue;
      if (NEGATIVE.test(clause)) {
        for (const slug of names) missing.add(slug);
      } else if (POSITIVE.test(clause)) {
        for (const slug of names) listed.add(slug);
      }
    }
  }

  if (opts.googlePlacesListed === true) listed.add('googlemaps');
  if (opts.googlePlacesListed === false) missing.add('googlemaps');

  for (const slug of forced) listed.add(slug);
  for (const slug of missing) listed.delete(slug);

  // This exhibit only appears when Maps is still standing — leave Maps on
  // unless the notes or the live flag say otherwise.
  if (opts.googlePlacesListed == null && !missing.has('googlemaps') && !listed.has('googlemaps')) {
    listed.add('googlemaps');
  }

  return listed;
}

export function directoryIsListed(slug: DirectorySlug, listed: Set<DirectorySlug>): boolean {
  return listed.has(slug);
}
