/**
 * Ranked “cascade of terribleness” for the audit sales sheet.
 *
 * Walk rank 1 → N. The first three hits become the three findings
 * (and their next-step lines) on `/admin/sales-sheet`.
 *
 * Top of the list is what you lead with in the room — not a lab score.
 *
 * Figma back-of-sheet walkthrough + this list: docs/audit-sales-sheet-back.md
 */
import type { AuditReportCard, LetterGrade, ReportCardCategoryId } from './auditReportCard';
import { isPlacesMissFinding, placesNotListedFinding } from './salesSheetPlacesView';

export const SALES_SHEET_CASCADE_COUNT = 3;

export type CascadeFinding = {
  id: string;
  rank: number;
  categoryLabel: string;
  /** What this finding puts on the sales sheet (visual / leave-behind treatment). */
  sheet: string;
  problem: string;
  solution: string;
};

export type CascadeContext = {
  body: string;
  businessName: string;
  card?: AuditReportCard | null;
  googlePlacesListed?: boolean | null;
  securityGrade?: LetterGrade | null;
};

type CascadeDef = {
  id: string;
  rank: number;
  categoryLabel: string;
  /** What this finding puts on the sales sheet (visual / leave-behind treatment). */
  sheet: string;
  match: (ctx: ResolvedCascadeContext) => boolean;
  problem: (ctx: ResolvedCascadeContext) => string;
  solution: (ctx: ResolvedCascadeContext) => string;
};

type ResolvedCascadeContext = CascadeContext & {
  lower: string;
  name: string;
};

function gradeOf(card: AuditReportCard | null | undefined, id: ReportCardCategoryId): LetterGrade | null {
  return card?.categories.find((c) => c.id === id)?.grade ?? null;
}

function scoreOf(card: AuditReportCard | null | undefined, id: ReportCardCategoryId): number | null {
  const n = card?.categories.find((c) => c.id === id)?.score;
  return n != null && Number.isFinite(n) ? n : null;
}

function weak(grade: LetterGrade | null | undefined, max: LetterGrade = 'D'): boolean {
  if (!grade) return false;
  const order = { F: 1, D: 2, C: 3, B: 4, A: 5 };
  return order[grade] <= order[max];
}

function named(ctx: ResolvedCascadeContext): string {
  return ctx.name || 'This business';
}

/** Existential / trust failures first — then findability, then “the site is useless”, then leaks. */
export const SALES_SHEET_CASCADE: CascadeDef[] = [
  {
    id: 'ssl-missing',
    rank: 1,
    categoryLabel: 'SSL',
    sheet:
      'Show a browser chrome on the audit URL with the Not Secure / “Your connection is not private” warning in the address bar — padlock crossed out, HTTP, no lock.',
    match: (ctx) =>
      ctx.securityGrade === 'F' ||
      gradeOf(ctx.card, 'security') === 'F' ||
      /\bnot secure\b|may not be safe|no ssl\b|missing ssl|tls inspection failed|http,? not https|http only|\bnot https\b|no certificate|lacks? (?:an? )?ssl|without ssl|unencrypted|(?:update|fix|missing|invalid|no).{0,40}security certificate/.test(
        ctx.lower,
      ),
    problem: (ctx) =>
      `${named(ctx)}'s site shows a Not Secure warning — browsers tell customers not to trust it.`,
    solution: () =>
      'Install a real SSL certificate and force HTTPS so the padlock is clean before anything else.',
  },
  {
    id: 'site-down',
    rank: 2,
    categoryLabel: 'Site Down',
    sheet:
      'Show the audit URL failing to load: browser error page (timeout, connection refused, or 5xx) so the sheet proves the front door is closed.',
    match: (ctx) => {
      if (
        /tls inspection failed|econnrefused.{0,12}443|no ssl\b/.test(ctx.lower) &&
        !/does not load|timed? ?out|site (?:is )?(?:down|unreachable)|failed to (?:fetch|connect)|err_connection/.test(
          ctx.lower,
        )
      ) {
        return false;
      }
      return /does not load|timed? ?out|connection refused|site (?:is )?(?:down|unreachable)|failed to (?:fetch|connect)|err_connection|http 5\d\d|\b502\b|\b503\b|origin is unreachable/.test(
        ctx.lower,
      );
    },
    problem: (ctx) => `${named(ctx)}'s website does not load — the front door is closed.`,
    solution: () => 'Get the host responding and the homepage loading before any marketing work.',
  },
  {
    id: 'domain-expired',
    rank: 3,
    categoryLabel: 'Domain',
    sheet:
      'Show a WHOIS / registrar card for the audit hostname with expired or NXDOMAIN — the name itself is dark, not just the site.',
    match: (ctx) =>
      (/domain expir|registration expir|nxdomain|not resolving|no a record|dns failed/.test(ctx.lower) &&
        !/certificate (?:has )?expir/.test(ctx.lower)) ||
      (gradeOf(ctx.card, 'domain') === 'F' && /expir|nxdomain|not resolving/.test(ctx.lower)),
    problem: (ctx) => `${named(ctx)}'s domain is expired or not resolving — the name itself is dark.`,
    solution: () => 'Renew the domain, fix DNS, and confirm the site answers on the real hostname.',
  },
  {
    id: 'malware',
    rank: 4,
    categoryLabel: 'Malware',
    sheet:
      'Show a browser or Google Safe Browsing interstitial on the audit URL (“Deceptive site” / malware warning) so the danger is visible, not just described.',
    match: (ctx) =>
      /malware|safe browsing|phishing|hacked|compromised|defaced|trojan|virus|drive-?by|blacklist(?:ed)? (?:for )?(?:malware|phishing)|flagged (?:as )?(?:dangerous|deceptive)/.test(
        ctx.lower,
      ) ||
      (gradeOf(ctx.card, 'domain_reputation') === 'F' && /safe browsing|malware|phishing|flagged/.test(ctx.lower)),
    problem: (ctx) =>
      `Browsers or Safe Browsing are warning that ${named(ctx)}'s site may be dangerous.`,
    solution: () => 'Clean the infection, request a Safe Browsing review, and lock the host down.',
  },
  {
    id: 'places-not-listed',
    rank: 5,
    categoryLabel: 'Google Places',
    sheet:
      'Generate an iPhone with a Google search result page from the URL provided from the audit with the business’s name in the search bar and no result showing, and the competition showing.',
    match: (ctx) =>
      ctx.googlePlacesListed === false ||
      /google (?:business|places).{0,40}(?:not listed|missing|no exact)|not listed on google|missing from google/.test(
        ctx.lower,
      ) ||
      (gradeOf(ctx.card, 'local_listings') === 'F' && (scoreOf(ctx.card, 'local_listings') ?? 0) <= 0),
    problem: (ctx) =>
      `${named(ctx)} is not listed on Google — nearby searches show competitors instead.`,
    solution: () =>
      'Claim Google Business Profile so map results point to you, not the shop down the street.',
  },
  {
    id: 'ssl-expired',
    rank: 6,
    categoryLabel: 'SSL Expired',
    sheet:
      'Show the audit URL in a browser with the expired-certificate warning and the cert dates (valid-to in the past) called out next to the padlock.',
    match: (ctx) => /certificate has expired|ssl expir|expired (?:ssl|certificate)/.test(ctx.lower),
    problem: () => 'The SSL certificate is expired — the padlock is a warning, not a trust mark.',
    solution: () => 'Renew the certificate today and turn on auto-renew so this does not happen again.',
  },
  {
    id: 'ssl-untrusted',
    rank: 7,
    categoryLabel: 'Bad Certificate',
    sheet:
      'Show the certificate mismatch / not-trusted warning on the audit hostname (self-signed or wrong name) so the padlock failure is specific.',
    match: (ctx) =>
      /not trusted|self-?signed|name mismatch|hostname mismatch|certificate (?:is )?invalid|authorization error/.test(
        ctx.lower,
      ),
    problem: () => 'The certificate is untrusted or does not match the domain — browsers block or warn.',
    solution: () => 'Replace it with a trusted cert that matches the live hostname.',
  },
  {
    id: 'site-parked',
    rank: 8,
    categoryLabel: 'Parked / Hijacked',
    sheet:
      'Screenshot the live audit URL: parking page, “domain for sale,” or coming-soon — not the business they think they have.',
    match: (ctx) =>
      /domain is for sale|parked domain|coming soon|under construction|this website is for sale|hijacked|defaced landing/.test(
        ctx.lower,
      ),
    problem: (ctx) => `${named(ctx)}'s domain is parked, for sale, or not the real business site.`,
    solution: () => 'Point the domain at a real site and take the parking/for-sale page down.',
  },
  {
    id: 'ip-blacklisted',
    rank: 9,
    categoryLabel: 'Blacklist',
    sheet:
      'Show the blacklist / Spamhaus (or similar) hit for the domain or IP — a small reputation card, not a full site screenshot.',
    match: (ctx) =>
      /spamhaus|blocklist|blacklist|rbl|listed on (?:a )?blacklist/.test(ctx.lower) &&
      !/malware|phishing|safe browsing/.test(ctx.lower),
    problem: () => 'The domain or IP is on a blacklist — mail and ads can get shut off.',
    solution: () => 'Find the listing, clean the host, and request delisting.',
  },
  {
    id: 'gbp-unclaimed',
    rank: 10,
    categoryLabel: 'Unclaimed Listing',
    sheet:
      'Show the Google Business listing in an iPhone with “Own this business?” / unclaimed — the profile exists but they do not control it.',
    match: (ctx) =>
      ctx.googlePlacesListed !== false &&
      /google business.{0,40}(?:unclaimed|not claimed)|gbp.{0,20}unclaimed/.test(ctx.lower),
    problem: (ctx) => `${named(ctx)} has a Google listing, but nobody has claimed it.`,
    solution: () => 'Claim and verify Google Business Profile so you control hours, photos, and reviews.',
  },
  {
    id: 'nap-mismatch',
    rank: 11,
    categoryLabel: 'NAP Mismatch',
    sheet:
      'Side-by-side name / address / phone from the website vs Google vs another listing — highlight the fields that do not match.',
    match: (ctx) =>
      /nap mismatch|name,? address,? (?:and )?phone|address (?:does not|doesn't) match|phone (?:does not|doesn't) match|inconsistent nap/.test(
        ctx.lower,
      ),
    problem: () => 'Name, address, or phone do not match across the web — Google treats that as two businesses.',
    solution: () => 'Pick one NAP and make every listing identical.',
  },
  {
    id: 'apple-maps-missing',
    rank: 12,
    categoryLabel: 'Apple Maps',
    sheet:
      'Generate an iPhone Maps search for the business name near their city with no pin for them and nearby competitors showing.',
    match: (ctx) =>
      /apple (?:maps|business connect).{0,40}(?:not listed|missing|not claimed|not found)/.test(ctx.lower),
    problem: (ctx) => `${named(ctx)} is missing from Apple Maps — iPhone customers never see you.`,
    solution: () => 'Claim Apple Business Connect and match the same NAP as Google.',
  },
  {
    id: 'reviews-none',
    rank: 13,
    categoryLabel: 'No Reviews',
    sheet:
      'Show the Google (or Yelp) listing card with a blank or near-zero review count so the lack of proof is obvious.',
    match: (ctx) =>
      /no reviews|zero reviews|0 reviews|few reviews|review drought/.test(ctx.lower) ||
      (gradeOf(ctx.card, 'reviews') === 'F' && /review/.test(ctx.lower)),
    problem: () => 'There are almost no reviews — new customers have nothing to trust.',
    solution: () => 'Start a simple after-visit ask so Google and Yelp start collecting proof.',
  },
  {
    id: 'reviews-poor',
    rank: 14,
    categoryLabel: 'Poor Reviews',
    sheet:
      'Show the live star rating and two or three of the worst recent reviews on an iPhone listing card.',
    match: (ctx) =>
      /[1-2](?:\.\d)?\s*stars|poor reviews|bad reviews|rating is (?:low|poor)/.test(ctx.lower) ||
      (weak(gradeOf(ctx.card, 'reviews'), 'D') && /negative|poor|low rating/.test(ctx.lower)),
    problem: () => 'The public rating is working against the business.',
    solution: () => 'Respond to every review and run a request loop so newer, better reviews can surface.',
  },
  {
    id: 'listings-thin',
    rank: 15,
    categoryLabel: 'Directories',
    sheet:
      'A small grid of Google / Apple / Yelp / Bing with claimed vs missing — empty slots are the point.',
    match: (ctx) =>
      /yelp.{0,30}(?:missing|not found)|bing places.{0,30}(?:missing|not found)|thin (?:directory|listing) coverage/.test(
        ctx.lower,
      ) ||
      (weak(gradeOf(ctx.card, 'local_listings'), 'D') && ctx.googlePlacesListed !== false),
    problem: () => 'Directory coverage is thin — Yelp, Bing, or Apple still point nowhere.',
    solution: () => 'Claim the remaining major directories and keep NAP identical.',
  },
  {
    id: 'hours-wrong',
    rank: 16,
    categoryLabel: 'Wrong Hours',
    sheet:
      'Show the Google hours next to the real hours (or a “Closed” state when they are open) so the mismatch is one glance.',
    match: (ctx) => /wrong hours|hours (?:are )?wrong|closed on google|outdated hours/.test(ctx.lower),
    problem: () => 'Published hours are wrong — customers show up or call when you are closed.',
    solution: () => 'Correct hours on Google and every other listing the same day.',
  },
  {
    id: 'duplicate-listings',
    rank: 17,
    categoryLabel: 'Duplicate Listings',
    sheet:
      'Show two Google results for the same business (or a suspended listing) so split reviews and confusion are visible.',
    match: (ctx) => /duplicate listing|gbp suspended|suspended listing|two google listings/.test(ctx.lower),
    problem: () => 'Duplicate or suspended listings split reviews and confuse Google.',
    solution: () => 'Merge or close the extras and restore the canonical Google profile.',
  },
  {
    id: 'site-password',
    rank: 18,
    categoryLabel: 'Not Public',
    sheet:
      'Screenshot the audit URL as a password wall, coming-soon, or staging page — customers cannot use the real site.',
    match: (ctx) =>
      /password-protected|coming soon|under construction|maintenance mode|staging only/.test(ctx.lower),
    problem: () => 'The public site is locked, “coming soon,” or still a staging box.',
    solution: () => 'Publish a real homepage customers can use without a password.',
  },
  {
    id: 'mobile-broken',
    rank: 19,
    categoryLabel: 'Mobile',
    sheet:
      'Generate an iPhone screenshot of the audit URL at 375px: overflow, tiny tap targets, or a layout that does not fit the screen.',
    match: (ctx) =>
      /broken on (?:mobile|phones)|unusable on (?:a )?phone|horizontal scroll|not mobile/.test(ctx.lower) ||
      weak(gradeOf(ctx.card, 'mobile'), 'D'),
    problem: () => 'The site is awkward or broken on phones — where most local customers look.',
    solution: () => 'Fix layout, tap targets, and click-to-call so a phone visit can convert.',
  },
  {
    id: 'speed-fail',
    rank: 20,
    categoryLabel: 'Site Speed',
    sheet:
      'Show the Lighthouse / PageSpeed pair (phone vs desktop) for the audit URL with LCP called out — the number is the exhibit.',
    match: (ctx) => {
      const score = scoreOf(ctx.card, 'performance');
      return (
        gradeOf(ctx.card, 'performance') === 'F' ||
        (score != null && score < 25) ||
        /lcp (?:is )?(?:over )?(?:5|6|7|8|9|10)|takes more than five seconds|feels slow/.test(ctx.lower)
      );
    },
    problem: () => 'The homepage is too slow — people leave before they see the offer.',
    solution: () => 'Compress images, cut heavy scripts, and fix the host if the build is already lean.',
  },
  {
    id: 'no-contact',
    rank: 21,
    categoryLabel: 'No Contact Path',
    sheet:
      'Crop the homepage header/footer from the audit URL with no phone, form, or book button highlighted as missing.',
    match: (ctx) =>
      /no (?:click-?to-call|phone|contact form|contact path)|visitors have no easy way to contact/.test(
        ctx.lower,
      ) || gradeOf(ctx.card, 'lead_capture') === 'F',
    problem: () => 'There is no easy way to call, book, or ask a question.',
    solution: () => 'Put click-to-call, a working form, or booking on every page.',
  },
  {
    id: 'form-broken',
    rank: 22,
    categoryLabel: 'Broken Form',
    sheet:
      'Show the contact form on the audit URL plus the failed submit (error, dead button, or no inbox delivery).',
    match: (ctx) => /form (?:is )?(?:broken|failing|does not send)|contact form.{0,20}(?:broken|fail)/.test(ctx.lower),
    problem: () => 'The contact form is broken — leads go nowhere.',
    solution: () => 'Fix the form, confirm it hits a real inbox, and add a backup click-to-call.',
  },
  {
    id: 'booking-broken',
    rank: 23,
    categoryLabel: 'Broken Booking',
    sheet:
      'Show the booking widget or “Book now” on the audit URL in a failed/empty state so the broken path is the exhibit.',
    match: (ctx) => /booking (?:is )?(?:broken|down|failing)|cannot book|scheduler (?:is )?down/.test(ctx.lower),
    problem: () => 'Online booking is broken — the highest-intent visitors bounce.',
    solution: () => 'Restore booking and test a real appointment from a phone.',
  },
  {
    id: 'no-offer-cta',
    rank: 24,
    categoryLabel: 'No Offer',
    sheet:
      'Crop the homepage hero from the audit URL — no clear service line and no single call-to-action.',
    match: (ctx) =>
      /does not clearly say what you offer|no (?:clear )?cta|no call-?to-?action|unclear offer/.test(ctx.lower) ||
      weak(gradeOf(ctx.card, 'content'), 'D'),
    problem: () => 'The homepage does not say what you do or what to do next.',
    solution: () => 'Rewrite the hero with one offer and one action (call, book, or quote).',
  },
  {
    id: 'broken-nav',
    rank: 25,
    categoryLabel: 'Broken Links',
    sheet:
      'Show a 404 (or a short list of dead nav URLs) from the audit crawl — one broken path is enough to make the point.',
    match: (ctx) =>
      /broken (?:nav|links|menu)|lots of 404|dead (?:pages|links)/.test(ctx.lower) ||
      weak(gradeOf(ctx.card, 'broken_links'), 'D'),
    problem: () => 'Broken links and dead pages make the business look abandoned.',
    solution: () => 'Fix or redirect the dead URLs and clean the main nav.',
  },
  {
    id: 'a11y-block',
    rank: 26,
    categoryLabel: 'Accessibility',
    sheet:
      'Show a phone crop of the unreadable contrast or untappable control on the audit URL — the WCAG fail as a picture.',
    match: (ctx) =>
      /cannot use the site|wcag.{0,20}fail|tap targets? (?:too small|fail)/.test(ctx.lower) ||
      gradeOf(ctx.card, 'accessibility') === 'F',
    problem: () => 'Parts of the site are hard or impossible for some customers to use.',
    solution: () => 'Fix contrast, labels, and tap targets so more people can actually convert.',
  },
  {
    id: 'search-buried',
    rank: 27,
    categoryLabel: 'Search',
    sheet:
      'Generate an iPhone Google results page for a real local query (service + city) where the business does not appear on page one and competitors do.',
    match: (ctx) =>
      /buries you in search|won't find you|will not find you|punishes you in search|not findable/.test(ctx.lower) ||
      weak(gradeOf(ctx.card, 'seo'), 'D'),
    problem: (ctx) => `${named(ctx)} is harder to find in search than a local business should be.`,
    solution: () => 'Fix titles, indexability, and local SEO so the right searches can surface you.',
  },
  {
    id: 'robots-blocking',
    rank: 28,
    categoryLabel: 'Blocked from Google',
    sheet:
      'Show the robots.txt or noindex line from the audit URL that blocks crawlers — a small code/excerpt card, not a full page.',
    match: (ctx) => /robots\.txt.{0,40}(?:block|disallow)|blocks? all crawlers|noindex/.test(ctx.lower),
    problem: () => 'robots.txt or noindex is blocking search engines from the site.',
    solution: () => 'Unblock crawlers and remove noindex on the pages you want found.',
  },
  {
    id: 'no-https-redirect',
    rank: 29,
    categoryLabel: 'HTTP Still Live',
    sheet:
      'Show the http:// version of the audit URL still loading (no redirect) next to the https:// address — two address bars.',
    match: (ctx) => /no https redirect|http still (?:live|works)|not redirecting to https/.test(ctx.lower),
    problem: () => 'HTTP still loads without sending people to HTTPS.',
    solution: () => '301 every HTTP request to HTTPS and turn on HSTS.',
  },
  {
    id: 'mixed-content',
    rank: 30,
    categoryLabel: 'Mixed Content',
    sheet:
      'Show the padlock-with-warning on the HTTPS audit URL and one mixed http:// image or script from the page.',
    match: (ctx) => /mixed content|insecure items loading on a secure page/.test(ctx.lower),
    problem: () => 'The page is HTTPS but still loads insecure files — the padlock stays dirty.',
    solution: () => 'Serve every image, script, and embed over HTTPS.',
  },
  {
    id: 'no-analytics',
    rank: 31,
    categoryLabel: 'No Tracking',
    sheet:
      'A small “no analytics / no conversion events” card for the audit URL — empty measurement, not a screenshot of the whole site.',
    match: (ctx) =>
      /no analytics|untracked leads|cannot see which visits/.test(ctx.lower) ||
      weak(gradeOf(ctx.card, 'analytics'), 'D'),
    problem: () => 'There is no picture of which visits become calls or bookings.',
    solution: () => 'Install analytics and conversion events on call, form, and booking.',
  },
  {
    id: 'no-sitemap',
    rank: 32,
    categoryLabel: 'No Sitemap',
    sheet:
      'Show the missing /sitemap.xml 404 (or “no sitemap” from the SEO inventory) for the audit host.',
    match: (ctx) => /no xml sitemap|sitemap.{0,20}missing/.test(ctx.lower),
    problem: () => 'There is no XML sitemap — Google has to guess the page list.',
    solution: () => 'Add a sitemap and submit it in Search Console.',
  },
  {
    id: 'no-og-image',
    rank: 33,
    categoryLabel: 'Share Cards',
    sheet:
      'Show a text-message or iMessage preview of the audit URL with a blank or random image — the ugly share card is the exhibit.',
    match: (ctx) => /no open graph|no og:image|share cards have no|blank or random preview/.test(ctx.lower),
    problem: () => 'Links shared in texts and social show a blank or random preview.',
    solution: () => 'Add Open Graph tags and a branded 1200×630 image.',
  },
  {
    id: 'no-schema',
    rank: 34,
    categoryLabel: 'Rich Results',
    sheet:
      'Show a Google result for the business without hours/stars/map pack extras, versus what a LocalBusiness result looks like.',
    match: (ctx) =>
      /no (?:localbusiness|json-?ld|schema)|missing (?:the )?markup/.test(ctx.lower) ||
      weak(gradeOf(ctx.card, 'schema'), 'D'),
    problem: () => 'Google is missing the local-business markup that unlocks richer results.',
    solution: () => 'Add LocalBusiness markup for hours, address, and reviews.',
  },
  {
    id: 'email-auth-fail',
    rank: 35,
    categoryLabel: 'Email Auth',
    sheet:
      'A three-row SPF / DKIM / DMARC card (fail or missing) for the audit domain — inbox risk in one glance.',
    match: (ctx) =>
      /spf.{0,12}fail|dkim.{0,12}fail|dmarc.{0,12}(?:fail|missing|none)|email can look fake/.test(ctx.lower) ||
      weak(gradeOf(ctx.card, 'email'), 'D'),
    problem: () => 'Business email can look fake or land in spam.',
    solution: () => 'Set SPF, DKIM, and DMARC so replies actually arrive.',
  },
  {
    id: 'content-thin',
    rank: 36,
    categoryLabel: 'Thin Content',
    sheet:
      'Crop a placeholder, lorem, or stale page from the audit URL so the unfinished offer is visible.',
    match: (ctx) => /thin content|outdated copy|placeholder pages|lorem ipsum/.test(ctx.lower),
    problem: () => 'Pages look unfinished or outdated — the offer is not clear.',
    solution: () => 'Replace placeholders with current services, proof, and a next step.',
  },
  {
    id: 'no-favicon',
    rank: 37,
    categoryLabel: 'No Favicon',
    sheet:
      'Show a browser tab strip for the audit URL with the generic globe icon instead of the brand mark.',
    match: (ctx) => /no favicon|missing favicon/.test(ctx.lower),
    problem: () => 'Browser tabs show a generic icon instead of the brand.',
    solution: () => 'Add a favicon and Apple touch icon that match the logo.',
  },
  {
    id: 'social-thin',
    rank: 38,
    categoryLabel: 'Social',
    sheet:
      'Show the Instagram or Facebook profile (or the missing-profile search) next to the website — thin, quiet, or a name mismatch.',
    match: (ctx) =>
      /social (?:profiles )?look thin|quiet, or inconsistent|no instagram|no facebook/.test(ctx.lower) ||
      weak(gradeOf(ctx.card, 'social'), 'D'),
    problem: () => 'Social profiles are thin, quiet, or do not match the business.',
    solution: () => 'Align names, links, and a recent post so the brand looks alive.',
  },
  {
    id: 'hosting-bottleneck',
    rank: 39,
    categoryLabel: 'Hosting',
    sheet:
      'Show the speed score plus the host name (GoDaddy / Bluehost / shared) so the bottleneck is the server, not the design.',
    match: (ctx) => /server resource issue|shared hosting|underpowered/.test(ctx.lower),
    problem: () => 'The build is lean but the host is the bottleneck.',
    solution: () => 'Move off the underpowered shared box once images and scripts are already clean.',
  },
  {
    id: 'security-headers',
    rank: 40,
    categoryLabel: 'Security Headers',
    sheet:
      'A short missing-headers list (HSTS, CSP, X-Frame-Options) for the audit URL — padlock is fine, the headers are not.',
    match: (ctx) =>
      /missing .{0,20}header|hsts|content-security-policy/.test(ctx.lower) &&
      gradeOf(ctx.card, 'security') !== 'F' &&
      !/\bnot secure\b|no ssl\b/.test(ctx.lower),
    problem: () => 'Security headers are missing — not a red padlock, but the site is softer than it should be.',
    solution: () => 'Add HSTS, CSP, and clickjacking headers after the certificate is clean.',
  },
];

const RANK_BY_ID = new Map(SALES_SHEET_CASCADE.map((item) => [item.id, item.rank]));

export function resolveCascadeContext(input: CascadeContext): ResolvedCascadeContext {
  return {
    ...input,
    lower: (input.body || '').toLowerCase(),
    name: (input.businessName || '').trim(),
    securityGrade: input.securityGrade ?? gradeOf(input.card, 'security'),
  };
}

export function cascadeRankForFinding(finding: {
  id?: string;
  rank?: number;
  categoryLabel?: string;
  problem?: string;
}): number {
  if (finding.rank != null && Number.isFinite(finding.rank)) return finding.rank;
  if (finding.id && RANK_BY_ID.has(finding.id)) return RANK_BY_ID.get(finding.id)!;
  if (finding.id === 'dummy-speed' || finding.id === 'perf-speed' || finding.id === 'perf') return 20;
  if (finding.id === 'dummy-seo') return 27;
  if (finding.id === 'dummy-listings' || isPlacesMissFinding({
    id: finding.id || '',
    categoryLabel: finding.categoryLabel || '',
    problem: finding.problem || '',
  })) {
    return 5;
  }
  return 80;
}

export function selectCascadeFindings(
  input: CascadeContext,
  count = SALES_SHEET_CASCADE_COUNT,
): CascadeFinding[] {
  const ctx = resolveCascadeContext(input);
  const hits: CascadeFinding[] = [];
  for (const item of SALES_SHEET_CASCADE) {
    if (hits.length >= count) break;
    if (!item.match(ctx)) continue;
    hits.push({
      id: item.id,
      rank: item.rank,
      categoryLabel: item.categoryLabel,
      sheet: item.sheet,
      problem: item.problem(ctx),
      solution: item.solution(ctx),
    });
  }
  return hits;
}

/** Insert or drop a live Places miss without jumping the SSL / down / domain / malware ranks. */
export function mergePlacesIntoCascadeFindings(
  findings: CascadeFinding[],
  notListed: boolean,
  businessName: string,
  count = SALES_SHEET_CASCADE_COUNT,
): CascadeFinding[] {
  const withoutPlaces = findings.filter((f) => !isPlacesMissFinding(f) && f.id !== 'places-not-listed');
  if (!notListed) return withoutPlaces.slice(0, count);
  const placesDef = SALES_SHEET_CASCADE.find((item) => item.id === 'places-not-listed');
  const pinned = {
    ...placesNotListedFinding(businessName),
    rank: 5,
    sheet: placesDef?.sheet ?? '',
  };
  return [...withoutPlaces, pinned]
    .sort((a, b) => cascadeRankForFinding(a) - cascadeRankForFinding(b))
    .slice(0, count);
}
